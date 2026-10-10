"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  GameMode,
  Difficulty,
  GuessResult,
  CachedPrices,
  DailyStats,
} from "@/lib/types";
import { COINS } from "@/lib/coins";
import { compareGuess } from "@/lib/compare";
import { getDailyCoinIndex, getDailyPuzzleNumber, getRandomCoinIndex, getTodayDateString } from "@/lib/daily";
import { MAX_GUESSES, PRICE_TIER_LABELS } from "@/lib/constants";

/** The 6 category keys in order */
const CATEGORY_KEYS = ["type", "color", "launchYear", "tickerLength", "priceRange", "fdvRange"] as const;
type CategoryKey = (typeof CATEGORY_KEYS)[number];

export interface HintReveal {
  categoryIndex: number;
  label: string;
  value: string;
}
import { useLocalStorage } from "./useLocalStorage";
import { useLivePrices, type LivePrices } from "./useLivePrices";
import { playFlip, playGreen, playWin, playLoss, playHint, scheduleGameSound } from "@/lib/sounds";
import { beginArcadeRound, finishArcadeRound, gameApiUrl, isArcadePaused, isHostedArcade, resetArcadeRound } from "@/lib/arcade";

const EMPTY_STATS: DailyStats = {
  played: 0,
  won: 0,
  streak: 0,
  maxStreak: 0,
  distribution: [0, 0, 0, 0, 0, 0],
  lastPlayedDate: "",
};

export function useGame() {
  // ── Mode & Difficulty ─────────────────────────────────────────
  const [mode, setMode] = useState<GameMode>("daily");
  const [difficulty, setDifficulty] = useState<Difficulty>("hard");

  // ── Secret coin ───────────────────────────────────────────────
  const [secretIndex, setSecretIndex] = useState<number>(() =>
    getDailyCoinIndex()
  );
  const secretCoin = COINS[secretIndex];

  // ── Guesses ───────────────────────────────────────────────────
  const [guesses, setGuesses] = useState<GuessResult[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  // ── Prices from API ───────────────────────────────────────────
  const [prices, setPrices] = useState<CachedPrices>({});
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const [pricesAvailable, setPricesAvailable] = useState(false);

  // ── Hints ───────────────────────────────────────────────────
  const [hints, setHints] = useState<HintReveal[]>([]);

  // ── Daily stats (persisted) ───────────────────────────────────
  const [stats, setStats] = useLocalStorage<DailyStats>(
    "coindle-stats",
    EMPTY_STATS
  );

  // ── Daily game state (persisted per day) ──────────────────────
  const [dailySavedState, setDailySavedState] = useLocalStorage<{
    date: string;
    guessedTickers: string[];
    gameOver: boolean;
    won: boolean;
  } | null>("coindle-daily", null);

  // ── Fetch prices on mount ─────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetch(gameApiUrl("/api/prices"), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Price service: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data && !data.error && Object.keys(data).length > 0) {
          setPrices(data);
          setPricesAvailable(true);
        }
        setPricesLoaded(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // The game remains playable with its five non-price clues.
        setPricesLoaded(true);
      });
    return () => controller.abort();
  }, []);

  // ── Restore daily state on mount ──────────────────────────────
  useEffect(() => {
    if (!pricesLoaded) return;
    if (mode !== "daily") return;

    const today = getTodayDateString();
    const dailyIndex = getDailyCoinIndex(today);
    setSecretIndex(dailyIndex);

    if (dailySavedState && dailySavedState.date === today) {
      // Restore previous guesses
      const restored: GuessResult[] = [];
      for (const ticker of dailySavedState.guessedTickers) {
        const coin = COINS.find((c) => c.ticker === ticker);
        if (coin) {
          restored.push(compareGuess(coin, COINS[dailyIndex], prices));
        }
      }
      setGuesses(restored);
      setGameOver(dailySavedState.gameOver);
      setWon(dailySavedState.won);
    } else {
      // New day — reset
      setGuesses([]);
      setGameOver(false);
      setWon(false);
    }
  }, [pricesLoaded, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pricesLoaded && !gameOver) beginArcadeRound();
  }, [pricesLoaded, gameOver, mode, secretIndex]);

  // ── Submit a guess ────────────────────────────────────────────
  const submitGuess = useCallback(
    (ticker: string) => {
      if (gameOver) return;
      if (isArcadePaused()) return;
      if (guesses.length >= MAX_GUESSES) return;

      const coin = COINS.find(
        (c) => c.ticker.toUpperCase() === ticker.toUpperCase()
      );
      if (!coin) return;

      // Prevent duplicate guesses
      if (guesses.some((g) => g.coin.ticker === coin.ticker)) return;

      beginArcadeRound();

      const result = compareGuess(coin, secretCoin, prices);
      const newGuesses = [...guesses, result];
      setGuesses(newGuesses);

      // Sound: flip for each cell, green ding for correct categories
      playFlip();
      const greens = [result.type, result.color, result.launchYear, result.tickerLength, result.priceRange, result.fdvRange]
        .filter((r) => r === "green").length;
      if (greens >= 3) scheduleGameSound(playGreen, 300);

      const isWin = coin.ticker === secretCoin.ticker;
      const isLoss = newGuesses.length >= MAX_GUESSES && !isWin;

      if (isWin || isLoss) {
        const today = getTodayDateString();
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const streak = mode !== "daily" ? stats.streak : stats.lastPlayedDate === today ? stats.streak
          : !isWin ? 0 : stats.lastPlayedDate === yesterday || stats.lastPlayedDate === "" ? stats.streak + 1 : 1;
        finishArcadeRound(isWin, newGuesses.length, hints.length, mode === "daily", difficulty === "hard", streak);
        setGameOver(true);
        setWon(isWin);
        scheduleGameSound(() => isWin ? playWin() : playLoss(), 600);

        // Ensure anonymous user ID exists
        if (!isHostedArcade() && !localStorage.getItem("coindle-uid")) {
          localStorage.setItem("coindle-uid", crypto.randomUUID());
        }

        if (!isHostedArcade()) {
          // The standalone site owns these analytics and leaderboard routes.
          // The Arcade build reports completion through its Cartridge adapter.
          fetch("/api/analytics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode,
              difficulty,
              result: isWin ? "win" : "loss",
              guesses: newGuesses.length,
              answer: secretCoin.ticker,
              userId: localStorage.getItem("coindle-uid"),
            }),
          }).catch(() => {}); // fire-and-forget

          if (mode === "daily") {
            const uid = localStorage.getItem("coindle-uid");
            const username = localStorage.getItem("coindle-username");
            if (uid && username) {
              fetch("/api/leaderboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: uid,
                  username,
                  puzzleNumber: getDailyPuzzleNumber(),
                  guesses: newGuesses.length,
                  won: isWin,
                }),
              }).catch(() => {});
            }
          }
        }

        // Update daily stats
        if (mode === "daily") {
          const today = getTodayDateString();
          setStats((prev) => {
            // Guard: don't double-count if stats already recorded for today
            if (prev.lastPlayedDate === today) return prev;

            const newStats = { ...prev };
            newStats.played++;

            if (isWin) {
              newStats.won++;
              newStats.distribution[newGuesses.length - 1]++;

              // Streak: continues if played yesterday (or first ever game)
              const yesterday = new Date();
              yesterday.setUTCDate(yesterday.getUTCDate() - 1);
              const yesterdayStr = yesterday.toISOString().split("T")[0];

              if (
                prev.lastPlayedDate === yesterdayStr ||
                prev.lastPlayedDate === ""
              ) {
                newStats.streak = prev.streak + 1;
              } else {
                // Missed a day or last game was >1 day ago — reset
                newStats.streak = 1;
              }
              newStats.maxStreak = Math.max(
                newStats.maxStreak,
                newStats.streak
              );
            } else {
              // Loss breaks the win streak
              newStats.streak = 0;
            }

            newStats.lastPlayedDate = today;
            return newStats;
          });
        }
      }

      // Persist daily state
      if (mode === "daily") {
        setDailySavedState({
          date: getTodayDateString(),
          guessedTickers: newGuesses.map((g) => g.coin.ticker),
          gameOver: isWin || isLoss,
          won: isWin,
        });
      }
    },
    [gameOver, guesses, secretCoin, prices, mode, hints.length, difficulty, stats, setStats, setDailySavedState]
  );

  // ── Use a hint (reveal one random category, skip already-green) ──
  const useHint = useCallback(() => {
    if (gameOver) return;
    if (isArcadePaused()) return;
    if (difficulty === "hard") return; // No hints in hard mode
    beginArcadeRound();

    // Find categories not yet hinted
    const hintedIndices = new Set(hints.map((h) => h.categoryIndex));

    // Find categories already guessed correctly (green) in any guess
    const greenIndices = new Set<number>();
    for (const g of guesses) {
      const results = [g.type, g.color, g.launchYear, g.tickerLength, g.priceRange, g.fdvRange];
      results.forEach((r, i) => {
        if (r === "green") greenIndices.add(i);
      });
    }

    const available = CATEGORY_KEYS.map((_, i) => i).filter(
      (i) => !hintedIndices.has(i) && !greenIndices.has(i) && (i !== 4 || prices[secretCoin.ticker] !== undefined)
    );
    if (available.length === 0) return;

    // Pick a random unhinted category
    const idx = available[Math.floor(Math.random() * available.length)];
    const labels = ["Type", "Color", "Year", "Ticker", "Price", "FDV"];
    const priceTier = prices[secretCoin.ticker]?.tier;

    const values: Record<CategoryKey, string> = {
      type: secretCoin.type,
      color: secretCoin.primaryColor,
      launchYear: String(secretCoin.launchYear),
      tickerLength: `${secretCoin.tickerLength} letters`,
      priceRange: priceTier === undefined ? "Unavailable" : PRICE_TIER_LABELS[priceTier],
      fdvRange: secretCoin.fdvBucket,
    };

    const key = CATEGORY_KEYS[idx];
    setHints((prev) => [
      ...prev,
      { categoryIndex: idx, label: labels[idx], value: values[key] },
    ]);
    playHint();
  }, [gameOver, difficulty, hints, guesses, secretCoin, prices]);

  // ── Switch mode ───────────────────────────────────────────────
  const switchMode = useCallback(
    (newMode: GameMode) => {
      resetArcadeRound();
      setMode(newMode);
      if (newMode === "freeplay") {
        const idx = getRandomCoinIndex();
        setSecretIndex(idx);
        setGuesses([]);
        setGameOver(false);
        setWon(false);
        setHints([]);
      }
      // Daily mode restoration happens in the useEffect above
    },
    []
  );

  // ── New free play round ───────────────────────────────────────
  const newFreePlay = useCallback(() => {
    if (mode !== "freeplay") return;
    resetArcadeRound();
    const idx = getRandomCoinIndex(secretIndex);
    setSecretIndex(idx);
    setGuesses([]);
    setGameOver(false);
    setWon(false);
    setHints([]);
  }, [mode, secretIndex]);

  // ── Live prices from Pyth Hermes (display only) ──────────────
  const liveTickers = useMemo(() => {
    const set = new Set<string>();
    set.add(secretCoin.ticker);
    guesses.forEach((g) => set.add(g.coin.ticker));
    return Array.from(set);
  }, [secretCoin.ticker, guesses]);

  const livePrices = useLivePrices(liveTickers);

  // ── Generate share text ───────────────────────────────────────
  const getShareText = useCallback(() => {
    const hintCount = hints.length;
    const hintSuffix = hintCount > 0 ? ` (${hintCount} hint${hintCount > 1 ? "s" : ""})` : "";
    const score = `${won ? guesses.length : "X"}/${MAX_GUESSES}`;
    const header = mode === "daily"
      ? `Coindle #${getDailyPuzzleNumber()} ${score}${hintSuffix}`
      : `Coindle Free Play ${score}${hintSuffix}`;

    const hintedIndices = new Set(hints.map((h) => h.categoryIndex));

    const grid = guesses
      .map((g) => {
        const cells = [
          g.type,
          g.color,
          g.launchYear,
          g.tickerLength,
          g.priceRange,
          g.fdvRange,
        ];
        return cells
          .map((c, i) => {
            if (hintedIndices.has(i)) return "🟪";
            return c === "green" ? "🟩" : c === "yellow" ? "🟨" : c === "unavailable" ? "⬜" : "🟥";
          })
          .join("");
      })
      .join("\n");

    return `${header}\n${grid}\n\nPlay at coindle.xyz`;
  }, [guesses, won, hints, mode]);

  return {
    // State
    mode,
    difficulty,
    guesses,
    gameOver,
    won,
    secretCoin,
    prices,
    pricesLoaded,
    pricesAvailable,
    livePrices,
    stats,
    hints,

    // Actions
    submitGuess,
    switchMode,
    setDifficulty,
    newFreePlay,
    useHint,
    getShareText,
  };
}
