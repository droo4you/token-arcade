import type { IncomingMessage } from "node:http";
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
  points: 31, concurrency: 2, batchDelayMs: 100, maxRetries: 2, baseBackoffMs: 250, maxBackoffMs: 2_000,
  fullTtlMs: 86_400_000, partialTtlMs: 600_000,
  /** If a timestamp has no update (404/400), try slightly later instants (seconds). */
  nearbyOffsets: [60, 3_600],
};
const HERMES = "https://hermes.pyth.network";
const liveCoins = COINS.filter((coin) => !coin.retired);
const knownIds = new Set(liveCoins.map((coin) => coin.pythFeedId));
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
  return async function coindle(request: Pick<IncomingMessage, "method">, url: URL): Promise<Reply | null> {
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
      const body = await cached(`history:${ticker}:${day}`,
        (result) => (result as { points: Point[] }).points.length >= HISTORY.points ? HISTORY.fullTtlMs : HISTORY.partialTtlMs,
        async () => {
          const midnight = Date.parse(`${day}T00:00:00Z`) / 1000;
          const points: Point[] = [];
          const dates = Array.from({ length: HISTORY.points }, (_, index) => midnight - (90 - index * 3) * 86400);
          for (let index = 0; index < dates.length; index += HISTORY.concurrency) {
            if (index) await sleep(HISTORY.batchDelayMs);
            const batch = await Promise.all(dates.slice(index, index + HISTORY.concurrency).map((timestamp) => historyPoint(coin.pythFeedId, timestamp, ticker!)));
            points.push(...batch.filter((point): point is Point => point !== null));
          }
          if (!points.length) throw new Error("No historical points available");
          if (points.length < dates.length) log(`[coindle] history ${ticker} partial series ${points.length}/${dates.length}`);
          return { ticker, points };
        });
      return { status: 200, body };
    } catch {
      return { status: 502, body: { error: "Pyth data is temporarily unavailable" } };
    }
  };
}
