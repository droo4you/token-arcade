import React from "react";
import { createRoot } from "react-dom/client";
import { GameProvider } from "@/context/GameContext";
import Header from "@/components/Header";
import GameBoard from "@/components/GameBoard";
import RapidFire from "@/components/RapidFire";
import ModePicker from "@/components/ModePicker";
import "@/app/globals.css";
import { VISUAL_VERSION } from "@/lib/constants";
import { resetArcadeRound, setArcadePaused, setHostedArcade } from "@/lib/arcade";
import { setArcadeMuted, setArcadeAudioPaused, destroyArcadeAudio } from "@/lib/sounds";

setHostedArcade(true);

const mount = document.getElementById("root");
if (!mount) throw new Error("Coindle mount element is missing");

let root: ReturnType<typeof createRoot> | null = null;
let runConfig: { mode: string; runId?: string } = { mode: "free" };
function showGame(): void {
  if (root) return;
  root = createRoot(mount!);
  if (runConfig.mode === "ranked" || runConfig.mode === "raid") {
    const runId = runConfig.runId!;
    root.render(
      <React.StrictMode>
        <main className="flex min-h-screen flex-col items-center px-4 pb-8 pt-6 sm:pt-10">
          <h1 className="mb-5 text-2xl font-semibold">
            <span style={{ color: "var(--accent)" }}>Coin</span>
            <span style={{ color: "var(--text)" }}>dle</span>
          </h1>
          <RapidFire runId={runId} raid={runConfig.mode === "raid"}
            onBegin={() => window.TokenArcade?.beginRun() ?? false}
            onComplete={(solved, guesses, skips) => window.TokenArcade?.complete({ primaryMetric: solved, secondaryMetrics: { guesses, skips }, result: "completed" })} />
        </main>
      </React.StrictMode>,
    );
    return;
  }
  root.render(
    <React.StrictMode>
      <GameProvider>
        <main className="flex min-h-screen flex-col items-center px-4 pb-8 pt-6 sm:pt-10">
          <Header />
          {window.TokenArcade?.embedded && <ModePicker />}
          <div className="mt-6 w-full"><GameBoard /></div>
          <footer className="mt-auto pt-8 text-center text-xs" style={{ color: "var(--text-dim)" }}>
            Built for the Pyth Community Hackathon 2026
            <span className="font-mono tabular-nums"> · {VISUAL_VERSION}</span>
          </footer>
        </main>
      </GameProvider>
    </React.StrictMode>,
  );
}
function hideGame(): void { root?.unmount(); root = null; resetArcadeRound(); setArcadePaused(false); destroyArcadeAudio(); }

if (window.TokenArcade?.embedded) {
  window.TokenArcade.register({
    version: "1.1.0", // rules version; visual stamp is VISUAL_VERSION and does not change Rapid Fire rules
    capabilities: { pause: true, mute: true, touch: true, keyboard: true, orientation: "any" },
    mount(config) {
      const run = config as { mode: string; runId?: string; objective?: string };
      if (run.mode !== "free" && (!run.runId || run.objective !== "coins_solved")) throw new Error("Coindle Passport Play needs a Rapid Fire run.");
      runConfig = { mode: run.mode, runId: run.runId };
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
