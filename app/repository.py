from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .config import DB_URL

engine: Engine = create_engine(DB_URL)


def _ensure_chat_messages_table() -> None:
    query = text(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id BIGSERIAL PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            sender TEXT NOT NULL,
            message TEXT NOT NULL,
            restaurant_name TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    index_query = text(
        """
        CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
        ON chat_messages (conversation_id, created_at)
        """
    )
    with engine.begin() as conn:
        conn.execute(query)
        conn.execute(index_query)


def save_chat_message(
    conversation_id: str,
    role: str,
    sender: str,
    message: str,
    restaurant_name: Optional[str] = None,
) -> None:
    if not conversation_id or not message.strip():
        return

    _ensure_chat_messages_table()
    query = text(
        """
        INSERT INTO chat_messages (conversation_id, role, sender, message, restaurant_name)
        VALUES (:conversation_id, :role, :sender, :message, :restaurant_name)
        """
    )
    with engine.begin() as conn:
        conn.execute(
            query,
            {
                "conversation_id": conversation_id,
                "role": role,
                "sender": sender,
                "message": message,
                "restaurant_name": restaurant_name,
            },
        )


def get_chat_history(conversation_id: str, role: str, limit: int = 20) -> List[Dict]:
    if not conversation_id:
        return []

    _ensure_chat_messages_table()
    query = text(
        """
        SELECT sender, message, created_at, restaurant_name
        FROM chat_messages
        WHERE conversation_id = :conversation_id AND role = :role
        ORDER BY created_at ASC
        LIMIT :limit
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(
            query,
            {"conversation_id": conversation_id, "role": role, "limit": limit},
        ).mappings().all()
    return [dict(row) for row in rows]


def list_chat_conversations(role: str, limit: int = 50) -> List[Dict]:
    _ensure_chat_messages_table()
    query = text(
        """
        SELECT conversation_id, role, message AS last_message, restaurant_name, created_at AS updated_at
        FROM (
            SELECT
                conversation_id,
                role,
                sender,
                message,
                restaurant_name,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC) AS rn
            FROM chat_messages
            WHERE role = :role
        ) ranked
        WHERE rn = 1
        ORDER BY updated_at DESC
        LIMIT :limit
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"role": role, "limit": limit}).mappings().all()

    out: List[Dict] = []
    for row in rows:
        item = dict(row)
        if item.get("updated_at") is not None:
            item["updated_at"] = item["updated_at"].isoformat()
        out.append(item)
    return out


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