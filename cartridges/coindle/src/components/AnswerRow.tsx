"use client";

import type { Coin, CachedPrices } from "@/lib/types";
import type { LivePrices } from "@/hooks/useLivePrices";
import { PRICE_TIER_LABELS } from "@/lib/constants";

interface AnswerRowProps {
  secretCoin: Coin;
  prices: CachedPrices;
  livePrices?: LivePrices;
  won?: boolean;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(3)}`;
}

/**
 * Shows how the correct answer fits each category.
 * Displayed in the compact result view for both wins and losses.
 */
export default function AnswerRow({ secretCoin, prices, livePrices, won }: AnswerRowProps) {
  const priceData = prices[secretCoin.ticker];
  const livePrice = livePrices?.[secretCoin.ticker];
  const priceTier = priceData?.tier;

  const cells = [
    { label: "Type", value: secretCoin.type },
    { label: "Color", value: secretCoin.primaryColor },
    { label: "Year", value: String(secretCoin.launchYear) },
    { label: "Ticker", value: `${secretCoin.tickerLength} letters` },
    { label: "Price", value: priceTier === undefined ? "Unavailable" : PRICE_TIER_LABELS[priceTier] },
    { label: "FDV", value: secretCoin.fdvBucket },
  ];

  const displayPrice = livePrice?.price ?? priceData?.price;

  return (
    <div>
      {/* Coin name + live price header */}
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <img
          src={secretCoin.logoUrl}
          alt={secretCoin.name}
          className="h-5 w-5 rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
          {secretCoin.ticker}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {secretCoin.name}
        </span>
        {displayPrice != null && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-dim)" }}>
            {livePrice && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }}
                title="Live from Pyth"
              />
            )}
            {formatPrice(displayPrice)}
            {livePrice?.change24h != null && (
              <span
                className="text-[11px] font-semibold"
                style={{ color: livePrice.change24h >= 0 ? "#22c55e" : "#f87171" }}
              >
                {livePrice.change24h >= 0 ? "+" : ""}
                {livePrice.change24h.toFixed(1)}%
              </span>
            )}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="mb-1 grid grid-cols-6 gap-1.5 px-1">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="text-center text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-dim)" }}
          >
            {cell.label}
          </div>
        ))}
      </div>

      {/* All-green category cells */}
      <div className="grid grid-cols-6 gap-1.5">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className={`${cell.label === "Price" && priceTier === undefined ? "cell-unavailable" : "cell-green"} flex h-[60px] flex-col items-center justify-center rounded-xl px-1`}
          >
            <span className="text-[11px] font-semibold leading-tight text-center">
              {cell.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
