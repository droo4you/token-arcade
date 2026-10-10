import type { GameRecord } from "./index.ts";

/** Reviewed legacy imports are the one permitted bootstrap into publication. */
export function launchCabinets(origin = "http://127.0.0.1:8788"): GameRecord[] {
  const createdAt = "2026-10-09T00:00:00.000Z";
  const definitions = [
    { id: "emonad-cabinet", name: "eMONAD cabinet", skeleton: "buy-bounce", description: "Catch the falling chart and keep the bounce alive.", genre: "Arcade survival", palette: "lime", glyph: "↟", objective: "score", orientation: "portrait", community: { name: "eMONAD", type: "erc20", address: "0x81a224f8a62f52bde942dbf23a56df77a10b7777", verification: "unverified", description: "Community association supplied by the founder. Chain, address and liquidity require protocol verification before economic use." } },
    { id: "two-places", name: "Two Places at Once", skeleton: "two-places", description: "Guide two characters through a shared puzzle platformer. Associated with the Skrumpeys community.", genre: "Puzzle platformer", palette: "cyan", glyph: "◩", objective: "completion_time", orientation: "any", community: { name: "Skrumpeys", type: "erc721", verification: "unverified", description: "Skrumpeys collection association. Ownership verification and any economy are configured separately." } },
    { id: "coindle", name: "Coindle", skeleton: "coindle", description: "A daily deduction game. Play now; its optional MiniCoin economy is coming soon.", genre: "Daily deduction", palette: "violet", glyph: "⌗", objective: "guesses", orientation: "any", community: { name: "COIN / RWA", type: "concept", verification: "unverified", description: "A product concept, with no supported onchain economy attached." } },
    { id: "skip-to-10k", name: "Skip to 10K", skeleton: "skip-to-10k", description: "Skip your way to 10K. The ETH / WETH concept stays separate from play.", genre: "Arcade skipper", palette: "pink", glyph: "≋", objective: "distance", orientation: "landscape", community: { name: "ETH / WETH", type: "concept", verification: "unverified", description: "Economic integration awaits verification of the exact asset and liquidity route." } },
  ] as const;
  return definitions.map((item): GameRecord => ({
    manifest: {
      id: item.id, name: item.name, description: item.description, version: "1.0.0", developer: "droo4you",
      adapterId: item.skeleton, skeletonId: item.skeleton,
      supportedModes: item.id === "emonad-cabinet" || item.id === "two-places" ? ["free", "ranked", "raid"] : ["free"],
      supportedObjectives: item.id === "two-places" ? ["completion_time", "stars"] : [item.objective],
      communityOptional: true, minicoinOptional: true,
      entry: { kind: "iframe", origin: new URL(origin).origin, url: new URL(`/${item.id}/v/1.0.0/`, origin).href },
      presentation: { genre: item.genre, palette: item.palette, glyph: item.glyph },
      controls: { touch: true, orientation: item.orientation },
      ...(item.id === "emonad-cabinet" || item.id === "two-places" ? { verifier: { kind: "replay" as const, description: item.id === "emonad-cabinet" ? "Server replays the issued seed and recorded paddle inputs in the pinned 390×844 simulation." : "Server replays fixed-step inputs for the selected authored levels; apples rank before completion time." } } : {}),
    },
    status: "published", createdAt, publishedAt: createdAt, legacyImportRevision: 2,
    review: { approvedAt: createdAt, approvedBy: "platform:legacy-import" },
    communityConcept: item.community,
    economy: { status: item.id === "coindle" ? "coming_soon" : "pending", reason: item.id === "coindle" ? "MiniCoin Economy — Coming Soon" : "The dedicated protocol pass must verify community assets, strategy and liquidity before enabling an economy." },
  }));
}
