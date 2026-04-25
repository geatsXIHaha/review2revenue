# Review2Revenue - Implementation Summary

This file summarizes how the system works now.

## System overview

Review2Revenue has two fixed roles:

- Diner: asks for restaurant recommendations
- Vendor: sees only the assigned restaurant and gets business analysis

The app uses:

- Firebase for login
- Supabase for user profiles
- FastAPI for the backend API
- PostgreSQL for restaurant, menu, and review data
- React + Vite for the frontend

## Main behavior

- Role is chosen once during registration and cannot be changed later
- Vendors are locked to one restaurant using `store_id`
- The home page shows the AI answer plus restaurant cards
- The chat page keeps the same restaurant cards in conversation history
- Restaurant menu and review buttons are available on the cards
- If no external model key is available, the backend returns a database-backed summary instead of a live LLM response

## Backend changes

- Added `/api/restaurants/by-store-id` for vendor lookup
- `/api/ask` now returns restaurant data for the frontend
- Chat start now keeps restaurant cards with the first message
- Review insertion now stores or infers sentiment values
- Review API responses now infer sentiment from rating when sentiment is missing

## Frontend changes

- `ProtectedApp.jsx` checks Supabase and routes login, registration, and app states
- `App.jsx` renders restaurant cards and adds menu/review actions
- `ChatPage.jsx` keeps restaurant cards, history, and menu/review views
- Shared restaurant cards now show Google Maps, Waze, menu, and review buttons

## Main files

- `app/api.py`: request handling and route logic
- `app/repository.py`: database access and persistence
- `app/schemas.py`: request and response models
- `app/zai_client.py`: model routing and fallback behavior
- `frontend/src/App.jsx`: home page and recommendation cards
- `frontend/src/ChatPage.jsx`: chat page and conversation history
- `frontend/src/ProtectedApp.jsx`: auth and registration flow

## Data flow

1. User logs in with Google.
2. App checks whether a Supabase profile exists.
3. If not, the user completes registration.
4. The user sends a prompt on the home page.
5. Backend returns answer text and restaurant data.
6. Frontend renders cards, menu, and reviews.
7. If the user opens chat, the first result is carried over.

## Notes

- The legacy Streamlit dashboard still exists in `app/app.py`.
- The source of truth for restaurant data is PostgreSQL or Supabase.
- Keep `.env` and `.env.local` files private.
