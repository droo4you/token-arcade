import type { FreePlayLifecycleEvent, GameManifest, GameRunConfig, GameRunResult, TokenArcadeGame } from "./index.ts";
import { validateRunResultShape } from "./validate.ts";
import type { ProgressConnection, ProgressRead, ProgressOperation } from "./progress.ts";

/** The existing lifecycle contract, transported to a reviewed, separate-origin build. */
export class IframeCartridge implements TokenArcadeGame {
  private frame: HTMLIFrameElement | null = null;
  private config: GameRunConfig | null = null;
  private channel = "";
  private listeners = new Set<(result: GameRunResult) => void>();
  private cleanup: (() => void) | null = null;
  private completed = false;
  private freeRun: GameRunConfig | null = null;
  private readonly manifest: GameManifest;
  private readonly onState?: (state: "paused" | "running", reason?: string) => void;
  private readonly onError?: (message: string) => void;
  private readonly onFreePlay?: (event: FreePlayLifecycleEvent) => void;
  private readonly progress?: ProgressConnection;
  constructor(manifest: GameManifest, onState?: (state: "paused" | "running", reason?: string) => void, onError?: (message: string) => void, onFreePlay?: (event: FreePlayLifecycleEvent) => void, progress?: ProgressConnection) {
    this.manifest = manifest; this.onState = onState; this.onError = onError;
    this.onFreePlay = onFreePlay;
    this.progress = progress;
  }

  async mount(container: HTMLElement, config: GameRunConfig): Promise<void> {
    this.destroy();
    const entry = this.manifest.entry;
    if (!entry || entry.kind !== "iframe") throw new Error("Cartridge entry is missing.");
    const url = new URL(entry.url);
    if (url.origin !== entry.origin || url.origin === window.location.origin) throw new Error("Cartridges must use their reviewed, separate origin.");
    this.config = { ...config };
    this.channel = crypto.randomUUID();
    this.completed = false;
    url.searchParams.set("ta", "1");
    url.searchParams.set("ta_host", window.location.origin);
    url.searchParams.set("ta_channel", this.channel);
    const frame = document.createElement("iframe");
    frame.title = this.manifest.name;
    frame.className = `cartridge-frame cartridge-${this.manifest.controls?.orientation ?? "any"}`;
    frame.sandbox.add("allow-scripts", "allow-same-origin", "allow-pointer-lock");
    frame.allow = "autoplay; fullscreen; gamepad";
    frame.referrerPolicy = "strict-origin";
    this.frame = frame;
    // Some existing simulations use viewport dimensions as scored rules. Scale
    // their declared playfield visually instead of changing simulation geometry.
    const width = config.rules?.viewportWidth;
    const height = config.rules?.viewportHeight;
    let wrapper: HTMLDivElement | undefined;
    let resize: ResizeObserver | undefined;
    if (config.mode !== "free" && typeof width === "number" && typeof height === "number" &&
        Number.isSafeInteger(width) && Number.isSafeInteger(height) && width >= 240 && width <= 2560 && height >= 320 && height <= 1440) {
      wrapper = document.createElement("div");
      Object.assign(wrapper.style, { margin: "0 auto", overflow: "hidden", position: "relative", borderRadius: "18px" });
      Object.assign(frame.style, { width: `${width}px`, minWidth: `${width}px`, maxWidth: "none", height: `${height}px`, minHeight: `${height}px`, maxHeight: "none", transformOrigin: "0 0", margin: "0" });
      const fit = () => {
        const scale = Math.min(1, (container.clientWidth || width) / width);
        wrapper!.style.width = `${width * scale}px`; wrapper!.style.height = `${height * scale}px`;
        frame.style.transform = `scale(${scale})`;
      };
      fit(); resize = new ResizeObserver(fit); resize.observe(container);
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const channel = this.channel;
      const current = () => this.frame === frame && this.channel === channel;
      let progressStage = "idle", progressTimer: ReturnType<typeof setTimeout> | undefined;
      const saving = new Set<string>();
      const fallback = () => {
        if (!current() || progressStage === "done") return;
        progressStage = "done"; clearTimeout(progressTimer);
        this.progress?.status("Browser save only. Account sync is unavailable; pending saves will retry when you reopen the game.");
        this.send("ta:mount", this.config);
      };
      const fail = (message: string) => {
        if (!settled) { settled = true; reject(new Error(message)); }
        else { this.destroy("error"); this.onError?.(message); }
      };
      const timer = window.setTimeout(() => fail("The cartridge did not become ready. Check its service and approved host origins."), 15_000);
      const message = (event: MessageEvent) => {
        if (event.origin !== entry.origin || event.source !== frame.contentWindow) return;
        const data = event.data;
        if (!data || data.ta !== 1 || data.channel !== this.channel) return;
        if (data.type === "ta:hello" && progressStage === "idle") {
          if (!this.progress || !data.payload?.progress) { progressStage = "done"; this.send("ta:mount", this.config); }
          else {
            progressStage = "opening"; this.progress.status("Loading account progress…");
            progressTimer = setTimeout(fallback, 8000);
            void this.progress.open().then(options => {
              if (!current() || progressStage !== "opening") return;
              progressStage = "reading";
              this.send("ta:progress_read", { ...options, gameId: this.manifest.id });
            }).catch(fallback);
          }
        }
        if (data.type === "ta:progress_snapshot" && this.progress && progressStage === "reading") {
          progressStage = "preparing";
          void this.progress.prepare(data.payload as ProgressRead).then(state => {
            if (!current() || progressStage !== "preparing") return;
            progressStage = "applying"; this.send("ta:progress_apply", state);
          }).catch(fallback);
        }
        if (data.type === "ta:progress_ready" && progressStage === "applying") {
          progressStage = "done"; clearTimeout(progressTimer);
          this.progress?.status("Saved to your account. Guest progress stays in this browser.");
          this.send("ta:mount", this.config);
        }
        if (data.type === "ta:progress_unavailable") {
          if (progressStage !== "done") fallback();
          else this.progress?.status("Account sync is unavailable. Keep this browser save and reopen the game to retry.");
        }
        if (data.type === "ta:progress_save" && this.progress && progressStage === "done" && typeof data.payload?.id === "string" && !saving.has(data.payload.id)) {
          const id = data.payload.id;
          saving.add(id); this.progress.status("Saving progress…");
          void this.progress.save(data.payload as ProgressOperation).then(() => {
            if (!current()) return;
            this.send("ta:progress_ack", { id }); this.progress?.status("Saved to your account.");
          }).catch(() => { if (current()) this.progress?.status("Saved in this browser. Account sync will retry."); }).finally(() => saving.delete(id));
        }
        if (data.type === "ta:ready" && !settled) { settled = true; clearTimeout(timer); resolve(); }
        if (data.type === "ta:run_started" && this.config?.mode === "free" && typeof data.payload?.runId === "string" && Number.isFinite(Date.parse(data.payload?.startedAt))) {
          if (data.payload.runId.length > 100) return;
          if (this.freeRun?.runId !== data.payload.runId) this.exitFreeRun("restart");
          this.config = { ...this.config, runId: data.payload.runId, startedAt: data.payload.startedAt };
          this.completed = false;
          if (!this.freeRun) {
            this.freeRun = { ...this.config };
            const context = data.payload.context;
            const bounded = context && typeof context === "object" && !Array.isArray(context)
              ? Object.fromEntries(Object.entries(context).filter(([k, v]) => /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(k) && typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12).slice(0, 32)) as Record<string, number> : undefined;
            this.observe({ type: "started", run: this.freeRun, context: bounded });
          }
        }
        if (data.type === "ta:run_complete" && this.config && !this.completed) {
          const checked = validateRunResultShape(this.config, data.payload);
          if (!checked.valid) { fail(checked.reason); return; }
          this.completed = true;
          this.freeRun = null;
          this.listeners.forEach((callback) => callback(checked.result));
        }
        if (data.type === "ta:paused") this.onState?.("paused", data.payload?.reason);
        if (data.type === "ta:resumed" || data.type === "ta:run_started") this.onState?.("running");
        if (data.type === "ta:error" && data.payload?.fatal) fail(String(data.payload.message).slice(0, 500));
      };
      const visibility = () => { if (document.hidden) this.pause(); };
      const pagehide = (event: PageTransitionEvent) => { if (!event.persisted) this.exitFreeRun("pagehide"); };
      window.addEventListener("message", message);
      window.addEventListener("pagehide", pagehide);
      document.addEventListener("visibilitychange", visibility);
      this.cleanup = () => {
        clearTimeout(timer);
        clearTimeout(progressTimer);
        resize?.disconnect(); wrapper?.remove();
        window.removeEventListener("message", message);
        window.removeEventListener("pagehide", pagehide);
        document.removeEventListener("visibilitychange", visibility);
        if (!settled) { settled = true; reject(new Error("Cartridge mount cancelled.")); }
      };
      frame.src = url.href;
      if (wrapper) { wrapper.append(frame); container.append(wrapper); }
      else container.append(frame);
    });
  }
  private send(type: string, payload: unknown = {}): void { this.frame?.contentWindow?.postMessage({ ta: 1, channel: this.channel, type, payload }, this.manifest.entry!.origin); }
  start(): void { this.send("ta:start"); this.frame?.focus(); }
  pause(): void { this.send("ta:pause", { reason: "host" }); }
  resume(): void { this.send("ta:resume"); this.frame?.focus(); }
  restart(): void { if (this.config?.mode === "free") this.send("ta:restart"); }
  private observe(event: FreePlayLifecycleEvent): void { try { this.onFreePlay?.(event); } catch { /* Analytics cannot interrupt gameplay. */ } }
  private exitFreeRun(reason: FreePlayLifecycleEvent["reason"]): void {
    if (!this.freeRun) return;
    this.observe({ type: "exited", run: this.freeRun, reason }); this.freeRun = null;
  }
  destroy(reason: FreePlayLifecycleEvent["reason"] = "navigation"): void {
    this.exitFreeRun(reason);
    this.send("ta:destroy");
    this.cleanup?.(); this.cleanup = null;
    this.frame?.remove(); this.frame = null; this.config = null;
  }
  onRunComplete(callback: (result: GameRunResult) => void): () => void { this.listeners.add(callback); return () => this.listeners.delete(callback); }
}
