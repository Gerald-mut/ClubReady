import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Local pages remain usable without a configured backend.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
