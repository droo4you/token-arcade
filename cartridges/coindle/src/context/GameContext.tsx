"use client";

import { createContext, useContext } from "react";
import { useGame } from "@/hooks/useGame";

type GameContextType = ReturnType<typeof useGame>;

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const game = useGame();
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}

export function useGameContext(): GameContextType {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error("useGameContext must be used within a GameProvider");
  }
  return ctx;
}
