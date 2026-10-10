import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode, difficulty, result, guesses, answer, platform, userId } = body;

    if (!mode || !difficulty || !result || !guesses || !answer) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Analytics are fire-and-forget: if the database is gone, the game
    // still finished fine as far as the player is concerned.
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ ok: true, recorded: false });

    const { error } = await supabase.from("game_events").insert({
      mode,
      difficulty,
      result,
      guesses,
      answer,
      platform: platform || "web",
      user_id: userId || null,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ ok: true, recorded: false });
    }

    return NextResponse.json({ ok: true, recorded: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
