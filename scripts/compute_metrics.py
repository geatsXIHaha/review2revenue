from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgres@localhost:5432/review2revenue_db")

engine = create_engine(DB_URL)

with engine.begin() as conn:   # ✅ IMPORTANT CHANGE

    conn.execute(text("DROP TABLE IF EXISTS restaurant_metrics"))

    conn.execute(text("""
    CREATE TABLE restaurant_metrics AS
    SELECT
        store_id,

        AVG(
            CASE 
                WHEN sentiment = 'positive' THEN 1
                WHEN sentiment = 'neutral' THEN 0
                WHEN sentiment = 'negative' THEN -1
            END
        ) AS avg_sentiment,

        AVG(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS positive_ratio,
        AVG(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative_ratio,

        COUNT(*) AS total_reviews,

        CASE 
            WHEN COUNT(*) > 50 THEN 'high'
            WHEN COUNT(*) > 20 THEN 'medium'
            ELSE 'low'
        END AS confidence_level

    FROM reviews
    GROUP BY store_id
    """))

print("✅ Metrics table created!")