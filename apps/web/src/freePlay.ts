// Compatibility no-ops: guest telemetry is disabled, including for stale callers.
import type { FreePlayLifecycleEvent, GameRunResult } from "../../../packages/sdk/src/index";
import type { TokenGetter } from "./api";
export async function recordFreePlayLifecycle(_event: FreePlayLifecycleEvent, _token: TokenGetter): Promise<void> {}
export async function recordFreePlay(_result: GameRunResult, _token: TokenGetter): Promise<void> {}
