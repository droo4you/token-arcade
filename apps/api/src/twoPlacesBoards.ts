import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import type { GameRules, GameVerifier } from "../../../packages/sdk/src/index.ts";
import { TWO_PLACES_ACTIONS } from "./gameVerification.ts";

export const twoRules = createRequire(import.meta.url)("../../../cartridges/two-places/releases/1.1.0/src/rules.js") as {
  FORMAT: string; LEVEL_COUNT: number; MAX_FRAMES: number;
  order(seed: string): number[]; encode(track: number[]): string; decode(track: unknown): number[];
};
export function twoLevelRules(level: unknown = 0): GameRules {
  if (!Number.isSafeInteger(level) || Number(level) < 0 || Number(level) >= twoRules.LEVEL_COUNT) throw new TypeError("Choose a level from 1 to 20");
  return { format: twoRules.FORMAT, level: Number(level) };
}
export function twoRaidRules(seed: string): GameRules {
  return { format: twoRules.FORMAT, levelSet: twoRules.order(seed).join(",") };
}
type Input = { held: Record<string, boolean>; pressed: Record<string, boolean> };
type World = { state: string; stateT: number; update(input: Input): void; applesGot(): number };
type Simulation = { World: new (level: unknown) => World; LEVELS: unknown[] };
const source = ["world.js", "levels.js", "levels2.js"].map(file => readFileSync(new URL(`../../../cartridges/two-places/releases/1.1.0/src/${file}`, import.meta.url), "utf8")).join("\n;\n");
const script = new Script(source + "\n;globalThis.__sim = { World, LEVELS };");
const reject = (reason: string) => ({ valid: false, reason });

export function createTwoPlacesBoardsVerifier(gameId = "two-places"): GameVerifier {
  return { gameId, async verify(config, result) {
    const raid = config.mode === "raid";
    if (config.gameVersion !== "1.1.0" || !config.seed || config.rules?.format !== twoRules.FORMAT || result.result !== "completed" ||
        result.objective !== (raid ? "score" : "completion_time")) return reject("Invalid Two Places session");
    let levels: number[];
    try {
      levels = raid ? twoRules.order(config.seed) : [Number(twoLevelRules(config.rules.level).level)];
      if (raid && config.rules.levelSet !== levels.join(",")) return reject("Invalid raid order");
    } catch { return reject("Invalid level"); }
    const proof = result.proof as { v?: number; tracks?: unknown[]; seed?: string } | undefined;
    if (!proof || proof.v !== 2 || proof.seed !== config.seed || !Array.isArray(proof.tracks) || proof.tracks.length < 1 || proof.tracks.length > levels.length ||
        (!raid && proof.tracks.length !== 1)) return reject("Missing Two Places replay");
    let tracks: number[][];
    try { tracks = proof.tracks.map(twoRules.decode); } catch { return reject("Invalid input trace"); }
    const frames = tracks.reduce((n, t) => n + t.length, 0);
    if (frames < 1 || frames > twoRules.MAX_FRAMES || tracks.some(t => t.length === 0)) return reject("Replay exceeds its input limits");
    const context = createContext({ Math });
    script.runInContext(context, { timeout: 1000 });
    const sim = (context as { __sim: Simulation }).__sim;
    let apples = 0, deaths = 0, completed = 0;
    const deadline = Date.now() + 5000;
    for (const [segment, track] of tracks.entries()) {
      let world = new sim.World(sim.LEVELS[levels[segment]]);
      for (const [frame, value] of track.entries()) {
        const heldBits = value & 2047, pressedBits = value >>> 11;
        if (pressedBits & ~heldBits) return reject("Pressed input is not held");
        if ((frame & 127) === 0 && Date.now() > deadline) return reject("Replay timed out");
        if (pressedBits & 1024) { deaths++; world = new sim.World(sim.LEVELS[levels[segment]]); continue; }
        const input: Input = { held: {}, pressed: {} };
        TWO_PLACES_ACTIONS.forEach((action, bit) => { input.held[action] = !!(heldBits & (1 << bit)); input.pressed[action] = !!(pressedBits & (1 << bit)); });
        world.update(input);
        if (world.state === "dead" && world.stateT > 55) { deaths++; world = new sim.World(sim.LEVELS[levels[segment]]); }
        if (world.state === "clear" && frame !== track.length - 1) return reject("Input continues after a level clear");
      }
      if (world.state === "clear") { completed++; apples += world.applesGot(); }
      else if (!raid || segment !== tracks.length - 1) return reject("Only the final raid level may be unfinished");
    }
    const elapsedMs = Math.round(frames * 1000 / 60), s = result.secondaryMetrics;
    if (result.primaryMetric !== (raid ? completed : elapsedMs) || !s || s.ticks !== frames || s.elapsedMs !== elapsedMs ||
        s.apples !== apples || s.deaths !== deaths || s.levelsCompleted !== completed) return reject("Result does not match replay");
    if (Date.now() - Date.parse(config.startedAt) + 2000 < elapsedMs || Date.parse(result.finishedAt) - Date.parse(config.startedAt) + 2000 < elapsedMs) return reject("Replay exceeds the issued session time");
    return { valid: true };
  } };
}
