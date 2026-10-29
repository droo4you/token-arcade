import type { FreePlayLifecycleEvent, GameManifest, TokenArcadeGame } from "../../../packages/sdk/src/index.ts";
import type { ProgressConnection } from "../../../packages/sdk/src/progress.ts";
import { IframeCartridge } from "../../../packages/sdk/src/iframe.ts";
import type { RunDiagnostic } from "../../../packages/sdk/src/diagnostics.ts";
import { WarmupCartridge } from "./warmupCartridge.ts";

type ClientCartridge = { gameId: string; create: () => TokenArcadeGame };

/** Browser cartridges are installed here after their source and controls are reviewed. */
const clientCartridges: Record<string, ClientCartridge> = {
  "arcade-warmup": { gameId: "arcade-warmup", create: () => new WarmupCartridge() },
};

export function hasClientCartridge(gameId: string, adapterId?: string, manifest?: GameManifest): boolean {
  return manifest?.entry?.kind === "iframe" || (!!adapterId && clientCartridges[adapterId]?.gameId === gameId);
}

export function createClientCartridge(gameId: string, adapterId?: string, manifest?: GameManifest, onState?: (state: "paused" | "running") => void, onError?: (message: string) => void, onFreePlay?: (event: FreePlayLifecycleEvent) => void, progress?: ProgressConnection, onDiagnostic?: (event: RunDiagnostic) => void): TokenArcadeGame | null {
  if (manifest?.entry?.kind === "iframe") return new IframeCartridge(manifest, onState, onError, onFreePlay, progress, onDiagnostic);
  return adapterId && hasClientCartridge(gameId, adapterId) ? clientCartridges[adapterId].create() : null;
}
