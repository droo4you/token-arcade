"use client";

import type { GuessResult, CachedPrices } from "@/lib/types";
import type { LivePrices } from "@/hooks/useLivePrices";
import { PRICE_TIER_LABELS } from "@/lib/constants";
import CategoryCell from "./CategoryCell";

interface GuessRowProps {
  guess: GuessResult;
  prices: CachedPrices;
  /** Live prices from Pyth Hermes (refreshed every 30s) */
  livePrices?: LivePrices;
  /** Row index for animation staggering */
  rowIndex: number;
  /** Category indices that were hinted (shown as purple) */
  hintedIndices?: Set<number>;
}

const CATEGORIES = [
  "Type",
  "Color",
  "Year",
  "Ticker",
  "Price",
  "FDV",
] as const;

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(3)}`;
}

export default function GuessRow({ guess, prices, livePrices, rowIndex, hintedIndices }: GuessRowProps) {
  const priceData = prices[guess.coin.ticker];
  const livePrice = livePrices?.[guess.coin.ticker];
  const priceTier = priceData?.tier;
  const cells = [
    {
      label: "Type",
      value: guess.coin.type,
      result: guess.type,
      direction: undefined,
    },
    {
      label: "Color",
      value: guess.coin.primaryColor,
      result: guess.color,
      direction: undefined,
    },
    {
      label: "Year",
      value: String(guess.coin.launchYear),
      result: guess.launchYear,
      direction: guess.launchYearDirection,
    },
    {
      label: "Ticker",
      value: `${guess.coin.tickerLength} letters`,
      result: guess.tickerLength,
      direction: guess.tickerLengthDirection,
    },
    {
      label: "Price",
      value: guess.priceRange === "unavailable" || priceTier === undefined ? "Unavailable" : PRICE_TIER_LABELS[priceTier],
      result: guess.priceRange,
      direction: guess.priceRangeDirection,
    },
    {
      label: "FDV",
      value: guess.coin.fdvBucket,
      result: guess.fdvRange,
      direction: guess.fdvRangeDirection,
    },
  ];

  return (
    <div className="mb-2">
      {/* Coin name header */}
      <div className="mb-1 flex items-center gap-2 px-1">
        <img
          src={guess.coin.logoUrl}
          alt={guess.coin.name}
          className="h-5 w-5 rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          {guess.coin.ticker}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {guess.coin.name}
        </span>
        {(livePrice || priceData) && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-dim)" }}>
            {livePrice && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }}
                title="Live from Pyth"
              />
            )}
            {formatPrice(livePrice?.price ?? priceData!.price)}
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

      {/* 6 category cells in a grid */}
      <div className="grid grid-cols-6 gap-1.5">
        {cells.map((cell, i) => (
          <CategoryCell
            key={CATEGORIES[i]}
            label={cell.label}
            value={cell.value}
            result={hintedIndices?.has(i) ? "purple" : cell.result}
            direction={cell.direction as "up" | "down" | "match" | undefined}
            index={i}
            revealed={true}
          />
        ))}
      </div>
    </div>
  );
}
