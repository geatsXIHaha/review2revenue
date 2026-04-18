import pandas as pd
from sqlalchemy import create_engine

# 🔧 CHANGE THIS
DB_URL = "postgresql://postgres:072a0385f6@localhost:5432/review2revenue_db"

# Load cleaned CSVs
df_restaurants = pd.read_csv("data/clean_restaurants.csv")
df_reviews = pd.read_csv("data/clean_reviews.csv")

# Connect to PostgreSQL
engine = create_engine(DB_URL)

# Insert into database
df_restaurants.to_sql("restaurants", engine, if_exists="replace", index=False)
df_reviews.to_sql("reviews", engine, if_exists="replace", index=False)

print("✅ Data loaded into PostgreSQL!")