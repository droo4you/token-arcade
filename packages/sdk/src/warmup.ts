/** Internal cartridge fixture. This is not a launch game. */
export const WARMUP_GAME_ID = "arcade-warmup";
export const WARMUP_ROUNDS = 12;

export interface WarmupProof {
  /** The player presses one of four pads on each round. */
  choices: number[];
  /** Milliseconds since the cartridge started, recorded for each press. */
  timesMs: number[];
}

function hashSeed(seed: string): number {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

export function getWarmupSequence(seed: string, count = WARMUP_ROUNDS): number[] {
  let state = hashSeed(seed);
  const sequence: number[] = [];
  for (let index = 0; index < count; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    sequence.push((state >>> 24) % 4);
  }
  return sequence;
}

export function scoreWarmupProof(seed: string, proof: unknown): { valid: boolean; score: number; durationMs: number; reason?: string } {
  if (!proof || typeof proof !== "object") return { valid: false, score: 0, durationMs: 0, reason: "Missing input proof" };
  const candidate = proof as Partial<WarmupProof>;
  if (!Array.isArray(candidate.choices) || !Array.isArray(candidate.timesMs) ||
      candidate.choices.length !== WARMUP_ROUNDS || candidate.timesMs.length !== WARMUP_ROUNDS) {
    return { valid: false, score: 0, durationMs: 0, reason: "Incomplete input proof" };
  }

  let previous = 0;
  for (let index = 0; index < WARMUP_ROUNDS; index += 1) {
    const choice = candidate.choices[index];
    const time = candidate.timesMs[index];
    if (!Number.isInteger(choice) || choice < 0 || choice > 3 || !Number.isInteger(time) || time < 100 || time > 20_000 || time - previous < 80) {
      return { valid: false, score: 0, durationMs: 0, reason: "Invalid input timing or pad" };
    }
    previous = time;
  }

  const sequence = getWarmupSequence(seed);
  const correct = candidate.choices.reduce<number>((score, choice, index) => score + Number(choice === sequence[index]), 0);
  return { valid: true, score: correct * 100, durationMs: previous };
}
