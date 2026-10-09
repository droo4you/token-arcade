import type { TokenArcadeGame } from "../../../packages/sdk/src/index.ts";
import { WarmupCartridge } from "./warmupCartridge.ts";

type ClientCartridge = { gameId: string; create: () => TokenArcadeGame };

/** Browser cartridges are installed here after their source and controls are reviewed. */
const clientCartridges: Record<string, ClientCartridge> = {
  "arcade-warmup": { gameId: "arcade-warmup", create: () => new WarmupCartridge() },
};

export function hasClientCartridge(gameId: string, adapterId?: string): boolean {
  return !!adapterId && clientCartridges[adapterId]?.gameId === gameId;
}

export function createClientCartridge(gameId: string, adapterId?: string): TokenArcadeGame | null {
  return adapterId && hasClientCartridge(gameId, adapterId) ? clientCartridges[adapterId].create() : null;
}
