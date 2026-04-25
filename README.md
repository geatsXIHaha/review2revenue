# Review2Revenue

Here is our pitching video:
https://drive.google.com/file/d/1YBURKtzLn4iBQ33OQA-Hxq199MnW2XEM/view?usp=sharing
You can use the cc button to turn on the subtitles.

Review2Revenue is a restaurant recommendation and review analysis system.

Users sign in with Google, complete a one-time role setup, and then use either the diner or vendor experience:

- Diner: search for restaurants and ask for recommendations
- Vendor: view only the assigned restaurant and get business insights

## Features

- Google sign-in with Firebase
- Permanent diner or vendor role
- Vendor restaurant lock using `store_id`
- AI answers with restaurant cards
- Menu and review views on both home and chat pages
- Chat history for saved conversations
- Database fallback when no external LLM is available

## How it works

1. The user logs in with Google.
2. ProtectedApp checks for a Supabase profile.
3. If the profile is missing, the user completes registration.
4. The home page sends the prompt to `/api/ask`.
5. The backend returns the answer plus restaurant data.
6. The frontend renders the answer, cards, menu, and reviews.
7. If the user opens chat, the same recommendation data is carried over.

## Project layout

```text
review2revenue/
├── app/       FastAPI backend, repository, schemas, AI client
├── data/      Restaurant and review CSV files
├── frontend/  React + Vite app
├── scripts/   Load, enrich, and training scripts
└── README.md
```

## Requirements

- Python 3.10+
- Node.js 18+
- PostgreSQL or Supabase
- Firebase project

## Setup

### Backend

From the project root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python scripts/load_to_db.py
python scripts/compute_metrics.py
python -m uvicorn app.api:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

From the `frontend` folder:

```powershell
npm install
npm run dev
```

The app usually opens at `http://localhost:5173`.

## Environment variables

### Backend `.env`

- `DB_URL`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `ZAI_API_KEY`
- `GOOGLE_PLACES_API_KEY`

### Frontend `frontend/.env.local`

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## API endpoints

- `GET /api/restaurants/search`
- `GET /api/restaurants/by-store-id`
- `POST /api/ask`
- `POST /api/chat/start`
- `GET /api/chat/history`

## Notes

- Keep `.env` and `frontend/.env.local` private.
- Do not commit real API keys.
- `app/app.py` is still available as a legacy Streamlit view.
