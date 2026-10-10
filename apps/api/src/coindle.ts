import type { IncomingMessage } from "node:http";
import { COINS } from "../../../cartridges/coindle/src/lib/coins.ts";
import { getPriceTier } from "../../../cartridges/coindle/src/lib/constants.ts";

type Reply = { status: number; body: unknown };
type ParsedPrice = { id: string; price: { price: string; expo: number; publish_time?: number } };
type Options = { apiKey?: string; fetch?: typeof globalThis.fetch; now?: () => number };
const HERMES = "https://hermes.pyth.network";
const liveCoins = COINS.filter((coin) => !coin.retired);
const knownIds = new Set(liveCoins.map((coin) => coin.pythFeedId));
const priceValue = (item: ParsedPrice) => Number(item.price.price) * 10 ** Number(item.price.expo);

/** Read-only, allowlisted Pyth data. This is not a competitive answer judge. */
export function createCoindleHandler(options: Options = {}) {
  const apiKey = options.apiKey ?? process.env.PYTH_API_KEY;
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { until: number; body: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  async function cached(key: string, ttl: number, load: () => Promise<unknown>) {
    const hit = cache.get(key);
    if (hit && hit.until > now()) return hit.body;
    if (pending.has(key)) return pending.get(key)!;
    const request = load().then((body) => {
      if (cache.size >= 256) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: now() + ttl, body });
      return body;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }
  async function read(ids: string[], at?: number): Promise<ParsedPrice[]> {
    const params = new URLSearchParams({ parsed: "true" });
    ids.forEach((id) => params.append("ids[]", id));
    const response = await fetcher(`${HERMES}/v2/updates/price/${at ?? "latest"}?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Price upstream unavailable");
    const data = await response.json() as { parsed?: ParsedPrice[] };
    if (!Array.isArray(data.parsed)) throw new Error("Invalid upstream response");
    return data.parsed.filter((item) => item && typeof item.id === "string" && item.price
      && ids.includes(`0x${item.id.replace(/^0x/, "")}`) && Number.isFinite(priceValue(item)) && priceValue(item) > 0);
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
      const body = await cached(`history:${ticker}:${day}`, 86_400_000, async () => {
        const midnight = Date.parse(`${day}T00:00:00Z`) / 1000;
        const points: { timestamp: number; price: number }[] = [];
        // Four requests per batch avoids the original 31-request burst.
        const dates = Array.from({ length: 31 }, (_, index) => midnight - (90 - index * 3) * 86400);
        for (let index = 0; index < dates.length; index += 4) {
          const batch = await Promise.all(dates.slice(index, index + 4).map(async (timestamp) => {
            const data = await read([coin.pythFeedId], timestamp);
            return data.length ? { timestamp, price: priceValue(data[0]) } : null;
          }));
          points.push(...batch.filter((point): point is { timestamp: number; price: number } => point !== null));
        }
        return { ticker, points };
      });
      return { status: 200, body };
    } catch {
      return { status: 502, body: { error: "Pyth data is temporarily unavailable" } };
    }
  };
}
