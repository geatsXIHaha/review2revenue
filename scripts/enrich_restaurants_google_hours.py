import argparse
import json
import os
import re
import time
from math import radians, sin, cos, sqrt, atan2
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx
import pandas as pd
from dotenv import load_dotenv


TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
DETAILS_URL     = "https://maps.googleapis.com/maps/api/place/details/json"

WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# ---------------------------------------------------------------------------
# Known mall / landmark anchors  →  (lat, lng)
# Add more entries here as you discover new mismatches.
# ---------------------------------------------------------------------------
LOCATION_ANCHORS: Dict[str, Tuple[float, float]] = {
    "tropicana gardens mall": (3.1491, 101.5952),
    "tropicana gardens":      (3.1491, 101.5952),
    "ioi mall damansara":     (3.1491, 101.5952),
    "sunway giza mall":       (3.1680, 101.5940),
    "sunway giza":            (3.1680, 101.5940),
    "paradigm mall":          (3.1059, 101.5958),
    "dataran sunway":         (3.1520, 101.5940),
    "kota damansara":         (3.1520, 101.5940),
    "ss2":                    (3.1185, 101.6220),
    "ss7":                    (3.1055, 101.5960),
    "pj":                     (3.1073, 101.6067),
}

PRICE_LABELS = {0: "budget", 1: "budget", 2: "mid", 3: "premium", 4: "premium"}

MAX_ANCHOR_KM = 2.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return text
    text = text.encode("utf-8", "ignore").decode("utf-8")
    text = re.sub(r"[^\x00-\x7F]+", " ", text)
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _anchor_for(name: str) -> Optional[Tuple[float, float]]:
    """Return the best (longest-match) location anchor for a restaurant name."""
    n = normalize(name)
    best_key, best_anchor = "", None
    for key, anchor in LOCATION_ANCHORS.items():
        if key in n and len(key) > len(best_key):
            best_key = key
            best_anchor = anchor
    return best_anchor


def _parse_weekday_text(lines: List[str]) -> Dict[str, str]:
    out = {day: "" for day in WEEK_DAYS}
    for line in lines:
        if ":" not in line:
            continue
        day, value = line.split(":", 1)
        day = day.strip()
        if day in out:
            out[day] = clean_text(value.strip())
    return out


def _price_label(price_level) -> str:
    if isinstance(price_level, int):
        return PRICE_LABELS.get(price_level, "")
    return ""


# ---------------------------------------------------------------------------
# Places API
# NOTE: "type=restaurant" filter intentionally removed — it causes misses for
# places Google categorises as "cafe", "food", "store", etc.
# ---------------------------------------------------------------------------

def _text_search(
    client: httpx.Client,
    api_key: str,
    query: str,
    anchor: Optional[Tuple[float, float]] = None,
) -> Optional[str]:
    params: Dict = {"query": query, "key": api_key}
    if anchor:
        params["location"] = f"{anchor[0]},{anchor[1]}"
        params["radius"]   = 2000

    resp = client.get(TEXT_SEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    if not results:
        return None

    # With location bias active, just take Google's top result —
    # the radius already pins results to the right area.
    # Without anchor, also take top result (Google ranks by relevance).
    return results[0].get("place_id")


def _place_details(client: httpx.Client, api_key: str, place_id: str) -> Dict:
    resp = client.get(
        DETAILS_URL,
        params={
            "place_id": place_id,
            "fields": (
                "place_id,name,formatted_address,business_status,opening_hours,"
                "geometry,price_level,types,website,formatted_phone_number"
            ),
            "key": api_key,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("result", {})


# ---------------------------------------------------------------------------
# Fallback query variants
# ---------------------------------------------------------------------------

def _fallback_queries(name: str, region_hint: str) -> List[str]:
    queries: List[str] = []
    # Strip parenthetical location hint e.g. "(kota damansara)"
    stripped = re.sub(r"\s*\(.*?\)", "", name).strip()
    if stripped and normalize(stripped) != normalize(name):
        queries.append(f"{stripped}, {region_hint}" if region_hint else stripped)
    # Try without region hint
    queries.append(f"{name}, Malaysia")
    # Try first two words only
    words = stripped.split()
    if len(words) >= 2:
        queries.append(f"{' '.join(words[:2])}, {region_hint}" if region_hint else " ".join(words[:2]))
    return queries


def _resolve_place_id(
    client: httpx.Client,
    api_key: str,
    name: str,
    region_hint: str,
) -> Optional[str]:
    anchor  = _anchor_for(name)
    primary = f"{name}, {region_hint}" if region_hint else name

    pid = _text_search(client, api_key, primary, anchor)
    if pid:
        return pid

    for q in _fallback_queries(name, region_hint):
        pid = _text_search(client, api_key, q, anchor)
        if pid:
            return pid

    return None


# ---------------------------------------------------------------------------
# Main enrichment
# ---------------------------------------------------------------------------

def enrich_hours(
    input_path: Path,
    output_path: Path,
    region_hint: str,
    delay_s: float,
    limit: int,
) -> None:
    load_dotenv()
    api_key = os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        raise ValueError("Set GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) in your .env first.")

    df = pd.read_csv(input_path)
    if "name" not in df.columns:
        raise ValueError("Input CSV must contain a 'name' column.")

    rows = df.copy()
    if limit > 0:
        rows = rows.head(limit)

    cols: Dict[str, List] = {
        "google_search_query":         [],
        "google_place_id":             [],
        "google_matched_name":         [],
        "google_formatted_address":    [],
        "google_business_status":      [],
        "google_price_level":          [],
        "google_price_tier":           [],
        "google_lat":                  [],
        "google_lng":                  [],
        "google_website":              [],
        "google_phone":                [],
        "google_types_json":           [],
        "operating_hours_monday":      [],
        "operating_hours_tuesday":     [],
        "operating_hours_wednesday":   [],
        "operating_hours_thursday":    [],
        "operating_hours_friday":      [],
        "operating_hours_saturday":    [],
        "operating_hours_sunday":      [],
        "operating_hours_by_day_json": [],
        "operating_hours_source":      [],
    }

    def _append_empty(query: str, source: str) -> None:
        cols["google_search_query"].append(query)
        cols["google_place_id"].append("")
        cols["google_matched_name"].append("")
        cols["google_formatted_address"].append("")
        cols["google_business_status"].append("")
        cols["google_price_level"].append(-1)
        cols["google_price_tier"].append("")
        cols["google_lat"].append(float("nan"))
        cols["google_lng"].append(float("nan"))
        cols["google_website"].append("")
        cols["google_phone"].append("")
        cols["google_types_json"].append("[]")
        for day in WEEK_DAYS:
            cols[f"operating_hours_{day.lower()}"].append("")
        cols["operating_hours_by_day_json"].append("{}")
        cols["operating_hours_source"].append(source)

    with httpx.Client() as client:
        for idx, (_, row) in enumerate(rows.iterrows(), 1):
            name  = str(row.get("name", "")).strip()
            query = f"{name}, {region_hint}" if region_hint else name

            try:
                place_id = _resolve_place_id(client, api_key, name, region_hint)

                if not place_id:
                    _append_empty(query, "not_found")
                    print(f"  [{idx}] NOT FOUND: {name}")
                    time.sleep(delay_s)
                    continue

                # --- fetch full details for the matched place ---
                detail       = _place_details(client, api_key, place_id)
                resolved_id  = detail.get("place_id", "")
                maps_url     = f"https://www.google.com/maps/place/?q=place_id:{resolved_id}"
                opening      = detail.get("opening_hours", {})
                parsed       = _parse_weekday_text(opening.get("weekday_text", []) or [])
                geo          = detail.get("geometry", {}).get("location", {})
                price_level  = detail.get("price_level")
                types        = detail.get("types") or []
                website      = detail.get("website") or maps_url

                # All fields come from the matched Google place, not the input row
                matched_name    = clean_text(detail.get("name", ""))
                matched_address = clean_text(detail.get("formatted_address", ""))
                matched_phone   = clean_text(detail.get("formatted_phone_number", ""))
                matched_status  = detail.get("business_status", "")
                matched_lat     = float(geo["lat"]) if geo.get("lat") is not None else float("nan")
                matched_lng     = float(geo["lng"]) if geo.get("lng") is not None else float("nan")

                cols["google_search_query"].append(query)
                cols["google_place_id"].append(resolved_id)
                cols["google_matched_name"].append(matched_name)
                cols["google_formatted_address"].append(matched_address)
                cols["google_business_status"].append(matched_status)
                cols["google_price_level"].append(int(price_level) if isinstance(price_level, int) else -1)
                cols["google_price_tier"].append(_price_label(price_level))
                cols["google_lat"].append(matched_lat)
                cols["google_lng"].append(matched_lng)
                cols["google_website"].append(website)
                cols["google_phone"].append(matched_phone)
                cols["google_types_json"].append(json.dumps(types, ensure_ascii=False))
                for day in WEEK_DAYS:
                    cols[f"operating_hours_{day.lower()}"].append(parsed.get(day, ""))
                cols["operating_hours_by_day_json"].append(json.dumps(parsed, ensure_ascii=False))
                cols["operating_hours_source"].append("google_places")

                # Distance warning
                anchor = _anchor_for(name)
                flag   = ""
                if anchor and geo.get("lat") and geo.get("lng"):
                    km   = _haversine_km(anchor[0], anchor[1], matched_lat, matched_lng)
                    flag = f"  ⚠  {km:.1f} km from expected anchor" if km > MAX_ANCHOR_KM else f"  ({km:.2f} km)"
                print(f"  [{idx}] OK: {name!r} → {matched_name!r}{flag}")

            except Exception as exc:
                _append_empty(query, "error")
                print(f"  [{idx}] ERROR: {name!r} — {exc}")

            time.sleep(delay_s)

    rows = rows.copy()
    for col, values in cols.items():
        rows[col] = values

    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows.to_csv(output_path, index=False, encoding="utf-8-sig")

    found = sum(1 for s in cols["operating_hours_source"] if s == "google_places")
    total = len(rows)
    print(f"\nDone. {found}/{total} matched ({total - found} not found / errors).")
    print(f"Saved → {output_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich restaurant CSV with Mon-Sun operating hours from Google Places API."
    )
    parser.add_argument("--input",  type=Path,  default=Path("data/clean_restaurants.csv"))
    parser.add_argument("--output", type=Path,  default=Path("data/clean_restaurants_google_hours.csv"))
    parser.add_argument("--region", type=str,   default="Petaling Jaya, Malaysia")
    parser.add_argument("--delay",  type=float, default=0.08)
    parser.add_argument("--limit",  type=int,   default=0, help="0 = all rows")
    args = parser.parse_args()

    if not args.input.exists():
        raise FileNotFoundError(f"Input file not found: {args.input}")

    enrich_hours(
        input_path=args.input,
        output_path=args.output,
        region_hint=args.region,
        delay_s=args.delay,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()