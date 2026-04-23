-- Migration: Create users table with Firebase integration
-- Description: Creates the users table to store user profiles with role-based access and restaurant references
-- Created: 2026-04-23

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM type for user roles
CREATE TYPE user_role AS ENUM ('diner', 'vendor');

-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  -- Primary key: Firebase UID (TEXT to match Firebase string UIDs)
  id TEXT PRIMARY KEY,
  
  -- User profile information
  user_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  
  -- Role-based access control
  role user_role NOT NULL,
  
  -- Foreign key to restaurants table (nullable for diners)
  -- Only populated for vendors who manage a restaurant
  store_id TEXT REFERENCES public.restaurants(store_id) ON DELETE RESTRICT,
  
  -- Timestamps for audit trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT user_email_valid CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT vendor_requires_store CHECK (
    (role = 'diner' AND store_id IS NULL) OR
    (role = 'vendor' AND store_id IS NOT NULL)
  )
);

-- Create indexes for common queries
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_store_id ON public.users(store_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the update function
CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_users_updated_at();

-- Set table security policies (adjust based on your auth setup)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile" 
  ON public.users FOR SELECT
  USING (id = auth.uid());

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid());

-- Policy: Allow INSERT via authenticated users (for registration)
CREATE POLICY "Authenticated users can register"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

-- Add comment to table
COMMENT ON TABLE public.users IS 'User profiles with Firebase authentication and role-based access control';
COMMENT ON COLUMN public.users.id IS 'Firebase UID (primary key)';
COMMENT ON COLUMN public.users.user_name IS 'Display name for the user';
COMMENT ON COLUMN public.users.email IS 'Email address (unique)';
COMMENT ON COLUMN public.users.role IS 'User role: diner or vendor';
COMMENT ON COLUMN public.users.store_id IS 'Foreign key to restaurants table (vendor only)';
COMMENT ON COLUMN public.users.created_at IS 'Account creation timestamp';
COMMENT ON COLUMN public.users.updated_at IS 'Last profile update timestamp';
