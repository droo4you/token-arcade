declare global {
  interface Window {
    __COINDLE_HOSTED_ARCADE__?: boolean;
    __COINDLE_ARCADE_API_ORIGIN__?: string;
    TokenArcade?: {
      embedded: boolean;
      active: boolean;
      paused: boolean;
      config?: { mode: string; gameId: string; gameVersion: string; objective: string };
      register(adapter: {
        version: string;
        capabilities: Record<string, boolean | string>;
        mount(config: { mode: string; gameId: string; gameVersion: string }): void;
        start(): void;
        pause(): void;
        resume(): void;
        restart(): void;
        destroy(): void;
        audio(muted: boolean): void;
      }): boolean;
      beginRun(): boolean;
      complete(result: {
        primaryMetric: number;
        secondaryMetrics: Record<string, number>;
        result: "completed" | "failed";
      }): void;
    };
  }
}

let roundOpen = false;
let roundStartedAt = 0;
let paused = false;
let pausedAt = 0;
let pausedMs = 0;

export function setHostedArcade(value: boolean): void {
  window.__COINDLE_HOSTED_ARCADE__ = value;
}

export function isHostedArcade(): boolean {
  return typeof window !== "undefined" && window.__COINDLE_HOSTED_ARCADE__ === true;
}

export function setArcadePaused(value: boolean): void {
  if (value === paused) return;
  if (value) pausedAt = Date.now();
  else if (roundOpen) pausedMs += Date.now() - pausedAt;
  paused = value;
}
export function isArcadePaused(): boolean { return isHostedArcade() && paused; }

export function beginArcadeRound(): void {
  if (!isHostedArcade() || roundOpen) return;
  if (window.TokenArcade?.active && window.TokenArcade.beginRun()) {
    roundOpen = true;
    roundStartedAt = Date.now();
    pausedMs = 0;
  }
}

export function finishArcadeRound(won: boolean, guesses: number, hints: number, daily: boolean, hard: boolean, streak = 0): void {
  if (!roundOpen) return;
  roundOpen = false;
  window.TokenArcade?.complete({
    primaryMetric: guesses,
    secondaryMetrics: {
      solved: Number(won),
      hintsUsed: hints,
      elapsedMs: Math.max(0, Date.now() - roundStartedAt - pausedMs),
      daily: Number(daily),
      hard: Number(hard),
      streak,
    },
    result: won ? "completed" : "failed",
  });
}

/** Free Play may switch between a daily puzzle and a random round mid-game. */
export function resetArcadeRound(): void { roundOpen = false; }

/** Local puzzle history follows the deployed cabinet, including reused Skeletons. */
export function arcadeStorageKey(key: string): string {
  return isHostedArcade() ? `ta.${window.TokenArcade?.config?.gameId || "coindle"}.${key}` : key;
}

/**
 * The original Next deployment keeps its own /api/* paths. The isolated Arcade
 * build reads public Pyth data from the Arcade API's /api/coindle/* proxy.
 */
export function gameApiUrl(path: string): string {
  if (!isHostedArcade()) return path;
  const endpoint = path.replace(/^\/api\//, "/api/coindle/");
  const origin = window.__COINDLE_ARCADE_API_ORIGIN__?.trim();
  return origin ? new URL(endpoint, origin).href : endpoint;
}
