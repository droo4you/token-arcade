import type { GameRecord, GameRunConfig, GameRunResult, Passport, Raid } from "../../../packages/sdk/src/index";

export interface Health {
  ok: boolean;
  auth: { privy: boolean; localDemo: boolean; localDemoAdmin: boolean };
  settlement: { ready: boolean; reason?: string; minicoin?: { ready: boolean; reason?: string; reconcileReady?: boolean; rehearsalReady?: boolean; rehearsalReconcileReady?: boolean } };
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  primaryMetric: number;
  secondaryMetrics?: Record<string, number>;
  objective: string;
  finishedAt: string;
  runId: string;
}

export class ApiError extends Error {
  status: number;
  details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export type TokenGetter = () => Promise<string | null>;

export async function api<T>(
  path: string,
  token: TokenGetter,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const accessToken = await token();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "The arcade server is unavailable. Start the API and try again.");
  }
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (payload as { error?: { message?: string; details?: string[] } }).error;
    throw new ApiError(response.status, error?.message ?? `Request failed (${response.status}).`, error?.details ?? []);
  }
  return payload as T;
}

export type GamesResponse = { games: GameRecord[] };
export type GameResponse = { game: GameRecord };
export type RaidsResponse = { raids: Raid[] };
export type RaidResponse = { raid: Raid; leaderboard: LeaderboardEntry[]; playerId?: string; attemptsUsed?: number; attemptsRemaining?: number; skipGoal?: { distance: number; broke10k: number }; communityTotal?: { coinsSolved: number; runs: number; participants: number } };
export type LeaderboardResponse = { entries: LeaderboardEntry[] };
export type PassportResponse = { passport: Passport; walletSync?: { ready: boolean; reason?: string } };
export type RunResponse = { run: GameRunConfig };
export type CompleteResponse = { verified: boolean; result: GameRunResult; passport: Passport; leaderboardEntry: LeaderboardEntry };

export function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
