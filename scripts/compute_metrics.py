from sqlalchemy import create_engine, inspect, text
import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgres@localhost:5432/review2revenue_db")

engine = create_engine(DB_URL)
inspector = inspect(engine)
review_columns = {col["name"] for col in inspector.get_columns("reviews")}

has_model_sentiment = "sentiment_model" in review_columns
has_legacy_sentiment = "sentiment" in review_columns

if has_model_sentiment and has_legacy_sentiment:
    sentiment_expr = "COALESCE(NULLIF(TRIM(sentiment_model), ''), sentiment)"
    sentiment_source = "sentiment_model (fallback: sentiment)"
elif has_model_sentiment:
    sentiment_expr = "sentiment_model"
    sentiment_source = "sentiment_model"
elif has_legacy_sentiment:
    sentiment_expr = "sentiment"
    sentiment_source = "sentiment"
else:
    raise ValueError("reviews table must contain sentiment_model or sentiment column")

with engine.begin() as conn:   # ✅ IMPORTANT CHANGE

    conn.execute(text("DROP TABLE IF EXISTS restaurant_metrics"))

    conn.execute(text("""
    CREATE TABLE restaurant_metrics AS
    SELECT
        store_id,

        AVG(
            CASE 
                WHEN {sentiment_expr} = 'positive' THEN 1
                WHEN {sentiment_expr} = 'neutral' THEN 0
                WHEN {sentiment_expr} = 'negative' THEN -1
            END
        ) AS avg_sentiment,

        AVG(CASE WHEN {sentiment_expr} = 'positive' THEN 1 ELSE 0 END) AS positive_ratio,
        AVG(CASE WHEN {sentiment_expr} = 'negative' THEN 1 ELSE 0 END) AS negative_ratio,

        COUNT(*) AS total_reviews,

        CASE 
            WHEN COUNT(*) > 50 THEN 'high'
            WHEN COUNT(*) > 20 THEN 'medium'
            ELSE 'low'
        END AS confidence_level

    FROM reviews
    GROUP BY store_id
    """.format(sentiment_expr=sentiment_expr)))

print(f"✅ Metrics table created using: {sentiment_source}")