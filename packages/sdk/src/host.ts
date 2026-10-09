import type { GameRunConfig, GameRunResult, TokenArcadeGame } from "./index.ts";

/** Owns one cartridge instance and guarantees cleanup when the screen changes. */
export class CartridgeHost {
  private cartridge: TokenArcadeGame | null = null;
  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  async mount(cartridge: TokenArcadeGame, container: HTMLElement, config: GameRunConfig, onComplete: (result: GameRunResult) => void): Promise<void> {
    this.destroy();
    const generation = this.generation;
    try {
      await cartridge.mount(container, config);
      if (generation !== this.generation) {
        cartridge.destroy();
        return;
      }
      this.unsubscribe = cartridge.onRunComplete(onComplete);
      this.cartridge = cartridge;
    } catch (error) {
      cartridge.destroy();
      throw error;
    }
  }

  start(): void { this.cartridge?.start(); }
  pause(): void { this.cartridge?.pause(); }
  resume(): void { this.cartridge?.resume(); }
  restart(): void { this.cartridge?.restart(); }

  destroy(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cartridge?.destroy();
    this.cartridge = null;
  }
}
