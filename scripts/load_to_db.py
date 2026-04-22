import pandas as pd
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgres@localhost:5432/review2revenue_db")

PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Load cleaned CSVs
restaurants_path = PROJECT_ROOT / "data" / "clean_restaurants_google_hours.csv"
reviews_path = PROJECT_ROOT / "data" / "clean_reviews.csv"

if not restaurants_path.exists():
	raise FileNotFoundError(f"Missing file: {restaurants_path}")
if not reviews_path.exists():
	raise FileNotFoundError(f"Missing file: {reviews_path}")

df_restaurants = pd.read_csv(restaurants_path)
df_reviews = pd.read_csv(reviews_path)

# Connect to PostgreSQL
engine = create_engine(DB_URL)

# Insert into database
df_restaurants.to_sql("restaurants", engine, if_exists="replace", index=False)
df_reviews.to_sql("reviews", engine, if_exists="replace", index=False)

print("✅ Data loaded into PostgreSQL!")