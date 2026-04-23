from typing import Dict, List, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .repository import (
    find_restaurant_by_name,
    find_restaurant_by_store_id,
    get_metrics_for_store_ids,
    get_recent_reviews,
    list_restaurants,
    search_restaurants_by_name,
)
from .schemas import AskRequest, AskResponse
from .sentiment_model import get_sentiment_engine_status, predict_sentiment_summary
from .zai_client import ZAIClient

app = FastAPI(title="Review2Revenue API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

zai_client = ZAIClient()


DINER_SYSTEM_PROMPT = (
    "You are a food recommendation assistant operating as a decision intelligence system. "
    "Use review-driven insights, customer sentiment analysis, context-aware reasoning, "
    "and explainable AI decisions to help users choose where to eat. "
    "\n\n"
    "Consider these dimensions when deciding:\n"
    "- cuisine type\n"
    "- budget\n"
    "- rating\n"
    "- sentiment from reviews\n"
    "\n"
    "Provide output with this structure:\n"
    "1. Recommended restaurants (top choices)\n"
    "2. Reasons for each recommendation (grounded in ratings and review sentiment)\n"
    "3. Trade-offs (for example price vs quality)\n"
    "\n"
    "Keep recommendations actionable, justified, and easy to compare. "
    "Use markdown bold (**text**) for important keywords such as cuisine, price level, and major decision factors."
)

VENDOR_SYSTEM_PROMPT = (
    "You are a restaurant business consultant focused on business optimization. "
    "Use review-driven insights, customer sentiment analysis, actionable recommendations, "
    "context-aware reasoning, what-if simulation thinking, and explainable AI decisions."
    "\n\n"
    "Analyze performance using:\n"
    "- customer reviews\n"
    "- sentiment trends\n"
    "- rating metrics\n"
    "\n"
    "Provide output with this structure:\n"
    "1. Key problems\n"
    "2. Strengths\n"
    "3. Actionable improvements (prioritized)\n"
    "4. Estimated business impact (rating, revenue, customer retention)\n"
    "\n"
    "Make the response clear, practical, and strongly justified by evidence. "
    "Use markdown bold (**text**) for critical issues, strengths, and top action priorities."
)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/restaurants/search")
def search_restaurants(query: str = Query(min_length=1), limit: int = Query(default=8, ge=1, le=20)) -> Dict[str, List[Dict]]:
    try:
        rows = search_restaurants_by_name(query_text=query, limit=limit)
    except Exception:
        rows = []
    return {"restaurants": rows}


@app.get("/api/restaurants/by-store-id")
def get_restaurant_by_store_id(store_id: str = Query(min_length=1)) -> Dict:
    """Get a restaurant by its store_id"""
    try:
        restaurant = find_restaurant_by_store_id(store_id)
        if restaurant:
            return {"restaurant": restaurant}
        else:
            raise HTTPException(status_code=404, detail=f"Restaurant with store_id '{store_id}' not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sentiment/engine")
def sentiment_engine() -> Dict[str, str]:
    return {"engine": get_sentiment_engine_status()}


@app.post("/api/ask", response_model=AskResponse)
def ask(payload: AskRequest) -> AskResponse:
    if payload.role == "diner":
        return _handle_diner(payload)
    if payload.role == "vendor":
        return _handle_vendor(payload)
    raise HTTPException(status_code=400, detail="Unsupported role")


def _handle_diner(payload: AskRequest) -> AskResponse:
    restaurants = list_restaurants(limit=60)
    if not restaurants:
        raise HTTPException(status_code=500, detail="No restaurants available in database")

    metrics_map = get_metrics_for_store_ids([r["store_id"] for r in restaurants])
    ranked = _rank_restaurants(payload.prompt, restaurants, metrics_map)
    top = ranked[:5]

    context_items = []
    for score, row in top:
        metric = metrics_map.get(row["store_id"], {})
        reviews = get_recent_reviews(row["store_id"], limit=3)
        context_items.append(
            {
                "name": row.get("name"),
                "food_type": row.get("food_type"),
                "avg_rating": row.get("avg_rating"),
                "score": round(score, 2),
                "metrics": metric,
                "sample_reviews": [r.get("review_text", "") for r in reviews],
            }
        )

    ai_input = {
        "role": "diner",
        "user_prompt": payload.prompt,
        "top_candidates": context_items,
        "output_format": "Top choices, reasons, trade-offs, and final best pick",
    }
    answer = zai_client.generate(DINER_SYSTEM_PROMPT, ai_input)

    return AskResponse(answer=answer, source="database", confidence=0.82)


def _handle_vendor(payload: AskRequest) -> AskResponse:
    if payload.restaurant_name:
        found = find_restaurant_by_name(payload.restaurant_name)
        if found:
            store_id = found["store_id"]
            metrics = get_metrics_for_store_ids([store_id]).get(store_id, {})
            reviews = get_recent_reviews(store_id, limit=20)
            ai_input = {
                "role": "vendor",
                "restaurant": found,
                "metrics": metrics,
                "recent_reviews": [r.get("review_text", "") for r in reviews],
                "user_prompt": payload.prompt,
                "output_format": "strengths, weaknesses, prioritized actions, expected impact",
            }
            answer = zai_client.generate(VENDOR_SYSTEM_PROMPT, ai_input)
            return AskResponse(answer=answer, source="database", confidence=0.86)

    if payload.external_reviews:
        sentiment = _simple_sentiment_summary(payload.external_reviews)
        ai_input = {
            "role": "vendor",
            "restaurant_name": payload.restaurant_name,
            "external_reviews": payload.external_reviews,
            "sentiment_summary": sentiment,
            "sentiment_engine": get_sentiment_engine_status(),
            "sentiment_confidence": sentiment.get("model_confidence", 0.0),
            "user_prompt": payload.prompt,
            "output_format": "strengths, weaknesses, prioritized actions, expected impact",
        }
        answer = zai_client.generate(VENDOR_SYSTEM_PROMPT, ai_input)
        return AskResponse(answer=answer, source="external_reviews", confidence=0.68)

    message = (
        "Restaurant not found in database. Provide external_reviews (list of review texts) "
        "to run dynamic analysis for unseen restaurants."
    )
    return AskResponse(answer=message, source="fallback", confidence=0.45)


def _rank_restaurants(prompt: str, restaurants: List[Dict], metrics_map: Dict[str, Dict]) -> List[Tuple[float, Dict]]:
    prompt_l = prompt.lower()
    cuisine_keywords = [
        "nasi lemak",
        "malaysian",
        "korean",
        "japanese",
        "western",
        "indian",
        "thai",
        "chinese",
    ]

    picked_cuisine = ""
    for keyword in cuisine_keywords:
        if keyword in prompt_l:
            picked_cuisine = keyword
            break

    cheap_mode = any(k in prompt_l for k in ["cheap", "budget", "affordable", "murah"])
    fine_mode = any(k in prompt_l for k in ["fine dining", "luxury", "romantic"])

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
