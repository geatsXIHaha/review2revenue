import streamlit as st
import pandas as pd
from dotenv import load_dotenv
import os   
from sqlalchemy import create_engine

load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgres@localhost:5432/review2revenue_db")

engine = create_engine(DB_URL)

st.title("🍽️ Review2Revenue Dashboard")

# Load restaurants
df_restaurants = pd.read_sql("SELECT * FROM restaurants", engine)

# Select restaurant
restaurant_name = st.selectbox("Select Restaurant", df_restaurants["name"])

# Get selected restaurant
selected = df_restaurants[df_restaurants["name"] == restaurant_name].iloc[0]
store_id = selected["store_id"]

st.subheader("📊 Restaurant Info")
st.write(selected)

# Load metrics
df_metrics = pd.read_sql(f"""
SELECT * FROM restaurant_metrics
WHERE store_id = '{store_id}'
""", engine)

st.subheader("📈 Metrics")
st.write(df_metrics)

# Load reviews
df_reviews = pd.read_sql(f"""
SELECT review_text, overall_rating, sentiment
FROM reviews
WHERE store_id = '{store_id}'
LIMIT 10
""", engine)

st.subheader("📝 Sample Reviews")
st.write(df_reviews)

# Simple decision logic
if not df_metrics.empty:
    row = df_metrics.iloc[0]

    st.subheader("🧠 AI Insight (Rule-Based Prototype)")

    if row["negative_ratio"] > 0.4:
        st.error("⚠️ High negative sentiment detected. Consider improving service or pricing.")

    elif row["positive_ratio"] > 0.6:
        st.success("✅ Strong customer satisfaction. Maintain quality and scale operations.")

    else:
        st.warning("⚖️ Mixed feedback. Investigate common complaints.")
        