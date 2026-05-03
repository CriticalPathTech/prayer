import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_AUTH_URL;
const anonKey = import.meta.env.VITE_AUTH_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('VITE_AUTH_URL and VITE_AUTH_ANON_KEY must be set');
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
