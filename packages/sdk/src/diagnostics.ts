export const RUN_EVENTS = ["mount", "frame_load", "hello", "progress_snapshot", "progress_ready", "ready", "start", "playing", "hidden", "visible", "blur", "focus", "offline", "online", "pause", "resume", "complete", "timeout", "fatal", "destroy", "pagehide", "submission_failed"] as const;
export type RunEvent = typeof RUN_EVENTS[number];
export interface RunDiagnostic {
  event: RunEvent;
  mountId: string;
  sequence: number;
  elapsedMs: number;
  hidden: boolean;
  stage: string;
}
