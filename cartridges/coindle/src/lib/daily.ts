import { COINS } from "./coins";

/**
 * Deterministic daily coin selection.
 * Uses a proper mixing hash (MurmurHash3-inspired) to avoid sequential clustering.
 */
function hashDateString(dateStr: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  // Extra avalanche mixing
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return Math.abs(h);
}

export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0]; // YYYY-MM-DD in UTC
}

const COOLDOWN_DAYS = 60;

/**
 * Build the full sequence from launch date to target date iteratively.
 * Each day checks the previous 60 resolved days — no recursion.
 */
const resolvedCache = new Map<string, number>();

function ensureResolvedUpTo(targetDateStr: string): void {
  // Find the earliest date we need (target - COOLDOWN_DAYS or launch, whichever is later)
  const target = new Date(targetDateStr + "T00:00:00Z");
  const launch = new Date("2026-03-24T00:00:00Z");
  const windowStart = new Date(target);
  windowStart.setUTCDate(windowStart.getUTCDate() - COOLDOWN_DAYS);
  const start = windowStart > launch ? windowStart : launch;

  // Walk forward day by day, resolving each
  const cursor = new Date(start);
  while (cursor <= target) {
    const ds = cursor.toISOString().split("T")[0];
    if (!resolvedCache.has(ds)) {
      // Collect recent indices from the previous 60 days
      const recent = new Set<number>();
      for (let i = 1; i <= COOLDOWN_DAYS; i++) {
        const prev = new Date(cursor);
        prev.setUTCDate(prev.getUTCDate() - i);
        const prevIdx = resolvedCache.get(prev.toISOString().split("T")[0]);
        if (prevIdx !== undefined) recent.add(prevIdx);
      }

      let idx = hashDateString(ds) % COINS.length;
      let attempts = 0;
      while (
        (recent.has(idx) || COINS[idx].retired) &&
        attempts < COINS.length
      ) {
        idx = (idx + 1) % COINS.length;
        attempts++;
      }
      resolvedCache.set(ds, idx);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export function getDailyCoinIndex(dateStr?: string): number {
  const date = dateStr ?? getTodayDateString();
  if (!resolvedCache.has(date)) {
    ensureResolvedUpTo(date);
  }
  return resolvedCache.get(date)!;
}

/** Launch date — Coindle #1 starts here */
const LAUNCH_DATE = new Date("2026-03-24T00:00:00Z");

/** Returns the daily puzzle number (1-indexed) */
export function getDailyPuzzleNumber(dateStr?: string): number {
  const date = dateStr ?? getTodayDateString();
  const target = new Date(date + "T00:00:00Z");
  const diffMs = target.getTime() - LAUNCH_DATE.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

export function getRandomCoinIndex(excludeIndex?: number): number {
  let index: number;
  do {
    index = Math.floor(Math.random() * COINS.length);
  } while (index === excludeIndex || COINS[index].retired);
  return index;
}

/**
 * Milliseconds until next UTC midnight.
 */
export function msUntilMidnightUTC(): number {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0
    )
  );
  return tomorrow.getTime() - now.getTime();
}
