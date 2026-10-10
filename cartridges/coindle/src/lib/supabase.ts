import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazily-created Supabase client.
 *
 * The routes used to call createClient(process.env.SUPABASE_URL!, ...) at
 * module scope. When the env vars are missing that throws while the module is
 * being imported, which takes the whole route down with an opaque 500 instead
 * of a handled error. Everything goes through here now, and callers that get
 * `null` are expected to degrade rather than throw.
 */
let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  client = url && key ? createClient(url, key) : null;
  if (!client) {
    console.warn(
      "SUPABASE_URL / SUPABASE_SERVICE_KEY not set — leaderboard, analytics " +
        "and the durable price cache are disabled"
    );
  }
  return client;
}

/** True when the database is configured. Does not prove it is reachable. */
export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}
