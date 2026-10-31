/**
 * Short forms for the 6-column tiles. The stored coin fields and price tiers
 * stay unchanged; only the painted label shrinks so every value fits at 375px.
 */
const TYPE_SHORT: Record<string, string> = {
  "L1 Blockchain": "L1",
  "Layer-0": "L0",
  "DeFi Token": "DeFi",
  "AI Token": "AI",
  "Stablecoin": "Stable",
  "Memecoin": "Meme",
  "Payment": "Pay",
  "Gaming": "Game",
};

const PRICE_SHORT: Record<string, string> = {
  "< $0.0001": "<0.0001",
  "$0.0001–$0.001": ".0001\n–.001",
  "$0.001–$0.01": ".001\n–.01",
  "$0.01–$0.1": ".01–.1",
  "$0.1–$1": ".1–$1",
  "$1–$10": "$1–10",
  "$10–$100": "$10\n–100",
  "$100–$1K": "$100\n–1K",
  "$1K–$10K": "$1K\n–10K",
  "> $10K": ">$10K",
  Unavailable: "N/A",
};

const FDV_SHORT: Record<string, string> = {
  "<10M": "<10M",
  "10M-100M": "10M\n–100M",
  "100M-1B": "100M\n–1B",
  "1B-10B": "1B–10B",
  "10B-100B": "10B\n–100B",
  ">100B": ">100B",
};

export function tileValue(value: string): string {
  if (TYPE_SHORT[value]) return TYPE_SHORT[value];
  if (PRICE_SHORT[value]) return PRICE_SHORT[value];
  if (FDV_SHORT[value]) return FDV_SHORT[value];
  const letters = /^(\d+) letters$/.exec(value);
  if (letters) return `${letters[1]} let.`;
  return value;
}
