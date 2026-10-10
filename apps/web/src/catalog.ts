import type { GameRecord } from "../../../packages/sdk/src/index";
import { hasClientCartridge } from "./cartridges.ts";

export type ArcadeGame = {
  id: string;
  name: string;
  genre: string;
  description: string;
  community: string;
  palette: "pink" | "cyan" | "violet" | "lime" | "ink";
  glyph: string;
  number: string;
  record?: GameRecord;
  playable: boolean;
  fixture?: boolean;
};

/** Publication is the only source of public cabinets, including future submissions. */
export function getCatalog(records: GameRecord[]): ArcadeGame[] {
  return records.filter(record => record.status === "published").map((record, index) => ({
    id: record.manifest.id, name: record.manifest.name, description: record.manifest.description,
    genre: record.manifest.presentation?.genre ?? "Arcade game",
    community: record.community?.name ?? record.communityConcept?.name ?? "Independent game",
    palette: record.manifest.presentation?.palette ?? "cyan",
    glyph: record.manifest.presentation?.glyph ?? "✦",
    number: String(index + 1).padStart(2, "0"), record,
    playable: hasClientCartridge(record.manifest.id, record.manifest.adapterId, record.manifest),
    fixture: record.manifest.id === "arcade-warmup",
  }));
}

export function getGame(id: string, records: GameRecord[]): ArcadeGame | undefined {
  return getCatalog(records).find((game) => game.id === id);
}

export function gameHref(id: string) { return `/games/${encodeURIComponent(id)}`; }
export function playHref(id: string, mode: "free" | "ranked" | "raid" = "free", raidId?: string) {
  const params = new URLSearchParams({ mode });
  if (raidId) params.set("raidId", raidId);
  return `/play/${encodeURIComponent(id)}?${params}`;
}
