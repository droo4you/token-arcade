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
export const RAPID_RULES: GameRules = { format: RAPID_FORMAT, windowSeconds: 180, maxGuessesPerCoin: MAX_GUESSES, priceHint: "shape-90d-v1" };
export const RAPID_V2_FORMAT = "rapid-fire-v2";
export const RAPID_V2_RULES: GameRules = { ...RAPID_RULES, format: RAPID_V2_FORMAT };
export const RAID_POOL_SIZE = 40;
export const RAPID_RAID_RULES: GameRules = { ...RAPID_V2_RULES, selection: "hidden-pool-40-v1" };
/** Time from session issue to pressing start, plus the window and submit slack. */
export const RAPID_RUN_TIMEOUT_MS = 600_000;
export const isRapidRules = (rules?: GameRules) => (rules?.format === RAPID_FORMAT || rules?.format === RAPID_V2_FORMAT)
  && rules.windowSeconds === 180 && rules.maxGuessesPerCoin === MAX_GUESSES
  && (rules.priceHint === undefined || rules.priceHint === "shape-90d-v1");

type Coin = (typeof COINS)[number];
type Match = "green" | "yellow" | "red" | "unavailable";
type Direction = "up" | "down" | "match";
export type PriceTiers = Record<string, { tier: number } | undefined>;
type Ledger = {
  runId: string; windowMs: number; maxGuesses: number;
  startedAt?: number; endsAt?: number; finishedAt?: number;
  current?: { answer: string; guesses: string[] };
  used: string[]; solved: number; totalGuesses: number; skips?: number; raidPoolId?: string;
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
  history?: (ticker: string) => Promise<{ price: number }[]>;
  now?: () => number;
  pick?: (count: number) => number;
};

export function createCoindleRapid(options: Options) {
  const { db } = options;
  const now = options.now ?? Date.now;
  const pick = options.pick ?? ((count: number) => randomInt(count));
  db.exec("CREATE TABLE IF NOT EXISTS coindle_rapid (run_id TEXT PRIMARY KEY, json TEXT NOT NULL)");
  // Private server state, never part of the public raid or issued run configuration.
  db.exec("CREATE TABLE IF NOT EXISTS coindle_raid_pools (raid_id TEXT PRIMARY KEY, json TEXT NOT NULL)");
  function raidPool(raidId: string): string[] {
    const row = db.prepare("SELECT json FROM coindle_raid_pools WHERE raid_id = ?").get(raidId) as { json: string } | undefined;
    if (row) return JSON.parse(row.json) as string[];
    if (liveCoins.length < RAID_POOL_SIZE) throw new RapidError(503, "POOL_UNAVAILABLE", "Not enough active coins for a raid");
    const available = liveCoins.map(coin => coin.ticker), pool: string[] = [];
    while (pool.length < RAID_POOL_SIZE) pool.push(available.splice(pick(available.length), 1)[0]);
    db.prepare("INSERT OR IGNORE INTO coindle_raid_pools (raid_id,json) VALUES (?,?)").run(raidId, JSON.stringify(pool));
    return JSON.parse((db.prepare("SELECT json FROM coindle_raid_pools WHERE raid_id = ?").get(raidId) as { json: string }).json);
  }
  const load = (runId: string) => {
    const row = db.prepare("SELECT json FROM coindle_rapid WHERE run_id = ?").get(runId) as { json: string } | undefined;
    return row ? JSON.parse(row.json) as Ledger : undefined;
  };
  const save = (ledger: Ledger) => db.prepare("INSERT INTO coindle_rapid (run_id,json) VALUES (?,?) ON CONFLICT(run_id) DO UPDATE SET json = excluded.json").run(ledger.runId, JSON.stringify(ledger));
  const ended = (ledger: Ledger) => ledger.finishedAt !== undefined || (ledger.endsAt !== undefined && now() >= ledger.endsAt);
  function nextAnswer(ledger: Ledger) {
    const candidates = ledger.raidPoolId ? raidPool(ledger.raidPoolId) : liveCoins.map(coin => coin.ticker);
    const pool = candidates.filter(ticker => !ledger.used.includes(ticker));
    if (!pool.length) { ledger.current = undefined; ledger.finishedAt = now(); return; }
    const answer = pool[pick(pool.length)];
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
    const v2 = found.config.rules?.format === RAPID_V2_FORMAT;
    if (found.config.gameVersion !== (v2 ? "1.1.0" : "1.0.0")) throw new RapidError(409, "RULES_MISMATCH", "Rapid Fire version does not match its rules");
    if (v2 && found.config.mode === "raid" && (!found.config.raidId || found.config.maxAttempts !== 3 || found.config.rules?.selection !== "hidden-pool-40-v1")) throw new RapidError(409, "RULES_MISMATCH", "Raid needs its private pool and three-attempt rules");
    if (found.consumedAt) throw new RapidError(409, "RUN_CONSUMED", "Run result was already accepted");
    return found;
  }
  const view = (ledger: Ledger) => ({
    runId: ledger.runId, startedAt: ledger.startedAt, endsAt: ledger.endsAt, ended: ended(ledger),
    remainingMs: ledger.endsAt === undefined ? ledger.windowMs : ended(ledger) ? 0 : ledger.endsAt - now(),
    puzzle: ledger.log.length + 1, guessesThisCoin: ledger.current?.guesses.length ?? 0, maxGuessesPerCoin: ledger.maxGuesses,
    solved: ledger.solved, totalGuesses: ledger.totalGuesses, skips: ledger.skips ?? 0,
    priceHint: options.getSession(ledger.runId)?.config.rules?.priceHint === "shape-90d-v1",
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
        ledger = { runId, windowMs, maxGuesses, startedAt: now(), endsAt: now() + windowMs, used: [], solved: 0, totalGuesses: 0, skips: 0, log: [],
          ...(found.config.mode === "raid" && found.config.rules?.format === RAPID_V2_FORMAT ? { raidPoolId: found.config.raidId } : {}) };
        nextAnswer(ledger); save(ledger);
      }
      return view(ledger);
    },
    state(runId: string) {
      session(runId);
      const ledger = load(runId);
      return ledger ? view(ledger) : null;
    },
    async hint(runId: string, puzzle: number) {
      if (!Number.isSafeInteger(puzzle) || puzzle < 1) throw new RapidError(400, "INVALID_PUZZLE", "A valid puzzle number is required");
      const ledger = active(runId);
      if (session(runId).config.rules?.priceHint !== "shape-90d-v1") throw new RapidError(409, "HINT_DISABLED", "This run was issued without price hints");
      const check = (current: Ledger) => {
        if (current.log.length + 1 !== puzzle) throw new RapidError(409, "PUZZLE_CHANGED", "The puzzle has changed");
      };
      check(ledger);
      const history = await options.history?.(ledger.current!.answer).catch(() => []) ?? [];
      check(active(runId)); // A skip, solve or expiry while loading must invalidate this hint.
      const prices = history.map(point => point.price).filter(price => Number.isFinite(price) && price > 0);
      if (prices.length < 2) return { puzzle, points: [] };
      const min = Math.min(...prices), range = Math.max(...prices) - min;
      // Only the silhouette leaves the server: no ticker, timestamps or absolute prices.
      return { puzzle, points: prices.map(price => range === 0 ? 0.5 : Math.round((price - min) / range * 10000) / 10000) };
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
      ledger.skips = (ledger.skips ?? 0) + 1;
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
        if (!isRapidRules(config.rules) || config.rules?.format !== result.rules?.format || config.gameVersion !== (config.rules?.format === RAPID_V2_FORMAT ? "1.1.0" : "1.0.0")) return { valid: false, reason: "Run was not issued with Rapid Fire rules" };
        if (result.objective !== "coins_solved") return { valid: false, reason: "Rapid Fire ranks coins solved" };
        const ledger = load(config.runId);
        if (ledger?.startedAt === undefined) return { valid: false, reason: "No server ledger for this run" };
        if (!ended(ledger)) return { valid: false, reason: "Rapid Fire window is still open" };
        if (result.primaryMetric !== ledger.solved || result.secondaryMetrics?.guesses !== ledger.totalGuesses ||
            (config.rules?.format === RAPID_V2_FORMAT && result.secondaryMetrics?.skips !== (ledger.skips ?? 0))) {
          return { valid: false, reason: "Claimed result does not match the server ledger" };
        }
        return { valid: true };
      },
    } satisfies GameVerifier,
  };
}
