import { gameApiUrl } from "./arcade";
import type { GuessResult } from "./types";
import { COINS } from "./coins";

/** Server-authoritative Rapid Fire client. The issued runId is the only credential. */
export type RapidState = {
  runId: string; startedAt?: number; endsAt?: number; ended: boolean; remainingMs: number;
  puzzle: number; guessesThisCoin: number; maxGuessesPerCoin: number; solved: number; totalGuesses: number;
  priceHint?: boolean;
};
type Feedback = Omit<GuessResult, "coin"> & { ticker: string };
export type GuessReply = RapidState & { feedback: Feedback; correct: boolean; revealed?: string; nextPuzzle?: boolean };
export type SkipReply = RapidState & { revealed: string; nextPuzzle: true };

export class RapidApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function call<T>(runId: string, action: string, body?: unknown): Promise<T> {
  const response = await fetch(gameApiUrl(`/api/rapid/${encodeURIComponent(runId)}/${action}`), action === "state"
    ? { cache: "no-store" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RapidApiError(data?.error?.code ?? `HTTP_${response.status}`, data?.error?.message ?? "Rapid Fire request failed");
  return data as T;
}

export const rapidApi = {
  start: (runId: string) => call<RapidState>(runId, "start"),
  guess: (runId: string, ticker: string) => call<GuessReply>(runId, "guess", { ticker }),
  skip: (runId: string) => call<SkipReply>(runId, "skip"),
  finish: (runId: string) => call<RapidState>(runId, "finish"),
  state: (runId: string) => call<{ state: RapidState | null }>(runId, "state"),
};

export function toGuessResult(feedback: Feedback): GuessResult {
  const { ticker, ...rest } = feedback;
  return { coin: COINS.find((coin) => coin.ticker === ticker)!, ...rest };
}
export const coinByTicker = (ticker: string) => COINS.find((coin) => coin.ticker === ticker);
