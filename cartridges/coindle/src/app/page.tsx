"use client";

import { useCallback, useState } from "react";
import { GameProvider } from "@/context/GameContext";
import Header from "@/components/Header";
import GameBoard from "@/components/GameBoard";
import UsernamePrompt from "@/components/UsernamePrompt";

export default function Home() {
  const [, setUsername] = useState<string>("");

  const handleUsernameSet = useCallback((name: string) => {
    setUsername(name);
    // Also ensure uid exists
    if (!localStorage.getItem("coindle-uid")) {
      localStorage.setItem("coindle-uid", crypto.randomUUID());
    }
  }, []);

  return (
    <GameProvider>
      <main className="flex min-h-screen flex-col items-center px-4 pb-8 pt-6 sm:pt-10">
        <Header />
        <div className="mt-6 w-full">
          <GameBoard />
        </div>

        <footer
          className="mt-auto pt-8 text-center text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          Built for the Pyth Community Hackathon 2026
        </footer>
      </main>

      <UsernamePrompt onSet={handleUsernameSet} />
    </GameProvider>
  );
}
