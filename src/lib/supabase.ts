// =============================================================================
// Atlas — Supabase Client
// =============================================================================
// Singleton Supabase client for the frontend.
// Uses the publishable (anon) key for RLS-enforced access.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://rfuyrizawszryakhczyx.supabase.co";
const supabaseAnonKey =
  "sb_publishable_GLkczWZNRMXsIhW5vZ8MPw_4OxLhA4y";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "implicit",
  },
});

export type { User, Session, AuthError } from "@supabase/supabase-js";