from pathlib import Path
import json
import threading
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .config import DB_URL

engine: Engine = create_engine(DB_URL)
_CHAT_SCHEMA_INIT_LOCK = threading.Lock()
_CHAT_SCHEMA_INITIALIZED = False


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")

# Columns that exist on public.restaurants (no review_count in schema).
_RESTAURANT_SELECT_SQL = """
    SELECT
        store_id,
        name,
        food_type,
        avg_rating,
        google_place_id,
        google_formatted_address,
        google_price_tier,
        google_lat,
        google_lng,
        google_website,
        google_phone,
        operating_hours_monday,
        operating_hours_tuesday,
        operating_hours_wednesday,
        operating_hours_thursday,
        operating_hours_friday,
        operating_hours_saturday,
        operating_hours_sunday,
        operating_hours_by_day_json
    FROM restaurants
"""

_RESTAURANT_ROW_KEYS = [
    "store_id",
    "name",
    "food_type",
    "avg_rating",
    "google_place_id",
    "google_formatted_address",
    "google_price_tier",
    "google_lat",
    "google_lng",
    "google_website",
    "google_phone",
    "operating_hours_monday",
    "operating_hours_tuesday",
    "operating_hours_wednesday",
    "operating_hours_thursday",
    "operating_hours_friday",
    "operating_hours_saturday",
    "operating_hours_sunday",
    "operating_hours_by_day_json",
]


def _row_from_csv_record(rec: Dict) -> Dict:
    out: Dict = {}
    for k in _RESTAURANT_ROW_KEYS:
        v = rec.get(k)
        if v is not None and pd.isna(v):
            v = None
        out[k] = v
    return out


def _ensure_chat_messages_table() -> None:
    global _CHAT_SCHEMA_INITIALIZED
    if _CHAT_SCHEMA_INITIALIZED:
        return

    with _CHAT_SCHEMA_INIT_LOCK:
        if _CHAT_SCHEMA_INITIALIZED:
            return

        conversations_query = text(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                conversation_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('diner', 'vendor')),
                title TEXT NULL DEFAULT 'Untitled chat',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        query = text(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id BIGSERIAL PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                sender TEXT NOT NULL,
                message TEXT NOT NULL,
                restaurant_name TEXT NULL,
                restaurants_json JSONB NULL,
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
        index_query_stable = text(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_id
            ON chat_messages (conversation_id, created_at, id)
            """
        )
        conversation_index_query = text(
            """
            CREATE INDEX IF NOT EXISTS idx_conversations_user_role_updated
            ON conversations (user_id, role, updated_at DESC)
            """
        )
        optional_indexes_query = text(
            """
            DO $$
            BEGIN
                IF to_regclass('public.reviews') IS NOT NULL THEN
                    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reviews_store_updated ON reviews (store_id, updated_at DESC)';
                END IF;

                IF to_regclass('public.restaurant_metrics') IS NOT NULL THEN
                    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_restaurant_metrics_store ON restaurant_metrics (store_id)';
                END IF;
            END $$;
            """
        )

        with engine.begin() as conn:
            conn.execute(conversations_query)
            conn.execute(query)
            conn.execute(
                text(
                    """
                    ALTER TABLE chat_messages
                    ADD COLUMN IF NOT EXISTS restaurants_json JSONB NULL
                    """
                )
            )
            conn.execute(
                text(
                    """
                    UPDATE chat_messages
                    SET role = CASE
                        WHEN LOWER(sender) IN ('assistant', 'ai') THEN 'assistant'
                        ELSE 'user'
                    END
                    WHERE role NOT IN ('user', 'assistant')
                    """
                )
            )
            conn.execute(
                text(
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'chat_messages_role_check'
                        ) THEN
                            ALTER TABLE chat_messages
                            ADD CONSTRAINT chat_messages_role_check
                            CHECK (role IN ('user', 'assistant'));
                        END IF;
                    END $$;
                    """
                )
            )
            conn.execute(index_query)
            conn.execute(index_query_stable)
            conn.execute(conversation_index_query)
            conn.execute(optional_indexes_query)

        _CHAT_SCHEMA_INITIALIZED = True


def upsert_conversation(conversation_id: str, user_id: str, role: str, title: str = "Untitled chat") -> None:
    if not conversation_id or not user_id or role not in {"diner", "vendor"}:
        return
    _ensure_chat_messages_table()
    query = text(
        """
        INSERT INTO conversations (conversation_id, user_id, role, title)
        VALUES (:conversation_id, :user_id, :role, :title)
        ON CONFLICT (conversation_id)
        DO NOTHING
        """
    )
    with engine.begin() as conn:
        conn.execute(
            query,
            {
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": role,
                "title": title or "Untitled chat",
            },
        )


def save_chat_message(
    conversation_id: str,
    role: str,
    sender: str,
    message: str,
    restaurant_name: Optional[str] = None,
    restaurants: Optional[List[Dict[str, Any]]] = None,
) -> None:
    if not conversation_id or not message.strip() or role not in {"user", "assistant"}:
        return

    _ensure_chat_messages_table()
    query = text(
        """
        INSERT INTO chat_messages (conversation_id, role, sender, message, restaurant_name, restaurants_json)
        VALUES (:conversation_id, :role, :sender, :message, :restaurant_name, CAST(:restaurants_json AS JSONB))
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
                "restaurants_json": json.dumps(restaurants, default=_json_default) if restaurants else None,
            },
        )
        conn.execute(
            text(
                """
                UPDATE conversations
                SET updated_at = NOW()
                WHERE conversation_id = :conversation_id
                """
            ),
            {"conversation_id": conversation_id},
        )


def get_chat_history(conversation_id: str, limit: Optional[int] = None) -> List[Dict]:
    if not conversation_id:
        return []

    _ensure_chat_messages_table()
    base_sql = """
        SELECT id, role, sender, message, created_at, restaurant_name, restaurants_json
        FROM chat_messages
        WHERE conversation_id = :conversation_id
        ORDER BY created_at ASC, id ASC
    """
    query = text(base_sql if limit is None else f"{base_sql}\nLIMIT :limit")
    with engine.connect() as conn:
        params = {"conversation_id": conversation_id}
        if limit is not None:
            params["limit"] = limit
        rows = conn.execute(query, params).mappings().all()
    out: List[Dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        raw_restaurants = item.get("restaurants_json")
        restaurants: List[Dict[str, Any]] = []
        if isinstance(raw_restaurants, list):
            restaurants = raw_restaurants
        elif isinstance(raw_restaurants, str):
            try:
                parsed = json.loads(raw_restaurants)
                if isinstance(parsed, list):
                    restaurants = parsed
            except Exception:
                restaurants = []
        item["restaurants"] = restaurants
        item.pop("restaurants_json", None)
        out.append(item)
    return out


def list_chat_conversations(role: str, user_id: str, limit: int = 50) -> List[Dict]:
    _ensure_chat_messages_table()
    query = text(
        """
        SELECT conversation_id, role, message AS last_message, restaurant_name, created_at AS updated_at
        FROM (
            SELECT
                cm.id,
                cm.conversation_id,
                c.role,
                cm.sender,
                cm.message,
                cm.restaurant_name,
                cm.created_at,
                ROW_NUMBER() OVER (PARTITION BY cm.conversation_id ORDER BY cm.created_at DESC, cm.id DESC) AS rn
            FROM chat_messages cm
            INNER JOIN conversations c
                ON c.conversation_id = cm.conversation_id
            WHERE c.role = :role
              AND c.user_id = :user_id
        ) ranked
        WHERE rn = 1
        ORDER BY updated_at DESC
        LIMIT :limit
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"role": role, "user_id": user_id, "limit": limit}).mappings().all()

    out: List[Dict] = []
    for row in rows:
        item = dict(row)
        if item.get("updated_at") is not None:
            item["updated_at"] = item["updated_at"].isoformat()
        out.append(item)
    return out


def get_existing_conversation_for_initial_pair(user_id: str, role: str, question: str, answer: str) -> Optional[str]:
    _ensure_chat_messages_table()
    query = text(
        """
        SELECT c.conversation_id
        FROM conversations c
        INNER JOIN chat_messages u
            ON u.conversation_id = c.conversation_id
            AND u.role = 'user'
            AND u.message = :question
        INNER JOIN chat_messages a
            ON a.conversation_id = c.conversation_id
            AND a.role = 'assistant'
            AND a.message = :answer
        WHERE c.user_id = :user_id
          AND c.role = :role
        ORDER BY c.created_at DESC
        LIMIT 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(
            query,
            {"user_id": user_id, "role": role, "question": question, "answer": answer},
        ).mappings().first()
    return str(row["conversation_id"]) if row else None


def start_conversation_with_initial_messages(
    conversation_id: str,
    user_id: str,
    role: str,
    question: str,
    answer: str,
    restaurant_name: Optional[str] = None,
) -> None:
    _ensure_chat_messages_table()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO conversations (conversation_id, user_id, role, title)
                VALUES (:conversation_id, :user_id, :role, :title)
                ON CONFLICT (conversation_id)
                DO NOTHING
                """
            ),
            {
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": role,
                "title": "Untitled chat",
            },
        )
        count_row = conn.execute(
            text(
                """
                SELECT COUNT(*) AS cnt
                FROM chat_messages
                WHERE conversation_id = :conversation_id
                """
            ),
            {"conversation_id": conversation_id},
        ).mappings().first()
        if int(count_row["cnt"]) == 0:
            conn.execute(
                text(
                    """
                    INSERT INTO chat_messages (conversation_id, role, sender, message, restaurant_name, restaurants_json)
                    VALUES (:conversation_id, 'user', :sender, :message, :restaurant_name, NULL)
                    """
                ),
                {
                    "conversation_id": conversation_id,
                    "sender": user_id,
                    "message": question,
                    "restaurant_name": restaurant_name,
                },
            )
            conn.execute(
                text(
                    """
                    INSERT INTO chat_messages (conversation_id, role, sender, message, restaurant_name, restaurants_json)
                    VALUES (:conversation_id, 'assistant', 'ai', :message, :restaurant_name, NULL)
                    """
                ),
                {
                    "conversation_id": conversation_id,
                    "message": answer,
                    "restaurant_name": restaurant_name,
                },
            )
        conn.execute(
            text(
                """
                UPDATE conversations
                SET updated_at = NOW()
                WHERE conversation_id = :conversation_id
                """
            ),
            {"conversation_id": conversation_id},
        )


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

    records = df.to_dict(orient="records")
    return [_row_from_csv_record(r) for r in records]


def find_restaurant_by_name(name: str) -> Optional[Dict]:
    query = text(
        _RESTAURANT_SELECT_SQL
        + """
        WHERE LOWER(name) LIKE LOWER(:name)
        ORDER BY avg_rating DESC NULLS LAST
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


def find_restaurant_by_store_id(store_id: str) -> Optional[Dict]:
    query = text(
        _RESTAURANT_SELECT_SQL
        + """
        WHERE store_id = :store_id
        LIMIT 1
        """
    )
    try:
        with engine.connect() as conn:
            row = conn.execute(query, {"store_id": store_id}).mappings().first()
        return dict(row) if row else None
    except Exception:
        for row in _load_restaurants_from_csv():
            if row.get("store_id") == store_id:
                return row
        return None


def find_vendor_restaurant_by_user_id(user_id: str):
    query = text("""
        SELECT r.*
        FROM users u
        JOIN restaurants r
          ON r.store_id = u.store_id
        WHERE u.id = :user_id
          AND u.role = 'vendor'
        LIMIT 1
    """)

    with engine.connect() as conn:
        row = conn.execute(query, {"user_id": user_id}).mappings().first()

    return dict(row) if row else None


def list_restaurants(limit: int = 40) -> List[Dict]:
    query = text(
        _RESTAURANT_SELECT_SQL
        + """
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
        _RESTAURANT_SELECT_SQL
        + """
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
        q = query_text.lower()
        rows = [r for r in _load_restaurants_from_csv() if q in str(r.get("name", "")).lower()]
        rows.sort(key=lambda x: float(x.get("avg_rating") or 0.0), reverse=True)
        return rows[:limit]


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


def _normalize_keyword_terms(keywords: List[str], max_terms: int = 10) -> List[str]:
    seen: set = set()
    out: List[str] = []
    for raw in keywords:
        t = (raw or "").strip().lower()
        if len(t) < 2 or t in seen:
            continue
        seen.add(t)
        out.append(t)
        if len(out) >= max_terms:
            break
    return out


def get_reviews_by_keywords(store_id: str, keywords: List[str], limit: int = 8) -> List[Dict]:
    terms = _normalize_keyword_terms(keywords)
    if not terms:
        return []

    or_clauses: List[str] = []
    params: Dict = {"store_id": store_id, "limit": limit}
    for i, term in enumerate(terms):
        key = f"k{i}"
        or_clauses.append(f"LOWER(COALESCE(review_text, '')) LIKE :{key}")
        params[key] = f"%{term}%"

    sql = f"""
        SELECT review_text, overall_rating, sentiment, updated_at
        FROM reviews
        WHERE store_id = :store_id AND ({' OR '.join(or_clauses)})
        ORDER BY updated_at DESC NULLS LAST
        LIMIT :limit
    """
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).mappings().all()
        return [dict(row) for row in rows]
    except Exception:
        csv_path = _reviews_csv_path()
        if not csv_path.exists():
            return []

        df = pd.read_csv(csv_path)
        if "store_id" not in df.columns or "review_text" not in df.columns:
            return []

        sub = df[df["store_id"].astype(str) == str(store_id)].copy()
        if sub.empty:
            return []

        def matches(txt: str) -> bool:
            low = str(txt).lower()
            return any(term in low for term in terms)

        sub = sub[sub["review_text"].astype(str).apply(matches)]
        sub = sub.head(limit)
        fields = ["review_text", "overall_rating", "sentiment", "updated_at"]
        for field in fields:
            if field not in sub.columns:
                sub[field] = None
        return sub[fields].to_dict(orient="records")


def count_reviews_matching_keywords(store_ids: List[str], keywords: List[str]) -> Dict[str, int]:
    terms = _normalize_keyword_terms(keywords)
    if not store_ids or not terms:
        return {}

    or_clauses: List[str] = []
    params: Dict = {"store_ids": store_ids}
    for i, term in enumerate(terms):
        key = f"k{i}"
        or_clauses.append(f"LOWER(COALESCE(review_text, '')) LIKE :{key}")
        params[key] = f"%{term}%"

    sql = f"""
        SELECT store_id, COUNT(*) AS cnt
        FROM reviews
        WHERE store_id = ANY(:store_ids) AND ({' OR '.join(or_clauses)})
        GROUP BY store_id
    """
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).mappings().all()
        return {str(row["store_id"]): int(row["cnt"]) for row in rows}
    except Exception:
        csv_path = _reviews_csv_path()
        if not csv_path.exists():
            return {}

        df = pd.read_csv(csv_path)
        if "store_id" not in df.columns or "review_text" not in df.columns:
            return {}

        id_set = {str(x) for x in store_ids}
        sub = df[df["store_id"].astype(str).isin(id_set)]
        counts: Dict[str, int] = {}
        for sid, grp in sub.groupby(sub["store_id"].astype(str)):
            c = 0
            for txt in grp["review_text"].astype(str):
                low = txt.lower()
                if any(term in low for term in terms):
                    c += 1
            if c:
                counts[str(sid)] = c
        return counts


def insert_bulk_menu_items(records: list) -> int:
    if not records:
        return 0

    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO menu_items 
                        (menu_id, store_id, restaurant_name, item_name, category, price_rm, source)
                    VALUES 
                        (:menu_id, :store_id, :restaurant_name, :item_name, :category, :price_rm, :source)
                """),
                records
            )
        return len(records)
    except Exception as e:
        print(f"Database bulk insert error: {e}")
        raise Exception(f"Failed to insert records into the database: {e}")


def insert_bulk_reviews(records: list) -> int:
    if not records:
        return 0

    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO reviews 
                        (uuid, store_id, review_text, overall_rating, food_rating, rider_rating, updated_at)
                    VALUES 
                        (gen_random_uuid(), :store_id, :review_text, :overall_rating, :food_rating, :rider_rating, NOW())
                """),
                records
            )
        return len(records)
    except Exception as e:
        print(f"Review bulk insert error: {e}")
        raise Exception(f"Failed to insert reviews: {e}")