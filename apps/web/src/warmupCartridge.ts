import type { GameRunConfig, GameRunResult, TokenArcadeGame } from "../../../packages/sdk/src/index";
import { getWarmupSequence, scoreWarmupProof, WARMUP_ROUNDS, type WarmupProof } from "../../../packages/sdk/src/warmup.ts";

const symbols = ["●", "◆", "▲", "✳"];
const symbolNames = ["circle", "diamond", "triangle", "spark"];

/** A deliberately small internal cartridge. Launch games arrive through separate adapters. */
export class WarmupCartridge implements TokenArcadeGame {
  private container: HTMLElement | null = null;
  private config: GameRunConfig | null = null;
  private sequence: number[] = [];
  private proof: WarmupProof = { choices: [], timesMs: [] };
  private callback: ((result: GameRunResult) => void) | null = null;
  private running = false;
  private finished = false;
  private paused = false;
  private startClock = 0;
  private startedAt = "";
  private pauseClock = 0;
  private totalPaused = 0;
  private interval: number | null = null;
  private onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    const pad = target.closest<HTMLButtonElement>("[data-pad]");
    if (pad) this.choose(Number(pad.dataset.pad));
    if (target.closest("[data-restart]")) this.restart();
  };
  private onKey = (event: KeyboardEvent) => {
    if (event.key >= "1" && event.key <= "4") this.choose(Number(event.key) - 1);
  };

  mount(container: HTMLElement, config: GameRunConfig): void {
    this.destroy();
    if (!config.seed) throw new Error("The warmup cartridge needs a seed.");
    this.container = container;
    this.config = config;
    this.sequence = getWarmupSequence(config.seed);
    container.innerHTML = `
      <div class="warmup-shell">
        <div class="warmup-topline"><span>Warmup Cabinet <i>★</i></span><span data-timer>20.0s</span></div>
        <div class="warmup-screen">
          <div class="warmup-progress" data-progress>Round 1 / 12</div>
          <div class="warmup-target" data-target aria-live="polite"></div>
          <p class="warmup-instruction" data-instruction>Tap the matching symbol</p>
        </div>
        <div class="warmup-pad-grid" role="group" aria-label="Choose the matching symbol">
          ${symbols.map((symbol, index) => `<button type="button" class="warmup-pad pad-${index}" data-pad="${index}" aria-label="${symbolNames[index]} (${index + 1})">${symbol}</button>`).join("")}
        </div>
        <div class="warmup-bottomline"><span>Keyboard: 1 2 3 4</span><span data-score>0 pts</span></div>
      </div>`;
    container.addEventListener("click", this.onClick);
    window.addEventListener("keydown", this.onKey);
    this.render();
  }

  start(): void {
    if (!this.container || !this.config) return;
    this.clearTimer();
    this.proof = { choices: [], timesMs: [] };
    this.startClock = performance.now();
    this.startedAt = new Date().toISOString();
    this.totalPaused = 0;
    this.running = true;
    this.finished = false;
    this.paused = false;
    this.interval = window.setInterval(() => this.render(), 50);
    this.render();
  }

  pause(): void {
    if (!this.running || this.paused || this.config?.mode !== "free") return;
    this.paused = true;
    this.pauseClock = performance.now();
    this.render();
  }

  resume(): void {
    if (!this.paused) return;
    this.totalPaused += performance.now() - this.pauseClock;
    this.paused = false;
    this.render();
  }

  restart(): void {
    if (this.config?.mode === "free") this.start();
  }

  destroy(): void {
    this.clearTimer();
    if (this.container) {
      this.container.removeEventListener("click", this.onClick);
      this.container.innerHTML = "";
    }
    window.removeEventListener("keydown", this.onKey);
    this.container = null;
    this.config = null;
    this.callback = null;
    this.running = false;
  }

  onRunComplete(callback: (result: GameRunResult) => void): () => void {
    this.callback = callback;
    return () => { if (this.callback === callback) this.callback = null; };
  }

  private elapsed(): number {
    return Math.round(performance.now() - this.startClock - this.totalPaused - (this.paused ? performance.now() - this.pauseClock : 0));
  }

  private choose(choice: number): void {
    if (!this.running || this.finished || this.paused || !this.config) return;
    const time = this.elapsed();
    const previous = this.proof.timesMs.at(-1) ?? 0;
    if (time < 100 || time - previous < 80 || time > 20_000) return;
    this.proof.choices.push(choice);
    this.proof.timesMs.push(time);
    if (this.proof.choices.length === WARMUP_ROUNDS) {
      this.finished = true;
      this.running = false;
      this.clearTimer();
      const scored = scoreWarmupProof(this.config.seed!, this.proof);
      const result: GameRunResult = {
        gameId: this.config.gameId,
        gameVersion: this.config.gameVersion,
        runId: this.config.runId,
        mode: this.config.mode,
        raidId: this.config.raidId,
        seed: this.config.seed,
        objective: this.config.objective,
        primaryMetric: scored.score,
        secondaryMetrics: { durationMs: scored.durationMs },
        result: scored.valid ? "completed" : "failed",
        startedAt: this.startedAt,
        finishedAt: new Date().toISOString(),
        proof: { choices: [...this.proof.choices], timesMs: [...this.proof.timesMs] },
      };
      this.callback?.(result);
    }
    this.render();
  }

  private clearTimer(): void {
    if (this.interval !== null) window.clearInterval(this.interval);
    this.interval = null;
  }

  private render(): void {
    if (!this.container) return;
    const elapsed = this.running || this.finished ? this.elapsed() : 0;
    const timeRemaining = Math.max(0, 20_000 - elapsed);
    const count = this.proof.choices.length;
    if (this.running && timeRemaining <= 0) {
      this.running = false;
      this.finished = true;
      this.clearTimer();
      if (this.config) {
        this.callback?.({
          gameId: this.config.gameId,
          gameVersion: this.config.gameVersion,
          runId: this.config.runId,
          mode: this.config.mode,
          raidId: this.config.raidId,
          seed: this.config.seed,
          objective: this.config.objective,
          primaryMetric: this.proof.choices.reduce((sum, choice, index) => sum + Number(choice === this.sequence[index]) * 100, 0),
          result: "failed",
          startedAt: this.startedAt,
          finishedAt: new Date().toISOString(),
          proof: { choices: [...this.proof.choices], timesMs: [...this.proof.timesMs] },
        });
      }
    }
    const timer = this.container.querySelector<HTMLElement>("[data-timer]");
    const target = this.container.querySelector<HTMLElement>("[data-target]");
    const progress = this.container.querySelector<HTMLElement>("[data-progress]");
    const instruction = this.container.querySelector<HTMLElement>("[data-instruction]");
    const score = this.container.querySelector<HTMLElement>("[data-score]");
    if (timer) timer.textContent = `${(timeRemaining / 1000).toFixed(1)}s`;
    if (progress) progress.textContent = count === WARMUP_ROUNDS ? "Cabinet complete" : `Round ${count + 1} / ${WARMUP_ROUNDS}`;
    if (score) score.textContent = `${this.proof.choices.reduce((sum, choice, i) => sum + Number(choice === this.sequence[i]) * 100, 0)} pts`;
    if (this.finished && count < WARMUP_ROUNDS) {
      if (target) target.textContent = "⏱";
      if (instruction) instruction.textContent = this.config?.mode === "free" ? "Time is up. Try another round!" : "Time is up. Start a new attempt to try again.";
    } else if (this.finished) {
      if (target) target.textContent = "★";
      if (instruction) instruction.textContent = "Run complete!";
    } else {
      if (target) {
        target.textContent = symbols[this.sequence[count]];
        target.setAttribute("aria-label", symbolNames[this.sequence[count]]);
      }
      if (instruction) instruction.textContent = this.paused ? "Paused" : "Tap the matching symbol";
    }
    for (const pad of this.container.querySelectorAll<HTMLButtonElement>("[data-pad]")) {
      const previous = this.proof.timesMs.at(-1) ?? 0;
      pad.disabled = !this.running || this.paused || elapsed < 100 || elapsed - previous < 80 || timeRemaining <= 0;
    }
    let restart = this.container.querySelector<HTMLButtonElement>("[data-restart]");
    if (this.finished && this.config?.mode === "free" && !restart) {
      restart = document.createElement("button");
      restart.type = "button";
      restart.className = "warmup-restart";
      restart.dataset.restart = "";
      restart.textContent = "Play again";
      this.container.querySelector(".warmup-screen")?.appendChild(restart);
    } else if (!this.finished && restart) restart.remove();
  }
}
