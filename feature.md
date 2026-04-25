# Review2Revenue Features

This document explains the main features and functions of Review2Revenue in a detailed but simple way.

## What Review2Revenue Does

Review2Revenue is a restaurant recommendation and review analysis platform.

It helps two kinds of users:

- Diner users who want restaurant recommendations
- Vendor users who want business insights for one assigned restaurant

The system combines Google login, role-based access, restaurant search, AI answers, restaurant cards, review analysis, and chat history.

## Main User Roles

### Diner

The diner role is for users who want to discover restaurants.

What a diner can do:

- Search for restaurants
- Ask questions like what to eat, where to go, or which place is best
- View AI answers with restaurant cards
- Open restaurant menu links and review links
- Continue the same recommendation in chat

### Vendor

The vendor role is for restaurant owners or staff.

What a vendor can do:

- See only the restaurant assigned to their account
- View business-related analysis for that restaurant
- Read reviews and menu-related information
- Use the chat page to continue the same conversation

The vendor role is fixed after registration. It cannot be changed later without updating the saved profile.

## Core Features

### 1. Google Sign-In

Users log in with Google through Firebase.

Why it matters:

- It avoids manual password setup
- It keeps the login flow simple
- It gives each user a stable identity for registration and saved history

### 2. One-Time Registration

After login, the app checks whether the user already has a Supabase profile.

If the profile does not exist:

- The user goes through registration
- The user selects either Diner or Vendor
- The app saves the role permanently

For vendors:

- The user must search and select a restaurant
- The selected restaurant is stored using `store_id`

### 3. Restaurant Recommendation on the Home Page

The home page is the main place where users ask for restaurant suggestions.

When the user submits a question:

- The frontend sends the prompt to the backend
- The backend returns a natural-language answer
- The backend also returns restaurant records
- The frontend renders those restaurants as cards

This is why users see both text answers and restaurant cards together.

### 4. Restaurant Cards

Restaurant cards are one of the most visible features in the app.

Each card can show:

- Restaurant name
- Food type or category
- Rating and review count
- Distance when available
- Menu link
- Review link
- Map navigation links

These cards make the AI answer actionable instead of just text-only.

### 5. Chat Page Recommendation Carryover

If the user opens chat after getting a recommendation, the same restaurant results are carried into the conversation.

This keeps the experience consistent because:

- The user does not lose the original recommendation
- The chat history can show the same restaurant cards
- Follow-up questions stay tied to the same result set

### 6. Menu and Review Actions

The app gives users direct actions from each restaurant card.

Supported actions include:

- Open Google Maps directions
- Open Waze navigation
- View the restaurant menu
- View restaurant reviews

These actions reduce friction because the user can move from recommendation to action without searching again.

### 7. Conversation History

The app stores chat history so users can continue previous conversations.

This helps with:

- Returning to earlier recommendations
- Keeping restaurant cards attached to the original conversation
- Supporting a more natural chat experience

### 8. Distance Calculation

Some restaurant records already contain distance data from the backend.

If the backend does not provide distance, the frontend can calculate it from the current location and restaurant coordinates.

This ensures more cards show a useful current distance when possible.

### 9. Review Sentiment Handling

The system stores and displays review sentiment.

If sentiment is missing:

- The backend can infer it from the rating
- Older reviews with missing values still show a usable sentiment label

This avoids showing `N/A` when the app already has enough information to classify the review.

### 10. Database Fallback

If no external AI provider is available, the backend still returns a database-backed summary.

This fallback keeps the app usable when:

- An API key is missing
- A provider is unavailable
- The live model call fails

## How The System Works End To End

1. The user signs in with Google.
2. The app checks whether a Supabase profile exists.
3. If the profile is missing, the user completes registration.
4. The user opens the home page.
5. The user asks for restaurant recommendations.
6. The backend ranks restaurants and creates a response.
7. The frontend shows the answer and restaurant cards.
8. The user can open chat and continue the same recommendation.

## Backend Functions

The backend is responsible for data, ranking, review handling, and chat persistence.

Important backend files:

- [app/api.py](app/api.py): API routes and request handling
- [app/repository.py](app/repository.py): database reads and writes
- [app/schemas.py](app/schemas.py): request and response models
- [app/zai_client.py](app/zai_client.py): AI provider routing and fallback logic

Main backend responsibilities:

- Receive prompts from the frontend
- Return restaurant recommendations
- Keep chat messages in storage
- Load vendor restaurant data
- Insert and read reviews
- Normalize missing sentiment values

## Frontend Functions

The frontend focuses on user interaction and presentation.

Important frontend files:

- [frontend/src/App.jsx](frontend/src/App.jsx): home page and restaurant cards
- [frontend/src/ChatPage.jsx](frontend/src/ChatPage.jsx): chat experience and history
- [frontend/src/ProtectedApp.jsx](frontend/src/ProtectedApp.jsx): login, registration, and routing
- [frontend/src/components/Registration.jsx](frontend/src/components/Registration.jsx): registration form

Main frontend responsibilities:

- Show the correct page based on user state
- Display AI answers clearly
- Render restaurant cards consistently
- Add map, menu, and review actions
- Keep the chat page aligned with the home page result

## Data Sources

Review2Revenue uses multiple data sources:

- Firebase for authentication
- Supabase for user profiles
- PostgreSQL for restaurant, menu, review, and chat data
- CSV files for seed and fallback data

This setup lets the app work even when some data is incomplete.

## Important User Flows

### Diner Flow

1. Sign in with Google
2. Complete registration if needed
3. Ask for restaurant recommendations
4. Review the result cards
5. Open map, menu, or review links
6. Continue in chat if needed

### Vendor Flow

1. Sign in with Google
2. Complete registration if needed
3. Search and select the vendor restaurant
4. Open the vendor home experience
5. Read restaurant analysis and reviews
6. Continue in chat if needed

## Why These Features Matter

The design of the system focuses on making restaurant discovery practical.

Instead of returning only text, the app:

- Shows restaurants as structured cards
- Keeps the same recommendations in chat
- Gives direct actions for navigation and menus
- Preserves vendor access restrictions
- Uses fallback logic so the app stays usable

## Short Summary

Review2Revenue is not just a chat app. It is a role-based restaurant assistant that combines login, registration, recommendation ranking, restaurant cards, maps, menus, reviews, chat persistence, and backend fallback behavior into one workflow.