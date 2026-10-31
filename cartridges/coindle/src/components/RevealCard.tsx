"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import type { Coin, GameMode } from "@/lib/types";
import type { LivePrices } from "@/hooks/useLivePrices";
import { MAX_GUESSES } from "@/lib/constants";
import CountdownTimer from "./CountdownTimer";
import ReportButton from "./ReportButton";
import Sparkline from "./Sparkline";
import LiveDot from "./LiveDot";
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
            <TrendingUp size={18} strokeWidth={1.5} style={{ color: "var(--text)" }} />
            <span className="text-lg font-medium" style={{ color: "var(--up)" }}>
              We Love Green Candles
            </span>
          </>
        ) : (
          <>
            <TrendingDown size={18} strokeWidth={1.5} style={{ color: "var(--text)" }} />
            <span className="text-lg font-medium" style={{ color: "var(--down)" }}>
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
          <div className="text-xl font-medium" style={{ color: "var(--text)" }}>
            {secretCoin.ticker}
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            {secretCoin.name}
          </div>
          {livePrice && (
            <div className="mt-1 flex items-center justify-center gap-1.5 font-mono text-sm tabular-nums">
              <LiveDot />
              <span style={{ color: "var(--text)" }}>
                {formatPrice(livePrice.price)}
              </span>
              {livePrice.change24h != null && (
                <span
                  className="text-xs"
                  style={{ color: livePrice.change24h >= 0 ? "var(--up)" : "var(--down)" }}
                >
                  {livePrice.change24h >= 0 ? "+" : ""}
                  {livePrice.change24h.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
        {won && (
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Guessed in <span className="font-mono tabular-nums">{guessCount}/{MAX_GUESSES}</span>
          </div>
        )}
      </div>

      <div className="mb-4 text-left">
        <Sparkline ticker={secretCoin.ticker} color="var(--accent)" />
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
              className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white transition-colors"
              style={{ background: "var(--accent)" }}
            >
              New random coin
            </button>
          )}
          <button
            onClick={onShare}
            className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors"
            style={{
              background: "var(--bg-surface-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            {copied ? "Copied" : "Share result"}
          </button>
        </div>

        {/* View guesses toggle */}
        {onViewGuesses && (
          <button
            onClick={onViewGuesses}
            className="rounded-xl py-2 text-xs font-medium transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            View guesses
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
