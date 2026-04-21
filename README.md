# Review2Revenue

Review2Revenue is an AI-powered restaurant decision system with two roles:
- User (diner): asks for restaurant recommendations with justification.
- Vendor (restaurant): asks for strengths, problems, and improvement actions.

Tech stack:
- Frontend: React + Vite
- Backend API: FastAPI (Python)
- Database: PostgreSQL
- AI layer: Groq (primary) + Gemini/Z.AI fallback
- Legacy dashboard: Streamlit (still available)

## Project Structure

- `app/` - Python apps (`api.py` for FastAPI, `app.py` for Streamlit)
- `frontend/` - React frontend
- `data/` - cleaned CSV files
- `scripts/` - DB loading and metrics scripts
- `requirements.txt` - Python dependencies
- `.env.example` - environment variable template

## Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL running locally (or remote accessible)

## 1) Python Setup

From project root:

```powershell
# If you do not have a venv yet:
python -m venv venv

# Activate (PowerShell)
.\venv\Scripts\Activate.ps1

# Install dependencies
python -m pip install -r requirements.txt
```

## 2) Database Setup

1. Create PostgreSQL database (example name): `review2revenue_db`
2. Update DB connection if needed:
- `DB_URL` in environment (recommended), or
- hardcoded value in scripts if you are using defaults

Load CSVs and compute metrics from project root:

```powershell
python scripts/load_to_db.py
python scripts/compute_metrics.py
```

### Use Supabase (Recommended For Team Collaboration)

Yes, you can switch from local PostgreSQL to Supabase without changing backend code, because this project already uses `DB_URL` from environment variables.

1. Create a Supabase project.
2. In Supabase dashboard, open `Project Settings -> Database` and copy the connection string.
3. Put it in local `.env` as `DB_URL` (use the pooler endpoint and SSL):

```env
DB_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

4. Ask each teammate to set their own local `.env` with the same `DB_URL`.
5. Run scripts to load shared dataset once:

```powershell
python scripts/load_to_db.py
python scripts/compute_metrics.py
```

Notes:
- Keep `.env` private (already ignored by `.gitignore`).
- Do not put real passwords or keys into `.env.example`.
- If connection fails, verify SSL (`sslmode=require`) and your Supabase database password.

## 3) Environment Variables (Optional but Recommended)

Use `.env.example` as reference:

- `DB_URL` - PostgreSQL connection string
- `GROQ_API_KEY` - your Groq API key (primary provider)
- `GROQ_BASE_URL` - default `https://api.groq.com/openai/v1`
- `GROQ_MODEL` - default `llama-3.1-8b-instant`
- `GEMINI_API_KEY` - your Gemini API key (secondary provider)
- `GEMINI_BASE_URL` - default `https://generativelanguage.googleapis.com/v1beta`
- `GEMINI_MODEL` - default `gemini-2.0-flash`
- `ZAI_API_KEY` - your Z.AI key
- `ZAI_BASE_URL` - default `https://api.z.ai/v1`
- `ZAI_MODEL` - default `glm-4.5`
- `API_HOST` - default `0.0.0.0`
- `API_PORT` - default `8000`

How to use this safely:

1. Create a local `.env` file in the project root.
2. Copy values from `.env.example`.
3. Put your real credentials only in `.env`.

Example:

```env
DB_URL=postgresql://your_user:your_password@localhost:5432/review2revenue_db
GROQ_API_KEY=your_key_here
```

Security note:

- `.env` is already ignored by `.gitignore`, so it will not be uploaded to GitHub.
- Never put real secrets in `.env.example` or source code files.

Provider priority:

1. Groq (`GROQ_API_KEY`)
2. Gemini (`GEMINI_API_KEY`)
3. Z.AI (`ZAI_API_KEY`)
4. Rule-based fallback response

## 4) Run FastAPI Backend

From project root:

```powershell
python -m uvicorn app.api:app --reload --host 0.0.0.0 --port 8000
```

Verify health check:

- `http://localhost:8000/health`

## 5) Run React Frontend

In a new terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

The frontend posts to:
- `POST http://localhost:8000/api/ask`

## 6) (Optional) Run Legacy Streamlit Dashboard

If you want the old dashboard:

```powershell
streamlit run app/app.py
```

## 7) (Optional) Train Local Sentiment Model

You can train a lightweight local sentiment classifier from `data/clean_reviews.csv`.

From project root:

```powershell
python scripts/train_sentiment_model.py
```

What this does:
- Trains a TF-IDF + Logistic Regression model on existing `sentiment` labels.
- Saves artifact to `artifacts/sentiment_model.joblib`.
- Prints basic evaluation metrics.

Runtime behavior:
- API automatically uses the trained model for vendor `external_reviews` sentiment summary when the artifact exists.
- If artifact is missing, API falls back to keyword-based sentiment logic.
- Check active mode via `GET /api/sentiment/engine` (returns `trained_model` or `keyword_fallback`).
- Sentiment summary now includes `model_confidence` for transparency.

## 8) (Optional) Generate Synthetic Restaurant Metadata

You can generate synthetic metadata for each restaurant (menu, business hours, price tier, tags).

Preview mode (recommended first):

```powershell
python scripts/enrich_restaurants_synthetic.py
```

This creates:
- `data/clean_restaurants_enriched.csv`

Overwrite main restaurants CSV directly:

```powershell
python scripts/enrich_restaurants_synthetic.py --in-place
```

Note:
- Synthetic tags are now consistent with generated hours (`late-night` appears only when closing hour is late).

After overwriting, reload database and recompute metrics:

```powershell
python scripts/load_to_db.py
python scripts/compute_metrics.py
```

## 9) (Optional) Fetch Real Monday-Sunday Operating Hours (Google Places)

If you want closer-to-real operating hours by day, use Google Places API enrichment.

1. Add API key to `.env`:

```env
GOOGLE_PLACES_API_KEY=your_google_places_key
```

2. Run enrichment script:

```powershell
python scripts/enrich_restaurants_google_hours.py
```

Output:
- `data/clean_restaurants_google_hours.csv`

Useful options:

```powershell
# Test first 20 rows
python scripts/enrich_restaurants_google_hours.py --limit 20

# Change region hint for better matching
python scripts/enrich_restaurants_google_hours.py --region "Petaling Jaya, Malaysia"
```

Added columns include:
- `operating_hours_monday` ... `operating_hours_sunday`
- `operating_hours_by_day_json`
- `google_place_id`, `google_matched_name`, `google_formatted_address`, `google_business_status`
- `google_price_level`, `google_price_tier`
- `google_lat`, `google_lng`
- `google_website`, `google_phone`
- `google_types_json`
- `google_search_query`, `operating_hours_source`

Notes for best quality:
- Start with `--limit 20` to inspect matching quality before full run.
- Tune `--region` to your target area to reduce wrong place matches.
- `operating_hours_source` values:
	- `google_places` = successful lookup
	- `not_found` = no place match found
	- `error` = request/parsing issue
- Places data can change over time and may not always be complete for every restaurant.

## API Notes

### `POST /api/ask`

Request body fields:
- `role`: `diner` or `vendor`
- `prompt`: user question
- `restaurant_name`: optional
- `external_reviews`: optional list of review text (for unlisted restaurants)

Behavior:
- Diner role uses DB restaurants + metrics to rank and explain.
- Vendor role uses DB data when restaurant exists.
- If not in DB, vendor can send `external_reviews` for dynamic analysis.

## Quick Start (Minimal)

```powershell
# Terminal 1 (backend)
python -m uvicorn app.api:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 (frontend)
cd frontend
npm run dev
```

Then open the frontend in your browser.
