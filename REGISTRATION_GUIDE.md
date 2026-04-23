# Registration Workflow Implementation Guide

## Overview

This document describes the complete React/Vite registration workflow integrating **Firebase Authentication** and **Supabase PostgreSQL** with **permanent role selection** and **vendor restaurant matching**.

### Key Features (April 2026 Update)

✅ **Permanent Role Selection**
- Users select role (Diner or Vendor) and CANNOT change it after confirmation
- Role confirmation screen displays: "Once you confirm this role, you **CANNOT change it** in the future"
- Back button on confirmation allows user to reconsider before committing

✅ **Vendor-Specific Restaurant Matching**
- Vendors search by restaurant name during registration
- Min 2 characters required before search (500ms debounce to reduce DB load)
- Shows dropdown suggestions matching restaurant name
- After selection, restaurant name cannot be changed
- Backend stores `store_id` in user profile for future identification

✅ **Separate Views After Registration**
- Diner view: Restaurant search + recommendations
- Vendor view: Read-only restaurant display (name + store_id), business insights only
- No role-switching UI elements

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     ProtectedApp (Main Flow)                │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴─────────────┐
        │                        │
    Not Logged In          Logged In
        │                        │
        ▼                        ▼
    ┌─────────┐          ┌──────────────────┐
    │  Login  │          │  Check DB for    │
    │ (Google)│          │  User Profile    │
    └─────────┘          └────────┬─────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                           │
              Found in DB              Not Found (Registration)
                    │                           │
                    ▼                           ▼
              ┌─────────┐           ┌───────────────────┐
              │   App   │           │  Registration     │
              └─────────┘           ├───────────────────┤
                                    │ 1. Role Selection │
                                    │    (Diner/Vendor) │
                                    └────────┬──────────┘
                                             │
                                    ┌────────┴──────────┐
                                    │                   │
                                 Diner              Vendor
                                    │                   │
                                    ▼                   ▼
                            ┌─────────────┐     ┌──────────────────┐
                            │ Save to DB  │     │ 2. Search & Match│
                            │  (upsert)   │     │    Restaurant    │
                            └──────┬──────┘     └────────┬─────────┘
                                   │                     │
                                   │            ┌────────┴──────────┐
                                   │            │                   │
                                   │       Found             Not Found
                                   │            │                   │
                                   │            ▼                   ▼
                                   │     ┌─────────────┐    ┌──────────────┐
                                   │     │ Save to DB  │    │ Error Alert  │
                                   │     │  (upsert)   │    │ Contact Team │
                                   │     └──────┬──────┘    └──────────────┘
                                   │            │
                                   └────────────┼──────────┐
                                                │          │
                                                ▼          ▼
                                            ┌──────────────────┐
                                            │  Profile Summary │
                                            │ & Continue to App│
                                            └──────────────────┘
                                                    │
                                                    ▼
                                               ┌─────────┐
                                               │   App   │
                                               └─────────┘
```

---

## Database Schema

### Users Table

```sql
CREATE TABLE public.users (
  id TEXT PRIMARY KEY,                    -- Firebase UID
  user_name TEXT NOT NULL,                -- Display name
  email TEXT NOT NULL UNIQUE,             -- Email address
  role user_role NOT NULL,                -- ENUM: 'diner' | 'vendor'
  store_id TEXT REFERENCES public.restaurants(store_id),  -- FK for vendors
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Constraints:**
- `id`: Firebase UID (matches Firebase authentication)
- `email`: Validated email format, globally unique
- `role`: ENUM restricted to `'diner'` or `'vendor'`
- `store_id`: Only populated for vendors; FK constraint ensures referential integrity
- Check constraint: Vendors must have `store_id`, diners must have NULL `store_id`

---

## Component Architecture

### 1. **ProtectedApp.jsx** (Main Container)

**Responsibilities:**
- Manages Firebase authentication state
- Checks if user exists in Supabase
- Routes between Login → Registration → App

**Key State:**
```javascript
const [user, setUser] = useState(null);                    // Firebase user
const [userProfile, setUserProfile] = useState(null);      // Supabase profile
const [registrationNeeded, setRegistrationNeeded] = useState(false);
```

**Flow:**
1. `onAuthStateChanged` listener detects login
2. Query Supabase: `SELECT * FROM users WHERE id = user.uid`
3. If user exists: Show App
4. If user doesn't exist: Show Registration component

---

### 2. **Registration.jsx** (UI Component)

**Props:**
```javascript
{
  firebaseUser: {              // From Firebase auth
    uid: string,
    email: string,
    displayName: string
  },
  onRegistrationComplete: () => void  // Callback when done
}
```

**Steps:**

#### Step 1: Role Selection
- User clicks "Diner" or "Vendor" button
- Updates hook state immediately
- Diners skip to final step
- Vendors proceed to Step 2

#### Step 2: Restaurant Search (Vendor Only)
- Input field with 300ms debounce
- Queries: `SELECT store_id, name FROM restaurants WHERE name ILIKE %search%`
- Case-insensitive matching (ILIKE operator)
- Shows suggestions dropdown
- User selects restaurant
- Shows confirmation with restaurant name and ID

#### Step 3: Profile Summary
- Displays selected role
- For vendors: Shows selected restaurant
- User confirms and saves to database

---

### 3. **useRegistration Hook** (Business Logic)

**Custom hook that manages:**
- Role selection state
- Restaurant search and matching
- Database persistence (upsert)
- Error handling (FK constraints, auth errors)

**Key Methods:**

```javascript
const {
  // State
  step,                          // 'role-selection' | 'vendor-matching' | 'complete'
  role,                          // 'diner' | 'vendor' | ''
  restaurantName,               // User input
  matchedRestaurant,            // Selected restaurant object
  restaurantSuggestions,        // Search results
  isLoading,                    // Async operation state
  error,                        // Error message
  isComplete,                   // Registration done?
  
  // Handlers
  selectRole(role),                           // Select diner or vendor
  searchRestaurants(searchTerm),              // Debounced search
  selectRestaurant(restaurant),               // Choose from suggestions
  completeRegistration(),                    // Persist to DB
  reset(),                                   // Reset flow
  clearError()                               // Clear error message
} = useRegistration(firebaseUser);
```

---

## API Integration

### Supabase Queries

#### 1. Check if User Exists
```javascript
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('id', currentUser.uid)
  .single();
```

#### 2. Search Restaurants (Case-Insensitive)
```javascript
const { data, error } = await supabase
  .from('restaurants')
  .select('store_id, name')
  .ilike('name', `%${searchTerm}%`)
  .limit(10);
```

#### 3. Save User Profile (Upsert)
```javascript
const { data, error } = await supabase
  .from('users')
  .upsert([userData], { onConflict: 'id' })
  .select();
```

**Why Upsert?**
- Handles both new registrations and profile updates
- Prevents duplicate key errors
- Atomic operation (all or nothing)

---

## Error Handling

### 1. Firebase Auth Errors
- Caught in Login component
- Displayed to user
- Common: Account doesn't exist, popup blocked, network error

### 2. Supabase Database Errors
- Foreign key constraint violation: "Restaurant not found"
- Network errors: "Failed to search restaurants"
- Upsert failures: "Failed to save user profile"

### 3. Validation Errors
- Required fields missing
- Invalid role selection
- Vendor without restaurant selection

---

## Environment Configuration

### Required Variables

**.env.local** (in `frontend/` directory)

```
# Firebase (from Firebase Console)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...

# Supabase (from Supabase Dashboard > Settings > API)
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]
```

### Setup Instructions

1. **Firebase Console**
   - Create project: https://console.firebase.google.com
   - Enable "Google" authentication provider
   - Create web app
   - Copy config values

2. **Supabase**
   - Create project: https://app.supabase.com
   - Run SQL migration: `migrations/001_create_users_table.sql`
   - Get API credentials from Settings > API
   - Enable RLS (Row Level Security) policies

---

## Type Definitions

### User Type
```typescript
interface User {
  id: string;              // Firebase UID
  user_name: string;       // Display name
  email: string;           // Email address
  role: 'diner' | 'vendor';
  store_id?: string | null; // FK to restaurants
  created_at: string;      // ISO timestamp
  updated_at: string;      // ISO timestamp
}
```

### Restaurant Type
```typescript
interface Restaurant {
  store_id: string;        // Primary key
  name: string;            // Restaurant name
  // ... other columns
}
```

### Registration State Type
```typescript
interface RegistrationState {
  step: 'role-selection' | 'vendor-matching' | 'complete';
  role: 'diner' | 'vendor' | '';
  restaurantName: string;
  matchedRestaurant: Restaurant | null;
  restaurantSuggestions: Restaurant[];
  isLoading: boolean;
  error: string;
  isComplete: boolean;
}
```

---

## Deployment Checklist

- [ ] Add Supabase and Firebase environment variables to hosting platform
- [ ] Run SQL migration on Supabase: `001_create_users_table.sql`
- [ ] Enable Google OAuth in Firebase Console
- [ ] Configure Firebase authorized domains (add your deployment domain)
- [ ] Test registration flow end-to-end
- [ ] Verify RLS policies prevent unauthorized access
- [ ] Monitor error logs after deployment
- [ ] Set up email notifications for registration failures (optional)

---

## Security Considerations

1. **Firebase UID as PK**: Guarantees 1:1 mapping with Firebase accounts
2. **Unique Email Constraint**: Prevents duplicate user accounts
3. **FK Constraint on store_id**: Prevents orphaned vendor records
4. **RLS Policies**: Users can only read/update their own profile
5. **Env Variables**: Never commit `.env.local` to git (use `.env.example`)
6. **Supabase Anon Key**: Limited scope; doesn't allow direct table mutations without RLS policies

---

## Testing

### Manual Test Cases

1. **Happy Path - Diner**
   - Google login
   - Select "Diner" role
   - Verify saved to DB with `store_id = NULL`

2. **Happy Path - Vendor**
   - Google login
   - Select "Vendor" role
   - Search for "McDonald's" → select from results
   - Verify saved to DB with `store_id` populated

3. **Error Case - Restaurant Not Found**
   - Select vendor
   - Search for non-existent restaurant
   - Should show "No results" message
   - Cannot proceed until valid restaurant selected

4. **Error Case - FK Constraint**
   - Manually set vendor with non-existent store_id
   - Should fail on upsert
   - Shows user-friendly error message

---

## Monitoring & Logging

**Client-side logs** (browser console):
```javascript
console.log('Auth state changed:', currentUser?.email);
console.log('User not found in Supabase, registration needed');
console.log('User profile found:', data);
```

**Server-side logs** (Supabase dashboard):
- Monitor RLS policy rejections
- Track FK constraint violations
- Watch for performance issues on restaurant search

---

## Future Enhancements

1. **Email Verification**: Send confirmation email after registration
2. **Restaurant Creation**: Allow vendors to create new restaurant entries if not found
3. **Profile Editing**: Enable users to change role or restaurant
4. **Bulk Import**: Admin tool to import restaurants
5. **Two-Factor Authentication**: Enhanced security for vendors
6. **Social OAuth**: GitHub, Apple, Microsoft sign-in options

---

## Support & Troubleshooting

### Issue: Registration button disabled after selection

**Solution:** Check browser console for errors; likely Firebase auth or Supabase connectivity issue.

### Issue: Restaurant search returns no results

**Solution:** Ensure restaurant data exists in `public.restaurants` table; verify `name` column spelling matches.

### Issue: "Foreign key constraint" error

**Solution:** Restaurant must exist in `restaurants` table before registering as vendor. Contact admin to add restaurant first.

### Issue: User profile not persisting

**Solution:** Check RLS policies; verify `.env.local` has correct Supabase credentials; check network tab for failed requests.

---

**Last Updated:** 2026-04-23  
**Maintained By:** Senior Systems Architect
