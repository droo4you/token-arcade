import type { CachedPrices } from "./types";
import { getSupabase } from "./supabase";

/**
 * Two-layer cache.
 *
 * L1 is an in-process Map, L2 is the `cache` table in Postgres.
 *
 * L1 alone used to be the whole cache, which quietly did nothing in
 * production: on Vercel the daily cron populated the Map inside one lambda
 * instance while /api/prices read from another, so almost every request fell
 * through to a live 144-feed Hermes fetch. L2 is what actually survives a cold
 * start; L1 just saves a round trip within a warm instance.
 *
 * Every L2 failure degrades to L1 rather than throwing — a cache is not worth
 * failing a request over.
 *
 * Keys:
 *   prices:YYYY-MM-DD         → CachedPrices (all coin tiers)
 *   history:TICKER:YYYY-MM-DD → PricePoint[] (90-day history)
 */

interface MemoryEntry {
  value: string;
  expiresAt: number; // unix ms
}

const memory = new Map<string, MemoryEntry>();

const DEFAULT_TTL_SECONDS = 90_000; // 25 hours — survives until the next cron run

export async function cacheGet<T>(key: string): Promise<T | null> {
  const now = Date.now();

  const hit = memory.get(key);
  if (hit) {
    if (hit.expiresAt > now) return JSON.parse(hit.value) as T;
    memory.delete(key);
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("cache")
      .select("value, expires_at")
      .eq("key", key)
      .maybeSingle();

    if (error || !data) return null;

    const expiresAt = new Date(data.expires_at).getTime();
    if (expiresAt <= now) return null;

    // Hydrate L1 so the rest of this instance's requests skip the round trip.
    memory.set(key, { value: JSON.stringify(data.value), expiresAt });
    return data.value as T;
  } catch (e) {
    console.warn(`cacheGet(${key}) fell back to memory:`, e);
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  memory.set(key, { value: JSON.stringify(value), expiresAt });

  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("cache").upsert(
      {
        key,
        value,
        expires_at: new Date(expiresAt).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) console.warn(`cacheSet(${key}) did not persist:`, error.message);
  } catch (e) {
    console.warn(`cacheSet(${key}) did not persist:`, e);
  }
}

/**
 * Delete expired rows. Called from the daily cron so the table does not grow
 * without bound on a free-tier database. Never throws.
 */
export async function sweepExpiredCache(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return "skipped (no credentials)";

  try {
    const { error } = await supabase
      .from("cache")
      .delete()
      .lt("expires_at", new Date().toISOString());
    return error ? `failed (${error.message})` : "ok";
  } catch (e) {
    return `failed (${e instanceof Error ? e.message : String(e)})`;
  }
}

// ── Typed helpers ───────────────────────────────────────────────

export async function getCachedPrices(
  dateStr: string
): Promise<CachedPrices | null> {
  return cacheGet<CachedPrices>(`prices:${dateStr}`);
}

export async function setCachedPrices(
  dateStr: string,
  prices: CachedPrices
): Promise<void> {
  await cacheSet(`prices:${dateStr}`, prices);
}

export async function getCachedHistory(
  ticker: string,
  dateStr: string
): Promise<{ timestamp: number; price: number }[] | null> {
  return cacheGet(`history:${ticker}:${dateStr}`);
}

export async function setCachedHistory(
  ticker: string,
  dateStr: string,
  history: { timestamp: number; price: number }[]
): Promise<void> {
  await cacheSet(`history:${ticker}:${dateStr}`, history);
}
