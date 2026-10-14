import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { getAddress } from "viem";
import type { GameRecord, GameRunConfig, GameRunResult, Passport, Raid } from "../../../packages/sdk/src/index.ts";
import { WARMUP_GAME_ID } from "../../../packages/sdk/src/warmup.ts";
import { launchCabinets } from "../../../packages/sdk/src/launch.ts";

type JsonRow = { json: string };
type CountRow = { count: number };

export interface RunSession {
  config: GameRunConfig;
  playerId: string;
  consumedAt?: string;
}

export interface AcceptedResult {
  playerId: string;
  result: GameRunResult;
  acceptedAt: string;
}

export interface WalletChallenge {
  nonce: string;
  playerId: string;
  address: string;
  message: string;
  expiresAt: string;
  usedAt?: string;
}

export class ArcadeStore {
  readonly db: DatabaseSync;
  private readonly includeWarmup: boolean;

  constructor(path = "apps/api/data/arcade.sqlite", includeWarmup = process.env.LOCAL_DEMO_MODE === "true") {
    this.includeWarmup = includeWarmup;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS raids (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, identity_id TEXT NOT NULL UNIQUE, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS run_sessions (
        id TEXT PRIMARY KEY, player_id TEXT NOT NULL, game_id TEXT NOT NULL,
        mode TEXT NOT NULL, raid_id TEXT, json TEXT NOT NULL, consumed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS run_sessions_raid_player ON run_sessions(raid_id, player_id);
      CREATE TABLE IF NOT EXISTS accepted_results (
        run_id TEXT PRIMARY KEY, player_id TEXT NOT NULL, game_id TEXT NOT NULL,
        mode TEXT NOT NULL, raid_id TEXT, metric REAL NOT NULL, accepted_at TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS accepted_results_game ON accepted_results(game_id, mode, raid_id);
      CREATE TABLE IF NOT EXISTS wallet_challenges (
        nonce TEXT PRIMARY KEY, player_id TEXT NOT NULL, address TEXT NOT NULL,
        message TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
      );
      CREATE TABLE IF NOT EXISTS linked_wallets (
        address TEXT PRIMARY KEY, player_id TEXT NOT NULL, linked_at TEXT NOT NULL
      );
    `);
    this.seed();
  }

  close(): void { this.db.close(); }

  private seed(): void {
    const now = new Date().toISOString();
    // Retire only untouched placeholders from the previous frontend scaffold.
    for (const id of ["buy-bounce", "two-places", "coindle", "skrumpey-slide"]) {
      const old = this.getGame(id);
      if (old?.status === "draft" && old.manifest.version === "0.0.0-unintegrated" && old.manifest.adapterId === `pending/${id}` && !old.minicoin && !old.creatorId) {
        this.db.prepare("DELETE FROM games WHERE id = ?").run(id);
      }
    }
    const warmup: GameRecord = {
      manifest: {
        id: WARMUP_GAME_ID, name: "Arcade Warmup", description: "Internal test cartridge for checking the arcade host and verified runs. Not a launch game.",
        version: "1.0.0", developer: "Token Arcade", adapterId: WARMUP_GAME_ID,
        supportedModes: ["free", "ranked", "raid"], supportedObjectives: ["score"],
        communityOptional: true, minicoinOptional: false,
      }, status: "published", createdAt: now, publishedAt: now,
    };
    for (const game of [
      ...(this.includeWarmup ? [warmup] : []),
      ...launchCabinets(process.env.CARTRIDGE_ORIGIN),
    ]) {
      const prior = this.getGame(game.manifest.id);
      // One narrow correction for v1 imports created during integration. Admin
      // edits clear this review marker; future starts never overwrite them.
      if (prior && (game.legacyImportRevision ?? 0) >= 2 && prior.legacyImportRevision === undefined &&
          prior.review?.approvedBy === "platform:legacy-import" && prior.manifest.version === "1.0.0" &&
          prior.manifest.adapterId === game.manifest.adapterId && prior.manifest.entry?.kind === "iframe" &&
          new URL(prior.manifest.entry.url).pathname === `/${game.manifest.id}/v/1.0.0/`) {
        this.saveGame({ ...prior, manifest: { ...game.manifest, entry: prior.manifest.entry }, legacyImportRevision: game.legacyImportRevision });
      } else if (prior && (game.legacyImportRevision ?? 0) > 2 && (prior.legacyImportRevision ?? 0) < (game.legacyImportRevision ?? 0) &&
          prior.review?.approvedBy === "platform:legacy-import" && prior.manifest.version === game.manifest.version &&
          prior.manifest.adapterId === game.manifest.adapterId) {
        // Reviewed platform upgrade of an untouched legacy import (e.g. Passport Play enabled): new modes and
        // verifier declaration; keep the stored entry origin and everything else.
        // Revision 3 also carries reviewed public display copy (e.g. eMONAD cabinet -> "Uppers"); id is unchanged.
        this.saveGame({ ...prior, manifest: { ...prior.manifest, name: game.manifest.name, description: game.manifest.description, supportedModes: game.manifest.supportedModes,
          supportedObjectives: game.manifest.supportedObjectives, ...(game.manifest.verifier ? { verifier: game.manifest.verifier } : {}) },
          legacyImportRevision: game.legacyImportRevision });
      } else this.db.prepare("INSERT OR IGNORE INTO games (id,json) VALUES (?,?)").run(game.manifest.id, JSON.stringify(game));
    }

    const demoRaid: Raid = {
      id: "warmup-test-raid", name: "Warmup Test Raid", gameId: WARMUP_GAME_ID,
      communityId: "internal-test", objective: "score", seed: "warmup-test-raid-v1",
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      maxAttempts: 3, reward: { type: "none" },
      feeSplitBps: { prize: 0, community: 0, treasury: 10_000 }, status: "open",
    };
    if (this.includeWarmup) this.db.prepare("INSERT OR IGNORE INTO raids (id,game_id,json) VALUES (?,?,?)").run(demoRaid.id, demoRaid.gameId, JSON.stringify(demoRaid));
    else {
      this.db.prepare("DELETE FROM raids WHERE id = ?").run(demoRaid.id);
      this.db.prepare("DELETE FROM games WHERE id = ?").run(WARMUP_GAME_ID);
    }
  }

  listGames(publishedOnly = false): GameRecord[] {
    const rows = this.db.prepare("SELECT json FROM games ORDER BY id").all() as unknown as JsonRow[];
    const games = rows.map((row) => JSON.parse(row.json) as GameRecord);
    return publishedOnly ? games.filter((game) => game.status === "published") : games;
  }

  getGame(id: string): GameRecord | undefined {
    const row = this.db.prepare("SELECT json FROM games WHERE id = ?").get(id) as JsonRow | undefined;
    return row ? JSON.parse(row.json) as GameRecord : undefined;
  }

  saveGame(game: GameRecord): void {
    this.db.prepare("INSERT INTO games (id,json) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json")
      .run(game.manifest.id, JSON.stringify(game));
  }

  listRaids(): Raid[] {
    const rows = this.db.prepare("SELECT json FROM raids ORDER BY id").all() as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.json) as Raid);
  }

  getRaid(id: string): Raid | undefined {
    const row = this.db.prepare("SELECT json FROM raids WHERE id = ?").get(id) as JsonRow | undefined;
    return row ? JSON.parse(row.json) as Raid : undefined;
  }

  saveRaid(raid: Raid): void {
    this.db.prepare("INSERT INTO raids (id,game_id,json) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET game_id=excluded.game_id,json=excluded.json")
      .run(raid.id, raid.gameId, JSON.stringify(raid));
  }

  getOrCreatePassport(identityId: string): Passport {
    const row = this.db.prepare("SELECT json FROM players WHERE identity_id = ?").get(identityId) as JsonRow | undefined;
    if (row) return JSON.parse(row.json) as Passport;
    const localName = identityId.startsWith("local-demo:") ? identityId.slice("local-demo:".length) : undefined;
    const displayName = localName === "player" ? "Player" : localName === "admin" ? "Arcade Admin" : localName ? localName[0].toUpperCase() + localName.slice(1) : `Player ${identityId.slice(-6)}`;
    const passport: Passport = {
      playerId: randomUUID(), displayName,
      ownershipWallets: [], gamesPlayed: 0, rankedRuns: 0, raidsEntered: 0,
      bestScores: {}, wins: 0, communities: [],
    };
    this.db.prepare("INSERT INTO players (id,identity_id,json) VALUES (?,?,?)")
      .run(passport.playerId, identityId, JSON.stringify(passport));
    return passport;
  }

  getPassport(playerId: string): Passport | undefined {
    const row = this.db.prepare("SELECT json FROM players WHERE id = ?").get(playerId) as JsonRow | undefined;
    return row ? JSON.parse(row.json) as Passport : undefined;
  }

  listCreatorAccounts(): { playerId: string; displayName: string }[] {
    return (this.db.prepare("SELECT json FROM players").all() as JsonRow[]).map(row => {
      const p = JSON.parse(row.json) as Passport;
      return { playerId: p.playerId, displayName: p.displayName };
    });
  }

  identityForPlayer(playerId: string): string | undefined {
    return (this.db.prepare("SELECT identity_id FROM players WHERE id = ?").get(playerId) as { identity_id: string } | undefined)?.identity_id;
  }

  savePassport(passport: Passport): void {
    this.db.prepare("UPDATE players SET json = ? WHERE id = ?").run(JSON.stringify(passport), passport.playerId);
  }

  createWalletChallenge(playerId: string, address: string): WalletChallenge {
    const nonce = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const message = `Token Arcade ownership wallet association\nPlayer ID: ${playerId}\nWallet: ${address}\nNonce: ${nonce}\nExpires: ${expiresAt}\nNo asset transfer is requested.`;
    this.db.prepare("INSERT INTO wallet_challenges (nonce,player_id,address,message,expires_at) VALUES (?,?,?,?,?)")
      .run(nonce, playerId, address.toLowerCase(), message, expiresAt);
    return { nonce, playerId, address, message, expiresAt };
  }

  getWalletChallenge(nonce: string): WalletChallenge | undefined {
    const row = this.db.prepare("SELECT * FROM wallet_challenges WHERE nonce = ?").get(nonce) as {
      nonce: string; player_id: string; address: string; message: string; expires_at: string; used_at: string | null;
    } | undefined;
    return row && { nonce: row.nonce, playerId: row.player_id, address: row.address,
      message: row.message, expiresAt: row.expires_at, ...(row.used_at ? { usedAt: row.used_at } : {}) };
  }

  confirmWalletChallenge(challenge: WalletChallenge): "linked" | "used" | "already_linked" {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const linked = this.db.prepare("SELECT player_id FROM linked_wallets WHERE address = ?").get(challenge.address.toLowerCase()) as { player_id: string } | undefined;
      if (linked && linked.player_id !== challenge.playerId) { this.db.exec("ROLLBACK"); return "already_linked"; }
      const update = this.db.prepare("UPDATE wallet_challenges SET used_at = ? WHERE nonce = ? AND player_id = ? AND used_at IS NULL AND expires_at > ?")
        .run(new Date().toISOString(), challenge.nonce, challenge.playerId, new Date().toISOString());
      if (update.changes !== 1) { this.db.exec("ROLLBACK"); return "used"; }
      if (!linked) this.db.prepare("INSERT INTO linked_wallets (address,player_id,linked_at) VALUES (?,?,?)")
        .run(challenge.address.toLowerCase(), challenge.playerId, new Date().toISOString());
      const passport = this.getPassport(challenge.playerId);
      if (passport && !passport.ownershipWallets.some((wallet) => wallet.toLowerCase() === challenge.address.toLowerCase())) {
        passport.ownershipWallets.push(getAddress(challenge.address));
        this.savePassport(passport);
      }
      this.db.exec("COMMIT");
      return "linked";
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  unlinkWallet(playerId: string, address: string): Passport | undefined {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM linked_wallets WHERE address = ? AND player_id = ?").run(address.toLowerCase(), playerId);
      const passport = this.getPassport(playerId);
      if (passport) {
        passport.ownershipWallets = passport.ownershipWallets.filter((wallet) => wallet.toLowerCase() !== address.toLowerCase());
        this.savePassport(passport);
      }
      this.db.exec("COMMIT");
      return passport;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  createSession(session: RunSession, maxAttempts?: number): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (session.config.raidId && maxAttempts !== undefined) {
        const row = this.db.prepare("SELECT COUNT(*) AS count FROM run_sessions WHERE raid_id = ? AND player_id = ?")
          .get(session.config.raidId, session.playerId) as CountRow;
        if (row.count >= maxAttempts) { this.db.exec("ROLLBACK"); return false; }
      }
      this.db.prepare("INSERT INTO run_sessions (id,player_id,game_id,mode,raid_id,json) VALUES (?,?,?,?,?,?)")
        .run(session.config.runId, session.playerId, session.config.gameId, session.config.mode, session.config.raidId ?? null, JSON.stringify(session.config));
      this.db.exec("COMMIT");
      return true;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  getSession(id: string): RunSession | undefined {
    const row = this.db.prepare("SELECT player_id,json,consumed_at FROM run_sessions WHERE id = ?")
      .get(id) as { player_id: string; json: string; consumed_at: string | null } | undefined;
    if (!row) return undefined;
    return { playerId: row.player_id, config: JSON.parse(row.json) as GameRunConfig, consumedAt: row.consumed_at ?? undefined };
  }

  acceptResult(session: RunSession, result: GameRunResult, updatePassport: (current: Passport) => Passport): Passport | undefined {
    const acceptedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const update = this.db.prepare("UPDATE run_sessions SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
        .run(acceptedAt, session.config.runId);
      if (update.changes !== 1) { this.db.exec("ROLLBACK"); return undefined; }
      const current = this.getPassport(session.playerId);
      if (!current) throw new Error("Player Passport is missing");
      const passport = updatePassport(current);
      this.db.prepare("INSERT INTO accepted_results (run_id,player_id,game_id,mode,raid_id,metric,accepted_at,json) VALUES (?,?,?,?,?,?,?,?)")
        .run(result.runId, session.playerId, result.gameId, result.mode, result.raidId ?? null, result.primaryMetric, acceptedAt, JSON.stringify(result));
      this.savePassport(passport);
      this.db.exec("COMMIT");
      return passport;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  listAcceptedResults(gameId: string, mode: "ranked" | "raid", raidId?: string): AcceptedResult[] {
    const rows = (raidId
      ? this.db.prepare("SELECT player_id,json,accepted_at FROM accepted_results WHERE game_id = ? AND mode = ? AND raid_id = ?").all(gameId, mode, raidId)
      : this.db.prepare("SELECT player_id,json,accepted_at FROM accepted_results WHERE game_id = ? AND mode = ? AND raid_id IS NULL").all(gameId, mode)) as unknown as { player_id: string; json: string; accepted_at: string }[];
    return rows.map((row) => ({ playerId: row.player_id, result: JSON.parse(row.json) as GameRunResult, acceptedAt: row.accepted_at }));
  }

  hasAcceptedGame(playerId: string, gameId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM accepted_results WHERE player_id = ? AND game_id = ? LIMIT 1").get(playerId, gameId);
  }

  hasAcceptedRaid(playerId: string, raidId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM accepted_results WHERE player_id = ? AND raid_id = ? LIMIT 1").get(playerId, raidId);
  }

  countRaidAttempts(playerId: string, raidId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM run_sessions WHERE raid_id = ? AND player_id = ?").get(raidId, playerId) as CountRow;
    return row.count;
  }
}
