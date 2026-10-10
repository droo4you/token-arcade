"use client";

import type { Coin, GameMode } from "@/lib/types";
import type { LivePrices } from "@/hooks/useLivePrices";
import { MAX_GUESSES } from "@/lib/constants";
import CountdownTimer from "./CountdownTimer";
import ReportButton from "./ReportButton";
import { isHostedArcade } from "@/lib/arcade";

interface RevealCardProps {
  won: boolean;
  secretCoin: Coin;
  guessCount: number;
  mode: GameMode;
  copied?: boolean;
  livePrice?: { price: number; change24h?: number };
  onNewGame: () => void;
  onShare: () => void;
  onViewGuesses?: () => void;
}

export default function RevealCard({
  won,
  secretCoin,
  guessCount,
  mode,
  copied,
  livePrice,
  onNewGame,
  onShare,
  onViewGuesses,
}: RevealCardProps) {
  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (p >= 1) return `$${p.toFixed(2)}`;
    if (p >= 0.01) return `$${p.toFixed(4)}`;
    return `$${p.toPrecision(3)}`;
  };
  return (
    <div className="bento-card relative overflow-hidden text-center">
      {/* Win/Lose arrow indicator */}
      <div className="mb-3 flex items-center justify-center gap-2">
        {won ? (
          <>
            <span className="text-3xl">📈</span>
            <span
              className="coin-bounce text-lg font-bold"
              style={{ color: "var(--result-green)" }}
            >
              We Love Green Candles
            </span>
            <span className="coin-bounce text-2xl" style={{ animationDelay: "0.2s" }}>
              🪙
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl">📉</span>
            <span
              className="text-lg font-bold"
              style={{ color: "var(--result-red)" }}
            >
              Dev Rugged
            </span>
          </>
        )}
      </div>

      {/* Secret coin reveal */}
      <div className="mb-4 flex flex-col items-center gap-1">
        <img
          src={secretCoin.logoUrl}
          alt={secretCoin.name}
          className="h-12 w-12 rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div>
          <div className="text-xl font-bold" style={{ color: "var(--text)" }}>
            {secretCoin.ticker}
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            {secretCoin.name}
          </div>
          {livePrice && (
            <div className="mt-1 flex items-center justify-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "#22c55e", boxShadow: "0 0 4px #22c55e" }}
              />
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {formatPrice(livePrice.price)}
              </span>
              {livePrice.change24h != null && (
                <span
                  className="text-xs font-semibold"
                  style={{ color: livePrice.change24h >= 0 ? "#22c55e" : "#f87171" }}
                >
                  {livePrice.change24h >= 0 ? "+" : ""}
                  {livePrice.change24h.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
        {won && (
          <div
            className="text-sm font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Guessed in {guessCount}/{MAX_GUESSES}
          </div>
        )}
      </div>

      {/* Countdown to next daily */}
      {mode === "daily" && (
        <div className="mb-4">
          <CountdownTimer />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          {mode === "freeplay" && (
            <button
              onClick={onNewGame}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors"
              style={{ background: "var(--accent)" }}
            >
              New Random Coin
            </button>
          )}
          <button
            onClick={onShare}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: "var(--bg-surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            {copied ? "Copied!" : "Share Result"}
          </button>
        </div>

        {/* View guesses toggle */}
        {onViewGuesses && (
          <button
            onClick={onViewGuesses}
            className="rounded-xl py-2 text-xs font-medium transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            View Guesses →
          </button>
        )}
      </div>

      {/* Report incorrect data */}
      <div className="mt-3 flex justify-center">
        {!isHostedArcade() && <ReportButton coin={secretCoin} />}
      </div>
    </div>
  );
}
