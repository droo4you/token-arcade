import React from "react";
import { createRoot } from "react-dom/client";
import { GameProvider } from "@/context/GameContext";
import Header from "@/components/Header";
import GameBoard from "@/components/GameBoard";
import "@/app/globals.css";
import { resetArcadeRound, setArcadePaused, setHostedArcade } from "@/lib/arcade";
import { setArcadeMuted, setArcadeAudioPaused, destroyArcadeAudio } from "@/lib/sounds";

setHostedArcade(true);

const mount = document.getElementById("root");
if (!mount) throw new Error("Coindle mount element is missing");

let root: ReturnType<typeof createRoot> | null = null;
function showGame(): void {
  if (root) return;
  root = createRoot(mount!);
  root.render(
    <React.StrictMode>
      <GameProvider>
        <main className="flex min-h-screen flex-col items-center px-4 pb-8 pt-6 sm:pt-10">
          <Header />
          <div className="mt-6 w-full"><GameBoard /></div>
          <footer className="mt-auto pt-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            Built for the Pyth Community Hackathon 2026
          </footer>
        </main>
      </GameProvider>
    </React.StrictMode>,
  );
}
function hideGame(): void { root?.unmount(); root = null; resetArcadeRound(); setArcadePaused(false); destroyArcadeAudio(); }

if (window.TokenArcade?.embedded) {
  window.TokenArcade.register({
    version: "1.0.0",
    capabilities: { pause: true, mute: true, touch: true, keyboard: true, orientation: "any" },
    mount(config) {
      if (config.mode !== "free") throw new Error("Coindle supports Free Play only.");
    },
    start: showGame,
    pause() { setArcadePaused(true); setArcadeAudioPaused(true); },
    resume() { setArcadePaused(false); setArcadeAudioPaused(false); },
    restart() { hideGame(); showGame(); },
    destroy: hideGame,
    audio: setArcadeMuted,
  });
} else {
  showGame();
}
