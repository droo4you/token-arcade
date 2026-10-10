import { NextResponse } from "next/server";
import { HERMES_BASE_URL } from "@/lib/constants";
import { COINS } from "@/lib/coins";

/**
 * GET /api/live?ids[]=0x..&ids[]=0x..[&at=<unix seconds>]
 *
 * Server-side proxy for Pyth Hermes price reads.
 *
 * The client used to call Hermes directly, which stopped working when Hermes
 * began requiring authentication. The key can't move into the browser bundle,
 * so the request comes through here instead and the key stays on the server.
 *
 * Returns Hermes' `parsed` array untouched so callers keep their own parsing.
 */

// Matches MAX_IDS_PER_REQUEST in useLivePrices — keeps the upstream URL sane.
const MAX_IDS = 50;

// Only feeds the game actually uses. Without this the route is an open proxy
// onto a metered Hermes key.
const KNOWN_FEED_IDS = new Set(
  COINS.filter((c) => !c.retired).map((c) => c.pythFeedId)
);

export async function GET(request: Request) {
  const apiKey = process.env.PYTH_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Price service is not configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const requestedIds = url.searchParams.getAll("ids[]");
  const ids = requestedIds.filter((id) => KNOWN_FEED_IDS.has(id));

  if (ids.length === 0) {
    return NextResponse.json({ error: "No known feed ids" }, { status: 400 });
  }

  const at = url.searchParams.get("at");
  if (at !== null && !/^\d{1,10}$/.test(at)) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  const params = new URLSearchParams();
  ids.slice(0, MAX_IDS).forEach((id) => params.append("ids[]", id));
  params.append("parsed", "true");

  const upstream = at
    ? `${HERMES_BASE_URL}/v2/updates/price/${at}?${params.toString()}`
    : `${HERMES_BASE_URL}/v2/updates/price/latest?${params.toString()}`;

  try {
    const res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Hermes API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();

    // A historical `at` never changes, so it can sit in the CDN much longer
    // than a live quote.
    return NextResponse.json(
      { parsed: data.parsed ?? [] },
      {
        headers: {
          "Cache-Control": at
            ? "public, s-maxage=3600, stale-while-revalidate=86400"
            : "public, s-maxage=15, stale-while-revalidate=30",
        },
      }
    );
  } catch (error) {
    console.error("Live price proxy error:", error);
    return NextResponse.json({ error: "Unable to fetch prices" }, { status: 502 });
  }
}
