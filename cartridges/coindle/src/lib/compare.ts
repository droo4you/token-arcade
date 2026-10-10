import type { Coin, GuessResult, MatchResult, CachedPrices } from "./types";
import {
  areColorsAdjacent,
  getCoinTypeFamily,
  FDV_BUCKET_ORDER,
  getPriceTier,
} from "./constants";

function compareNumericTier(
  guessVal: number,
  secretVal: number
): { match: MatchResult; direction: "up" | "down" | "match" } {
  const diff = Math.abs(guessVal - secretVal);
  const match: MatchResult =
    diff === 0 ? "green" : diff === 1 ? "yellow" : "red";
  const direction =
    guessVal === secretVal ? "match" : guessVal < secretVal ? "up" : "down";
  return { match, direction };
}

export function compareGuess(
  guess: Coin,
  secret: Coin,
  prices: CachedPrices
): GuessResult {
  // ── Type ──
  let typeMatch: MatchResult;
  if (guess.type === secret.type) {
    typeMatch = "green";
  } else if (getCoinTypeFamily(guess.type) === getCoinTypeFamily(secret.type)) {
    typeMatch = "yellow";
  } else {
    typeMatch = "red";
  }

  // ── Color ──
  let colorMatch: MatchResult;
  if (guess.primaryColor === secret.primaryColor) {
    colorMatch = "green";
  } else if (areColorsAdjacent(guess.primaryColor, secret.primaryColor)) {
    colorMatch = "yellow";
  } else {
    colorMatch = "red";
  }

  // ── Launch Year ──
  const yearDiff = Math.abs(guess.launchYear - secret.launchYear);
  const launchYearMatch: MatchResult =
    yearDiff === 0 ? "green" : yearDiff === 1 ? "yellow" : "red";
  const launchYearDirection =
    guess.launchYear === secret.launchYear
      ? "match"
      : guess.launchYear < secret.launchYear
        ? "up"
        : "down";

  // ── Ticker Length ──
  const tickerResult = compareNumericTier(
    guess.tickerLength,
    secret.tickerLength
  );

  // ── Price Range ──
  const guessPriceTier = prices[guess.ticker]?.tier;
  const secretPriceTier = prices[secret.ticker]?.tier;
  // A missing oracle snapshot must never turn the price clue into a false green.
  const priceResult = guessPriceTier === undefined || secretPriceTier === undefined
    ? { match: "unavailable" as const, direction: "match" as const }
    : compareNumericTier(guessPriceTier, secretPriceTier);

  // ── FDV Range ──
  const guessFdvIdx = FDV_BUCKET_ORDER.indexOf(guess.fdvBucket);
  const secretFdvIdx = FDV_BUCKET_ORDER.indexOf(secret.fdvBucket);
  const fdvResult = compareNumericTier(guessFdvIdx, secretFdvIdx);

  return {
    coin: guess,
    type: typeMatch,
    color: colorMatch,
    launchYear: launchYearMatch,
    tickerLength: tickerResult.match,
    priceRange: priceResult.match,
    fdvRange: fdvResult.match,
    launchYearDirection,
    tickerLengthDirection: tickerResult.direction,
    priceRangeDirection: priceResult.direction,
    fdvRangeDirection: fdvResult.direction,
  };
}
