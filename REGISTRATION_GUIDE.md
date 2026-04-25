# Registration Guide

This guide explains the registration flow in simple terms.

## Goal

Registration happens once. After that, the app always opens with the saved role and restaurant assignment.

## Flow

1. The user signs in with Google.
2. The app checks whether a Supabase profile already exists.
3. If no profile exists, the registration screen opens.
4. The user chooses a role: Diner or Vendor.
5. The user confirms the role.
6. Vendors search and select their restaurant.
7. The profile is saved.
8. The app opens with the correct view.

## Rules

- The role is permanent after confirmation.
- Diner users can search restaurants and ask recommendation questions.
- Vendor users are locked to one restaurant using `store_id`.
- Vendors cannot switch to another restaurant later.

## Steps

### 1. Choose a role

- Click Diner or Vendor.
- The next screen asks you to confirm the choice.
- The warning message tells you the role cannot be changed later.

### 2. Confirm the role

- Review the selected role.
- If it is wrong, go back and choose again.
- If it is correct, continue.

### 3. Vendor restaurant search

- Only vendors see this step.
- Type part of the restaurant name.
- The app searches the restaurant database.
- Pick the correct restaurant from the list.

### 4. Complete registration

- The profile is saved in Supabase.
- The app refreshes the user profile right away.
- The user is sent to the main app.

## Data saved in Supabase

The profile usually contains:

- Firebase user id
- email
- display name
- permanent role
- vendor `store_id` if the user is a vendor

## Common problems

- If the restaurant search does not show results, try a shorter name.
- If the page says the profile is missing, complete registration again.
- If the vendor restaurant looks wrong, check the selected `store_id`.
- If login works but the app stays on registration, refresh once after saving.

## Files involved

- `frontend/src/ProtectedApp.jsx`
- `frontend/src/components/Registration.jsx`
- `frontend/src/hooks/useRegistration.js`
- `app/api.py`
- `app/repository.py`

## Environment variables

In `frontend/.env.local`, set your Firebase config values:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

## Summary

The registration flow is simple: sign in, choose a role, confirm it, and finish setup. After that, the user stays on the saved role and assigned restaurant.
