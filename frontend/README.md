# Frontend

This folder contains the React + Vite app for Review2Revenue.

## What it does

- Handles Firebase login
- Shows the registration flow when needed
- Displays the diner home page
- Opens the chat page
- Renders restaurant cards, menus, reviews, and distance

## Setup

From the `frontend` folder:

```powershell
npm install
npm run dev
```

The app usually runs at `http://localhost:5173`.

## Environment variables

Create `frontend/.env.local` with your Firebase web config:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Useful scripts

- `npm run dev` - start the local dev server
- `npm run build` - create a production build
- `npm run lint` - check code quality

## Notes

- The frontend expects the backend API to run on `http://localhost:8000`
- Keep `frontend/.env.local` private
- The app uses React Markdown to render AI responses
