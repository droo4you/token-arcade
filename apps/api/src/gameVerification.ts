import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Script, createContext } from "node:vm";
import type { GameRunConfig, GameRunResult, GameVerifier } from "../../../packages/sdk/src/index.ts";

type Verdict = { valid: boolean; reason?: string };
const reject = (reason: string): Verdict => ({ valid: false, reason });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The host issues opaque seeds. Buy Bounce's existing simulation consumes uint32. */
const seedModule = createRequire(import.meta.url)("../../../cartridges/emonad-cabinet/src/arcade-seed.js") as
  { buyBounceSeed(seed: string): number };
export const buyBounceSeed = seedModule.buyBounceSeed;

type BuyState = {
  over: boolean; shown?: boolean; steps: number; ath: number;
  buys: number; best: number; tickets: number;
};
type BuyReplay = { ok: boolean; problems: string[]; recomputed: BuyState; ticks: number };
const requireSource = createRequire(import.meta.url);
const buyReplay = requireSource("../../../cartridges/emonad-cabinet/tools/verify.js") as
  { verify(record: unknown): BuyReplay };

export function createEmonadVerifier(gameId = "emonad-cabinet"): GameVerifier {
  return {
    gameId,
    async verify(config: GameRunConfig, result: GameRunResult): Promise<Verdict> {
      if (config.gameVersion !== "1.0.0" || !config.seed ||
          (result.objective !== "score" && result.objective !== "total_score") || result.result !== "completed") {
        return reject("This session cannot score an eMONAD run");
      }
      const width = config.rules?.viewportWidth, height = config.rules?.viewportHeight;
      if (width !== 390 || height !== 844) return reject("An issued 390×844 playfield is required");
      const record = result.proof;
      if (!isRecord(record) || record.v !== 2 || record.tuned !== false ||
          record.seed !== buyBounceSeed(config.seed) ||
          record.w !== width || record.h !== height ||
          !Number.isSafeInteger(record.steps) || Number(record.steps) < 1 || Number(record.steps) > 36_000 ||
          typeof record.track !== "string" || record.track.length > 60_000 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.track) ||
          !isRecord(record.claim)) {
        return reject("Missing or invalid Buy Bounce replay record");
      }
      let replay: BuyReplay;
      try { replay = buyReplay.verify(record); }
      catch { return reject("Buy Bounce replay could not be decoded"); }
      if (!replay.ok) return reject(`Replay mismatch: ${replay.problems[0] ?? "unknown difference"}`);
      const state = replay.recomputed;
      if (!state.over || !state.shown || state.steps !== record.steps || replay.ticks !== record.steps) {
        return reject("The recorded run did not reach the game over screen");
      }
      if (!Number.isSafeInteger(Math.round(state.ath)) || result.primaryMetric !== Math.round(state.ath)) {
        return reject("eMONAD score does not match the replay");
      }
      const secondary = result.secondaryMetrics;
      if (!secondary || secondary.buys !== state.buys || secondary.bestStreak !== state.best ||
          secondary.collectibles !== state.tickets || secondary.ticks !== state.steps) {
        return reject("eMONAD run details do not match the replay");
      }
      const simulatedMs = state.steps * (1_000 / 120);
      if (Date.parse(result.finishedAt) - Date.parse(config.startedAt) + 2_000 < simulatedMs ||
          Date.now() - Date.parse(config.startedAt) + 2_000 < simulatedMs) {
        return reject("Replay duration exceeds the issued session time");
      }
      return { valid: true };
    },
  };
}

export const TWO_PLACES_ACTIONS = [
  "left", "right", "up", "down", "jump", "run", "act", "swap", "call", "ability", "restart",
] as const;
const ACTION_MASK = (1 << TWO_PLACES_ACTIONS.length) - 1;
const RESTART_BIT = 1 << TWO_PLACES_ACTIONS.indexOf("restart");
const twoPlacesSource = ["world.js", "levels.js", "levels2.js"]
  .map((file) => readFileSync(new URL(`../../../cartridges/two-places/src/${file}`, import.meta.url), "utf8"))
  .join("\n;\n");
const twoPlacesScript = new Script(`${twoPlacesSource}\n;globalThis.__ta = { World, LEVELS };`,
  { filename: "two-places-sim.js" });

type World = {
  state: string; stateT: number; appleTotal: number;
  update(input: { held: Record<string, boolean>; pressed: Record<string, boolean> }): void;
  applesGot(): number;
};
type GameSimulation = { World: new (level: unknown) => World; LEVELS: unknown[] };

function loadTwoPlaces(): GameSimulation {
  const context = createContext({ Math });
  twoPlacesScript.runInContext(context, { timeout: 1_000 });
  return (context as { __ta: GameSimulation }).__ta;
}

function issuedLevels(config: GameRunConfig): number[] | null {
  const rules = config.rules ?? {};
  if (config.mode === "raid") {
    if (typeof rules.levelSet !== "string" || !/^\d{1,2}(,\d{1,2}){2}$/.test(rules.levelSet)) return null;
    const levels = rules.levelSet.split(",").map(Number);
    return levels.every((level) => level >= 0 && level < 20) && new Set(levels).size === 3 ? levels : null;
  }
  const level = rules.level ?? 0;
  return Number.isSafeInteger(level) && Number(level) >= 0 && Number(level) < 20 ? [Number(level)] : null;
}

export function createTwoPlacesVerifier(gameId = "two-places"): GameVerifier {
  return {
    gameId,
    async verify(config: GameRunConfig, result: GameRunResult): Promise<Verdict> {
      if (config.gameVersion !== "1.0.0" || result.result !== "completed" ||
          (result.objective !== "completion_time" && result.objective !== "stars")) {
        return reject("This session cannot score a Two Places run");
      }
      const levelSet = issuedLevels(config);
      const proof = result.proof;
      if (!levelSet || !isRecord(proof) || proof.v !== 1 || !Array.isArray(proof.tracks) ||
          proof.tracks.length !== levelSet.length) {
        return reject("Missing or invalid Two Places replay");
      }
      let game: GameSimulation;
      try { game = loadTwoPlaces(); }
      catch { return reject("Two Places simulation is unavailable"); }
      let ticks = 0, apples = 0, deaths = 0, totalFrames = 0;
      const deadline = Date.now() + 5_000;
      for (const [segment, levelIndex] of levelSet.entries()) {
        const track: unknown = proof.tracks[segment];
        if (!Array.isArray(track) || track.length < 1 || track.length > 18_000 ||
            totalFrames + track.length > 30_000) return reject("Two Places input trace exceeds its limits");
        let world = new game.World(game.LEVELS[levelIndex]);
        for (const [frame, value] of track.entries()) {
          if (!Number.isSafeInteger(value) || value < 0 || value > ((1 << (TWO_PLACES_ACTIONS.length * 2)) - 1)) {
            return reject("Two Places input trace contains an invalid frame");
          }
          const heldBits = value & ACTION_MASK;
          const pressedBits = value >>> TWO_PLACES_ACTIONS.length;
          // Input.poll() merges sub-frame keydowns into both held and pressed.
          // This is the normalized input after polling, so pressed is a subset of held.
          if (pressedBits & ~heldBits) return reject("Two Places pressed input is not held");
          if (frame % 128 === 0 && Date.now() > deadline) return reject("Two Places replay timed out");
          if (pressedBits & RESTART_BIT) {
            deaths++;
            world = new game.World(game.LEVELS[levelIndex]);
            continue;
          }
          const held: Record<string, boolean> = {}, pressed: Record<string, boolean> = {};
          for (const [bit, action] of TWO_PLACES_ACTIONS.entries()) {
            held[action] = (heldBits & (1 << bit)) !== 0;
            pressed[action] = (pressedBits & (1 << bit)) !== 0;
          }
          world.update({ held, pressed });
          if (world.state === "play") ticks++;
          if (world.state === "dead" && world.stateT > 55) {
            deaths++;
            world = new game.World(game.LEVELS[levelIndex]);
          }
          if (world.state === "clear" && frame !== track.length - 1) {
            return reject("Two Places replay continues after level completion");
          }
        }
        totalFrames += track.length;
        if (world.state !== "clear") return reject("Two Places level was not completed");
        apples += world.applesGot();
      }
      const primary = result.objective === "stars" ? apples : Math.round(ticks * (1_000 / 60));
      const secondary = result.secondaryMetrics;
      if (result.primaryMetric !== primary || !secondary || secondary.ticks !== ticks ||
          secondary.apples !== apples || secondary.deaths !== deaths ||
          secondary.levelsCompleted !== levelSet.length) {
        return reject("Two Places result does not match replayed inputs");
      }
      const simulatedMs = ticks * (1_000 / 60);
      if (Date.parse(result.finishedAt) - Date.parse(config.startedAt) + 2_000 < simulatedMs ||
          Date.now() - Date.parse(config.startedAt) + 2_000 < simulatedMs) {
        return reject("Replay duration exceeds the issued session time");
      }
      return { valid: true };
    },
  };
}
