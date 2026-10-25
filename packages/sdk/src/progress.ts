/** Casual saves only. Never use these values as competitive verification. */
export type ProgressSnapshot = Record<string, unknown>;
export type ProgressOperation = { id: string; base: ProgressSnapshot; state: ProgressSnapshot };
export type ProgressRead = {
  deviceId: string; guest: ProgressSnapshot; local?: ProgressOperation; pending?: ProgressOperation;
};
export interface ProgressConnection {
  open(): Promise<{ scope: string; keys: string[] }>;
  prepare(snapshot: ProgressRead): Promise<ProgressSnapshot>;
  save(operation: ProgressOperation): Promise<void>;
  status(message: string): void;
}
export function progressKeys(gameId: string): string[] {
  switch (gameId) {
    case "emonad-cabinet": return ["token-arcade:mood-swings:progress:v2"];
    case "two-places": return [`ta.${gameId}.two-places.v1`];
    case "skip-to-10k": return [`ta.${gameId}.skip10k.v1`];
    case "coindle": return [`ta.${gameId}.coindle-stats`, `ta.${gameId}.coindle-daily`];
    case "skrumpey-slide": return [`ta.${gameId}.progress.v1`];
    default: return [];
  }
}
