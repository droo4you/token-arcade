import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ticker, category, message, userId } = body;

    if (!ticker || !category) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: "Reports are temporarily unavailable" },
        { status: 503 }
      );
    }

    const { error } = await supabase.from("reports").insert({
      ticker,
      category,
      message: message || null,
      user_id: userId || null,
    });

    if (error) {
      console.error("Report insert error:", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { reports: [], error: "Reports are temporarily unavailable" },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Reports read error:", error);
    return NextResponse.json(
      { reports: [], error: "Reports are temporarily unavailable" },
      { status: 503 }
    );
  }

  return NextResponse.json({ reports: data });
}
