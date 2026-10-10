import { NextResponse } from "next/server";
import { COINS } from "@/lib/coins";
import { fetch90DayHistory } from "@/lib/pyth";
import { getCachedHistory, setCachedHistory } from "@/lib/cache";
import { getTodayDateString } from "@/lib/daily";

/**
 * GET /api/history?ticker=BTC
 * Returns 90-day daily closing prices for a coin (used in Easy Mode sparkline).
 * Cached per coin per day.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();

  if (!ticker) {
    return NextResponse.json(
      { error: "Missing ticker parameter" },
      { status: 400 }
    );
  }

  const coin = COINS.find((c) => c.ticker === ticker);
  if (!coin) {
    return NextResponse.json({ error: "Unknown ticker" }, { status: 404 });
  }

  const dateStr = getTodayDateString();

  // Try cache first
  let history = await getCachedHistory(ticker, dateStr);

  if (!history) {
    // Cache miss — fetch from Hermes historical endpoint
    try {
      history = await fetch90DayHistory(coin.pythFeedId);
      if (history.length > 0) {
        await setCachedHistory(ticker, dateStr, history);
      }
    } catch (error) {
      console.error(`Failed to fetch history for ${ticker}:`, error);
      return NextResponse.json(
        { error: "Unable to fetch price history" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    ticker,
    points: history,
  });
}
