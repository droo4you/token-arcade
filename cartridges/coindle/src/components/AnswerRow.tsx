"use client";

import type { Coin, CachedPrices } from "@/lib/types";
import type { LivePrices } from "@/hooks/useLivePrices";
import { PRICE_TIER_LABELS } from "@/lib/constants";
import LiveDot from "./LiveDot";

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
export default function AnswerRow({ secretCoin, prices, livePrices }: AnswerRowProps) {
  const priceData = prices[secretCoin.ticker];
  const livePrice = livePrices?.[secretCoin.ticker];
  const priceTier = priceData?.tier;

  const cells = [
    { label: "Type", value: secretCoin.type, mono: false },
    { label: "Color", value: secretCoin.primaryColor, mono: false },
    { label: "Year", value: String(secretCoin.launchYear), mono: true },
    { label: "Ticker", value: `${secretCoin.tickerLength} letters`, mono: false },
    { label: "Price", value: priceTier === undefined ? "Unavailable" : PRICE_TIER_LABELS[priceTier], mono: true },
    { label: "FDV", value: secretCoin.fdvBucket, mono: true },
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
        <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {secretCoin.ticker}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {secretCoin.name}
        </span>
        {displayPrice != null && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            {livePrice && <LiveDot />}
            {formatPrice(displayPrice)}
            {livePrice?.change24h != null && (
              <span style={{ color: livePrice.change24h >= 0 ? "var(--up)" : "var(--down)" }}>
                {livePrice.change24h >= 0 ? "+" : ""}
                {livePrice.change24h.toFixed(1)}%
              </span>
            )}
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="mb-1 grid grid-cols-6 gap-2 px-1">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {cell.label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-6 gap-2">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className={`${cell.label === "Price" && priceTier === undefined ? "cell-unavailable" : "cell-green"} flex h-16 flex-col items-center justify-center rounded-lg px-2`}
          >
            <span className={`text-center text-xs font-medium leading-tight ${cell.mono ? "font-mono tabular-nums" : ""}`}>
              {cell.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
