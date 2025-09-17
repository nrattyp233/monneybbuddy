import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Read credentials from Vite environment variables
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

// Use a singleton pattern to ensure the client is created only once.
let supabaseInstance: SupabaseClient | null = null;

/**
 * Creates and returns the Supabase client instance.
 */
export const getSupabase = (): SupabaseClient => {
    if (supabaseInstance) {
        return supabaseInstance;
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in your environment (e.g., .env, Netlify env vars).');
    }

    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseInstance;
};
