"use client";

import { useState } from "react";
import { useGameContext } from "@/context/GameContext";
import GuessRow from "./GuessRow";
import AnswerRow from "./AnswerRow";
import CoinAutocomplete from "./CoinAutocomplete";
import Sparkline from "./Sparkline";
import RevealCard from "./RevealCard";
import PythFeedCard from "./PythFeedCard";
import { MAX_GUESSES } from "@/lib/constants";
import { tileValue } from "@/lib/tileValue";

/** Category column headers */
const HEADERS = ["Type", "Color", "Year", "Ticker", "Price", "FDV"];

export default function GameBoard() {
  const {
    guesses,
    gameOver,
    won,
    secretCoin,
    prices,
    pricesLoaded,
    pricesAvailable,
    livePrices,
    difficulty,
    mode,
    hints,
    submitGuess,
    newFreePlay,
    useHint,
    getShareText,
  } = useGameContext();

  const [copied, setCopied] = useState(false);
  const [showGuesses, setShowGuesses] = useState(false);

  function copyFallback(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  function handleShare() {
    const text = getShareText();
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          copyFallback(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
    } else {
      copyFallback(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const guessedTickers = guesses.map((g) => g.coin.ticker);
  const remaining = MAX_GUESSES - guesses.length;
  const hintedIndices = new Set(hints.map((h) => h.categoryIndex));

  /* ──────────────────────────────────────────────────────────────
   * GAME OVER — compact result view (no scrolling needed)
   * ────────────────────────────────────────────────────────────── */
  if (gameOver && !showGuesses) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        {/* Answer categories */}
        <AnswerRow secretCoin={secretCoin} prices={prices} livePrices={livePrices} won={won} />

        {/* Result card: win/lose + coin + countdown + buttons */}
        <RevealCard
          won={won}
          secretCoin={secretCoin}
          guessCount={guesses.length}
          mode={mode}
          livePrice={livePrices[secretCoin.ticker]}
          onNewGame={() => {
            setShowGuesses(false);
            newFreePlay();
          }}
          copied={copied}
          onShare={handleShare}
          onViewGuesses={() => setShowGuesses(true)}
        />

        {/* Pyth feed transparency — show judges exactly how Pyth powers this round */}
        <PythFeedCard secretCoin={secretCoin} prices={prices} livePrices={livePrices} />
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────────
   * ACTIVE GAME  or  "View Guesses" mode
   * ────────────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {pricesLoaded && !pricesAvailable && (
        <div className="rounded-xl px-3 py-2 text-xs" role="status" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
          Pyth prices are temporarily unavailable. You can still play with the other five clues; price clues are marked unavailable.
        </div>
      )}
      {/* Back to result button (game-over only) */}
      {gameOver && showGuesses && (
        <button
          onClick={() => setShowGuesses(false)}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-colors"
          style={{
            background: "var(--bg-surface-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
        >
          ← Back to result
        </button>
      )}

      {/* Sparkline chart — shown in both modes */}
      {!gameOver && (
        <div className="bento-card">
          <Sparkline ticker={secretCoin.ticker} color="var(--accent)" />
        </div>
      )}

      {/* Input area — above the grid */}
      {!gameOver && (
        <div>
          {pricesLoaded ? (
            <CoinAutocomplete
              onSelect={submitGuess}
              guessedTickers={guessedTickers}
              disabled={gameOver}
            />
          ) : (
            <div
              className="h-12 rounded-xl"
              style={{ background: "var(--bg-surface-2)" }}
            />
          )}
          <div className="mt-2 flex items-center justify-center gap-3">
            <p
              className="text-center text-xs"
              style={{ color: "var(--text-dim)" }}
            >
              <span className="font-mono tabular-nums">{remaining}</span> guess{remaining !== 1 ? "es" : ""} remaining
            </p>
            {difficulty === "easy" && hints.length < 3 && (
              <button
                onClick={useHint}
                className="rounded-lg px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                Hint ({hints.length}/3)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hint reveals */}
      {hints.length > 0 && !gameOver && (
        <div className="tile-grid">
          {HEADERS.map((h, i) => {
            const hint = hints.find((ht) => ht.categoryIndex === i);
            return (
              <div
                key={h}
                className={`flex h-16 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg px-0.5 ${
                  hint ? "cell-purple" : "cell-empty"
                }`}
              >
                {hint ? (
                  <span className="tile-value">
                    {tileValue(hint.value)}
                  </span>
                ) : (
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    ?
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Column headers */}
      <div className="tile-grid px-1">
        {HEADERS.map((h) => (
          <div
            key={h}
            className="text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Guess rows */}
      {guesses.map((guess, i) => (
        <GuessRow key={i} guess={guess} prices={prices} livePrices={livePrices} rowIndex={i} hintedIndices={hintedIndices} />
      ))}

      {/* Empty slots */}
      {!gameOver &&
        Array.from({ length: remaining }).map((_, i) => (
          <div key={`empty-${i}`} className="tile-grid">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="cell-empty h-16 rounded-lg" />
            ))}
          </div>
        ))}
    </div>
  );
}
