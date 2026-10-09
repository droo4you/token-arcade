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

const editorial: Omit<ArcadeGame, "record" | "playable">[] = [
  {
    id: "skrumpey-slide",
    name: "Skrumpey Slide",
    genre: "Physics launch",
    description: "Build momentum, steer the slide, and make a magnificent mess.",
    community: "Skrumpeys",
    palette: "pink",
    glyph: "✳",
    number: "01",
  },
  {
    id: "two-places",
    name: "Two Places",
    genre: "Puzzle platformer",
    description: "A precise little puzzle about being in the right place.",
    community: "Original game",
    palette: "cyan",
    glyph: "◩",
    number: "02",
  },
  {
    id: "buy-bounce",
    name: "Buy Bounce",
    genre: "Endless jumper",
    description: "Keep climbing. Keep bouncing. See how far you can get.",
    community: "Original game",
    palette: "lime",
    glyph: "↟",
    number: "03",
  },
  {
    id: "coindle",
    name: "Coindle",
    genre: "Daily deduction",
    description: "One good guess leads to another in this daily brain teaser.",
    community: "Arcade original",
    palette: "violet",
    glyph: "⌗",
    number: "04",
  },
];

const warmup: Omit<ArcadeGame, "record" | "playable"> = {
  id: "arcade-warmup",
  name: "Warmup Cabinet",
  genre: "Reaction test",
  description: "Match twelve symbols against the clock. A small internal test cartridge for the arcade host.",
  community: "Token Arcade test fixture",
  palette: "ink",
  glyph: "✦",
  number: "T",
  fixture: true,
};

export function getCatalog(records: GameRecord[]): ArcadeGame[] {
  const byId = new Map(records.map((record) => [record.manifest.id, record]));
  const base = editorial.map((game) => {
    const record = byId.get(game.id);
    return {
      ...game,
      name: record?.manifest.name ?? game.name,
      description: record?.manifest.description ?? game.description,
      community: record?.community?.name ?? game.community,
      record,
      playable: record?.status === "published" && hasClientCartridge(game.id, record.manifest.adapterId),
    };
  });
  const editorialIds = new Set(editorial.map((game) => game.id));
  const added = records.filter((record) => record.status === "published" && record.manifest.id !== warmup.id && !editorialIds.has(record.manifest.id)).map((record, index): ArcadeGame => ({
    id: record.manifest.id,
    name: record.manifest.name,
    genre: "Arcade game",
    description: record.manifest.description,
    community: record.community?.name ?? "Arcade original",
    palette: (["cyan", "lime", "violet", "pink"] as const)[index % 4],
    glyph: "✦",
    number: String(index + editorial.length + 1).padStart(2, "0"),
    record,
    playable: hasClientCartridge(record.manifest.id, record.manifest.adapterId),
  }));
  const fixtureRecord = byId.get(warmup.id);
  const fixture: ArcadeGame[] = fixtureRecord?.status === "published" ? [{ ...warmup, record: fixtureRecord, playable: hasClientCartridge(warmup.id, fixtureRecord.manifest.adapterId) }] : [];
  return [...base, ...added, ...fixture];
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
