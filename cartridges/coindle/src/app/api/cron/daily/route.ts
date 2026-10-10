import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchAllPrices } from "@/lib/pyth";
import { setCachedPrices, sweepExpiredCache } from "@/lib/cache";
import { getTodayDateString } from "@/lib/daily";

/**
 * Touch Postgres so Supabase doesn't pause the project for inactivity.
 *
 * Nothing else in the app queries the database on a schedule — analytics and
 * leaderboard writes only happen when someone finishes a game. In April 2026
 * traffic stopped, no query ran for ~7 days, and the free-tier project was
 * paused, which 500'd /api/leaderboard and /api/analytics/stats until it was
 * manually restored.
 *
 * Never throws: keeping the daily price refresh working matters more than
 * this succeeding, and a failure here is reported rather than fatal.
 */
async function keepDatabaseWarm(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return "skipped (no credentials)";

  try {
    const { error } = await supabase
      .from("game_events")
      .select("id")
      .limit(1);
    return error ? `failed (${error.message})` : "ok";
  } catch (e) {
    return `failed (${e instanceof Error ? e.message : String(e)})`;
  }
}

/**
 * Vercel Cron: runs at midnight UTC daily.
 * Fetches all prices from Pyth Hermes in one batch and caches them.
 */
export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run before the Pyth fetch so a Hermes outage can't skip the DB touch.
  const dbWarm = await keepDatabaseWarm();
  // Expired cache rows would otherwise accumulate forever on the free tier.
  const cacheSwept = await sweepExpiredCache();

  try {
    const dateStr = getTodayDateString();
    const prices = await fetchAllPrices();

    const coinCount = Object.keys(prices).length;
    if (coinCount === 0) {
      return NextResponse.json(
        { error: "No prices fetched from Hermes", dbWarm, cacheSwept },
        { status: 502 }
      );
    }

    await setCachedPrices(dateStr, prices);

    return NextResponse.json({
      ok: true,
      date: dateStr,
      coinsUpdated: coinCount,
      dbWarm,
      cacheSwept,
    });
  } catch (error) {
    console.error("Cron daily error:", error);
    return NextResponse.json(
      { error: "Failed to update prices", dbWarm, cacheSwept },
      { status: 500 }
    );
  }
}
