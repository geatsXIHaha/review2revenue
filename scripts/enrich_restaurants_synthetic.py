import argparse
import hashlib
import json
from pathlib import Path
from typing import Dict, List

import pandas as pd


DEFAULT_INPUT = Path("data/clean_restaurants.csv")
DEFAULT_OUTPUT = Path("data/clean_restaurants_enriched.csv")


CUISINE_MENUS: Dict[str, List[str]] = {
    "malaysian": [
        "Nasi Lemak Special",
        "Nasi Goreng Kampung",
        "Mee Goreng Mamak",
        "Ayam Berempah",
        "Satay Set",
        "Teh Tarik",
        "Roti Canai",
        "Sambal Sotong",
        "Laksa Utara",
        "Ikan Bakar",
    ],
    "korean": [
        "Bibimbap",
        "Kimchi Fried Rice",
        "Tteokbokki",
        "Bulgogi Rice Bowl",
        "Kimchi Jjigae",
        "Korean Fried Chicken",
        "Jajangmyeon",
        "Soondubu Jjigae",
    ],
    "japanese": [
        "Chicken Katsu Curry",
        "Salmon Don",
        "Ramen Shoyu",
        "Unagi Don",
        "Tempura Udon",
        "California Maki",
        "Teriyaki Bento",
        "Matcha Latte",
    ],
    "thai": [
        "Tom Yum Seafood",
        "Pad Thai",
        "Green Curry Chicken",
        "Basil Chicken Rice",
        "Mango Sticky Rice",
        "Thai Milk Tea",
        "Pineapple Fried Rice",
        "Som Tam",
    ],
    "chinese": [
        "Char Kuey Teow",
        "Claypot Chicken Rice",
        "Sweet and Sour Fish",
        "Kung Pao Chicken",
        "Wantan Mee",
        "Yong Tau Foo",
        "Hot and Sour Soup",
        "Loh Mee",
    ],
    "indian": [
        "Nasi Kandar Set",
        "Roti Canai Telur",
        "Chicken Tandoori",
        "Mutton Briyani",
        "Masala Dosa",
        "Teh Masala",
        "Butter Chicken",
        "Paneer Tikka",
    ],
    "burgers": [
        "Classic Beef Burger",
        "Spicy Chicken Burger",
        "Double Cheese Burger",
        "Mushroom Swiss Burger",
        "Curly Fries",
        "Onion Rings",
        "Iced Lemon Tea",
    ],
    "noodles": [
        "Dry Wantan Mee",
        "Curry Mee",
        "Pan Mee",
        "Beef Noodle Soup",
        "Fish Ball Noodle",
        "Fried Mee Hoon",
        "Barley Drink",
    ],
    "pasta": [
        "Aglio Olio",
        "Carbonara",
        "Bolognese",
        "Seafood Marinara",
        "Mushroom Soup",
        "Garlic Bread",
        "Lemon Soda",
    ],
    "default": [
        "Chef Signature Rice",
        "Spicy Stir Fry",
        "House Noodle",
        "Chicken Chop",
        "Seasonal Vegetables",
        "Fresh Juice",
        "Soup of the Day",
        "Dessert Special",
    ],
}


OPENING_WINDOWS = [
    ("07:00", "15:00"),
    ("09:00", "18:00"),
    ("10:00", "20:00"),
    ("11:00", "22:00"),
    ("12:00", "23:00"),
    ("16:00", "01:00"),
]


PRICE_LABELS = ["budget", "mid", "premium"]
PRICE_RANGES = {
    "budget": "RM8-RM20",
    "mid": "RM15-RM35",
    "premium": "RM30-RM70",
}


GLOBAL_TAGS = [
    "halal-friendly",
    "family-friendly",
    "quick-bites",
    "spicy",
    "takeaway",
    "dine-in",
    "delivery",
]


def _stable_index(seed: str, modulo: int) -> int:
    h = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return int(h, 16) % modulo


def _pick_cuisine_key(food_type: str) -> str:
    v = (food_type or "").lower()
    for key in CUISINE_MENUS:
        if key != "default" and key in v:
            return key
    if "nasi kandar" in v or "roti canai" in v or "nasi lemak" in v:
        return "malaysian"
    return "default"


def _build_menu(seed: str, cuisine_key: str, top_k: int = 6) -> List[str]:
    pool = CUISINE_MENUS.get(cuisine_key, CUISINE_MENUS["default"]).copy()
    chosen: List[str] = []
    for i in range(min(top_k, len(pool))):
        idx = _stable_index(f"{seed}-menu-{i}", len(pool))
        chosen.append(pool.pop(idx))
    return chosen


def _build_hours(seed: str) -> str:
    open_h, close_h = OPENING_WINDOWS[_stable_index(f"{seed}-hours", len(OPENING_WINDOWS))]
    day_style = [
        "Mon-Sun",
        "Mon-Sat",
        "Tue-Sun",
        "Mon-Fri",
    ][_stable_index(f"{seed}-days", 4)]
    return f"{day_style} {open_h}-{close_h}"


def _is_late_night(close_h: str) -> bool:
    hour = int(str(close_h).split(":", 1)[0])
    return hour <= 3 or hour >= 23


def _build_price(seed: str, rating: float) -> str:
    base_idx = _stable_index(f"{seed}-price", len(PRICE_LABELS))
    if rating >= 4.6:
        base_idx = min(base_idx + 1, len(PRICE_LABELS) - 1)
    label = PRICE_LABELS[base_idx]
    return label


def _build_tags(seed: str, cuisine_key: str, price_label: str, is_late_night: bool) -> List[str]:
    tags = [f"cuisine:{cuisine_key}", f"price:{price_label}"]
    pool = GLOBAL_TAGS.copy()
    for i in range(3):
        idx = _stable_index(f"{seed}-tag-{i}", len(pool))
        tags.append(pool.pop(idx))
    if is_late_night:
        tags.append("late-night")
    return tags


def enrich_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    required = ["store_id", "name", "food_type", "avg_rating"]
    for col in required:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    out = df.copy()
    menus: List[str] = []
    hours: List[str] = []
    price_labels: List[str] = []
    price_ranges: List[str] = []
    tags: List[str] = []

    for _, row in out.iterrows():
        store_id = str(row.get("store_id", ""))
        name = str(row.get("name", ""))
        food_type = str(row.get("food_type", ""))
        rating = float(row.get("avg_rating", 0.0) or 0.0)

        seed = f"{store_id}|{name}|{food_type}"
        cuisine_key = _pick_cuisine_key(food_type)

        menu_items = _build_menu(seed, cuisine_key)
        business_hours = _build_hours(seed)
        close_h = business_hours.split(" ")[-1].split("-")[-1]
        price_label = _build_price(seed, rating)
        tag_items = _build_tags(seed, cuisine_key, price_label, _is_late_night(close_h))

        menus.append(json.dumps(menu_items, ensure_ascii=False))
        hours.append(business_hours)
        price_labels.append(price_label)
        price_ranges.append(PRICE_RANGES[price_label])
        tags.append(", ".join(tag_items))

    out["menu_items"] = menus
    out["business_hours"] = hours
    out["price_tier"] = price_labels
    out["price_range_rm"] = price_ranges
    out["tags"] = tags
    out["is_synthetic_metadata"] = True
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Add synthetic menu/hours/price/tags metadata to restaurants CSV.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input restaurants CSV path")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output enriched CSV path")
    parser.add_argument("--in-place", action="store_true", help="Overwrite the input file directly")
    args = parser.parse_args()

    input_path = args.input
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    df = pd.read_csv(input_path)
    enriched = enrich_dataframe(df)

    output_path = input_path if args.in_place else args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    enriched.to_csv(output_path, index=False)

    print(f"Rows processed: {len(enriched)}")
    print(f"Saved enriched CSV: {output_path}")


if __name__ == "__main__":
    main()
