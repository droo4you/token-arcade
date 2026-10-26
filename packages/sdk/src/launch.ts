import type { GameRecord } from "./index.ts";

/** Reviewed legacy imports are the one permitted bootstrap into publication. */
export function launchCabinets(origin = "http://127.0.0.1:8788"): GameRecord[] {
  const createdAt = "2026-10-09T00:00:00.000Z";
  const definitions = [
    { id: "emonad-cabinet", name: "Mood Swings", skeleton: "mood-swings", description: "Keep Emonad's mood up. Paired community: eMONAD.", genre: "Arcade survival", palette: "lime", glyph: "↟", objective: "score", orientation: "portrait", community: { name: "eMONAD", type: "erc20", address: "0x81a224f8a62f52bde942dbf23a56df77a10b7777", verification: "unverified", description: "Community association supplied by the founder. Chain, address and liquidity require protocol verification before economic use." } },
    { id: "two-places", name: "Two Places at Once", skeleton: "two-places-v2", description: "Guide two characters through a shared puzzle platformer. Associated with the Skrumpeys community.", genre: "Puzzle platformer", palette: "cyan", glyph: "◩", objective: "completion_time", orientation: "any", community: { name: "Skrumpeys", type: "erc721", verification: "unverified", description: "Skrumpeys collection association. Ownership verification and any economy are configured separately." } },
    { id: "coindle", name: "Coindle", skeleton: "coindle-v2", description: "A daily deduction game. Play now; its optional MiniCoin economy is coming soon.", genre: "Daily deduction", palette: "violet", glyph: "⌗", objective: "coins_solved", orientation: "any", community: { name: "COIN / RWA", type: "concept", verification: "unverified", description: "A product concept, with no supported onchain economy attached." } },
    { id: "skip-to-10k", name: "Skip to 10K", skeleton: "skip-to-10k-v2", description: "Skip your way to 10K. The ETH / WETH concept stays separate from play.", genre: "Arcade skipper", palette: "pink", glyph: "≋", objective: "score", orientation: "landscape", community: { name: "ETH / WETH", type: "concept", verification: "unverified", description: "Economic integration awaits verification of the exact asset and liquidity route." } },
  ] as const;
  return definitions.map((item): GameRecord => ({
    manifest: {
      id: item.id, name: item.name, description: item.description, version: item.id === "emonad-cabinet" ? "2.0.0" : "1.1.0", developer: "droo4you",
      adapterId: item.skeleton, skeletonId: item.skeleton,
      supportedModes: item.id === "emonad-cabinet" || item.id === "two-places" || item.id === "skip-to-10k" || item.id === "coindle" ? ["free", "ranked", "raid"] : ["free"],
      supportedObjectives: item.id === "two-places" ? ["completion_time", "score"] : item.id === "coindle" ? ["coins_solved", "guesses"] : [item.objective],
      ...(item.id === "emonad-cabinet" ? { playGuide: { free: "Keep Emonad's mood up. Keep your best Mood, Good Vibes and cosmetic unlocks.", ranked: "One verified run. Peak Mood wins, then most Good Vibes.", raid: "Best of three attempts on one shared seed. Community Good Vibes are a separate display-only goal.", scoring: "Peak Mood. Euphoria is identical in every mode. Cosmetics never change gameplay.", tieBreak: "Most Good Vibes, then acceptance time and run ID." } } : {}),
      communityOptional: true, minicoinOptional: true,
      entry: { kind: "iframe", origin: new URL(origin).origin, url: new URL(`/${item.id}/v/${item.id === "emonad-cabinet" ? "2.0.0" : "1.1.0"}/`, origin).href },
      presentation: { genre: item.genre, palette: item.palette, glyph: item.glyph },
      ...(item.id === "two-places" ? { playGuide: {
        free: "Start at level 1 and unlock the full game. Progress saves in this browser.",
        ranked: "Choose any of the 20 levels. Each level has its own speedrun board.",
        raid: "One shared shuffled level order. Beat as many levels as you can, then finish your run. Active play is capped at 8m 20s.",
        scoring: "Speedruns rank by fastest time, then apples. Raids rank by levels beaten, then apples, then time. Only cleared levels contribute apples.",
        tieBreak: "The raid community goal is total verified levels beaten; it does not determine rewards.",
      } } : {}),
      controls: { touch: true, orientation: item.orientation },
      ...(item.id === "skip-to-10k" ? { playGuide: {
        free: "Start with zero upgrades. Earn gwei, upgrade skills and collect helpful rocks. Your progress saves in this browser.",
        ranked: "Choose Open with your saved loadout, or fixed Zero, Mid and Max boards with rocks locked.",
        raid: "One shared seed, three runs: Zero, Mid and Max. Complete all three to rank by their total.",
        scoring: "Distance through Ethereum history × peak-price multiplier: 1× below $5K, 2× at $5K, 3× at $10K and 4× at $30K.",
        tieBreak: "More gwei. The community goal shows total distance and players who broke $10K; it does not affect prizes.",
      } } : {}),
      ...(item.id === "emonad-cabinet" || item.id === "two-places" || item.id === "skip-to-10k" ? { verifier: { kind: "replay" as const, description: item.id === "emonad-cabinet" ? "Server replays the issued seed and recorded paddle inputs in the pinned 390×844 simulation." : item.id === "skip-to-10k" ? "Four boards use issued seeds and server replay; score is distance times peak-price multiplier, with gwei as tie-break." : "Server replays the selected level for speedruns and the shared shuffled level order for raids." } } : {}),
      ...(item.id === "coindle" ? { verifier: { kind: "server_authoritative" as const, description: "Rapid Fire: the server picks every coin, judges every guess and times the 3-minute window; answers are revealed only after a solve, skip or miss." } } : {}),
    },
    status: "published", createdAt, publishedAt: createdAt, legacyImportRevision: item.id === "emonad-cabinet" ? 5 : item.id === "coindle" ? 4 : item.id === "skip-to-10k" ? 3 : 2,
    review: { approvedAt: createdAt, approvedBy: "platform:legacy-import" },
    communityConcept: item.community,
    economy: { status: item.id === "coindle" || item.id === "emonad-cabinet" ? "coming_soon" : "pending", reason: item.id === "coindle" || item.id === "emonad-cabinet" ? "MiniCoin Economy — Coming Soon" : "The dedicated protocol pass must verify community assets, strategy and liquidity before enabling an economy." },
  }));
}
