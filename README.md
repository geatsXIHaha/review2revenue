# Review2Revenue

Review2Revenue is an AI-powered restaurant decision system with two roles:
- User (diner): asks for restaurant recommendations with justification.
- Vendor (restaurant): asks for strengths, problems, and improvement actions.

Tech stack:
- Frontend: React + Vite + Firebase Authentication
- Backend API: FastAPI (Python)
- Database: PostgreSQL (Supabase)
- AI layer: Groq (primary) + Gemini/Z.AI fallback
- Authentication: Firebase (Google Sign-In)
- UI Theme: Glassmorphism with animated food elements
- Legacy dashboard: Streamlit (still available)

## 🎨 Latest Updates (April 2026)

✅ **Firebase Google Sign-In Authentication**
- Users must authenticate with Google before accessing the app
- Secure token-based session management
- Profile information display in header

✅ **Beautiful Foodie Theme**
- Glassmorphic cards with blur effects
- Animated floating food emojis (🍕🍣🍜🧁🍩 etc)
- Sparkle animations throughout
- Wavy ribbon animation at bottom
- Gradient text for titles
- Smooth color transitions

✅ **Responsive & Accessible UI**
- Mobile-optimized with `clamp()` sizing
- All text fully visible and readable
- Touch-friendly button sizes (min 44px)
- Flexible layouts that adapt to screen size
- Proper spacing and padding throughout

✅ **Environment Configuration**
- Comprehensive `.env.example` with all API setup instructions
- Frontend `.env.local` for Firebase config (VITE_ prefixed)
- Security best practices documented
- API key sourcing guides for each service

## Project Structure

```
review2revenue/
├── app/                          # Backend (Python)
│   ├── api.py                   # FastAPI endpoints
│   ├── app.py                   # Streamlit dashboard
│   ├── config.py                # Configuration
│   ├── sentiment_model.py        # ML models
│   └── ...
├── frontend/                     # Frontend (React)
│   ├── src/
│   │   ├── App.jsx             # Main app (after login)
│   │   ├── Login.jsx           # Google Sign-In page
│   │   ├── ProtectedApp.jsx    # Auth wrapper
│   │   ├── firebase.js         # Firebase config
│   │   ├── App.css             # Main styles
│   │   ├── Login.css           # Login styles
│   │   ├── index.css           # Global styles
│   │   └── main.jsx            # Entry point
│   ├── index.html              # HTML root (with background)
│   ├── .env.local              # Firebase env vars
│   ├── .env.example            # Firebase template
│   ├── package.json            # Dependencies
│   └── vite.config.js          # Vite config
├── data/                        # Restaurant data (CSVs)
├── scripts/                     # Utility scripts
├── .env                         # Backend env vars (gitignored)
├── .env.example                 # Backend template
├── .gitignore                   # Git exclusions
└── README.md                    # This file
```

## Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL (local or Supabase)
- Firebase project (for authentication)

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

## 3) Environment Variables Setup

### Backend Configuration (.env)

Use `.env.example` as reference. Create `.env` in project root with:

**Database:**
- `DB_URL` - PostgreSQL connection string

**LLM APIs:**
- `GROQ_API_KEY` - your Groq API key (primary provider)
- `GROQ_BASE_URL` - default `https://api.groq.com/openai/v1`
- `GROQ_MODEL` - default `llama-3.1-8b-instant`
- `GEMINI_API_KEY` - your Gemini API key (secondary)
- `GEMINI_BASE_URL` - default `https://generativelanguage.googleapis.com/v1beta`
- `GEMINI_MODEL` - default `gemini-2.0-flash`
- `ZAI_API_KEY` - your Z.AI key (optional)
- `ZAI_BASE_URL` - default `https://api.z.ai/v1`
- `ZAI_MODEL` - default `glm-4.5`

**Server:**
- `API_HOST` - default `0.0.0.0`
- `API_PORT` - default `8000`

**Google Services:**
- `GOOGLE_PLACES_API_KEY` - Google Places API key (optional, for restaurant enrichment)

**Firebase (Backend reference):**
- Firebase config values (also in frontend/.env.local)

Example:

```env
DB_URL=postgresql://your_user:your_password@localhost:5432/review2revenue_db
GROQ_API_KEY=your_groq_key_here
GOOGLE_PLACES_API_KEY=your_google_key_here
VITE_FIREBASE_API_KEY=your_firebase_key_here
```

### Frontend Configuration (frontend/.env.local)

Create `frontend/.env.local` with Firebase authentication:

```env
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID=YOUR_FIREBASE_MEASUREMENT_ID
```

**How to get Firebase config:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Add a Web app
4. Copy the `firebaseConfig` object values
5. Use the values for VITE_ variables above
6. Save as `frontend/.env.local`

**Important:** 
- `VITE_` prefix is required for Vite to expose variables to frontend
- `.env.local` is gitignored and never committed
- Each developer needs their own `.env.local` with their Firebase credentials

### Security Notes

- `.env` and `frontend/.env.local` are **gitignored** and never committed
- Never put real secrets in `.env.example` or source code
- `.env.example` contains template values with setup instructions
- Each team member should have their own `.env` and `.env.local`

### API Key Priority

When making requests:
1. Groq (`GROQ_API_KEY`) - fastest
2. Gemini (`GEMINI_API_KEY`) - reliable
3. Z.AI (`ZAI_API_KEY`) - optional
4. Fallback - rule-based response

## 4) Frontend Setup (React + Firebase Auth)

Install dependencies and start development server:

```powershell
cd frontend
npm install
npm run dev
```

The frontend will:
- Load at `http://localhost:5173` (or next available port)
- Show **Google Sign-In page** first
- Require authentication before accessing app
- Display animated foodie theme with:
  - Floating food emojis (🍕🍣🍜 etc)
  - Sparkle animations
  - Glassmorphic cards
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
