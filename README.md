# Review2Revenue

Review2Revenue is a restaurant recommendation and review analysis app.

It has two fixed roles:

- Diner: asks for restaurant recommendations
- Vendor: sees only their own restaurant and gets business analysis

## What the app includes

- Firebase Google sign-in for login
- Supabase user profiles
- FastAPI backend with PostgreSQL data
- React + Vite frontend
- Restaurant cards, menu details, and review summaries
- Chat page that keeps conversation history

## Current behavior

- Role is chosen during registration and cannot be changed later
- Vendors are locked to one restaurant via `store_id`
- Home page shows the AI answer and restaurant cards
- Chat page shows the same recommendation cards and saves chat history
- If no external LLM key is available, the backend returns a database-based summary instead of a live-model response

## Project layout

```text
review2revenue/
├── app/          Backend API, repository, schemas, AI client
├── frontend/     React app
├── data/         Restaurant and review CSV files
├── scripts/      Import, training, and utility scripts
└── README.md
```

## Requirements

- Python 3.10+
- Node.js 18+
- PostgreSQL or Supabase
- Firebase project for authentication

## Setup

### 1. Backend

From the project root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Set the backend environment variables in `.env`, then load the data:

```powershell
python scripts/load_to_db.py
python scripts/compute_metrics.py
```

Start the API:

```powershell
python -m uvicorn app.api:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The app usually opens at `http://localhost:5173`.

## Environment variables

### Backend `.env`

Common values:

- `DB_URL`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `ZAI_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `API_HOST`
- `API_PORT`

### Frontend `frontend/.env.local`

Use your Firebase web app values:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Main API endpoints

- `GET /api/restaurants/search`
- `GET /api/restaurants/by-store-id`
- `POST /api/ask`
- `POST /api/chat/start`
- `GET /api/chat/history`

## Notes

- Keep `.env` and `frontend/.env.local` private.
- Do not commit real API keys.
- The repository still includes `app/app.py` for the legacy Streamlit view.
  - Wavy ribbon at bottom
  - Responsive design for all screen sizes

**Features:**
- Click "🔐 Sign in with Google" to authenticate
- Header shows welcome message with user email
- "🚪 Sign Out" button in top-right
- Full app access after successful login
- Automatic logout handling

## 5) Run FastAPI Backend

From project root (in another terminal):

```powershell
python -m uvicorn app.api:app --reload --host 0.0.0.0 --port 8000
```

Verify health check:

- `http://localhost:8000/health`

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
- `google_place_id`, `google_formatted_address`, `google_business_status`
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

### `GET /api/restaurants/search`
Search restaurants by name (used by diners)
- Query: `query` (string, min 1 char)
- Limit: `limit` (int, default 8, max 20)
- Returns: List of restaurants with `store_id`, `name`, `food_type`, `avg_rating`, `review_count`

### `GET /api/restaurants/by-store-id`
Get a specific restaurant by store_id (used by vendors)
- Query: `store_id` (string)
- Returns: Single restaurant object with full details
- Used during vendor app initialization to fetch their restaurant name

### `POST /api/ask`
Submit a prompt for AI analysis

Request body:
- `role`: `diner` or `vendor`
- `prompt`: user question
- `conversation_id`: optional chat session id (recommended for memory)
- `restaurant_name`: optional
- `external_reviews`: optional list of review text (for unlisted restaurants)

Behavior:
- Diner role uses DB restaurants + metrics to rank and explain.
- Vendor role uses DB data when restaurant exists.
- If not in DB, vendor can send `external_reviews` for dynamic analysis.
- Backend stores chat turns in `chat_messages` table and uses past conversation for follow-up context.

### `GET /api/chat/history`

Query params:
- `conversation_id`: chat session id
- `role`: `diner` or `vendor`

Returns stored messages for that conversation and role.

## Registration & User Management

### Role Selection Flow (Registration)
1. **Step 1 - Role Selection**: User chooses between 🍴 Diner or 🏪 Vendor
2. **Step 1.5 - Role Confirmation**: User confirms their role with warning about permanence
3. **Step 2 - Vendor-Only**: If vendor, search for and select their restaurant by name
4. **Completion**: Profile saved to Supabase `users` table with role and store_id (vendors only)

### Role Permanence
- Once a user confirms their role, it **cannot be changed**
- Role is stored in Supabase `users.role` column
- Backend and frontend read role to determine which view to show
- No role-switching UI elements exist after registration

### User Profile Structure (Supabase `users` table)
```sql
id (UUID)              -- Firebase UID
email (text)           -- User email
user_name (text)       -- User display name
role (ENUM)            -- 'diner' or 'vendor'
store_id (text)        -- Foreign key to restaurants.store_id (vendors only)
created_at (timestamp) -- Account creation time
```

## Quick Start (Minimal Setup)

**Prerequisites:** Firebase project with Google Sign-In enabled, PostgreSQL (local or Supabase)

```powershell
# 1. Create .env in project root with:
#    - DB_URL (PostgreSQL)
#    - GROQ_API_KEY (LLM)
#    - Firebase config values

# 2. Create frontend/.env.local with:
#    - Firebase auth variables (VITE_ prefixed)

# Terminal 1 - Backend
python -m uvicorn app.api:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

Then:
1. Open frontend URL (usually `http://localhost:5173`)
2. Click "🔐 Sign in with Google"
3. Authenticate with your Google account
4. Explore the app! 🍜✨

## Architecture Overview

```
Browser
  ↓
  ├─→ Firebase Auth (Google Sign-In)
  │
  └─→ React Frontend (Vite)
       ↓
       POST /api/ask
       ↓
       FastAPI Backend
       ↓
       ├─ PostgreSQL (restaurant data)
       ├─ Groq/Gemini/Z.AI (LLM)
       └─ Sentiment Model (optional)
```

## UI/UX Features

### Authentication Flow
1. **Login Page** - Beautiful Google Sign-In card with gradient text
2. **Protected Routes** - ProtectedApp wrapper requires authentication
3. **Session Management** - Automatic logout, profile in header

### Visual Design
- **Glassmorphism:** Semi-transparent cards with backdrop blur
- **Animations:** 
  - Floating food emojis (25 different foods)
  - Twinkling sparkles throughout
  - Smooth card entrance animations
  - Wavy ribbon at bottom
  - Orbiting food elements
- **Responsive:** Adapts to mobile, tablet, desktop
- **Readable:** All text fully visible with proper spacing
- **Color Scheme:** Warm pastels (peach, coral, mint, purple, sky)

### Frontend Pages
1. **Login.jsx** - Google Sign-In with Firebase
2. **ProtectedApp.jsx** - Auth wrapper, header with logout
3. **App.jsx** - Main interface:
   - Diner/Vendor role tabs
   - Restaurant search with dropdown
   - Prompt editor
   - AI response display
   - Sentiment engine indicator

## Frontend Dependencies

- `react` ^19.2.4
- `react-dom` ^19.2.4
- `react-markdown` ^10.1.0
- `firebase` latest
- `react-router-dom` ^6.20.0
- Vite build tool

## Customization

### Change Theme Colors
Edit `frontend/src/index.css` `:root` variables:
```css
--cream: #FFF8F0;      /* Background */
--coral: #FF6B6B;      /* Primary accent */
--mint: #B5EAD7;       /* Secondary accent */
```

### Modify Food Emojis
In `frontend/index.html`, update the `foods` array:
```javascript
const foods = ['🍕','🍣','🍜','🧁',...];
```

### Disable Animations
Comment out animation sections in `frontend/src/index.css`:
- `.food-item` - floating foods
- `.sparkle` - sparkles
- `.ribbon` - wavy bottom

## Troubleshooting

### "Blank page on frontend"
1. Check browser console (F12) for errors
2. Verify `frontend/.env.local` has all Firebase variables
3. Check that backend is running on port 8000
4. Clear browser cache and restart dev server

### "Firebase not initializing"
1. Confirm all `VITE_FIREBASE_*` variables in `frontend/.env.local`
2. Verify Firebase project has Web app created
3. Check Firebase console has Google Sign-In enabled
4. Restart Vite dev server after `.env.local` changes

### "Google Sign-In not working"
1. Verify Firebase project OAuth consent screen configured
2. Check Google Cloud project has `google-signin-client-id` set
3. Ensure Firebase Auth domain matches project settings
4. Test in incognito/private mode (avoids cache issues)

### "Backend API not responding"
1. Check `.env` has valid `DB_URL`
2. Verify PostgreSQL is running
3. Check `python -m uvicorn app.api:app` output for errors
4. Visit `http://localhost:8000/health` to test

### "Database connection failed"
1. Test connection string: `psql <DB_URL>`
2. Verify Supabase password is correct (if using Supabase)
3. Check SSL mode: use `sslmode=require` for Supabase
4. Run `python scripts/load_to_db.py` to initialize tables

## Contributing

- Frontend improvements: edit `frontend/src/`
- Backend features: edit `app/`
- Data scripts: update `scripts/`
- Documentation: update `README.md`

## License

[Specify your license here]

---

**Last Updated:** April 23, 2026
**Status:** Production Ready ✅
