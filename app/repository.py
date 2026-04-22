from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .config import DB_URL

engine: Engine = create_engine(DB_URL)


def _restaurants_csv_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "clean_restaurants.csv"


def _reviews_csv_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "clean_reviews.csv"


def _load_restaurants_from_csv() -> List[Dict]:
    csv_path = _restaurants_csv_path()
    if not csv_path.exists():
        return []

    df = pd.read_csv(csv_path)
    required = ["store_id", "name", "food_type", "avg_rating"]
    for col in required:
        if col not in df.columns:
            return []

    if "review_count" not in df.columns:
        df["review_count"] = 0

    return df[["store_id", "name", "food_type", "avg_rating", "review_count"]].to_dict(orient="records")


def find_restaurant_by_name(name: str) -> Optional[Dict]:
    query = text(
        """
        SELECT store_id, name, food_type, avg_rating, COALESCE(review_count, 0) AS review_count
        FROM restaurants
        WHERE LOWER(name) LIKE LOWER(:name)
        ORDER BY avg_rating DESC
        LIMIT 1
        """
    )
    try:
        with engine.connect() as conn:
            row = conn.execute(query, {"name": f"%{name}%"}).mappings().first()
        return dict(row) if row else None
    except Exception:
        query_l = name.lower()
        for row in _load_restaurants_from_csv():
            if query_l in str(row.get("name", "")).lower():
                return row
        return None


def list_restaurants(limit: int = 40) -> List[Dict]:
    query = text(
        """
        SELECT store_id, name, food_type, avg_rating, COALESCE(review_count, 0) AS review_count
        FROM restaurants
        ORDER BY avg_rating DESC NULLS LAST
        LIMIT :limit
        """
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(query, {"limit": limit}).mappings().all()
        return [dict(row) for row in rows]
    except Exception:
        rows = _load_restaurants_from_csv()
        rows.sort(key=lambda x: float(x.get("avg_rating") or 0.0), reverse=True)
        return rows[:limit]


def search_restaurants_by_name(query_text: str, limit: int = 8) -> List[Dict]:
    query = text(
        """
        SELECT store_id, name, food_type, avg_rating, COALESCE(review_count, 0) AS review_count
        FROM restaurants
        WHERE LOWER(name) LIKE LOWER(:query)
        ORDER BY avg_rating DESC NULLS LAST, name ASC
        LIMIT :limit
        """
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                query,
                {"query": f"%{query_text}%", "limit": limit},
            ).mappings().all()
        return [dict(row) for row in rows]
    except Exception:
        csv_path = _restaurants_csv_path()
        if not csv_path.exists():
            return []

        df = pd.read_csv(csv_path)
        if "name" not in df.columns:
            return []

        mask = df["name"].astype(str).str.lower().str.contains(query_text.lower(), na=False)
        if "food_type" not in df.columns:
            df["food_type"] = None
        if "avg_rating" not in df.columns:
            df["avg_rating"] = None
        if "review_count" not in df.columns:
            df["review_count"] = 0

        filtered = df.loc[mask, ["store_id", "name", "food_type", "avg_rating", "review_count"]].head(limit)
        return filtered.to_dict(orient="records")


def get_metrics_for_store_ids(store_ids: List[str]) -> Dict[str, Dict]:
    if not store_ids:
        return {}

    query = text(
        """
        SELECT store_id, avg_sentiment, positive_ratio, negative_ratio, total_reviews, confidence_level
        FROM restaurant_metrics
        WHERE store_id = ANY(:store_ids)
        """
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(query, {"store_ids": store_ids}).mappings().all()
        return {row["store_id"]: dict(row) for row in rows}
    except Exception:
        return {}


def get_recent_reviews(store_id: str, limit: int = 12) -> List[Dict]:
    query = text(
        """
        SELECT review_text, overall_rating, sentiment, updated_at
        FROM reviews
        WHERE store_id = :store_id
        ORDER BY updated_at DESC NULLS LAST
        LIMIT :limit
        """
    )
    try:
        with engine.connect() as conn:
            rows = conn.execute(query, {"store_id": store_id, "limit": limit}).mappings().all()
        return [dict(row) for row in rows]
    except Exception:
        csv_path = _reviews_csv_path()
        if not csv_path.exists():
            return []

        df = pd.read_csv(csv_path)
        if "store_id" not in df.columns:
            return []

        filtered = df[df["store_id"].astype(str) == str(store_id)].head(limit).copy()
        fields = ["review_text", "overall_rating", "sentiment", "updated_at"]
        for field in fields:
            if field not in filtered.columns:
                filtered[field] = None
        return filtered[fields].to_dict(orient="records")
