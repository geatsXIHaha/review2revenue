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

# Keep schema column as `name`; if old CSVs still carry google_matched_name,
# fold values into name and remove the legacy column.
if "google_matched_name" in df_restaurants.columns:
	if "name" in df_restaurants.columns:
		google_name = df_restaurants["google_matched_name"].astype(str).str.strip()
		df_restaurants["name"] = google_name.where(google_name != "", df_restaurants["name"])
	df_restaurants = df_restaurants.drop(columns=["google_matched_name"])

# Connect to PostgreSQL
engine = create_engine(DB_URL)

# Insert into database
df_restaurants.to_sql("restaurants", engine, if_exists="replace", index=False)
df_reviews.to_sql("reviews", engine, if_exists="replace", index=False)

print("✅ Data loaded into PostgreSQL!")