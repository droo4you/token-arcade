import { HERMES_BASE_URL } from "./constants";
import { COINS } from "./coins";
import type { CachedPrices } from "./types";
import { getPriceTier } from "./constants";

/**
 * Auth headers for Pyth Hermes.
 *
 * Hermes used to serve unauthenticated requests and the key was optional, for
 * higher rate limits. It now rejects them with 401, so the key is required.
 * The accepted scheme is `Authorization: Bearer` — the `X-Api-Key` header this
 * used to send is also rejected with 401.
 */
function getAuthHeaders(): HeadersInit {
  const apiKey = process.env.PYTH_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PYTH_API_KEY is not set — Hermes rejects unauthenticated requests with 401"
    );
  }
  return { Authorization: `Bearer ${apiKey}` };
}

/**
 * Parse a Pyth price from the raw response fields.
 */
function parsePythPrice(priceData: {
  price: string;
  expo: number;
}): number {
  return Number(priceData.price) * Math.pow(10, Number(priceData.expo));
}

/**
 * Fetch latest prices for all live coins in a single batch from Pyth Hermes.
 *
 * Retired feeds must be filtered out: Hermes fails the *entire* request if any
 * requested id is one it no longer publishes, so a single dead feed would take
 * every price down with it.
 */
export async function fetchAllPrices(): Promise<CachedPrices> {
  const ids = COINS.filter((c) => !c.retired).map((c) => c.pythFeedId);

  const params = new URLSearchParams();
  ids.forEach((id) => params.append("ids[]", id));
  params.append("parsed", "true");

  const url = `${HERMES_BASE_URL}/v2/updates/price/latest?${params.toString()}`;
  const res = await fetch(url, { headers: getAuthHeaders() });

  if (!res.ok) {
    throw new Error(`Hermes API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const prices: CachedPrices = {};

  for (const parsed of data.parsed ?? []) {
    const feedId = "0x" + parsed.id;
    const coin = COINS.find((c) => c.pythFeedId === feedId);
    if (!coin) continue;

    const price = parsePythPrice(parsed.price);
    prices[coin.ticker] = {
      price,
      tier: getPriceTier(price),
    };
  }

  return prices;
}

/**
 * Fetch a single historical price at a given Unix timestamp.
 */
async function fetchHistoricalPrice(
  pythFeedId: string,
  timestamp: number
): Promise<number | null> {
  try {
    const url = `${HERMES_BASE_URL}/v2/updates/price/${timestamp}?ids[]=${pythFeedId}&parsed=true`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) return null;

    const data = await res.json();
    const cleanId = pythFeedId.replace("0x", "");

    for (const parsed of data.parsed ?? []) {
      if (parsed.id === cleanId) {
        return parsePythPrice(parsed.price);
      }
    }
  } catch {
    // Skip failed fetches
  }
  return null;
}

/**
 * Fetch 90-day price history for a single coin's sparkline.
 * Samples every 3 days = 30 data points (plenty for a sparkline shape).
 *
 * Hermes public rate limit: 30 requests per 10 seconds.
 * 30 points in 1 batch = 1 burst, well under the limit.
 * Results are cached so this only runs once per coin per day.
 */
export async function fetch90DayHistory(
  pythFeedId: string
): Promise<{ timestamp: number; price: number }[]> {
  const now = new Date();
  const timestamps: number[] = [];

  // Sample every 3 days over 90 days = 30 data points
  for (let i = 90; i >= 0; i -= 3) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 0, 0, 0)
    );
    timestamps.push(Math.floor(d.getTime() / 1000));
  }

  const points: { timestamp: number; price: number }[] = [];

  // Fetch all 31 points concurrently — fits in one rate-limit window
  const results = await Promise.all(
    timestamps.map(async (ts) => {
      const price = await fetchHistoricalPrice(pythFeedId, ts);
      return { timestamp: ts, price };
    })
  );

  for (const r of results) {
    if (r.price !== null) {
      points.push({ timestamp: r.timestamp, price: r.price });
    }
  }

  return points;
}
