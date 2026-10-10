import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/** Shape the client expects even when the database is unreachable. */
const EMPTY = { entries: [] as unknown[] };

export async function POST(req: Request) {
  try {
    const { userId, username, puzzleNumber, guesses, won } = await req.json();

    if (!userId || !username || !puzzleNumber || !guesses) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: "Leaderboard is temporarily unavailable" },
        { status: 503 }
      );
    }

    const { error } = await supabase.from("leaderboard").upsert(
      {
        user_id: userId,
        username,
        puzzle_number: puzzleNumber,
        guesses,
        won: won ?? false,
      },
      { onConflict: "user_id,puzzle_number" }
    );

    if (error) {
      // The database being unreachable is an availability problem, not a bad
      // request — same 503 the GET path returns.
      console.error("Leaderboard insert error:", error);
      return NextResponse.json(
        { error: "Leaderboard is temporarily unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { ...EMPTY, error: "Leaderboard is temporarily unavailable" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const puzzle = searchParams.get("puzzle");

  if (puzzle) {
    // Daily leaderboard for a specific puzzle
    const { data, error } = await supabase
      .from("leaderboard")
      .select("*")
      .eq("puzzle_number", Number(puzzle))
      .eq("won", true)
      .order("guesses", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error("Daily leaderboard read error:", error);
      return NextResponse.json(
        { ...EMPTY, error: "Leaderboard is temporarily unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json({ entries: data });
  }

  // All-time leaderboard: most wins
  const { data: fullData, error } = await supabase
    .from("leaderboard")
    .select("user_id, username, guesses, won");

  if (error) {
    console.error("All-time leaderboard read error:", error);
    return NextResponse.json(
      { ...EMPTY, error: "Leaderboard is temporarily unavailable" },
      { status: 503 }
    );
  }

  const allTimeMap = new Map<string, { username: string; wins: number; totalGuesses: number; games: number }>();
  for (const row of fullData ?? []) {
    if (!allTimeMap.has(row.user_id)) {
      allTimeMap.set(row.user_id, { username: row.username, wins: 0, totalGuesses: 0, games: 0 });
    }
    const u = allTimeMap.get(row.user_id)!;
    u.games++;
    if (row.won) {
      u.wins++;
      u.totalGuesses += row.guesses;
    }
  }

  const allTime = Array.from(allTimeMap.values())
    .filter((u) => u.wins > 0)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return (a.totalGuesses / a.wins) - (b.totalGuesses / b.wins);
    })
    .slice(0, 20)
    .map((u) => ({
      username: u.username,
      wins: u.wins,
      games: u.games,
      avgGuesses: (u.totalGuesses / u.wins).toFixed(1),
    }));

  return NextResponse.json({ entries: allTime });
}
