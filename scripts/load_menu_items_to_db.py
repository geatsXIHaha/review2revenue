import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgres@localhost:5432/review2revenue_db")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
MENU_PATH = PROJECT_ROOT / "data" / "menu_items_synthetic.csv"


def main() -> None:
    if not MENU_PATH.exists():
        raise FileNotFoundError(f"Missing file: {MENU_PATH}")

    df_menu = pd.read_csv(MENU_PATH)
    required = ["menu_id", "store_id", "restaurant_name", "item_name", "category", "price_rm", "source", "is_available", "updated_at"]
    for col in required:
        if col not in df_menu.columns:
            raise ValueError(f"CSV missing required column: {col}")

    engine = create_engine(DB_URL)

    # Replace table so reruns are deterministic and easy for team sync.
    df_menu.to_sql("menu_items", engine, if_exists="replace", index=False)

    with engine.begin() as conn:
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_menu_items_store_id ON menu_items (store_id)"))
        count = conn.execute(text("SELECT COUNT(*) FROM menu_items")).scalar() or 0

    print(f"Loaded menu_items table with {count} rows.")


if __name__ == "__main__":
    main()
