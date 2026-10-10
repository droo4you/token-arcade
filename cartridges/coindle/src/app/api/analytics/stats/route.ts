import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Stats are temporarily unavailable" },
      { status: 503 }
    );
  }

  const [{ data, error }, { data: reports }] = await Promise.all([
    supabase
      .from("game_events")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (error || !data) {
    console.error("Stats read error:", error);
    return NextResponse.json(
      { error: "Stats are temporarily unavailable" },
      { status: 503 }
    );
  }

  const total = data.length;
  const wins = data.filter((e) => e.result === "win").length;
  const daily = data.filter((e) => e.mode === "daily").length;
  const freeplay = data.filter((e) => e.mode === "freeplay").length;

  // Unique users
  const uniqueUsers = new Set(
    data.map((e) => e.user_id).filter(Boolean)
  ).size;

  // Unique days played
  const uniqueDays = new Set(
    data.map((e) => new Date(e.created_at).toISOString().split("T")[0])
  ).size;

  // Today's games
  const today = new Date().toISOString().split("T")[0];
  const todayGames = data.filter(
    (e) => new Date(e.created_at).toISOString().split("T")[0] === today
  );
  const todayUsers = new Set(
    todayGames.map((e) => e.user_id).filter(Boolean)
  ).size;

  // Average guesses for wins
  const winGames = data.filter((e) => e.result === "win");
  const avgGuesses = winGames.length > 0
    ? (winGames.reduce((sum, e) => sum + e.guesses, 0) / winGames.length).toFixed(1)
    : "0";

  // Games per day (last 7 days)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().split("T")[0];
    const count = data.filter(
      (e) => new Date(e.created_at).toISOString().split("T")[0] === ds
    ).length;
    last7.push({ date: ds, games: count });
  }

  return NextResponse.json({
    total_games: total,
    wins,
    losses: total - wins,
    win_rate: total > 0 ? `${((wins / total) * 100).toFixed(1)}%` : "0%",
    daily_games: daily,
    freeplay_games: freeplay,
    unique_users: uniqueUsers,
    unique_days: uniqueDays,
    avg_guesses: avgGuesses,
    today: {
      games: todayGames.length,
      wins: todayGames.filter((e) => e.result === "win").length,
      users: todayUsers,
    },
    last7,
    recent: data.slice(0, 20),
    reports: reports ?? [],
  });
}
