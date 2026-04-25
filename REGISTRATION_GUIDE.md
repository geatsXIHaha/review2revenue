# Registration Guide

This guide explains the registration flow in simple terms.

## What happens during registration

1. The user signs in with Google
2. The app checks whether a profile already exists in Supabase
3. If no profile exists, the registration screen opens
4. The user chooses a role: Diner or Vendor
5. The user confirms the role
6. Vendors search and select their restaurant
7. The profile is saved
8. The app opens with the correct view

## Important rules

- The role is permanent after confirmation
- Diner users can search restaurants and ask recommendation questions
- Vendor users are locked to one restaurant using `store_id`
- Vendors cannot switch to another restaurant later

## Registration steps

### Step 1: Choose a role

- Click Diner or Vendor
- The next screen asks you to confirm the choice
- The warning message tells you that the role cannot be changed later

### Step 2: Confirm the role

- Review the selected role
- If it is wrong, go back and choose again
- If it is correct, continue

### Step 3: Vendor restaurant search

- Only vendors see this step
- Type part of the restaurant name
- The app searches the restaurant database
- Pick the correct restaurant from the list

### Step 4: Complete registration

- The profile is saved in Supabase
- The app refreshes the user profile right away
- The user is sent to the main app

## Data stored in Supabase

The profile usually contains:

- Firebase user id
- email
- display name
- permanent role
- vendor `store_id` if the user is a vendor

## Common problems

- If the restaurant search does not show results, try a shorter name
- If the page says the profile is missing, complete registration again
- If the vendor restaurant looks wrong, check the selected `store_id`
- If login works but the app stays on registration, refresh the page once after saving

## Simple architecture

```text
Login
  -> Check Supabase profile
    -> Profile exists: open app
    -> Profile missing: open registration
      -> Choose role
      -> Confirm role
      -> Vendor only: search restaurant
      -> Save profile
      -> Open app
```

## Files involved

- `frontend/src/ProtectedApp.jsx`
- `frontend/src/components/Registration.jsx`
- `frontend/src/hooks/useRegistration.js`
- `app/api.py`
- `app/repository.py`

## Summary

Registration is designed to be one-time setup. After that, the app always opens with the saved role and restaurant assignment.
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
