import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check .env.local file.')
  console.log('Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

console.log('Supabase client initialized:', { urlLoaded: !!supabaseUrl, keyLoaded: !!supabaseAnonKey })
