import { NextResponse } from "next/server";
import { getCachedPrices, setCachedPrices } from "@/lib/cache";
import { fetchAllPrices } from "@/lib/pyth";
import { getTodayDateString } from "@/lib/daily";

/**
 * GET /api/prices
 * Returns cached price tiers for all coins.
 * Falls back to live fetch if cache is empty (first load / dev).
 */
export async function GET() {
  const dateStr = getTodayDateString();

  // Try cache first
  let prices = await getCachedPrices(dateStr);

  if (!prices) {
    // Cache miss — fetch live and cache
    try {
      prices = await fetchAllPrices();
      await setCachedPrices(dateStr, prices);
    } catch (error) {
      console.error("Failed to fetch prices:", error);
      return NextResponse.json(
        { error: "Unable to fetch prices" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(prices);
}
