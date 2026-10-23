import { randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { GameRules, GameRunConfig, GameRunResult, GameVerifier } from "../../../packages/sdk/src/index.ts";
import { COINS } from "../../../cartridges/coindle/src/lib/coins.ts";
import { areColorsAdjacent, FDV_BUCKET_ORDER, getCoinTypeFamily, MAX_GUESSES } from "../../../cartridges/coindle/src/lib/constants.ts";

/**
 * Coindle Passport Play "Rapid Fire": solve as many coins as possible in a server-timed window.
 * Server-authoritative (not replay): the server picks every answer, judges every guess, and keeps
 * the ledger. An answer is only revealed after it is solved, skipped, or out of guesses.
 */
export const RAPID_FORMAT = "rapid-fire-v1";
export const RAPID_RULES: GameRules = { format: RAPID_FORMAT, windowSeconds: 180, maxGuessesPerCoin: MAX_GUESSES };
/** Time from session issue to pressing start, plus the window and submit slack. */
export const RAPID_RUN_TIMEOUT_MS = 600_000;
export const isRapidRules = (rules?: GameRules) => rules?.format === RAPID_FORMAT
  && rules.windowSeconds === 180 && rules.maxGuessesPerCoin === MAX_GUESSES;

type Coin = (typeof COINS)[number];
type Match = "green" | "yellow" | "red" | "unavailable";
type Direction = "up" | "down" | "match";
export type PriceTiers = Record<string, { tier: number } | undefined>;
type Ledger = {
  runId: string; windowMs: number; maxGuesses: number;
  startedAt?: number; endsAt?: number; finishedAt?: number;
  current?: { answer: string; guesses: string[] };
  used: string[]; solved: number; totalGuesses: number;
  log: { answer: string; guesses: number; solved: boolean }[];
};
export class RapidError extends Error {
  readonly status: number; readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

const liveCoins = COINS.filter((coin) => !coin.retired);
const byTicker = new Map(liveCoins.map((coin) => [coin.ticker, coin]));

function tier(guess: number, secret: number): { match: Match; direction: Direction } {
  const diff = Math.abs(guess - secret);
  return { match: diff === 0 ? "green" : diff === 1 ? "yellow" : "red", direction: guess === secret ? "match" : guess < secret ? "up" : "down" };
}
/** Same rules as the cartridge's compareGuess, without sending the secret coin. */
export function judge(guess: Coin, secret: Coin, prices: PriceTiers) {
  const year = tier(guess.launchYear, secret.launchYear);
  const length = tier(guess.tickerLength, secret.tickerLength);
  const gp = prices[guess.ticker]?.tier, sp = prices[secret.ticker]?.tier;
  const price = gp === undefined || sp === undefined ? { match: "unavailable" as const, direction: "match" as const } : tier(gp, sp);
  const fdv = tier(FDV_BUCKET_ORDER.indexOf(guess.fdvBucket), FDV_BUCKET_ORDER.indexOf(secret.fdvBucket));
  return {
    ticker: guess.ticker,
    ...(gp === undefined ? {} : { priceTier: gp }),
    type: guess.type === secret.type ? "green" : getCoinTypeFamily(guess.type) === getCoinTypeFamily(secret.type) ? "yellow" : "red",
    color: guess.primaryColor === secret.primaryColor ? "green" : areColorsAdjacent(guess.primaryColor, secret.primaryColor) ? "yellow" : "red",
    launchYear: year.match, launchYearDirection: year.direction,
    tickerLength: length.match, tickerLengthDirection: length.direction,
    priceRange: price.match, priceRangeDirection: price.direction,
    fdvRange: fdv.match, fdvRangeDirection: fdv.direction,
  };
}

type Session = { playerId: string; config: GameRunConfig; consumedAt?: string };
type Options = {
  db: DatabaseSync;
  getSession: (runId: string) => Session | undefined;
  prices: () => Promise<PriceTiers>;
  now?: () => number;
  pick?: (count: number) => number;
};

export function createCoindleRapid(options: Options) {
  const { db } = options;
  const now = options.now ?? Date.now;
  const pick = options.pick ?? ((count: number) => randomInt(count));
  db.exec("CREATE TABLE IF NOT EXISTS coindle_rapid (run_id TEXT PRIMARY KEY, json TEXT NOT NULL)");
  const load = (runId: string) => {
    const row = db.prepare("SELECT json FROM coindle_rapid WHERE run_id = ?").get(runId) as { json: string } | undefined;
    return row ? JSON.parse(row.json) as Ledger : undefined;
  };
  const save = (ledger: Ledger) => db.prepare("INSERT INTO coindle_rapid (run_id,json) VALUES (?,?) ON CONFLICT(run_id) DO UPDATE SET json = excluded.json").run(ledger.runId, JSON.stringify(ledger));
  const ended = (ledger: Ledger) => ledger.finishedAt !== undefined || (ledger.endsAt !== undefined && now() >= ledger.endsAt);
  function nextAnswer(ledger: Ledger) {
    const pool = liveCoins.filter((coin) => !ledger.used.includes(coin.ticker));
    if (!pool.length) { ledger.current = undefined; ledger.finishedAt = now(); return; }
    const answer = pool[pick(pool.length)].ticker;
    ledger.used.push(answer);
    ledger.current = { answer, guesses: [] };
  }
  function close(ledger: Ledger, solved: boolean) {
    const current = ledger.current!;
    ledger.log.push({ answer: current.answer, guesses: current.guesses.length, solved });
    if (solved) ledger.solved++;
    nextAnswer(ledger);
    return current.answer;
  }
  function session(runId: string) {
    const found = options.getSession(runId);
    if (!found || found.config.gameId !== "coindle" || (found.config.mode !== "ranked" && found.config.mode !== "raid")) throw new RapidError(404, "NOT_FOUND", "Rapid Fire run not found");
    if (!isRapidRules(found.config.rules)) throw new RapidError(409, "RULES_MISMATCH", "Run was not issued with reviewed Rapid Fire rules");
    if (found.consumedAt) throw new RapidError(409, "RUN_CONSUMED", "Run result was already accepted");
    return found;
  }
  const view = (ledger: Ledger) => ({
    runId: ledger.runId, startedAt: ledger.startedAt, endsAt: ledger.endsAt, ended: ended(ledger),
    remainingMs: ledger.endsAt === undefined ? ledger.windowMs : ended(ledger) ? 0 : ledger.endsAt - now(),
    puzzle: ledger.log.length + 1, guessesThisCoin: ledger.current?.guesses.length ?? 0, maxGuessesPerCoin: ledger.maxGuesses,
    solved: ledger.solved, totalGuesses: ledger.totalGuesses,
  });
  function active(runId: string) {
    session(runId);
    const ledger = load(runId);
    if (ledger?.startedAt === undefined) throw new RapidError(409, "NOT_STARTED", "Start the Rapid Fire clock first");
    if (ended(ledger)) throw new RapidError(409, "WINDOW_CLOSED", "The Rapid Fire window has ended");
    return ledger;
  }
  return {
    /** Starts the server clock once; later calls return the same window. */
    start(runId: string) {
      const found = session(runId);
      let ledger = load(runId);
      if (!ledger) {
        const windowMs = Number(found.config.rules?.windowSeconds ?? 180) * 1000;
        const maxGuesses = Number(found.config.rules?.maxGuessesPerCoin ?? MAX_GUESSES);
        if (found.config.expiresAt && now() + windowMs > Date.parse(found.config.expiresAt)) throw new RapidError(409, "RUN_EXPIRED", "Not enough session time left for a full window");
        ledger = { runId, windowMs, maxGuesses, startedAt: now(), endsAt: now() + windowMs, used: [], solved: 0, totalGuesses: 0, log: [] };
        nextAnswer(ledger); save(ledger);
      }
      return view(ledger);
    },
    state(runId: string) {
      session(runId);
      const ledger = load(runId);
      return ledger ? view(ledger) : null;
    },
    async guess(runId: string, rawTicker: unknown) {
      const ticker = typeof rawTicker === "string" ? rawTicker.toUpperCase() : "";
      const coin = byTicker.get(ticker);
      if (!coin) throw new RapidError(400, "UNKNOWN_COIN", "Guess a known, active coin");
      active(runId); // Reject unknown or closed runs before any upstream price request.
      const prices = await options.prices().catch(() => ({} as PriceTiers));
      const ledger = active(runId); // re-read after the await so the window check is current
      const current = ledger.current!;
      if (current.guesses.includes(ticker)) throw new RapidError(409, "DUPLICATE_GUESS", "Already guessed this coin for this puzzle");
      current.guesses.push(ticker); ledger.totalGuesses++;
      const feedback = judge(coin, byTicker.get(current.answer)!, prices);
      const correct = ticker === current.answer;
      let revealed: string | undefined;
      if (correct) revealed = close(ledger, true);
      else if (current.guesses.length >= ledger.maxGuesses) revealed = close(ledger, false);
      save(ledger);
      return { feedback, correct, ...(revealed ? { revealed, nextPuzzle: true } : {}), ...view(ledger) };
    },
    skip(runId: string) {
      const ledger = active(runId);
      const revealed = close(ledger, false);
      save(ledger);
      return { revealed, nextPuzzle: true, ...view(ledger) };
    },
    finish(runId: string) {
      session(runId);
      const ledger = load(runId);
      if (ledger?.startedAt === undefined) throw new RapidError(409, "NOT_STARTED", "Run never started");
      if (!ended(ledger)) { ledger.finishedAt = now(); save(ledger); }
      return view(ledger);
    },
    verifier: {
      gameId: "coindle",
      async verify(config: GameRunConfig, result: GameRunResult) {
        if (config.rules?.format !== RAPID_FORMAT || result.rules?.format !== RAPID_FORMAT) return { valid: false, reason: "Run was not issued with Rapid Fire rules" };
        if (result.objective !== "coins_solved") return { valid: false, reason: "Rapid Fire ranks coins solved" };
        const ledger = load(config.runId);
        if (ledger?.startedAt === undefined) return { valid: false, reason: "No server ledger for this run" };
        if (!ended(ledger)) return { valid: false, reason: "Rapid Fire window is still open" };
        if (result.primaryMetric !== ledger.solved || result.secondaryMetrics?.guesses !== ledger.totalGuesses) {
          return { valid: false, reason: "Claimed result does not match the server ledger" };
        }
        return { valid: true };
      },
    } satisfies GameVerifier,
  };
}
