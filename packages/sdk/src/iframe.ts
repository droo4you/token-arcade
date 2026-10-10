import type { GameManifest, GameRunConfig, GameRunResult, TokenArcadeGame } from "./index.ts";
import { validateRunResultShape } from "./validate.ts";

/** The existing lifecycle contract, transported to a reviewed, separate-origin build. */
export class IframeCartridge implements TokenArcadeGame {
  private frame: HTMLIFrameElement | null = null;
  private config: GameRunConfig | null = null;
  private channel = "";
  private listeners = new Set<(result: GameRunResult) => void>();
  private cleanup: (() => void) | null = null;
  private completed = false;
  private readonly manifest: GameManifest;
  private readonly onState?: (state: "paused" | "running", reason?: string) => void;
  private readonly onError?: (message: string) => void;
  constructor(manifest: GameManifest, onState?: (state: "paused" | "running", reason?: string) => void, onError?: (message: string) => void) {
    this.manifest = manifest; this.onState = onState; this.onError = onError;
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
      const fail = (message: string) => {
        if (!settled) { settled = true; reject(new Error(message)); }
        else { this.destroy(); this.onError?.(message); }
      };
      const timer = window.setTimeout(() => fail("The cartridge did not become ready. Check its service and approved host origins."), 15_000);
      const message = (event: MessageEvent) => {
        if (event.origin !== entry.origin || event.source !== frame.contentWindow) return;
        const data = event.data;
        if (!data || data.ta !== 1 || data.channel !== this.channel) return;
        if (data.type === "ta:hello") this.send("ta:mount", this.config);
        if (data.type === "ta:ready" && !settled) { settled = true; clearTimeout(timer); resolve(); }
        if (data.type === "ta:run_started" && this.config?.mode === "free" && typeof data.payload?.runId === "string" && Number.isFinite(Date.parse(data.payload?.startedAt))) {
          this.config = { ...this.config, runId: data.payload.runId, startedAt: data.payload.startedAt };
          this.completed = false;
        }
        if (data.type === "ta:run_complete" && this.config && !this.completed) {
          const checked = validateRunResultShape(this.config, data.payload);
          if (!checked.valid) { fail(checked.reason); return; }
          this.completed = true;
          this.listeners.forEach((callback) => callback(checked.result));
        }
        if (data.type === "ta:paused") this.onState?.("paused", data.payload?.reason);
        if (data.type === "ta:resumed" || data.type === "ta:run_started") this.onState?.("running");
        if (data.type === "ta:error" && data.payload?.fatal) fail(String(data.payload.message).slice(0, 500));
      };
      const visibility = () => { if (document.hidden) this.pause(); };
      window.addEventListener("message", message);
      document.addEventListener("visibilitychange", visibility);
      this.cleanup = () => {
        clearTimeout(timer);
        resize?.disconnect(); wrapper?.remove();
        window.removeEventListener("message", message);
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
  destroy(): void {
    this.send("ta:destroy");
    this.cleanup?.(); this.cleanup = null;
    this.frame?.remove(); this.frame = null; this.config = null;
  }
  onRunComplete(callback: (result: GameRunResult) => void): () => void { this.listeners.add(callback); return () => this.listeners.delete(callback); }
}
