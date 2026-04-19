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
