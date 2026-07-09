// =============================================================================
// Atlas — Database Client
// =============================================================================
// Singleton Supabase client for Edge Functions.
// Uses the service role key for full database access (RLS is enforced in
// application-layer WHERE clauses, not via anon-key RLS).
//
// Environment variables:
//   SUPABASE_URL  — injected automatically by Supabase Edge Functions
//   SUPABASE_SERVICE_ROLE_KEY — must be set as a Supabase secret

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

let _client: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client instance.
 * Creates it on first call using the service role key.
 *
 * The service role bypasses RLS, so every query must explicitly filter by
 * user_id in a WHERE clause. This is intentional — pgvector index performance
 * degrades when combined with RLS, and explicit WHERE filtering is the
 * recommended pattern for vector search.
 */
export function getDb(): SupabaseClient {
  if (_client) return _client;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
        "SUPABASE_URL is auto-injected by Supabase. Set SUPABASE_SERVICE_ROLE_KEY " +
        "via `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-key>`.",
    );
  }

  _client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: "public",
    },
  });

  return _client;
}

/**
 * Verifies that the caller is authenticated and returns their user ID.
 *
 * In Edge Functions, the Authorization header contains the user's JWT.
 * We validate this against Supabase Auth to extract the authenticated user's ID.
 * Every API endpoint that operates on user data MUST call this first.
 *
 * Returns the user ID string.
 * Throws UnauthorizedError if no valid session is found.
 */
export async function requireAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Dynamic import to avoid circular dependency at module level
    const { UnauthorizedError } = await import("./errors.ts");
    throw new UnauthorizedError();
  }

  const token = authHeader.slice(7);
  const db = getDb();

  const { data, error } = await db.auth.getUser(token);

  if (error || !data.user) {
    const { UnauthorizedError } = await import("./errors.ts");
    throw new UnauthorizedError();
  }

  return data.user.id;
}