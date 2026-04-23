import os
from pathlib import Path

import joblib
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine


load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgres@localhost:5432/review2revenue_db")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = PROJECT_ROOT / "artifacts" / "sentiment_model.joblib"


def main() -> None:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

    engine = create_engine(DB_URL)
    model = joblib.load(MODEL_PATH)

    df_reviews = pd.read_sql("SELECT * FROM reviews", engine)
    if "review_text" not in df_reviews.columns:
        raise ValueError("reviews table must contain review_text column")

    text_series = df_reviews["review_text"].fillna("").astype(str).str.strip()
    valid_mask = text_series != ""

    preds = pd.Series(index=df_reviews.index, dtype="object")
    preds.loc[valid_mask] = model.predict(text_series.loc[valid_mask])
    preds = preds.fillna("neutral").astype(str).str.lower()

    df_reviews["sentiment_model"] = preds
    df_reviews["sentiment"] = preds

    # Replace table so sentiment columns are in sync with current model output.
    df_reviews.to_sql("reviews", engine, if_exists="replace", index=False)

    pos = int((preds == "positive").sum())
    neu = int((preds == "neutral").sum())
    neg = int((preds == "negative").sum())

    print("Updated reviews with model predictions.")
    print(f"Rows: {len(df_reviews)}")
    print(f"positive={pos}, neutral={neu}, negative={neg}")


if __name__ == "__main__":
    main()
