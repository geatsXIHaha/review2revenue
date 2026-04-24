import math
import re
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io

from .repository import (
    count_reviews_matching_keywords,
    find_restaurant_by_name,
    find_restaurant_by_store_id,
    get_chat_history,
    get_metrics_for_store_ids,
    get_recent_reviews,
    get_reviews_by_keywords,
    insert_bulk_menu_items,
    list_chat_conversations,
    list_restaurants,
    save_chat_message,
    search_restaurants_by_name,
)
from .schemas import AskRequest, AskResponse, ChatHistoryResponse, ConversationSummary, PredictBatchRequest
from .sentiment_model import get_sentiment_engine_status, predict_sentiment_summary
from .zai_client import ZAIClient

app = FastAPI(title="Review2Revenue API", version="1.0.0")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Add this block right after creating the app instance
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Your React app's URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

zai_client = ZAIClient()

MYT = timezone(timedelta(hours=8))

_WEEKDAY_HOUR_COLUMNS = [
    "operating_hours_monday",
    "operating_hours_tuesday",
    "operating_hours_wednesday",
    "operating_hours_thursday",
    "operating_hours_friday",
    "operating_hours_saturday",
    "operating_hours_sunday",
]

DINER_SYSTEM_PROMPT = """
You are an intelligent food recommendation assistant operating as a decision system.
You MUST only use the restaurants provided in the input. Do NOT suggest or invent restaurants outside the database.

Your goal is to understand the user's intent and provide accurate, helpful, and context-aware answers.

=== CORE RULES ===

1. STRICT DATA BOUNDARY:
- Only use restaurants from the provided data.
- If no matching restaurant exists, clearly say so ONCE.

2. INTENT UNDERSTANDING:
- Identify what the user really wants (e.g. pizza, cheap, big portion, fine dining, open now, nearest).
- Prioritize relevance over rating.
- Only recommend restaurants that match the user's request.
- If NO restaurants match, suggest closest alternatives based on food type and sentiment.
- If specific_restaurant_query and specific_restaurant_match are provided, answer that matched restaurant first.

3. TIME AWARENESS (Malaysia time, UTC+8):
- Use operating_hours_today and current_day_myt/current_time_myt fields.
- Classify restaurants as:
  • Open now
  • Closed but opening later today
  • Closed for the day
- If user does not specify time, assume TODAY.

4. DECISION FLOW (INTERNAL — DO NOT SHOW):
- First check if any restaurants match the user's intent.
- If YES:
  • Prioritize restaurants that are open now
  • Then include those opening later today (with opening time)
- If NO:
  • Clearly state no matching restaurant is available (ONLY ONCE)
  • Then suggest closest alternatives

5. HANDLING NO MATCH:
- If no restaurant matches the request:
  • Say it clearly ONCE
  • Do NOT repeat
  • Then provide reasonable alternatives

6. USE OF EVIDENCE:
- Use structured data first:
  • food_type
  • sentiment_summary
  • keyword_match_review_count
- Then support with relevant_reviews if helpful
- Do NOT make unsupported claims

7. ACTIONABLE OUTPUT:
- Include ONLY available fields:
  • today's operating hours
  • address
  • website or phone (ONLY if available)

8. RESPONSE STYLE:
- Adapt naturally to the user's question
- Do NOT follow a rigid template
- Do NOT show internal reasoning like CASE A/B/C
- Refer to the assistant as 'you'
- Keep responses clear and natural

9. AVOID REDUNDANCY:
- Do NOT repeat conclusions
- Be concise but informative

10. HONESTY:
- If data is missing or weak, say so clearly
- Do NOT hallucinate missing fields

11. RECOMMENDATION DETAIL REQUIREMENTS:
- For EVERY restaurant:
  • Explain WHY it is recommended (intent-based)
  • Include today's operating hours
  • Include address
  • Include website or phone if available

12. DEFAULT TIME ASSUMPTION:
- If user does not specify time, assume TODAY
- Always use today's operating hours

13. OUTPUT QUALITY:
- Do NOT just list restaurants
- Each recommendation must be meaningful and justified
- Keep explanations 1–2 lines

14. EXPLANATION QUALITY:
- Match explanation to user intent:
  • cheap → value/price
  • big portion → portion evidence
  • fine dining → ambience/premium
  • nearest → proximity
- Avoid generic explanations like "popular" or "good rating"

15. HANDLE CLOSED RESTAURANTS SMARTLY:
- If closed but relevant:
  • still mention it
  • include opening time
- Never prioritize closed over open

16. NEAREST RESTAURANT LOGIC (STRICT):
- user_location is trusted backend input when present.
- NEVER say user location is missing if user_location exists in input.
- Use ONLY backend-provided distance_km for distance statements and nearest claims.
- NEVER estimate, infer, or invent distance values.
- NEVER use 0 km unless distance_km is explicitly 0 in input.
- If distance_km is null, do not display distance for that restaurant.
- Do not explain backend assumptions (no "I assume..." wording).

17. EXPLANATION RULE (GLOBAL OVERRIDE):
- Every restaurant MUST always include:
  • Why it is recommended (based on intent + rating/sentiment/keywords)
- This rule applies EVEN IF:
  • distance is missing
  • intent is fallback
  • no exact match exists

18. FALLBACK BEHAVIOR (IMPORTANT FIX):
- If no exact match exists:
  • You MUST STILL format output as normal recommendations
  • Do NOT switch into "informational list mode"
  • Do NOT remove explanations
  • Instead:
      → explain "closest available alternatives based on food type and sentiment"
      → then continue normal recommendation structure

19. CONSISTENCY RULE:
- All restaurant outputs MUST follow the same structure:
  Name
  Why recommended
  Operating hours today
  Address
  (Optional: website/phone if exists)
  (Optional: distance_km if not null)

20. MENU AND FOOD DETAIL ENRICHMENT:
- If menu_highlights exists, describe them explicitly.
- If menu_highlights is weak, infer likely dishes from food_type and review evidence.
- Mention 1-3 likely dishes or signature items when possible.

21. PRICE EXPLANATION RULE:
- Always translate price_tier/price_description into practical budget language.
- Mention whether it is budget, mid-range, expensive, or premium.

22. REVIEW SYNTHESIS RULE:
- Use review_insights to summarize what customers praise and complain about.
- Synthesize patterns; do not just repeat raw reviews.

23. DETAIL DEPTH RULE (MANDATORY):
- For recommendation queries, provide detailed explanations for EACH restaurant.
- Minimum content per restaurant:
  • 2-4 sentences of reasoning
  • menu/cuisine details (use menu_highlights + cuisine_description)
  • practical price context (use price_description or price_tier)
  • review evidence summary (praises + complaints if available)
  • operational context (open/closed + today's hours)
  • distance context if distance_km is available
- Avoid one-line/generic explanations.

24. PRECISION RULE:
- Prefer concrete facts from input over generic adjectives.
- Use specific fields (distance_km, operating_hours_today, menu_highlights, review_insights, sentiment_summary).
- If a field is unknown, state that clearly and continue with other available evidence.

=== GOAL ===
Provide accurate, intent-aware, and actionable restaurant recommendations using only the provided data.
"""

VENDOR_SYSTEM_PROMPT = (
    "You are a restaurant business consultant focused on business optimization. "
    "Use review-driven insights, customer sentiment analysis, actionable recommendations, "
    "context-aware reasoning, what-if simulation thinking, and explainable AI decisions.\n\n"

    "Context may include address, coordinates, Google price tier, phone, website, operating hours, "
    "structured sentiment metrics, and aspect_analysis — use them when relevant.\n\n"

    "Analyze performance using customer reviews, sentiment trends, and rating metrics.\n\n"

    "=== RESPONSE ADAPTATION RULE ===\n"
    "You MUST adapt your answer structure to vendor_intent.\n"
    '- If vendor_intent = "diagnostic": focus on root causes of lower ratings, and compare positive vs negative patterns relevant to the question.\n'
    '- If vendor_intent = "strengths": focus ONLY on strengths, rank top 3-5 strengths by review frequency, and use wording like "most consistently praised" or "frequently mentioned".\n'
    '- If vendor_intent = "improvements": focus ONLY on weaknesses/issues, rank top complaints by severity or frequency, and provide concrete fixes tied to review evidence.\n'
    '- If vendor_intent = "general": provide balanced analysis (strengths + weaknesses + practical actions).\n'
    "Do NOT reuse one rigid template for every question.\n\n"

    "=== ASPECT MODE OVERRIDE (HIGHEST PRIORITY) ===\n"
    "If vendor_intent starts with 'aspect_':\n"
    "- You MUST answer ONLY that specific aspect\n"
    "- You MUST NOT include:\n"
    "  • overall analysis\n"
    "  • strengths/weaknesses sections\n"
    "  • unrelated aspects\n"
    "- You MUST:\n"
    "  • Use aspect_analysis for that aspect\n"
    "  • Quantify positive vs negative mentions\n"
    "  • State total mentions if available\n"
    "  • Conclude clearly (positive / negative / mixed)\n"
    "  • Explain consistency (e.g. generally good but inconsistent)\n"
    "- Output MUST be a focused paragraph (3–5 sentences max)\n\n"

    "=== ASPECT ANALYSIS RULE (CRITICAL) ===\n"
    "When the user asks about a specific aspect (e.g. portion, price, service, taste):\n"
    "- You MUST prioritize aspect_analysis data if available\n"
    "- You MUST quantify:\n"
    "  • number of positive mentions\n"
    "  • number of negative mentions\n"
    "  • total mentions (if available)\n"
    "- You MUST clearly conclude whether sentiment is:\n"
    "  • mostly positive\n"
    "  • mostly negative\n"
    "  • mixed / inconsistent\n"
    "- You MUST explain consistency (e.g. generally good but inconsistent)\n"
    "- You MUST NOT give generic strengths/weaknesses\n"
    "- You MUST NOT mix unrelated aspects\n"
    "- If aspect data is weak or limited, say so clearly\n\n"

    "=== REVIEW GROUNDING RULE ===\n"
    "You MUST anchor conclusions to review evidence and review_summary.\n"
    "Mention repeated themes and frequency signals (e.g., multiple reviews mention, frequently reported).\n"
    "Avoid generic consultant advice unless clearly supported by supplied review signals.\n"
    "If the user asks about a time scope (for example this month), prioritize scoped_reviews and state if data is limited.\n\n"

    "=== QUANTIFICATION RULE ===\n"
    "Whenever possible, include numbers or relative frequency:\n"
    "- e.g. 'many reviews', 'a few complaints', 'majority of customers', 'several mentions'\n"
    "- Prefer quantified insight over vague statements\n\n"

    "=== CONSISTENCY & CONFLICT HANDLING ===\n"
    "If both positive and negative signals exist for the same aspect:\n"
    "- DO NOT list them separately as strengths and weaknesses\n"
    "- Instead, synthesize into one conclusion:\n"
    "  → e.g. 'generally good but inconsistent'\n\n"

    "=== SENTIMENT INTERPRETATION RULE ===\n"
    "Interpret sentiment ratios correctly:\n"
    "- >70% positive → strong performance\n"
    "- 50–70% → moderate / mixed\n"
    "- <50% → weak or concerning\n"
    "Do NOT label low ratios as strong performance.\n\n"

    "=== ACTIONABLE INSIGHT RULE ===\n"
    "When giving recommendations:\n"
    "- Tie actions directly to review evidence\n"
    "- Be specific and practical (not generic advice)\n"
    "- Example: instead of 'improve portion', say 'standardize portion size to reduce inconsistency reported in reviews'\n\n"

    "=== OUTPUT STYLE ===\n"
    "- Be concise but insightful\n"
    "- Avoid repetition\n"
    "- Use natural business language\n"
    "- Use markdown bold (**text**) sparingly for key insights\n"
    "- Do NOT hallucinate missing data\n\n"

    "=== GOAL ===\n"
    "Provide precise, evidence-based, and actionable business insights grounded in customer reviews and structured data."
)


def _now_myt() -> datetime:
    return datetime.now(MYT)


def _today_hours_line(row: Dict, now_myt: datetime) -> Optional[str]:
    col = _WEEKDAY_HOUR_COLUMNS[now_myt.weekday()]
    v = row.get(col)
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    s = str(v).strip()
    return s if s else None


def _hours_suggest_closed(hours_line: Optional[str]) -> bool:
    if not hours_line:
        return False
    low = hours_line.lower().strip()
    if low == "closed":
        return True
    if low.startswith("closed") and "open" not in low[:12]:
        return True
    return False


def _hours_late_closing_hint(hours_line: Optional[str]) -> bool:
    if not hours_line:
        return False
    low = hours_line.lower()
    if "24 hour" in low or "24-hour" in low or "24h" in low:
        return True
    markers = ("11:00 pm", "11:30 pm", "12:00 am", "midnight", "1:00 am", "2:00 am", "22:", "23:")
    return any(m in low for m in markers)


def _late_night_prompt(prompt_l: str) -> bool:
    keys = (
        "late night",
        "late-night",
        "midnight",
        "supper",
        "after hours",
        "1am",
        "2am",
        "3am",
        "tengah malam",
        "24 hour",
        "24h",
    )
    return any(k in prompt_l for k in keys)


def _nearest_prompt(prompt_l: str) -> bool:
    keys = ("nearest", "closest", "near me", "nearby", "paling dekat", "dekat sini")
    return any(k in prompt_l for k in keys)


def _price_tier_level(tier: Optional[str]) -> Optional[int]:
    if tier is None:
        return None
    t = str(tier).lower().strip()
    if "$" in t:
        return max(1, min(4, t.count("$")))
    if "inexpensive" in t or "cheap" in t:
        return 1
    if "moderate" in t or "medium" in t:
        return 2
    if "very expensive" in t:
        return 4
    if "expensive" in t:
        return 3
    return None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(min(1.0, math.sqrt(a)))
    return 6371.0 * c


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def _is_valid_lat_lng(lat: float, lng: float) -> bool:
    return -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0


def _normalize_user_location(lat_raw: Any, lng_raw: Any) -> Tuple[Optional[float], Optional[float], str]:
    lat = _to_float(lat_raw)
    lng = _to_float(lng_raw)
    if lat is None or lng is None:
        return None, None, "invalid_or_missing"
    if _is_valid_lat_lng(lat, lng):
        return lat, lng, "as_provided"
    if _is_valid_lat_lng(lng, lat):
        return lng, lat, "swapped_detected"
    return None, None, "out_of_range"


def _extract_keywords(prompt: str) -> List[str]:
    p = prompt.lower()
    found: List[str] = []

    def add(*terms: str) -> None:
        for t in terms:
            t = t.strip().lower()
            if len(t) >= 2 and t not in found:
                found.append(t)

    intent_rules: List[Tuple[List[str], Tuple[str, ...]]] = [
        (
            ["portion", "large portion", "big portion", "generous", "heap", "banyak", "besar", "serving size", "big serving"],
            ("portion", "generous", "serving", "banyak", "large", "small", "size"),
        ),
        (
            ["cheap", "budget", "affordable", "murah", "expensive", "mahal", "price", "value", "worth", "pricing"],
            ("cheap", "expensive", "price", "mahal", "murah", "worth", "value"),
        ),
        (
            ["service", "staff", "waiter", "waitress", "rude", "friendly", "attitude", "slow service"],
            ("service", "staff", "rude", "friendly", "attitude", "slow"),
        ),
        (
            ["tasty", "taste", "delicious", "flavour", "flavor", "bland", "sedap", "enak"],
            ("tasty", "delicious", "sedap", "bland", "flavour"),
        ),
        (
            ["clean", "dirty", "hygiene", "hygienic", "smelly"],
            ("clean", "dirty", "hygiene", "smelly"),
        ),
        (
            ["atmosphere", "ambiance", "ambience", "noisy", "quiet", "vibe", "cosy", "cozy"],
            ("atmosphere", "noisy", "quiet", "ambiance"),
        ),
    ]
    for triggers, terms in intent_rules:
        if any(tr in p for tr in triggers):
            add(*terms)
    return found[:12]


def _normalize_name_text(value: str) -> str:
    s = str(value or "").lower().strip()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _extract_restaurant_query_from_prompt(prompt: str) -> Optional[str]:
    p = _normalize_name_text(prompt)
    if not p:
        return None
    patterns = [
        r"(?:food|menu|sell|sells|serve|serves|about)\s+(?:in|at|for)\s+(.+)$",
        r"(?:in|at)\s+(.+)$",
    ]
    for pat in patterns:
        m = re.search(pat, p)
        if m:
            candidate = _normalize_name_text(m.group(1))
            if len(candidate) >= 3:
                return candidate
    tokens = p.split()
    if len(tokens) <= 6 and len(tokens[-1]) >= 3:
        return tokens[-1]
    return None


def _best_fuzzy_restaurant_match(query: str, restaurants: List[Dict]) -> Optional[Dict]:
    q = _normalize_name_text(query)
    if not q:
        return None
    q_compact = q.replace(" ", "")

    sql_hits = search_restaurants_by_name(q, limit=3)
    if sql_hits:
        return sql_hits[0]

    best_row: Optional[Dict] = None
    best_score = 0.0
    for row in restaurants:
        name = _normalize_name_text(str(row.get("name") or ""))
        if not name:
            continue
        name_compact = name.replace(" ", "")

        if q_compact and q_compact in name_compact:
            contains_score = 1.0
        elif q_compact and name_compact.startswith(q_compact):
            contains_score = 0.98
        elif q_compact and q_compact[:5] and name_compact.startswith(q_compact[:5]):
            contains_score = 0.8
        else:
            contains_score = 0.0

        ratio = SequenceMatcher(None, q, name).ratio()
        token_hit = 0.0
        q_tokens = set(q.split())
        if q_tokens:
            name_tokens = set(name.split())
            token_hit = len(q_tokens.intersection(name_tokens)) / max(len(q_tokens), 1)
        score = max(contains_score, ratio, 0.6 * ratio + 0.25 * token_hit + 0.15 * contains_score)
        if score > best_score:
            best_score = score
            best_row = row

    return best_row if best_score >= 0.55 else None


def _extract_menu_keywords(reviews: List[Dict], food_type: Optional[str] = None) -> List[str]:
    text = " ".join(str(r.get("review_text") or r.get("text") or "") for r in reviews).lower()
    keywords: List[str] = []
    common_foods = [
        "nasi lemak", "fried chicken", "burger", "pasta", "ramen",
        "thai basil", "laksa", "rice bowl", "grill", "steak",
        "satay", "roti canai", "mee goreng", "ayam gepuk", "cendol",
        "teh tarik", "coffee",
    ]
    for k in common_foods:
        if k in text and k not in keywords:
            keywords.append(k)

    if len(keywords) < 3 and food_type:
        f = str(food_type).lower().strip()
        by_food_type = {
            "malaysian": ["nasi lemak", "mee goreng", "satay"],
            "korean": ["kimchi", "bibimbap", "fried chicken"],
            "japanese": ["ramen", "donburi", "sushi"],
            "western": ["pasta", "burger", "steak"],
            "thai": ["tom yum", "thai basil", "green curry"],
            "indian": ["roti canai", "briyani", "tandoori"],
            "chinese": ["fried rice", "dimsum", "noodles"],
            "cakes": ["cakes", "pastries", "coffee"],
            "asian": ["rice bowl", "noodles", "grill"],
        }
        for item in by_food_type.get(f, []):
            if item not in keywords:
                keywords.append(item)
            if len(keywords) >= 5:
                break
    return keywords[:5]


def _extract_common_phrases(texts: List[str], keywords: List[str]) -> List[str]:
    found: List[str] = []
    for k in keywords:
        if any(k in t for t in texts):
            found.append(k)
    return found


def _review_insights(reviews: List[Dict]) -> Dict[str, List[str]]:
    texts = [str(r.get("review_text") or r.get("text") or "").lower() for r in reviews]
    texts = [t for t in texts if t.strip()]
    return {
        "common_praises": _extract_common_phrases(
            texts,
            ["delicious", "sedap", "cheap", "friendly", "fast service", "clean", "good coffee", "big portion"],
        ),
        "common_complaints": _extract_common_phrases(
            texts,
            ["slow", "expensive", "mahal", "cold", "rude", "dirty", "small portion", "crowded"],
        ),
    }


def _aspect_sentiment_analysis(reviews: List[Dict]) -> Dict[str, Dict]:
    aspect_rules = {
        "portion": {
            "keywords": ["portion", "serving", "size", "banyak", "large", "small"],
            "pos": ["big", "generous", "large", "banyak", "worth", "filling"],
            "neg": ["small", "little", "tiny", "not enough", "too small"],
        },
        "price": {
            "keywords": ["price", "cheap", "expensive", "worth", "mahal", "murah"],
            "pos": ["cheap", "affordable", "worth", "value", "reasonable"],
            "neg": ["expensive", "mahal", "overpriced", "not worth"],
        },
        "service": {
            "keywords": ["service", "staff", "waiter", "attitude"],
            "pos": ["friendly", "fast", "good service", "nice staff"],
            "neg": ["slow", "rude", "bad service", "unfriendly"],
        },
        "taste": {
            "keywords": ["taste", "delicious", "sedap", "tasty", "flavour"],
            "pos": ["delicious", "tasty", "sedap", "flavourful"],
            "neg": ["bland", "bad", "not tasty", "no taste"],
        },
    }

    results = {}
    for aspect, rule in aspect_rules.items():
        pos = 0
        neg = 0
        total_mentions = 0
        for r in reviews:
            text = str(r.get("review_text") or r.get("text") or "").lower()
            if not text.strip():
                continue
            if any(k in text for k in rule["keywords"]):
                total_mentions += 1
                if any(p in text for p in rule["pos"]):
                    pos += 1
                if any(n in text for n in rule["neg"]):
                    neg += 1
        total = pos + neg
        score = (pos - neg) / total if total > 0 else 0
        results[aspect] = {
            "positive_mentions": pos,
            "negative_mentions": neg,
            "total_mentions": total_mentions,
            "net_sentiment": round(score, 2),
            "dominant": (
                "positive" if pos > neg else
                "negative" if neg > pos else
                "mixed"
            )
        }
    return results


def _price_label(tier: Optional[str]) -> str:
    if not tier:
        return "Unknown"
    level = _price_tier_level(tier)
    labels = {
        1: "Budget (RM5-RM15 per person)",
        2: "Mid-range (RM15-RM40 per person)",
        3: "Expensive (RM40-RM80 per person)",
        4: "Fine dining (RM80+ per person)",
    }
    return labels.get(level, "Unknown")


def _format_ts(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    return value


def _review_brief(r: Dict) -> Dict:
    return {
        "text": (r.get("review_text") or "").strip(),
        "overall_rating": r.get("overall_rating"),
        "sentiment": r.get("sentiment"),
        "updated_at": _format_ts(r.get("updated_at")),
    }


def _detect_vendor_intent(prompt: str) -> str:
    p = str(prompt or "").lower()
    if any(k in p for k in ["portion", "serving", "size"]):
        return "aspect_portion"
    if any(k in p for k in ["price", "expensive", "cheap", "value"]):
        return "aspect_price"
    if any(k in p for k in ["service", "staff", "waiter"]):
        return "aspect_service"
    if any(k in p for k in ["taste", "food quality", "delicious"]):
        return "aspect_taste"
    if "why" in p and any(k in p for k in ("rating", "ratings", "lower", "drop", "decrease")):
        return "diagnostic"
    if any(k in p for k in ("strongest", "strength", "best", "doing well", "what works", "top thing")):
        return "strengths"
    if any(k in p for k in ("improve", "fix", "weakness", "problem", "issue", "complaint", "better")):
        return "improvements"
    return "general"


def _mentions_this_month(prompt: str) -> bool:
    p = str(prompt or "").lower()
    return any(k in p for k in ("this month", "current month", "bulan ini", "month"))


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _reviews_for_requested_period(reviews: List[Dict], prompt: str, now_myt: datetime) -> List[Dict]:
    if not _mentions_this_month(prompt):
        return reviews
    scoped: List[Dict] = []
    for r in reviews:
        dt = _parse_iso_datetime(r.get("updated_at"))
        if dt is None:
            continue
        local_dt = dt.astimezone(MYT) if dt.tzinfo else dt.replace(tzinfo=MYT)
        if local_dt.year == now_myt.year and local_dt.month == now_myt.month:
            scoped.append(r)
    return scoped


def _summarize_review_patterns(reviews: List[Dict]) -> Dict[str, Any]:
    positive_terms = [
        "delicious", "sedap", "tasty", "friendly", "clean",
        "fast", "value", "reasonable", "worth", "fresh",
    ]
    negative_terms = [
        "slow", "late", "rude", "dirty", "cold",
        "expensive", "mahal", "small portion", "missing", "inconsistent",
    ]
    pos_counts = {k: 0 for k in positive_terms}
    neg_counts = {k: 0 for k in negative_terms}

    for review in reviews:
        text = str(review.get("review_text") or review.get("text") or "").lower().strip()
        if not text:
            continue
        for k in positive_terms:
            if k in text:
                pos_counts[k] += 1
        for k in negative_terms:
            if k in text:
                neg_counts[k] += 1

    top_pos = sorted(((k, v) for k, v in pos_counts.items() if v > 0), key=lambda item: item[1], reverse=True)[:5]
    top_neg = sorted(((k, v) for k, v in neg_counts.items() if v > 0), key=lambda item: item[1], reverse=True)[:5]

    return {
        "total_review_count": len(reviews),
        "top_positive_keywords": [{"keyword": k, "count": v} for k, v in top_pos],
        "top_negative_keywords": [{"keyword": k, "count": v} for k, v in top_neg],
        "most_common_strength": top_pos[0][0] if top_pos else None,
        "most_common_issue": top_neg[0][0] if top_neg else None,
    }


def _sentiment_summary_from_metrics(metric: Dict) -> Dict:
    return {
        "avg_sentiment": metric.get("avg_sentiment"),
        "positive_ratio": metric.get("positive_ratio"),
        "negative_ratio": metric.get("negative_ratio"),
        "total_reviews": metric.get("total_reviews"),
        "confidence_level": metric.get("confidence_level"),
    }


def _restaurant_context_block(row: Dict, now_myt: datetime) -> Dict:
    out = {
        "address": row.get("google_formatted_address"),
        "lat": row.get("google_lat"),
        "lng": row.get("google_lng"),
        "price_tier": row.get("google_price_tier"),
        "operating_hours_today": _today_hours_line(row, now_myt),
        "operating_hours_by_day_json": row.get("operating_hours_by_day_json"),
    }
    phone = row.get("google_phone")
    website = row.get("google_website")
    if isinstance(phone, str) and phone.strip():
        out["phone"] = phone.strip()
    if isinstance(website, str) and website.strip():
        out["website"] = website.strip()
    return out


def _distance_km_for_row(row: Dict, user_lat: float, user_lng: float) -> Optional[float]:
    rlat = _to_float(row.get("google_lat"))
    rlng = _to_float(row.get("google_lng"))
    if rlat is None or rlng is None:
        return None
    if not _is_valid_lat_lng(rlat, rlng):
        return None
    try:
        return _haversine_km(user_lat, user_lng, rlat, rlng)
    except (TypeError, ValueError):
        return None


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/restaurants/search")
def search_restaurants(
    query: str = Query(min_length=1),
    limit: int = Query(default=8, ge=1, le=20),
) -> Dict[str, List[Dict]]:
    try:
        rows = search_restaurants_by_name(query_text=query, limit=limit)
    except Exception:
        rows = []
    return {"restaurants": rows}


@app.get("/api/restaurants/by-store-id")
def get_restaurant_by_store_id(store_id: str = Query(min_length=1)) -> Dict:
    try:
        restaurant = find_restaurant_by_store_id(store_id)
        if restaurant:
            return {"restaurant": restaurant}
        raise HTTPException(status_code=404, detail=f"Restaurant with store_id '{store_id}' not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reviews/by-store-id")
def get_reviews_by_store_id(
    store_id: str = Query(min_length=1),
    limit: int = Query(default=100, ge=1, le=500),
) -> Dict[str, List[Dict]]:
    try:
        reviews = get_recent_reviews(store_id, limit=limit)
        clean_reviews = [_review_brief(r) for r in reviews if (r.get("review_text") or "").strip()]
        return {"reviews": clean_reviews}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sentiment/engine")
def sentiment_engine() -> Dict[str, str]:
    return {"engine": get_sentiment_engine_status()}


@app.post("/api/sentiment/predict-batch")
def predict_batch(req: PredictBatchRequest) -> Dict[str, List[str]]:
    from .sentiment_model import predict_sentiments_batch
    preds = predict_sentiments_batch(req.reviews)
    return {"predictions": preds}


@app.post("/api/ask", response_model=AskResponse)
def ask(payload: AskRequest) -> AskResponse:
    conversation_id = (payload.conversation_id or str(uuid4())).strip()
    history = get_chat_history(conversation_id, payload.role, limit=20)

    if payload.role == "diner":
        return _handle_diner(payload, conversation_id=conversation_id, history=history)
    if payload.role == "vendor":
        return _handle_vendor(payload, conversation_id=conversation_id, history=history)
    raise HTTPException(status_code=400, detail="Unsupported role")


@app.get("/api/chat/history", response_model=ChatHistoryResponse)
def chat_history(conversation_id: str, role: str) -> ChatHistoryResponse:
    if role not in {"diner", "vendor"}:
        raise HTTPException(status_code=400, detail="Unsupported role")
    messages = get_chat_history(conversation_id=conversation_id, role=role, limit=100)
    return ChatHistoryResponse(conversation_id=conversation_id, role=role, messages=messages)


@app.get("/api/chat/conversations", response_model=List[ConversationSummary])
def chat_conversations(
    role: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> List[ConversationSummary]:
    if role not in {"diner", "vendor"}:
        raise HTTPException(status_code=400, detail="Unsupported role")
    rows = list_chat_conversations(role=role, limit=limit)
    return [ConversationSummary(**row) for row in rows]


@app.post("/api/menu/upload")
async def upload_menu(
    file: UploadFile = File(...),
    store_id: Optional[str] = Form(None),
) -> Dict:
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")

    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))

        required_columns = ["menu_id", "store_id", "restaurant_name", "item_name", "category"]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise HTTPException(
                status_code=400,
                detail=f"CSV is missing required columns: {', '.join(missing_columns)}",
            )

        # Default optional columns if not present in CSV
        if "price_rm" not in df.columns:
            df["price_rm"] = None
        if "source" not in df.columns:
            df["source"] = "manual_upload"

        df = df.where(pd.notnull(df), None)
        records_to_insert = df.to_dict(orient="records")
        inserted_count = insert_bulk_menu_items(records_to_insert)

        return {"message": "Menu inserted successfully!", "inserted_count": inserted_count}

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The uploaded CSV file is empty.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/api/reviews/upload")
async def upload_reviews(
    file: UploadFile = File(...),
    store_id: str = Form(...),
) -> Dict:
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")

    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))

        required_columns = ["review_text", "overall_rating", "food_rating"]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise HTTPException(
                status_code=400,
                detail=f"CSV is missing required columns: {', '.join(missing_columns)}",
            )

        if "rider_rating" not in df.columns:
            df["rider_rating"] = None

        df["store_id"] = store_id  # force correct store_id from logged-in user
        df = df.where(pd.notnull(df), None)
        records = df[["store_id", "review_text", "overall_rating", "food_rating", "rider_rating"]].to_dict(orient="records")

        from .repository import insert_bulk_reviews
        inserted_count = insert_bulk_reviews(records)
        return {"message": "Reviews inserted successfully!", "inserted_count": inserted_count}

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="The uploaded CSV file is empty.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Handlers ──────────────────────────────────────────────────────────────────

def _handle_diner(payload: AskRequest, conversation_id: str, history: List[Dict]) -> AskResponse:
    restaurants = list_restaurants(limit=60)
    if not restaurants:
        raise HTTPException(status_code=500, detail="No restaurants available in database")

    now_myt = _now_myt()
    keywords = _extract_keywords(payload.prompt)
    user_lat, user_lng, location_source = _normalize_user_location(payload.user_lat, payload.user_lng)
    loc_ok = user_lat is not None and user_lng is not None
    store_ids = [r["store_id"] for r in restaurants]
    metrics_map = get_metrics_for_store_ids(store_ids)
    kw_counts = count_reviews_matching_keywords(store_ids, keywords)
    ranked = _rank_restaurants(
        payload.prompt,
        restaurants,
        metrics_map,
        kw_counts,
        now_myt,
        user_lat if loc_ok else None,
        user_lng if loc_ok else None,
    )
    nearest_mode = _nearest_prompt(payload.prompt.lower())
    specific_restaurant_query = (payload.restaurant_name or "").strip() or (
        _extract_restaurant_query_from_prompt(payload.prompt) or ""
    )
    specific_match = None
    if specific_restaurant_query:
        match_pool = restaurants
        if len(match_pool) < 300:
            match_pool = list_restaurants(limit=3000)
        specific_match = _best_fuzzy_restaurant_match(specific_restaurant_query, match_pool)

    if nearest_mode and not loc_ok:
        message = (
            "I can find the nearest restaurants once your location is available. "
            "Please allow location access and send user_lat/user_lng, then I will compute exact distance_km."
        )
        save_chat_message(conversation_id, payload.role, "user", payload.prompt, payload.restaurant_name)
        save_chat_message(conversation_id, payload.role, "assistant", message, payload.restaurant_name)
        return AskResponse(answer=message, conversation_id=conversation_id, source="fallback", confidence=0.96)

    ranked_score_map = {str(row["store_id"]): float(score) for score, row in ranked}
    selected_rows: List[Dict] = []

    if specific_match is not None:
        selected_rows = [specific_match]
    elif nearest_mode and loc_ok:
        by_distance: List[Tuple[float, float, Dict]] = []
        missing_distance: List[Tuple[float, Dict]] = []
        for score, row in ranked:
            d = _distance_km_for_row(row, user_lat, user_lng)
            if d is None:
                missing_distance.append((score, row))
            else:
                by_distance.append((d, score, row))
        by_distance.sort(key=lambda item: (item[0], -item[1]))
        selected_rows = [row for _, _, row in by_distance[:5]]
        if len(selected_rows) < 5:
            missing_distance.sort(key=lambda item: item[0], reverse=True)
            selected_rows.extend([row for _, row in missing_distance[: 5 - len(selected_rows)]])
    else:
        selected_rows = [row for _, row in ranked[:5]]

    context_items = []
    for row in selected_rows:
        score = ranked_score_map.get(str(row["store_id"]), 0.0)
        metric = metrics_map.get(row["store_id"], {})
        recent_raw = get_recent_reviews(row["store_id"], limit=3)
        relevant_raw = get_reviews_by_keywords(row["store_id"], keywords, limit=8)
        seen_txt: set = set()
        recent_list: List[Dict] = []
        for r in recent_raw:
            t = (r.get("review_text") or "").strip()
            if not t or t in seen_txt:
                continue
            seen_txt.add(t)
            recent_list.append(r)
        relevant_list: List[Dict] = []
        for r in relevant_raw:
            t = (r.get("review_text") or "").strip()
            if not t or t in seen_txt:
                continue
            seen_txt.add(t)
            relevant_list.append(r)
        all_reviews = recent_list + relevant_list
        aspect_analysis = _aspect_sentiment_analysis(all_reviews)

        block = _restaurant_context_block(row, now_myt)
        distance_km = None
        if loc_ok:
            distance_km = _distance_km_for_row(row, user_lat, user_lng)
        block["distance_km"] = round(distance_km, 2) if distance_km is not None else None
        block["distance_calc_method"] = "backend_haversine" if distance_km is not None else None

        context_items.append(
            {
                "name": row.get("name"),
                "food_type": row.get("food_type"),
                "cuisine_description": row.get("food_type"),
                "avg_rating": row.get("avg_rating"),
                "ranking_score": round(score, 2),
                "sentiment_summary": _sentiment_summary_from_metrics(metric),
                **block,
                "recent_reviews": [_review_brief(r) for r in recent_list],
                "relevant_reviews": [_review_brief(r) for r in relevant_list[:6]],
                "menu_highlights": _extract_menu_keywords(recent_list + relevant_list, row.get("food_type")),
                "price_description": _price_label(row.get("google_price_tier")),
                "review_insights": _review_insights(all_reviews),
                "aspect_analysis": aspect_analysis,
                "explanation_hint": {
                    "should_describe_food": True,
                    "should_describe_price": True,
                    "should_use_reviews": True,
                },
                "keyword_match_review_count": kw_counts.get(str(row["store_id"]), 0),
            }
        )

    if nearest_mode and loc_ok:
        context_items.sort(
            key=lambda item: (
                item.get("distance_km") is None,
                float(item.get("distance_km") or 0.0),
                -float(item.get("ranking_score") or 0.0),
            )
        )

    ai_input = {
        "role": "diner",
        "user_prompt": payload.prompt,
        "nearest_mode": nearest_mode,
        "specific_restaurant_query": specific_restaurant_query or None,
        "specific_restaurant_match": specific_match.get("name") if specific_match else None,
        "response_depth": "detailed",
        "explanation_requirements": {
            "min_sentences_per_restaurant": 2,
            "target_sentences_per_restaurant": 3,
            "must_cover": [
                "food_and_menu_details",
                "price_context",
                "review_praise_and_complaints",
                "operating_hours_status",
                "distance_if_available",
            ],
        },
        "review_search_keywords": keywords,
        "current_day_myt": now_myt.strftime("%A"),
        "current_time_myt": now_myt.strftime("%I:%M %p"),
        "timezone_note": "Malaysia Time (UTC+8).",
        "distance_policy": "Distances are backend-computed haversine in kilometers. Never estimate or invent missing distance.",
        "has_user_location": loc_ok,
        "user_location": {"lat": user_lat, "lng": user_lng} if loc_ok else None,
        "distance_input_status": location_source,
        "conversation_history": [{"sender": h.get("sender"), "message": h.get("message")} for h in history],
        "top_candidates": context_items,
    }
    answer = zai_client.generate(DINER_SYSTEM_PROMPT, ai_input)
    save_chat_message(conversation_id, payload.role, "user", payload.prompt, payload.restaurant_name)
    save_chat_message(conversation_id, payload.role, "assistant", answer, payload.restaurant_name)
    return AskResponse(answer=answer, conversation_id=conversation_id, source="database", confidence=0.82, restaurants=context_items)


def _handle_vendor(payload: AskRequest, conversation_id: str, history: List[Dict]) -> AskResponse:
    vendor_intent = _detect_vendor_intent(payload.prompt)
    aspect_focus = vendor_intent.replace("aspect_", "") if vendor_intent.startswith("aspect_") else None

    if payload.restaurant_name:
        found = find_restaurant_by_name(payload.restaurant_name)
        if found:
            store_id = found["store_id"]
            now_myt = _now_myt()
            metrics = get_metrics_for_store_ids([store_id]).get(store_id, {})
            reviews = get_recent_reviews(store_id, limit=20)
            scoped_reviews = _reviews_for_requested_period(reviews, payload.prompt, now_myt)
            rest_block = _restaurant_context_block(found, now_myt)
            ai_input = {
                "role": "vendor",
                "vendor_intent": vendor_intent,
                "aspect_focus": aspect_focus,
                "restaurant": {
                    "store_id": found.get("store_id"),
                    "name": found.get("name"),
                    "food_type": found.get("food_type"),
                    "avg_rating": found.get("avg_rating"),
                    **rest_block,
                },
                "sentiment_summary": _sentiment_summary_from_metrics(metrics),
                "recent_reviews": [_review_brief(r) for r in reviews if (r.get("review_text") or "").strip()],
                "scoped_reviews": [_review_brief(r) for r in scoped_reviews if (r.get("review_text") or "").strip()],
                "review_summary": _summarize_review_patterns(scoped_reviews or reviews),
                "conversation_history": [{"sender": h.get("sender"), "message": h.get("message")} for h in history],
                "user_prompt": payload.prompt,
                "current_day_myt": now_myt.strftime("%A"),
                "current_time_myt": now_myt.strftime("%I:%M %p"),
                "timezone_note": "Malaysia Time (UTC+8).",
            }
            answer = zai_client.generate(VENDOR_SYSTEM_PROMPT, ai_input)
            save_chat_message(conversation_id, payload.role, "user", payload.prompt, payload.restaurant_name)
            save_chat_message(conversation_id, payload.role, "assistant", answer, payload.restaurant_name)
            return AskResponse(answer=answer, conversation_id=conversation_id, source="database", confidence=0.86)

    if payload.external_reviews:
        sentiment = _simple_sentiment_summary(payload.external_reviews)
        external_review_items = [{"review_text": text, "updated_at": None} for text in payload.external_reviews]
        review_summary = _summarize_review_patterns(external_review_items)
        ai_input = {
            "role": "vendor",
            "vendor_intent": vendor_intent,
            "aspect_focus": aspect_focus,
            "restaurant_name": payload.restaurant_name,
            "external_reviews": payload.external_reviews,
            "review_summary": review_summary,
            "sentiment_summary": sentiment,
            "sentiment_engine": get_sentiment_engine_status(),
            "sentiment_confidence": sentiment.get("model_confidence", 0.0),
            "conversation_history": [{"sender": h.get("sender"), "message": h.get("message")} for h in history],
            "user_prompt": payload.prompt,
        }
        answer = zai_client.generate(VENDOR_SYSTEM_PROMPT, ai_input)
        save_chat_message(conversation_id, payload.role, "user", payload.prompt, payload.restaurant_name)
        save_chat_message(conversation_id, payload.role, "assistant", answer, payload.restaurant_name)
        return AskResponse(answer=answer, conversation_id=conversation_id, source="external_reviews", confidence=0.68)

    message = (
        "Restaurant not found in database. Provide external_reviews (list of review texts) "
        "to run dynamic analysis for unseen restaurants."
    )
    save_chat_message(conversation_id, payload.role, "user", payload.prompt, payload.restaurant_name)
    save_chat_message(conversation_id, payload.role, "assistant", message, payload.restaurant_name)
    return AskResponse(answer=message, conversation_id=conversation_id, source="fallback", confidence=0.45)


# ── Ranking ───────────────────────────────────────────────────────────────────

def _rank_restaurants(
    prompt: str,
    restaurants: List[Dict],
    metrics_map: Dict[str, Dict],
    kw_counts: Dict[str, int],
    now_myt: datetime,
    user_lat: Optional[float] = None,
    user_lng: Optional[float] = None,
) -> List[Tuple[float, Dict]]:
    prompt_l = prompt.lower()
    cuisine_keywords = [
        "nasi lemak", "malaysian", "korean", "japanese",
        "western", "indian", "thai", "chinese",
    ]
    picked_cuisine = ""
    for keyword in cuisine_keywords:
        if keyword in prompt_l:
            picked_cuisine = keyword
            break

    cheap_mode = any(k in prompt_l for k in ["cheap", "budget", "affordable", "murah"])
    fine_mode = any(k in prompt_l for k in ["fine dining", "luxury", "romantic"])
    late = _late_night_prompt(prompt_l)

    ranked: List[Tuple[float, Dict]] = []
    for row in restaurants:
        metrics = metrics_map.get(row["store_id"], {})
        avg_rating = float(row.get("avg_rating") or 0.0)
        pos_ratio = float(metrics.get("positive_ratio") or 0.0)
        neg_ratio = float(metrics.get("negative_ratio") or 0.0)

        score = (avg_rating * 18.0) + (pos_ratio * 35.0) - (neg_ratio * 22.0)

        food_type = str(row.get("food_type") or "").lower()
        name = str(row.get("name") or "").lower()

        if picked_cuisine and (picked_cuisine in food_type or picked_cuisine in name):
            score += 22.0
        if cheap_mode and avg_rating >= 4.0:
            score += 5.0
        if fine_mode and avg_rating >= 4.4:
            score += 8.0

        sid = str(row["store_id"])
        kc = min(int(kw_counts.get(sid, 0)), 10)
        score += kc * 3.5

        today_h = _today_hours_line(row, now_myt)
        if _hours_suggest_closed(today_h):
            score -= 75.0
        if late and _hours_late_closing_hint(today_h):
            score += 14.0

        pt = _price_tier_level(row.get("google_price_tier"))
        if cheap_mode and pt is not None:
            if pt <= 1:
                score += 10.0
            elif pt >= 3:
                score -= 6.0
        if fine_mode and pt is not None:
            if pt >= 3:
                score += 12.0
            elif pt == 1:
                score -= 4.0

        if user_lat is not None and user_lng is not None:
            rlat = row.get("google_lat")
            rlng = row.get("google_lng")
            if rlat is not None and rlng is not None:
                try:
                    d = _haversine_km(float(user_lat), float(user_lng), float(rlat), float(rlng))
                    score += max(0.0, 18.0 - d * 1.15)
                except (TypeError, ValueError):
                    pass

        ranked.append((score, row))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked


def _simple_sentiment_summary(reviews: List[str]) -> Dict[str, float]:
    model_summary = predict_sentiment_summary(reviews)
    if model_summary is not None:
        return model_summary

    positive_words = ["good", "great", "sedap", "best", "excellent", "friendly", "nice"]
    negative_words = ["bad", "slow", "mahal", "expensive", "dirty", "rude", "not good"]

    pos = 0
    neg = 0
    for review in reviews:
        text = review.lower()
        if any(word in text for word in positive_words):
            pos += 1
        if any(word in text for word in negative_words):
            neg += 1

    total = max(len(reviews), 1)
    return {
        "positive_ratio": round(pos / total, 3),
        "negative_ratio": round(neg / total, 3),
        "neutral_ratio": round(max(total - pos - neg, 0) / total, 3),
        "model_confidence": 0.35,
    }