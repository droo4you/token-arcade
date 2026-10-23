import type { IncomingMessage } from "node:http";
import { mkdirSync, readFileSync, renameSync, writeFileSync, accessSync, constants } from "node:fs";
import { dirname, join } from "node:path";
import { COINS } from "../../../cartridges/coindle/src/lib/coins.ts";
import { getPriceTier } from "../../../cartridges/coindle/src/lib/constants.ts";

type Reply = { status: number; body: unknown };
type ParsedPrice = { id: string; price: { price: string; expo: number; publish_time?: number } };
type Options = {
  apiKey?: string; fetch?: typeof globalThis.fetch; now?: () => number;
  /** Injectable for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  random?: () => number;
  /** Directory for the persisted history cache. null = memory only. Default: COINDLE_CACHE_DIR, /var/data, then the DB dir. */
  cacheDir?: string | null;
};
type Point = { timestamp: number; price: number };
class UpstreamError extends Error {
  readonly status: number; readonly path: string; readonly retryAfterMs?: number;
  constructor(status: number, path: string, retryAfterMs?: number) {
    super(`Pyth upstream ${status}`); this.status = status; this.path = path; this.retryAfterMs = retryAfterMs;
  }
}
/** History tuning. Full series cache for a day; partial series only briefly; empty never. */
export const HISTORY = {
  points: 31, concurrency: 6, maxRetries: 2, baseBackoffMs: 250, maxBackoffMs: 2_000,
  fullTtlMs: 86_400_000, partialTtlMs: 600_000,
  /** If a timestamp has no update (404/400), try slightly later instants (seconds). */
  nearbyOffsets: [60, 3_600],
};
const HERMES = "https://hermes.pyth.network";
const liveCoins = COINS.filter((coin) => !coin.retired);
const knownIds = new Set(liveCoins.map((coin) => coin.pythFeedId));
type HistoryEntry = { day: string; builtAt: number; body: { ticker: string; points: Point[] } };

function defaultCacheDir(): string | null {
  const candidates = [process.env.COINDLE_CACHE_DIR, "/var/data", process.env.ARCADE_DB_PATH ? dirname(process.env.ARCADE_DB_PATH) : undefined];
  for (const dir of candidates) {
    if (!dir) continue;
    try { mkdirSync(dir, { recursive: true }); accessSync(dir, constants.W_OK); return dir; } catch { /* try next */ }
  }
  return null;
}
const priceValue = (item: ParsedPrice) => Number(item.price.price) * 10 ** Number(item.price.expo);

/** Read-only, allowlisted Pyth data. This is not a competitive answer judge. */
export function createCoindleHandler(options: Options = {}) {
  const apiKey = options.apiKey ?? process.env.PYTH_API_KEY;
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? ((message: string) => console.warn(message));
  const random = options.random ?? Math.random;
  const cache = new Map<string, { until: number; body: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  async function cached(key: string, ttl: number | ((body: unknown) => number), load: () => Promise<unknown>) {
    const hit = cache.get(key);
    if (hit && hit.until > now()) return hit.body;
    if (pending.has(key)) return pending.get(key)!;
    const request = load().then((body) => {
      const life = typeof ttl === "function" ? ttl(body) : ttl;
      if (life > 0) {
        if (cache.size >= 256) cache.delete(cache.keys().next().value!);
        cache.set(key, { until: now() + life, body });
      }
      return body;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }
  const cacheDir = options.cacheDir === undefined ? defaultCacheDir() : options.cacheDir;
  const cacheFile = cacheDir ? join(cacheDir, "coindle-history.json") : null;
  const history = new Map<string, HistoryEntry>();
  const building = new Map<string, Promise<HistoryEntry>>();
  if (cacheFile) {
    try {
      const saved = JSON.parse(readFileSync(cacheFile, "utf8")) as Record<string, HistoryEntry>;
      for (const [ticker, entry] of Object.entries(saved)) {
        if (liveCoins.some((coin) => coin.ticker === ticker) && Array.isArray(entry?.body?.points) && entry.body.points.length) history.set(ticker, entry);
      }
    } catch { /* no cache yet or unreadable: start empty */ }
  }
  function persist() {
    if (!cacheFile) return;
    try {
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(history)));
      renameSync(tmp, cacheFile);
    } catch (error) { log(`[coindle] history cache not persisted: ${(error as Error).message}`); }
  }
  /** Shared 429 gate: when Pyth rate-limits one worker, every worker waits. */
  let pausedUntil = 0;
  async function paced() { const wait = pausedUntil - Date.now(); if (wait > 0) await sleep(wait); }
  async function read(ids: string[], at?: number): Promise<ParsedPrice[]> {
    const params = new URLSearchParams({ parsed: "true" });
    ids.forEach((id) => params.append("ids[]", id));
    const path = `/v2/updates/price/${at ?? "latest"}`;
    const response = await fetcher(`${HERMES}${path}?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const header = response.headers.get("retry-after");
      const seconds = header === null ? NaN : Number(header);
      const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : header ? Math.max(0, Date.parse(header) - Date.now()) || undefined : undefined;
      throw new UpstreamError(response.status, path, retryAfterMs);
    }
    const data = await response.json() as { parsed?: ParsedPrice[] };
    if (!Array.isArray(data.parsed)) throw new Error("Invalid upstream response");
    return data.parsed.filter((item) => item && typeof item.id === "string" && item.price
      && ids.includes(`0x${item.id.replace(/^0x/, "")}`) && Number.isFinite(priceValue(item)) && priceValue(item) > 0);
  }
  /** One historical point: retry 429/5xx with backoff, nudge forward on 404/400, never throw. */
  async function historyPoint(feedId: string, timestamp: number, ticker: string): Promise<Point | null> {
    for (const offset of [0, ...HISTORY.nearbyOffsets]) {
      for (let attempt = 0; ; attempt++) {
        try {
          await paced();
          const data = await read([feedId], timestamp + offset);
          if (data.length) return { timestamp, price: priceValue(data[0]) };
          break; // empty parse: try a nearby instant
        } catch (error) {
          const status = error instanceof UpstreamError ? error.status : 0;
          const path = error instanceof UpstreamError ? error.path : `/v2/updates/price/${timestamp + offset}`;
          log(`[coindle] history ${ticker} upstream failure status=${status || "network"} path=${path} attempt=${attempt + 1}`);
          const retryable = status === 429 || status >= 500 || status === 0;
          if (retryable && attempt < HISTORY.maxRetries) {
            const backoff = Math.min(HISTORY.maxBackoffMs, HISTORY.baseBackoffMs * 2 ** attempt);
            const wait = error instanceof UpstreamError && error.retryAfterMs !== undefined
              ? Math.min(HISTORY.maxBackoffMs, error.retryAfterMs) : backoff + random() * backoff * 0.5;
            if (status === 429) pausedUntil = Math.max(pausedUntil, Date.now() + wait);
            await sleep(wait);
            continue;
          }
          if (status === 404 || status === 400) break; // no update at that instant: try nearby
          return null; // rate limited past retries / auth / other: skip this point
        }
      }
    }
    return null;
  }
  const isFresh = (entry: HistoryEntry, day: string) => entry.day === day
    && (entry.body.points.length >= HISTORY.points ? now() - entry.builtAt < HISTORY.fullTtlMs : now() - entry.builtAt < HISTORY.partialTtlMs);
  async function buildHistory(ticker: string, day: string): Promise<HistoryEntry> {
    const coin = liveCoins.find((coin) => coin.ticker === ticker)!;
    const midnight = Date.parse(`${day}T00:00:00Z`) / 1000;
    const dates = Array.from({ length: HISTORY.points }, (_, index) => midnight - (90 - index * 3) * 86400);
    const results: (Point | null)[] = new Array(dates.length).fill(null);
    let next = 0;
    const worker = async () => { while (next < dates.length) { const i = next++; results[i] = await historyPoint(coin.pythFeedId, dates[i], ticker); } };
    await Promise.all(Array.from({ length: Math.min(HISTORY.concurrency, dates.length) }, worker));
    const points = results.filter((point): point is Point => point !== null);
    if (!points.length) throw new Error("No historical points available");
    if (points.length < dates.length) log(`[coindle] history ${ticker} partial series ${points.length}/${dates.length}`);
    return { day, builtAt: now(), body: { ticker, points } };
  }
  /** Deduped build; on success replaces the cache entry and persists. */
  function refresh(ticker: string, day: string): Promise<HistoryEntry> {
    const inFlight = building.get(ticker);
    if (inFlight) return inFlight;
    const job = buildHistory(ticker, day).then((entry) => {
      const previous = history.get(ticker);
      // Never replace a full series for today with a worse partial one.
      if (!(previous && previous.day === day && previous.body.points.length > entry.body.points.length)) { history.set(ticker, entry); persist(); }
      else history.set(ticker, { ...previous, builtAt: now() });
      return history.get(ticker)!;
    }).finally(() => building.delete(ticker));
    building.set(ticker, job);
    return job;
  }
  /** Fresh: serve. Stale: serve and refresh in the background. Missing: build and wait. */
  async function historyFor(ticker: string) {
    const day = new Date(now()).toISOString().slice(0, 10);
    const entry = history.get(ticker);
    if (entry && isFresh(entry, day)) return entry.body;
    if (entry) {
      refresh(ticker, day).catch(() => log(`[coindle] background history refresh failed for ${ticker}`));
      return entry.body;
    }
    return (await refresh(ticker, day)).body;
  }
  const handler = async function coindle(request: Pick<IncomingMessage, "method">, url: URL): Promise<Reply | null> {
    const endpoint = url.pathname.match(/^\/api\/coindle\/(prices|live|history)$/)?.[1];
    if (!endpoint) return null;
    if (request.method !== "GET") return { status: 405, body: { error: "Only GET is supported" } };
    if (!apiKey) return { status: 503, body: { error: "Price service is not configured" } };
    if (url.search.length > 8192) return { status: 400, body: { error: "Query is too long" } };
    const day = new Date(now()).toISOString().slice(0, 10);
    try {
      if (endpoint === "prices") {
        const body = await cached(`prices:${day}`, 86_400_000, async () => {
          const data = await read(liveCoins.map((coin) => coin.pythFeedId));
          if (!data.length) throw new Error("No price snapshot available");
          return Object.fromEntries(data.map((item) => {
            const coin = liveCoins.find((coin) => coin.pythFeedId === `0x${item.id.replace(/^0x/, "")}`)!;
            const price = priceValue(item);
            return [coin.ticker, { price, tier: getPriceTier(price) }];
          }));
        });
        return { status: 200, body };
      }
      if (endpoint === "live") {
        const ids = [...new Set(url.searchParams.getAll("ids[]"))];
        if (!ids.length || ids.length > 50 || ids.some((id) => !knownIds.has(id))) return { status: 400, body: { error: "Request 1–50 known active feed ids" } };
        const rawAt = url.searchParams.get("at");
        const at = rawAt === null ? undefined : Number(rawAt);
        if (rawAt !== null && (!/^\d{1,10}$/.test(rawAt) || !Number.isSafeInteger(at) || at! > now() / 1000 || at! < now() / 1000 - 91 * 86400)) {
          return { status: 400, body: { error: "Timestamp must be within the past 91 days" } };
        }
        const body = await cached(`live:${ids.sort().join(",")}:${at ?? "latest"}`, at ? 3_600_000 : 15_000, async () => ({ parsed: await read(ids, at) }));
        return { status: 200, body };
      }
      const ticker = url.searchParams.get("ticker")?.toUpperCase();
      const coin = liveCoins.find((coin) => coin.ticker === ticker);
      if (!coin) return { status: 400, body: { error: "Unknown or retired ticker" } };
      const body = await historyFor(ticker!);
      return { status: 200, body };
    } catch {
      return { status: 502, body: { error: "Pyth data is temporarily unavailable" } };
    }
  };
  /** Build any missing/stale histories one ticker at a time (boot prewarm). Never throws. */
  async function prewarm(tickers: string[] = liveCoins.map((coin) => coin.ticker)) {
    if (!apiKey) return;
    for (const ticker of tickers) {
      const day = new Date(now()).toISOString().slice(0, 10);
      const entry = history.get(ticker);
      if (entry && isFresh(entry, day)) continue;
      try { await refresh(ticker, day); } catch { log(`[coindle] prewarm failed for ${ticker}`); }
    }
  }
  return Object.assign(handler, { prewarm });
}
