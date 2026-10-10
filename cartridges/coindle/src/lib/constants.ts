import type { LogoColor, CoinType, FDVBucket } from "./types";

// ── Price Tiers (0-9) ──────────────────────────────────────────────
export const PRICE_TIER_BOUNDARIES = [
  0.0001,   // Tier 0: < $0.0001
  0.001,    // Tier 1: $0.0001 – $0.001
  0.01,     // Tier 2: $0.001 – $0.01
  0.1,      // Tier 3: $0.01 – $0.1
  1,        // Tier 4: $0.1 – $1
  10,       // Tier 5: $1 – $10
  100,      // Tier 6: $10 – $100
  1000,     // Tier 7: $100 – $1,000
  10000,    // Tier 8: $1,000 – $10,000
              // Tier 9: > $10,000
];

export function getPriceTier(price: number): number {
  for (let i = 0; i < PRICE_TIER_BOUNDARIES.length; i++) {
    if (price < PRICE_TIER_BOUNDARIES[i]) return i;
  }
  return 9;
}

export const PRICE_TIER_LABELS = [
  "< $0.0001",
  "$0.0001–$0.001",
  "$0.001–$0.01",
  "$0.01–$0.1",
  "$0.1–$1",
  "$1–$10",
  "$10–$100",
  "$100–$1K",
  "$1K–$10K",
  "> $10K",
];

// ── FDV Buckets (ordered for adjacency comparison) ─────────────────
export const FDV_BUCKET_ORDER: FDVBucket[] = [
  "<10M",
  "10M-100M",
  "100M-1B",
  "1B-10B",
  "10B-100B",
  ">100B",
];

// ── Color Wheel Adjacency ──────────────────────────────────────────
const COLOR_ADJACENCY: Record<LogoColor, LogoColor[]> = {
  Red: ["Orange", "Pink"],
  Orange: ["Red", "Yellow"],
  Yellow: ["Orange", "Green"],
  Green: ["Yellow", "Blue"],
  Blue: ["Green", "Purple"],
  Purple: ["Blue", "Pink"],
  Pink: ["Purple", "Red"],
  Black: ["White", "Multi"],
  White: ["Black", "Multi"],
  Multi: ["Black", "White"],
};

export function areColorsAdjacent(a: LogoColor, b: LogoColor): boolean {
  return COLOR_ADJACENCY[a]?.includes(b) ?? false;
}

// ── Coin Type Families ─────────────────────────────────────────────
const TYPE_FAMILIES: Record<string, CoinType[]> = {
  Hype: ["Memecoin", "Gaming"],
  Infrastructure: ["L1 Blockchain", "L2", "Layer-0"],
  Finance: ["DeFi Token", "Stablecoin", "Payment"],
  Data: ["Oracle", "AI Token", "RWA"],
};

export function getCoinTypeFamily(type: CoinType): string {
  for (const [family, types] of Object.entries(TYPE_FAMILIES)) {
    if (types.includes(type)) return family;
  }
  return "Other";
}

// ── Game Constants ─────────────────────────────────────────────────
export const MAX_GUESSES = 6;
export const TOTAL_CATEGORIES = 6;

// ── Hermes API ─────────────────────────────────────────────────────
export const HERMES_BASE_URL = "https://hermes.pyth.network";
export const BENCHMARKS_BASE_URL = "https://benchmarks.pyth.network";
