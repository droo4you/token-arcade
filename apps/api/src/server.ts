import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, verifyMessage, type Address } from "viem";
import type { CommunityAsset, GameManifest, GameObjective, GameRecord, GameRules, GameRunConfig, GameRunResult, Passport, Raid } from "../../../packages/sdk/src/index.ts";
import { validateRunResultShape } from "../../../packages/sdk/src/validate.ts";
import { validFeeSplit } from "../../../packages/sdk/src/platform.ts";
import { WARMUP_GAME_ID } from "../../../packages/sdk/src/warmup.ts";
import { ArcadeAuth, AuthError, type AuthSettings, type Identity } from "./auth.ts";
import { ArcadeStore, type AcceptedResult, type RunSession } from "./store.ts";
import { DirectWalletOwnershipResolver } from "./ownership.ts";
import { AdapterRegistry, normalizeRunRules } from "./verifiers.ts";
import { MinicoinDeployer, MinicoinError, type MinicoinSettings } from "./minicoin.ts";
import { createCoindleHandler } from "./coindle.ts";
import { createCoindleRapid, RapidError, isRapidRules, RAPID_RULES, RAPID_V2_RULES, RAPID_V2_FORMAT, RAPID_RAID_RULES, RAPID_RUN_TIMEOUT_MS, type PriceTiers } from "./coindleRapid.ts";
import { TestnetMinicoinService } from "./testnet-minicoin.ts";
import { FundedRaids, FundedRaidError } from "./fundedRaids.ts";
import { AutomaticPayouts } from "./automaticPayouts.ts";
import { freePlayReport } from "./freePlayAnalytics.ts";
import { skipBoardRules, skipRules, SKIP_RAID_RULES, skipRaidResults } from "./skipBoards.ts";

function requestedSkipRules(board: unknown) {
  if (!skipRules.BOARDS.some(value => value === board)) fail(400, "INVALID_BOARD", "Choose Open, Zero, Mid or Max");
  return normalizeRunRules(skipBoardRules(board));
}

import { twoRules, twoLevelRules, twoRaidRules } from "./twoPlacesBoards.ts";
function requestedTwoRules(level: unknown = 0) {
  if (!Number.isSafeInteger(level) || Number(level) < 0 || Number(level) >= twoRules.LEVEL_COUNT) fail(400, "INVALID_LEVEL", "Choose a level from 1 to 20");
  return normalizeRunRules(twoLevelRules(level));
}

import { initializeProgress, readProgress, syncProgress } from "./freePlayProgress.ts";
import { progressKeys, twoPlacesUnlockedCount } from "../../../packages/sdk/src/progress.ts";

const OBJECTIVES = new Set<GameObjective>(["score", "total_score", "distance", "destruction", "completion_time", "stars", "guesses", "coins_solved"]);
const MODES = new Set(["free", "ranked", "raid"]);
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const LOCAL_EMONAD_METADATA_URI = "http://127.0.0.1:5173/minicoin-rehearsal/emonad.json";

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: string[];
  constructor(status: number, code: string, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status: number, code: string, message: string, details?: string[]): never { throw new HttpError(status, code, message, details); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function requiredString(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(400, "INVALID_INPUT", `${field} must be a nonempty string of at most ${max} characters`);
  return value.trim();
}
function optionalString(value: unknown, field: string, max = 200): string | undefined {
  return value === undefined || value === null ? undefined : requiredString(value, field, max);
}
function isoDate(value: unknown, field: string): string {
  const string = requiredString(value, field);
  if (!Number.isFinite(Date.parse(string))) fail(400, "INVALID_INPUT", `${field} must be an ISO date`);
  return new Date(string).toISOString();
}
function respond(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, jsonHeaders).end(JSON.stringify(data));
}
async function readJson(request: IncomingMessage, maxLength = 65_536): Promise<Record<string, unknown>> {
  if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    fail(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json");
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > maxLength) fail(413, "BODY_TOO_LARGE", "JSON body is too large");
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) fail(400, "INVALID_INPUT", "Expected a JSON object");
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return fail(400, "INVALID_JSON", "Malformed JSON body");
  }
}

function validatePlayGuide(value: unknown, modes: string[]): NonNullable<GameManifest["playGuide"]> {
  if (!isRecord(value)) fail(400, "INVALID_PLAY_GUIDE", "Describe the gameplay for each requested mode");
  const guide: NonNullable<GameManifest["playGuide"]> = { free: requiredString(value.free, "Free Play description", 1000) };
  for (const mode of ["ranked", "raid"] as const) if (modes.includes(mode)) guide[mode] = requiredString(value[mode], `${mode === "ranked" ? "Passport Play" : "Community Raid"} challenge`, 1000);
  if (modes.some(mode => mode !== "free")) {
    guide.scoring = requiredString(value.scoring, "Scoring rules", 1000);
    guide.tieBreak = requiredString(value.tieBreak, "Tie-break rules", 1000);
  }
  return guide;
}

function validateManifest(value: unknown): GameManifest {
  if (!isRecord(value)) fail(400, "INVALID_MANIFEST", "Manifest is required");
  const id = requiredString(value.id, "manifest.id", 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail(400, "INVALID_MANIFEST", "Game ID must use lowercase letters, numbers, and hyphens");
  const supportedModes = value.supportedModes;
  const supportedObjectives = value.supportedObjectives;
  if (!Array.isArray(supportedModes) || supportedModes.length === 0 || supportedModes.some((mode) => !MODES.has(mode)) || new Set(supportedModes).size !== supportedModes.length) {
    fail(400, "INVALID_MANIFEST", "supportedModes must contain unique supported modes");
  }
  if (!Array.isArray(supportedObjectives) || supportedObjectives.length === 0 || supportedObjectives.some((objective) => !OBJECTIVES.has(objective)) || new Set(supportedObjectives).size !== supportedObjectives.length) {
    fail(400, "INVALID_MANIFEST", "supportedObjectives must contain unique supported objectives");
  }
  if (typeof value.communityOptional !== "boolean" || typeof value.minicoinOptional !== "boolean") {
    fail(400, "INVALID_MANIFEST", "communityOptional and minicoinOptional must be booleans");
  }
  const artwork = optionalString(value.artwork, "manifest.artwork", 2_000);
  if (artwork && !/^https:\/\//.test(artwork) && !artwork.startsWith("/")) fail(400, "INVALID_MANIFEST", "Artwork must be an HTTPS URL or site path");
  let entry: GameManifest["entry"];
  if (value.entry !== undefined) {
    if (!isRecord(value.entry) || value.entry.kind !== "iframe") fail(400, "INVALID_MANIFEST", "Submitted cartridges must use an isolated iframe entry");
    const url = requiredString(value.entry.url, "entry.url", 2_000);
    const origin = requiredString(value.entry.origin, "entry.origin", 300);
    let parsed: URL;
    try { parsed = new URL(url); } catch { return fail(400, "INVALID_MANIFEST", "Cartridge entry URL is invalid"); }
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) || parsed.username || parsed.password || parsed.hash || parsed.origin !== origin) fail(400, "INVALID_MANIFEST", "Cartridge entry must use HTTPS (or local development HTTP) and its exact origin");
    entry = { kind: "iframe", url: parsed.href, origin };
  }
  let presentation: GameManifest["presentation"];
  if (value.presentation !== undefined) {
    if (!isRecord(value.presentation) || !["pink", "cyan", "violet", "lime", "ink"].includes(String(value.presentation.palette))) fail(400, "INVALID_MANIFEST", "Invalid cabinet presentation");
    presentation = { genre: requiredString(value.presentation.genre, "presentation.genre", 80), palette: value.presentation.palette as NonNullable<GameManifest["presentation"]>["palette"], glyph: requiredString(value.presentation.glyph, "presentation.glyph", 16) };
  }
  let controls: GameManifest["controls"];
  if (value.controls !== undefined) {
    if (!isRecord(value.controls) || typeof value.controls.touch !== "boolean" || !["any", "landscape", "portrait"].includes(String(value.controls.orientation))) fail(400, "INVALID_MANIFEST", "Invalid cartridge controls");
    controls = { touch: value.controls.touch, orientation: value.controls.orientation as NonNullable<GameManifest["controls"]>["orientation"] };
  }
  let verifier: GameManifest["verifier"];
  if (value.verifier !== undefined) {
    if (!isRecord(value.verifier) || !["session_checks", "server_authoritative", "replay"].includes(String(value.verifier.kind))) fail(400, "INVALID_MANIFEST", "Invalid verifier declaration");
    verifier = { kind: value.verifier.kind as NonNullable<GameManifest["verifier"]>["kind"], description: requiredString(value.verifier.description, "verifier.description", 1_000) };
  }
  return {
    id,
    name: requiredString(value.name, "manifest.name", 80),
    description: requiredString(value.description, "manifest.description", 2_000),
    version: requiredString(value.version, "manifest.version", 80),
    developer: requiredString(value.developer, "manifest.developer", 80),
    adapterId: requiredString(value.adapterId, "manifest.adapterId", 80),
    supportedModes: supportedModes as GameManifest["supportedModes"],
    ...(value.playGuide !== undefined ? { playGuide: validatePlayGuide(value.playGuide, supportedModes as string[]) } : {}),
    supportedObjectives: supportedObjectives as GameManifest["supportedObjectives"],
    communityOptional: value.communityOptional,
    minicoinOptional: value.minicoinOptional,
    ...(artwork ? { artwork } : {}),
    ...(value.skeletonId !== undefined ? { skeletonId: requiredString(value.skeletonId, "manifest.skeletonId", 80) } : {}),
    ...(entry ? { entry } : {}), ...(presentation ? { presentation } : {}), ...(controls ? { controls } : {}), ...(verifier ? { verifier } : {}),
  };
}

function validateCommunity(value: unknown): CommunityAsset | undefined {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value)) fail(400, "INVALID_COMMUNITY", "Community asset must be an object");
  const type = value.type;
  if (type !== "erc20" && type !== "erc721" && type !== "erc1155") fail(400, "INVALID_COMMUNITY", "Unsupported community asset type");
  if (!Number.isSafeInteger(value.chainId) || Number(value.chainId) <= 0) fail(400, "INVALID_COMMUNITY", "Invalid chain ID");
  const address = requiredString(value.address, "community.address", 42);
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) fail(400, "INVALID_COMMUNITY", "Invalid EVM contract address");
  const base = { id: requiredString(value.id, "community.id", 80), name: requiredString(value.name, "community.name", 80), chainId: Number(value.chainId), address };
  if (type === "erc1155") {
    if (typeof value.tokenId !== "string" || !value.tokenId || value.tokenId.length > 80) fail(400, "INVALID_COMMUNITY", "ERC-1155 tokenId is required");
    const tokenId = requiredString(value.tokenId, "community.tokenId", 80);
    if (!/^\d+$/.test(tokenId) || BigInt(tokenId) >= 2n ** 256n) fail(400, "INVALID_COMMUNITY", "ERC-1155 tokenId must be an unsigned uint256 decimal value");
    return { ...base, type, tokenId };
  }
  return { ...base, type };
}

function currentRaid(raid: Raid, now = Date.now()): Raid {
  return raid.status === "open" && now >= Date.parse(raid.endsAt) ? { ...raid, status: "closed" } : raid;
}

const validationKeys = ["builds", "mounts", "destroys", "resultSchema", "mobile", "sourceReviewed"] as const;

function configuredCartridgeOrigins(): string[] {
  return [process.env.CARTRIDGE_ORIGIN ?? "http://127.0.0.1:8788", ...(process.env.ALLOWED_CARTRIDGE_ORIGINS ?? "").split(",")].map((item) => item.trim()).filter(Boolean);
}

function artifactBlockers(game: GameRecord, allowedOrigins: string[], host?: string): string[] {
  const entry = game.manifest.entry;
  if (!entry) return ["An isolated Cartridge entry is required"];
  const blockers: string[] = [];
  const url = new URL(entry.url);
  if (!allowedOrigins.includes(entry.origin)) blockers.push("Cartridge origin is not in the platform allowlist");
  if (host && url.host.toLowerCase() === host.toLowerCase()) blockers.push("Cartridge must be hosted on a separate origin from Token Arcade");
  if (!url.pathname.includes(`/v/${encodeURIComponent(game.manifest.version)}/`)) blockers.push("Cartridge entry must pin an immutable /v/<gameVersion>/ build");
  return blockers;
}

function validateConcept(value: unknown): GameRecord["communityConcept"] {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !["erc20", "erc721", "concept"].includes(String(value.type)) || value.verification !== "unverified") fail(400, "INVALID_CONCEPT", "Community concept must declare its type and remain unverified until the protocol review");
  const address = optionalString(value.address, "communityConcept.address", 42);
  if (address && !isAddress(address)) fail(400, "INVALID_CONCEPT", "Invalid community reference address");
  if (value.chainId !== undefined && (!Number.isSafeInteger(value.chainId) || Number(value.chainId) <= 0)) fail(400, "INVALID_CONCEPT", "Invalid community reference chain");
  return { name: requiredString(value.name, "communityConcept.name", 100), type: value.type as NonNullable<GameRecord["communityConcept"]>["type"], verification: "unverified", ...(address ? { address } : {}), ...(value.chainId !== undefined ? { chainId: Number(value.chainId) } : {}), ...(value.description !== undefined ? { description: requiredString(value.description, "communityConcept.description", 1_000) } : {}) };
}

function validateEconomy(value: unknown): GameRecord["economy"] {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !["coming_soon", "pending"].includes(String(value.status))) fail(400, "INVALID_ECONOMY", "Economy requests must stay pending until a verified protocol deployment");
  return { status: value.status as "coming_soon" | "pending", reason: requiredString(value.reason, "economy.reason", 1_000) };
}

function gameBlockers(game: GameRecord, adapters: AdapterRegistry, allowedOrigins = configuredCartridgeOrigins(), host?: string): string[] {
  const blockers: string[] = [];
  if (game.submission && !game.submission.configuredAt) blockers.push("Admin must configure the cartridge before technical review and approval");
  if (game.submission?.playGuide && !game.manifest.playGuide) blockers.push("Configure the creator's challenge descriptions before approval");
  const adapter = adapters.get(game.manifest.adapterId);
  if (game.manifest.entry) {
    blockers.push(...artifactBlockers(game, allowedOrigins, host));
    if (game.review?.approvedBy !== "platform:legacy-import" && validationKeys.some((key) => game.review?.validation?.[key] !== true)) blockers.push("Admin technical validation has not passed");
  } else if (!adapter) blockers.push("Reviewed cartridge adapter is not installed");
  else {
    if (!adapter.freePlaySmokeTest) blockers.push("Free Play cartridge smoke test has not passed");
  }
  if (game.manifest.supportedModes.some((mode) => mode !== "free") && !adapter?.verifier) blockers.push("Game-specific score verifier is not registered");
  if (game.manifest.entry && game.manifest.supportedModes.some((mode) => mode !== "free") && !game.manifest.verifier) blockers.push("Competitive cartridges must declare their Score Verifier type");
  if (!game.manifest.supportedModes.includes("free")) blockers.push("Published games must support Free Play");
  if (!game.manifest.communityOptional && !game.community) blockers.push("Community Asset is required");
  return blockers;
}

function raidBlockers(raid: Raid, store: ArcadeStore, adapters: AdapterRegistry): string[] {
  const blockers: string[] = [];
  const game = store.getGame(raid.gameId);
  if (!game || game.status !== "published") blockers.push("Game must be published");
  else {
    if (!game.manifest.supportedModes.includes("raid")) blockers.push("Game does not support Community Raid");
    if (!game.manifest.supportedObjectives.includes(raid.objective)) blockers.push("Game does not support this objective");
    if (game.community && game.community.id !== raid.communityId) blockers.push("Raid Community Asset does not match the game");
    const conceptId = game.communityConcept?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!game.community && conceptId && raid.communityId !== conceptId) blockers.push("Raid community does not match the Cabinet association");
    if (!game.community && !conceptId && raid.gameId !== WARMUP_GAME_ID) blockers.push("Game has no associated community");
    if (game.manifest.adapterId === "coindle" && (!isRapidRules(raid.rules) || raid.rules?.format !== RAPID_RULES.format || raid.objective !== "coins_solved")) blockers.push("Coindle raids must use reviewed Rapid Fire rules: coins_solved, 180 seconds and 6 guesses per coin");
    if (game.manifest.adapterId === "coindle-v2" && (!isRapidRules(raid.rules) || raid.rules?.format !== RAPID_V2_FORMAT || raid.rules?.selection !== "hidden-pool-40-v1" || raid.objective !== "coins_solved" || raid.maxAttempts !== 3)) blockers.push("Coindle Rapid Fire raids require a hidden coin pool, 180 seconds, 6 guesses per coin and best of 3 attempts");
    if (game.manifest.adapterId === "two-places-v2" && (raid.objective !== "score" || JSON.stringify(raid.rules) !== JSON.stringify(normalizeRunRules(twoRaidRules(raid.seed))))) blockers.push("Two Places raids require the shared shuffled level order and levels-beaten score");
    if (game.manifest.adapterId === "two-places") {
      const levels = typeof raid.rules?.levelSet === "string" && /^\d{1,2}(,\d{1,2}){2}$/.test(raid.rules.levelSet) ? raid.rules.levelSet.split(",").map(Number) : [];
      if (levels.length !== 3 || new Set(levels).size !== 3 || levels.some((level) => level < 0 || level >= 20)) blockers.push("Two Places raids require three distinct authored levels in rules.levelSet");
    }
    if (["buy-bounce", "mood-swings"].includes(game.manifest.adapterId) && (raid.rules?.viewportWidth !== 390 || raid.rules?.viewportHeight !== 844)) blockers.push("eMONAD raids require the reviewed 390×844 viewport rules");
    if (game.manifest.adapterId === "mood-swings" && (raid.maxAttempts !== 3 || raid.objective !== "score")) blockers.push("Mood Swings raids require best of three attempts, ranked by peak Mood");
    if (game.manifest.adapterId === "skip-to-10k-v2" && (raid.maxAttempts !== 3 || raid.objective !== "score" || raid.rules?.format !== skipRules.FORMAT || raid.rules?.board !== "triathlon")) blockers.push("Skip raids require three runs: Zero, Mid and Max, scored by their total");
    const adapter = adapters.get(game.manifest.adapterId);
    if (!adapter?.verifier) blockers.push("Game-specific score verifier is not registered");
  }
  if (raid.entry) blockers.push("Onchain entry collection is not configured");
  if (raid.reward.type !== "none" && !raid.funding) blockers.push("Onchain prize custody is not verified");
  return blockers;
}

function validateRaidInput(body: Record<string, unknown>): Raid {
  const objective = body.objective;
  if (!OBJECTIVES.has(objective as GameObjective)) fail(400, "INVALID_RAID", "Unsupported objective");
  const startsAt = isoDate(body.startsAt, "startsAt");
  const endsAt = isoDate(body.endsAt, "endsAt");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) fail(400, "INVALID_RAID", "Raid end must follow its start");
  if (!Number.isInteger(body.maxAttempts) || Number(body.maxAttempts) < 1 || Number(body.maxAttempts) > 100) fail(400, "INVALID_RAID", "maxAttempts must be between 1 and 100");
  const reward = body.reward ?? { type: "none" };
  if (!isRecord(reward) || !["none", "erc20", "erc721", "native"].includes(String(reward.type))) fail(400, "INVALID_RAID", "Invalid reward type");
  const normalizedReward: Raid["reward"] = reward.type === "none"
    ? { type: "none" }
    : { type: reward.type as "erc20" | "erc721" | "native", asset: requiredString(reward.asset, "reward.asset", 100),
        ...(reward.amount !== undefined ? { amount: requiredString(reward.amount, "reward.amount", 80) } : {}),
        ...(reward.tokenId !== undefined ? { tokenId: requiredString(reward.tokenId, "reward.tokenId", 80) } : {}) };
  let entry: Raid["entry"];
  if (body.entry !== undefined && body.entry !== null) {
    if (!isRecord(body.entry)) fail(400, "INVALID_RAID", "Invalid entry definition");
    entry = { asset: requiredString(body.entry.asset, "entry.asset", 100), amount: requiredString(body.entry.amount, "entry.amount", 80) };
    if (!/^\d+(?:\.\d+)?$/.test(entry.amount) || Number(entry.amount) <= 0) fail(400, "INVALID_RAID", "Entry amount must be positive");
  }
  const split = body.feeSplitBps ?? { prize: 0, community: 0, treasury: 10_000 };
  if (!isRecord(split) || ![split.prize, split.community, split.treasury].every((n) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 10_000)) {
    fail(400, "INVALID_RAID", "feeSplitBps must contain nonnegative integer shares");
  }
  if (!validFeeSplit(split as Raid["feeSplitBps"])) fail(400, "INVALID_RAID", "Fee shares must total 10,000 basis points");
  let rules: GameRules | undefined;
  if (body.rules !== undefined) {
    try { rules = normalizeRunRules(body.rules); }
    catch (error) { fail(400, "INVALID_RULES", error instanceof Error ? error.message : "Invalid rules"); }
  }
  return {
    id: randomUUID(), name: requiredString(body.name, "name", 100),
    gameId: requiredString(body.gameId, "gameId", 64), communityId: requiredString(body.communityId, "communityId", 80),
    objective: objective as GameObjective, seed: optionalString(body.seed, "seed", 128) ?? randomBytes(16).toString("hex"),
    startsAt, endsAt, maxAttempts: Number(body.maxAttempts),
    ...(rules ? { rules } : {}),
    ...(entry ? { entry } : {}), reward: normalizedReward,
    feeSplitBps: { prize: Number(split.prize), community: Number(split.community), treasury: Number(split.treasury) },
    status: "draft",
  };
}

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  primaryMetric: number;
  objective: GameObjective;
  finishedAt: string;
  runId: string;
  secondaryMetrics?: Record<string, number>;
}

function leaderboard(store: ArcadeStore, gameId: string, mode: "ranked" | "raid", raidId?: string, objective?: GameObjective, gameVersion?: string, rules?: GameRules): LeaderboardEntry[] {
  const skipV2 = rules?.format === skipRules.FORMAT;
  let results = store.listAcceptedResults(gameId, mode, raidId).filter((item) =>
    (objective === undefined || item.result.objective === objective) &&
    (gameVersion === undefined || item.result.gameVersion === gameVersion) &&
    (skipV2 && mode === "raid" ? item.result.gameVersion === "1.1.0" && item.result.rules?.format === skipRules.FORMAT : JSON.stringify(item.result.rules ?? {}) === JSON.stringify(rules ?? {})));
  if (skipV2 && mode === "raid") results = skipRaidResults(results);
  const best = new Map<string, AcceptedResult>();
  const twoPlaces = store.getGame(gameId)?.manifest.adapterId === "two-places";
  const compare = (a: AcceptedResult, b: AcceptedResult) => {
    if (a.result.gameId === "emonad-cabinet" && a.result.gameVersion === "2.0.0" && b.result.gameVersion === "2.0.0") {
      return b.result.primaryMetric - a.result.primaryMetric || (b.result.secondaryMetrics?.goodVibes ?? 0) - (a.result.secondaryMetrics?.goodVibes ?? 0)
        || a.acceptedAt.localeCompare(b.acceptedAt) || a.result.runId.localeCompare(b.result.runId);
    }
    if (skipV2) return b.result.primaryMetric - a.result.primaryMetric
      || (b.result.secondaryMetrics?.gwei ?? 0) - (a.result.secondaryMetrics?.gwei ?? 0)
      || a.acceptedAt.localeCompare(b.acceptedAt) || a.result.runId.localeCompare(b.result.runId);
    if (rules?.format === twoRules.FORMAT) {
      const score = mode === "raid" ? b.result.primaryMetric - a.result.primaryMetric : a.result.primaryMetric - b.result.primaryMetric;
      return score || (b.result.secondaryMetrics?.apples ?? 0) - (a.result.secondaryMetrics?.apples ?? 0)
        || (mode === "raid" ? (a.result.secondaryMetrics?.elapsedMs ?? 0) - (b.result.secondaryMetrics?.elapsedMs ?? 0) : 0)
        || a.acceptedAt.localeCompare(b.acceptedAt) || a.result.runId.localeCompare(b.result.runId);
    }
    if (twoPlaces) {
      const apples = (b.result.secondaryMetrics?.apples ?? 0) - (a.result.secondaryMetrics?.apples ?? 0);
      if (apples) return apples;
      const aTime = a.result.objective === "completion_time" ? a.result.primaryMetric : (a.result.secondaryMetrics?.ticks ?? Infinity) * 1000 / 60;
      const bTime = b.result.objective === "completion_time" ? b.result.primaryMetric : (b.result.secondaryMetrics?.ticks ?? Infinity) * 1000 / 60;
      return aTime - bTime || a.acceptedAt.localeCompare(b.acceptedAt) || a.result.runId.localeCompare(b.result.runId);
    }
    if (a.result.objective === "coins_solved") {
      // Keep legacy boards unchanged; v2 adds fewer skips after fewer guesses.
      return b.result.primaryMetric - a.result.primaryMetric
        || (a.result.secondaryMetrics?.guesses ?? Infinity) - (b.result.secondaryMetrics?.guesses ?? Infinity)
        || (rules?.format === RAPID_V2_FORMAT ? (a.result.secondaryMetrics?.skips ?? Infinity) - (b.result.secondaryMetrics?.skips ?? Infinity) : 0)
        || a.acceptedAt.localeCompare(b.acceptedAt) || a.result.runId.localeCompare(b.result.runId);
    }
    const lowerIsBetter = a.result.objective === "completion_time" || a.result.objective === "guesses";
    return (lowerIsBetter ? a.result.primaryMetric - b.result.primaryMetric : b.result.primaryMetric - a.result.primaryMetric) || a.acceptedAt.localeCompare(b.acceptedAt) || a.result.runId.localeCompare(b.result.runId);
  };
  for (const item of results) {
    const prior = best.get(item.playerId);
    if (!prior || compare(item, prior) < 0) best.set(item.playerId, item);
  }
  const ordered = [...best.values()].sort(compare);
  return ordered.map((item, index) => ({
    rank: index + 1, playerId: item.playerId,
    displayName: store.getPassport(item.playerId)?.displayName ?? "Player",
    primaryMetric: item.result.primaryMetric, objective: item.result.objective,
    finishedAt: item.result.finishedAt, runId: item.result.runId,
    ...(item.result.secondaryMetrics ? { secondaryMetrics: item.result.secondaryMetrics } : {}),
  }));
}

function updatePassport(store: ArcadeStore, passport: Passport, result: GameRunResult, raid?: Raid): Passport {
  const wasFirstGame = !store.hasAcceptedGame(passport.playerId, result.gameId);
  const wasFirstRaid = raid ? !store.hasAcceptedRaid(passport.playerId, raid.id) : false;
  const bestScores = { ...passport.bestScores };
  const key = result.rules?.format === twoRules.FORMAT
    ? `${result.gameId}@${result.gameVersion}:${result.objective}${result.mode === "ranked" ? `_level_${Number(result.rules.level) + 1}` : "_raid"}` : result.rules?.format === skipRules.FORMAT ? `${result.gameId}@${result.gameVersion}:${result.objective}_${result.rules.board}` : result.gameId === "emonad-cabinet" && result.gameVersion === "2.0.0" ? `${result.gameId}@${result.gameVersion}:${result.objective}` : `${result.gameId}:${result.objective}`;
  const prior = bestScores[key];
  const lowerIsBetter = result.objective === "completion_time" || result.objective === "guesses";
  if (prior === undefined || (lowerIsBetter ? result.primaryMetric < prior : result.primaryMetric > prior)) bestScores[key] = result.primaryMetric;
  delete bestScores[result.gameId];
  return {
    ...passport,
    gamesPlayed: passport.gamesPlayed + Number(wasFirstGame),
    rankedRuns: passport.rankedRuns + Number(result.mode === "ranked"),
    raidsEntered: passport.raidsEntered + Number(wasFirstRaid),
    bestScores,
    communities: raid && !passport.communities.includes(raid.communityId) ? [...passport.communities, raid.communityId] : passport.communities,
  };
}

export interface ApiOptions {
  store?: ArcadeStore;
  auth?: ArcadeAuth;
  adapters?: AdapterRegistry;
  staticRoot?: string;
  authSettings?: AuthSettings;
  minicoinSettings?: MinicoinSettings;
  testnetMinicoinSettings?: MinicoinSettings;
  /** Explicit local-chain rehearsal override for isolated tests. */
  localMinicoinRehearsal?: boolean;
}

function requireAdmin(identity: Identity): void {
  if (!identity.isAdmin) fail(403, "FORBIDDEN", "This action requires an allowlisted administrator");
}

function isLoopbackRpc(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  } catch { return false; }
}

function serveStatic(request: IncomingMessage, response: ServerResponse, pathname: string, staticRoot: string): void {
  if (request.method !== "GET" && request.method !== "HEAD") return respond(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  const root = resolve(staticRoot);
  const target = resolve(root, `.${decodeURIComponent(pathname)}`);
  if (target !== root && !target.startsWith(root + sep)) return respond(response, 404, { error: { code: "NOT_FOUND", message: "Not found" } });
  const file = existsSync(target) && statSync(target).isFile() ? target : resolve(root, "index.html");
  if (!existsSync(file)) return respond(response, 404, { error: { code: "NOT_FOUND", message: "Web build not found" } });
  const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2" };
  response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" });
  if (request.method === "HEAD") response.end(); else createReadStream(file).pipe(response);
}

export function createArcadeServer(options: ApiOptions = {}): Server {
  const localMinicoinRehearsalRequested = options.localMinicoinRehearsal ?? process.env.LOCAL_MINICOIN_REHEARSAL === "true";
  const auth = options.auth ?? new ArcadeAuth(options.authSettings ?? {
    appId: process.env.PRIVY_APP_ID, appSecret: process.env.PRIVY_APP_SECRET,
    adminPrivyIds: process.env.ADMIN_PRIVY_IDS, localDemoMode: process.env.LOCAL_DEMO_MODE === "true",
    localDemoAdminDisabled: process.env.LOCAL_DEMO_ADMIN_DISABLED === "true" || localMinicoinRehearsalRequested,
  });
  const store = options.store ?? new ArcadeStore(process.env.ARCADE_DB_PATH || undefined, auth.localDemoMode);
  initializeProgress(store);
  const adapters = options.adapters ?? new AdapterRegistry();
  const fundedRaids = new FundedRaids(store);
  const payouts = new AutomaticPayouts(store, fundedRaids);
  const verifyingRaids = new Map<string, number>();
  const publicRaid = (raid: Raid): Raid => {
    if (!verifyingRaids.get(raid.id)) {
      raid = store.finalizeFreeRaid(raid.id, () => leaderboard(store, raid.gameId, "raid", raid.id, raid.objective, undefined, raid.rules)) ?? raid;
    }
    return payouts.decorate(currentRaid(raid));
  };
  const ownership = new DirectWalletOwnershipResolver(process.env.MONAD_RPC_URL);
  const minicoinSettings = options.minicoinSettings ?? {
    enabled: process.env.ENABLE_ONCHAIN_WRITES === "true", rpcUrl: process.env.MONAD_RPC_URL,
    chainId: process.env.MONAD_CHAIN_ID, privateKey: process.env.DEPLOYER_PRIVATE_KEY,
    factoryAddress: process.env.MINICOIN_FACTORY_ADDRESS, treasuryAddress: process.env.TREASURY_ADDRESS,
    supplyRecipient: process.env.MINICOIN_SUPPLY_RECIPIENT,
  };
  const minicoin = new MinicoinDeployer(minicoinSettings);
  // This allows a token-only rehearsal on an isolated local EVM. It never
  // enables the production MiniCoin economy or bypasses the live launch gate.
  const rehearsalEnabled = localMinicoinRehearsalRequested &&
    auth.localDemoMode && minicoinSettings.chainId === "31337" &&
    (!!minicoinSettings.transport || isLoopbackRpc(minicoinSettings.rpcUrl));
  const rehearsalReady = rehearsalEnabled && minicoin.ready;
  const rehearsalReconcileReady = rehearsalEnabled && minicoin.reconcileReady;
  const localDemoAdmin = auth.localDemoAdmin && !localMinicoinRehearsalRequested;
  const staticRoot = options.staticRoot ?? resolve(process.cwd(), "dist/web");
  const coindle = createCoindleHandler();
  const rapid = createCoindleRapid({
    db: store.db, getSession: (runId) => store.getSession(runId),
    history: async (ticker) => {
      const reply = await coindle({ method: "GET" }, new URL(`http://local/api/coindle/history?ticker=${encodeURIComponent(ticker)}`));
      return reply?.status === 200 ? (reply.body as { points: { price: number }[] }).points : [];
    },
    prices: async () => {
      const reply = await coindle({ method: "GET" }, new URL("http://local/api/coindle/prices"));
      return reply?.status === 200 ? reply.body as PriceTiers : {};
    },
  });
  if (!adapters.get("coindle")) {
    adapters.register({ adapterId: "coindle", gameId: "coindle", freePlaySmokeTest: true, verifier: rapid.verifier, rankedRules: RAPID_RULES, runTimeoutMs: RAPID_RUN_TIMEOUT_MS });
  }
  if (!adapters.get("coindle-v2")) {
    adapters.register({ adapterId: "coindle-v2", gameId: "coindle", freePlaySmokeTest: true, verifier: rapid.verifier, rankedRules: RAPID_V2_RULES, runTimeoutMs: RAPID_RUN_TIMEOUT_MS });
  }
  /** Community Raid total: every verified run in the raid counts, not just each player's best. */
  const raidTotal = (raid: Raid) => {
    if (raid.gameId === "emonad-cabinet" && raid.gameVersion === "2.0.0") {
      const runs = store.listAcceptedResults(raid.gameId, "raid", raid.id).filter(item => item.result.gameVersion === "2.0.0");
      return { moodGoal: { goodVibes: runs.reduce((sum, item) => sum + (item.result.secondaryMetrics?.goodVibes ?? 0), 0), runs: runs.length, participants: new Set(runs.map(item => item.playerId)).size } };
    }
    if (raid.rules?.format === skipRules.FORMAT) {
      const runs = store.listAcceptedResults(raid.gameId, "raid", raid.id).filter(item => item.result.gameVersion === "1.1.0" && item.result.rules?.format === skipRules.FORMAT);
      return { skipGoal: { distance: runs.reduce((n, r) => n + (r.result.secondaryMetrics?.distance ?? 0), 0),
        broke10k: new Set(runs.filter(r => (r.result.secondaryMetrics?.peak ?? 0) >= 10000).map(r => r.playerId)).size } };
    }
    if (raid.rules?.format === twoRules.FORMAT) {
      const runs = store.listAcceptedResults(raid.gameId, "raid", raid.id).filter(item => item.result.gameVersion === "1.1.0" && item.result.rules?.format === twoRules.FORMAT);
      return { twoPlacesGoal: { levels: runs.reduce((n, r) => n + r.result.primaryMetric, 0), participants: new Set(runs.map(r => r.playerId)).size } };
    }
    if (raid.objective !== "coins_solved") return {};
    const runs = store.listAcceptedResults(raid.gameId, "raid", raid.id);
    return { communityTotal: { coinsSolved: runs.reduce((sum, item) => sum + item.result.primaryMetric, 0), runs: runs.length, participants: new Set(runs.map((item) => item.playerId)).size } };
  };
  // Warm the sparkline cache off the request path (no-op without PYTH_API_KEY); re-check every 6h.
  const prewarmList = (process.env.COINDLE_PREWARM_TICKERS ?? "BTC,ETH,SOL").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (prewarmList.length) {
    setTimeout(() => void coindle.prewarm(prewarmList), 2_000).unref();
    setInterval(() => void coindle.prewarm(prewarmList), 6 * 3_600_000).unref();
  }
  const testnet = new TestnetMinicoinService(store, options.testnetMinicoinSettings ?? {
    enabled: process.env.TESTNET_ENABLE_WRITES === "true", chainId: "10143",
    rpcUrl: process.env.TESTNET_RPC_URL, privateKey: process.env.TESTNET_DEPLOYER_PRIVATE_KEY,
    factoryAddress: process.env.TESTNET_FACTORY_ADDRESS, treasuryAddress: process.env.TESTNET_TREASURY_ADDRESS,
    supplyRecipient: process.env.TESTNET_SUPPLY_RECIPIENT,
  }, auth.localDemoMode);

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const path = url.pathname;
      const method = request.method ?? "GET";
      if (!path.startsWith("/api/")) return serveStatic(request, response, path, staticRoot);
      const fundedRoute = path.match(/^\/api\/admin\/raids\/([^/]+)\/funded\/(rules|bind|settlement)$/);
      if (fundedRoute) {
        requireAdmin(await auth.authenticate(request));
        const saved = store.getRaid(decodeURIComponent(fundedRoute[1]));
        if (!saved) fail(404, "NOT_FOUND", "Raid not found");
        if (method === "GET" && fundedRoute[2] === "rules") return respond(response, 200, fundedRaids.rules(saved));
        if (method === "GET" && fundedRoute[2] === "settlement") return respond(response, 200, fundedRaids.settlement(publicRaid(saved)));
        if (method === "POST" && fundedRoute[2] === "bind") {
          const blockers = raidBlockers({ ...saved, reward: { type: "none" } }, store, adapters);
          if (blockers.length) fail(409, "NOT_READY", "Game is not ready for a funded raid", blockers);
          const body = await readJson(request);
          const chainRaidId = requiredString(body.chainRaidId, "chainRaidId", 66);
          if (!/^0x[a-fA-F0-9]{64}$/.test(chainRaidId)) fail(400, "INVALID_INPUT", "Invalid chain raid ID");
          await payouts.assertReady();
          return respond(response, 200, { raid: await fundedRaids.bind(saved, chainRaidId as `0x${string}`) });
        }
        fail(405, "METHOD_NOT_ALLOWED", "Unsupported funded raid action");
      }
      if (method === "GET" && /^\/api\/raids\/[^/]+\/claim$/.test(path)) {
        const identity = await auth.authenticate(request);
        const saved = store.getRaid(decodeURIComponent(path.split("/")[3]));
        if (!saved) fail(404, "NOT_FOUND", "Raid not found");
        return respond(response, 200, await fundedRaids.claim(publicRaid(saved), store.getOrCreatePassport(identity.id)));
      }
      if (method === "POST" && path === "/api/free-play/events") {
        const body = await readJson(request);
        const guestId = requiredString(body.guestId, "guestId", 36);
        if (!/^[a-f0-9-]{36}$/i.test(guestId)) fail(400, "INVALID_INPUT", "Invalid guest ID");
        if (body.type !== "started" && body.type !== "exited") fail(400, "INVALID_INPUT", "Unknown lifecycle event");
        const run = body.run;
        if (!isRecord(run) || run.mode !== "free") fail(400, "INVALID_INPUT", "Free Play only");
        const runId = requiredString(run.runId, "runId", 100);
        const gameId = requiredString(run.gameId, "gameId", 64);
        const gameVersion = requiredString(run.gameVersion, "gameVersion", 80);
        const game = store.getGame(gameId);
        if (!game || game.status !== "published") fail(404, "NOT_FOUND", "Game not found");
        if (!game.manifest.supportedObjectives.includes(run.objective as GameObjective)) fail(400, "INVALID_INPUT", "Unknown objective");
        const startedAt = isoDate(run.startedAt, "startedAt");
        const context = body.context ?? {};
        if (!isRecord(context) || Object.keys(context).length > 32 || Object.entries(context).some(([key, value]) => !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e12)) fail(400, "INVALID_INPUT", "Invalid start context");
        if (body.type === "exited" && !["navigation", "restart", "pagehide", "error"].includes(String(body.reason))) fail(400, "INVALID_INPUT", "Unknown exit reason");
        const identity = request.headers.authorization ? await auth.authenticate(request) : null;
        const playerId = identity ? store.getOrCreatePassport(identity.id).playerId : null;
        const cutoff = new Date(Date.now() - 60_000).toISOString();
        const recent = store.db.prepare("SELECT COUNT(*) AS n FROM free_play_events WHERE received_at > ? AND (guest_id = ? OR player_id = ?)").get(cutoff, guestId, playerId) as { n: number };
        if (recent.n >= 120) fail(429, "RATE_LIMITED", "Too many lifecycle events");
        const observation = { runId, gameId, gameVersion, objective: run.objective, startedAt, context: body.type === "started" ? context : {}, ...(body.type === "exited" ? { reason: body.reason } : {}) };
        store.db.prepare("INSERT OR IGNORE INTO free_play_events VALUES (?,?,?,?,?,?,?)").run(runId, body.type, gameId, playerId, guestId, new Date().toISOString(), JSON.stringify(observation));
        return respond(response, 200, { recorded: true, verified: false });
      }
      if (method === "POST" && path === "/api/free-play/summaries") {
        const body = await readJson(request);
        const guestId = requiredString(body.guestId, "guestId", 36);
        if (!/^[a-f0-9-]{36}$/i.test(guestId)) fail(400, "INVALID_INPUT", "Invalid guest ID");
        const candidate = body.result;
        if (!isRecord(candidate) || candidate.mode !== "free") fail(400, "INVALID_INPUT", "Expected a Free Play result");
        const gameId = requiredString(candidate.gameId, "gameId", 64);
        const game = store.getGame(gameId);
        if (!game || game.status !== "published") fail(404, "NOT_FOUND", "Game not found");
        const runId = requiredString(candidate.runId, "runId", 100);
        const gameVersion = requiredString(candidate.gameVersion, "gameVersion", 80);
        if (!game.manifest.supportedObjectives.includes(candidate.objective as GameObjective)) fail(400, "INVALID_INPUT", "Unknown objective");
        const checked = validateRunResultShape(candidate as unknown as GameRunConfig, candidate);
        if (!checked.valid) fail(400, "INVALID_INPUT", checked.reason);
        const metrics = checked.result.secondaryMetrics ?? {};
        if (Object.keys(metrics).length > 50 || Object.entries(metrics).some(([key, value]) => !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || Math.abs(value) > 1e12) || Math.abs(checked.result.primaryMetric) > 1e12) fail(400, "INVALID_INPUT", "Metrics exceed summary limits");
        const identity = request.headers.authorization ? await auth.authenticate(request) : null;
        const playerId = identity ? store.getOrCreatePassport(identity.id).playerId : null;
        const now = new Date().toISOString();
        const cutoff = new Date(Date.now() - 60_000).toISOString();
        const recent = store.db.prepare("SELECT COUNT(*) AS n FROM free_play_summaries WHERE received_at > ? AND (guest_id = ? OR player_id = ?)").get(cutoff, guestId, playerId) as { n: number };
        if (recent.n >= 30) fail(429, "RATE_LIMITED", "Too many run summaries; try again later");
        // Store only bounded summary fields, never input proofs or client-supplied identity.
        const summary = { runId, gameId, gameVersion, mode: "free", verified: false, objective: candidate.objective,
          result: checked.result.result, primaryMetric: checked.result.primaryMetric, secondaryMetrics: metrics,
          startedAt: isoDate(candidate.startedAt, "startedAt"), finishedAt: isoDate(candidate.finishedAt, "finishedAt") };
        store.db.prepare("INSERT OR IGNORE INTO free_play_summaries VALUES (?,?,?,?,?,?)").run(runId, gameId, playerId, guestId, now, JSON.stringify(summary));
        return respond(response, 200, { recorded: true, verified: false });
      }
      if (method === "GET" && path === "/api/admin/free-play/report") {
        requireAdmin(await auth.authenticate(request));
        const days = Number(url.searchParams.get("days") ?? 7);
        if (![1, 7, 30].includes(days)) fail(400, "INVALID_INPUT", "Choose 1, 7 or 30 days");
        return respond(response, 200, freePlayReport(store, days));
      }
      if (method === "GET" && path === "/api/admin/free-play/summaries") {
        requireAdmin(await auth.authenticate(request));
        const gameId = url.searchParams.get("gameId");
        const rows = store.db.prepare("SELECT player_id, guest_id, received_at, json FROM free_play_summaries WHERE (? IS NULL OR game_id = ?) ORDER BY received_at DESC LIMIT 500").all(gameId, gameId) as { player_id: string | null; guest_id: string; received_at: string; json: string }[];
        return respond(response, 200, { summaries: rows.map(row => ({ ...JSON.parse(row.json), playerId: row.player_id, guestId: row.guest_id, receivedAt: row.received_at })) });
      }
      const rapidRoute = path.match(/^\/api\/coindle\/rapid\/([0-9a-f-]{36})\/(start|state|guess|skip|finish|hint)$/);
      if (rapidRoute) {
        // The issued runId (unguessable, only returned to the signed-in player) is the capability here, so the
        // separate-origin cartridge can play without holding the player's Privy token.
        const [, runId, action] = rapidRoute;
        if (action === "state" || action === "hint" ? method !== "GET" : method !== "POST") fail(405, "METHOD_NOT_ALLOWED", "Unsupported method");
        try {
          if (action === "hint") return respond(response, 200, await rapid.hint(runId, Number(url.searchParams.get("puzzle"))));
          if (action === "start") return respond(response, 200, rapid.start(runId));
          if (action === "state") return respond(response, 200, { state: rapid.state(runId) });
          if (action === "skip") return respond(response, 200, rapid.skip(runId));
          if (action === "finish") return respond(response, 200, rapid.finish(runId));
          const body = await readJson(request);
          return respond(response, 200, await rapid.guess(runId, body.ticker));
        } catch (error) {
          if (error instanceof RapidError) fail(error.status, error.code, error.message);
          throw error;
        }
      }
      const coindleReply = await coindle(request, url);
      if (coindleReply) return respond(response, coindleReply.status, coindleReply.body);

      const testnetRoute = path.match(/^\/api\/(creator|admin)\/games\/([^/]+)\/testnet-minicoin(?:\/(approve|reject|deploy|reconcile))?$/);
      if (testnetRoute) {
        const identity = await auth.authenticate(request);
        const [, role, encodedId, action] = testnetRoute;
        if (role === "admin") requireAdmin(identity);
        const game = store.getGame(decodeURIComponent(encodedId));
        if (!game || (role === "creator" && game.creatorId !== identity.id)) fail(404, "NOT_FOUND", "Game not found");
        if (method === "GET" && !action) return respond(response, 200, { config: testnet.config, launch: testnet.get(game.manifest.id) ?? null });
        if (method !== "POST") fail(405, "METHOD_NOT_ALLOWED", "Use POST for launch actions");
        const body = await readJson(request);
        const launch = role === "creator" && !action ? testnet.submit(game, identity, body)
          : role === "admin" && (action === "approve" || action === "reject") ? testnet.review(game, identity, body, action === "approve")
          : role === "creator" && action === "deploy" ? await testnet.deploy(game, identity, body)
          : action === "reconcile" ? await testnet.reconcile(game, identity, body)
          : fail(404, "NOT_FOUND", "Launch action not found");
        return respond(response, 200, { config: testnet.config, launch });
      }

      if (method === "GET" && path === "/api/health") {
        return respond(response, 200, {
          ok: true, auth: { privy: auth.privyReady, localDemo: auth.localDemoMode, localDemoAdmin },
          settlement: { ready: false, reason: "General paid entry and prize settlement are not configured", testnetRaid: { configured: Boolean(fundedRaids.vault), chainId: 10143, automaticPayouts: payouts.enabled }, minicoin: { ready: minicoin.ready, ...(!minicoin.ready ? { reason: minicoin.reason } : {}), reconcileReady: minicoin.reconcileReady, rehearsalReady, rehearsalReconcileReady } },
          release: process.env.RENDER_GIT_COMMIT ?? null,
          cartridge: { installed: store.listGames(true).filter((game) => game.manifest.id !== WARMUP_GAME_ID).map((game) => game.manifest.id), verifierAdapters: adapters.keys() },
        });
      }
      if (method === "GET" && path === "/api/games") return respond(response, 200, { games: store.listGames(true).filter((game) => game.manifest.id !== WARMUP_GAME_ID).map(({ submission, ...game }) => game) });
      if (method === "GET" && /^\/api\/games\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split("/")[3]);
        const game = store.getGame(id);
        if (!game || game.status !== "published") fail(404, "NOT_FOUND", "Published game not found");
        const { submission, ...publicGame } = game;
        return respond(response, 200, { game: publicGame });
      }
      if (method === "GET" && path === "/api/raids") return respond(response, 200, { raids: store.listRaids().filter((raid) => raid.status !== "draft" && raid.gameId !== WARMUP_GAME_ID).map(publicRaid) });
      if (method === "GET" && /^\/api\/raids\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split("/")[3]);
        const savedRaid = store.getRaid(id);
        const raid = savedRaid && publicRaid(savedRaid);
        if (!raid || raid.status === "draft") fail(404, "NOT_FOUND", "Public raid not found");
        let attempts: { playerId: string; attemptsUsed: number; attemptsRemaining: number } | undefined;
        if (request.headers.authorization) {
          const identity = await auth.authenticate(request);
          const passport = store.getOrCreatePassport(identity.id);
          const attemptsUsed = store.countRaidAttempts(passport.playerId, raid.id);
          attempts = { playerId: passport.playerId, attemptsUsed, attemptsRemaining: Math.max(0, raid.maxAttempts - attemptsUsed) };
        }
        return respond(response, 200, { raid, leaderboard: raid.finalResult?.entries ?? leaderboard(store, raid.gameId, "raid", raid.id, raid.objective, undefined, raid.rules), ...raidTotal(raid), ...attempts });
      }
      if (method === "GET" && /^\/api\/leaderboards\/[^/]+$/.test(path)) {
        const gameId = decodeURIComponent(path.split("/")[3]);
        const game = store.getGame(gameId);
        if (!game || game.status !== "published") fail(404, "NOT_FOUND", "Published game not found");
        const mode = url.searchParams.get("mode") ?? "ranked";
        if (mode !== "ranked" && mode !== "raid") fail(400, "INVALID_MODE", "Leaderboard mode must be ranked or raid");
        const raidId = mode === "raid" ? url.searchParams.get("raidId") ?? undefined : undefined;
        const raid = raidId ? store.getRaid(raidId) : undefined;
        if (mode === "raid" && (!raid || raid.gameId !== gameId || raid.status === "draft")) fail(400, "INVALID_RAID", "A matching raidId is required");
        const objective = mode === "raid" ? raid!.objective : game.manifest.supportedObjectives[0];
        const rules = mode === "raid" ? raid?.rules : game.manifest.adapterId === "skip-to-10k-v2" ? requestedSkipRules(url.searchParams.get("board") ?? "zero") : game.manifest.adapterId === "two-places-v2" ? requestedTwoRules(Number(url.searchParams.get("level") ?? 0)) : adapters.get(game.manifest.adapterId)?.rankedRules;
        return respond(response, 200, { gameId, mode, objective, ...(raidId ? { raidId } : {}), ...(raid ? raidTotal(raid) : {}), entries: (raid && publicRaid(raid).finalResult?.entries) ?? leaderboard(store, gameId, mode, raidId, objective, mode === "ranked" ? game.manifest.version : undefined, rules) });
      }

      if (/^\/api\/me\/progress\/[^/]+$/.test(path) && (method === "GET" || method === "POST")) {
        const identity = await auth.authenticate(request), passport = store.getOrCreatePassport(identity.id);
        const gameId = decodeURIComponent(path.split("/")[4]), keys = progressKeys(gameId);
        if (!keys.length || !store.getGame(gameId)) fail(404, "NOT_FOUND", "This game has no account-save integration");
        if (method === "GET") return respond(response, 200, { scope: passport.playerId, keys, state: readProgress(store, passport.playerId, gameId) });
        const body = await readJson(request);
        if (body.scope !== passport.playerId) fail(409, "ACCOUNT_CHANGED", "Account changed before progress was saved");
        try {
          const state = syncProgress(store, passport.playerId, gameId, body as Parameters<typeof syncProgress>[3]);
          return respond(response, 200, { state });
        } catch (error) { if (error instanceof TypeError) fail(400, "INVALID_PROGRESS", error.message); throw error; }
      }

      if (path === "/api/me" && (method === "GET" || method === "PATCH")) {
        const identity = await auth.authenticate(request);
        let passport = store.getOrCreatePassport(identity.id);
        let walletSync: { ready: boolean; reason?: string } | undefined;
        if (identity.source === "privy") {
          try {
            const arcadeWallet = await auth.arcadeWallet(identity);
            if (passport.arcadeWallet !== arcadeWallet) {
              passport = { ...passport, ...(arcadeWallet ? { arcadeWallet } : {}) };
              if (!arcadeWallet) delete passport.arcadeWallet;
              store.savePassport(passport);
            }
            walletSync = { ready: true };
          } catch (reason) {
            const status = typeof reason === "object" && reason !== null && "status" in reason ? reason.status : undefined;
            walletSync = { ready: false, reason: status === 401
              ? "Privy rejected the server credentials. Check the App Secret for this app."
              : "Privy wallet lookup is temporarily unavailable" };
          }
        }
        if (method === "PATCH") {
          const body = await readJson(request);
          if (Object.keys(body).some((key) => key !== "displayName" && key !== "avatarUrl")) fail(400, "INVALID_INPUT", "Only displayName and avatarUrl can be edited here");
          const displayName = body.displayName === undefined ? passport.displayName : requiredString(body.displayName, "displayName", 32);
          const avatarUrl = body.avatarUrl === undefined ? passport.avatarUrl
            : body.avatarUrl === null || body.avatarUrl === "" ? undefined : optionalString(body.avatarUrl, "avatarUrl", 2_000);
          if (avatarUrl && !/^https:\/\//.test(avatarUrl)) fail(400, "INVALID_INPUT", "Avatar URL must use HTTPS");
          passport = { ...passport, displayName };
          if (avatarUrl) passport.avatarUrl = avatarUrl; else delete passport.avatarUrl;
          store.savePassport(passport);
        }
        return respond(response, 200, { passport, ...(walletSync ? { walletSync } : {}) });
      }

      if (method === "POST" && path === "/api/me/ownership/challenge") {
        const identity = await auth.authenticate(request);
        const passport = store.getOrCreatePassport(identity.id);
        const body = await readJson(request);
        const rawAddress = requiredString(body.address, "address", 42);
        if (!isAddress(rawAddress)) fail(400, "INVALID_ADDRESS", "Invalid ownership wallet address");
        const address = getAddress(rawAddress);
        const challenge = store.createWalletChallenge(passport.playerId, address);
        return respond(response, 201, { address, nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt });
      }
      if (method === "POST" && path === "/api/me/ownership/confirm") {
        const identity = await auth.authenticate(request);
        const passport = store.getOrCreatePassport(identity.id);
        const body = await readJson(request);
        const address = requiredString(body.address, "address", 42);
        const nonce = requiredString(body.nonce, "nonce", 80);
        const signature = requiredString(body.signature, "signature", 5_000);
        if (!isAddress(address) || !/^0x[0-9a-fA-F]+$/.test(signature)) fail(400, "INVALID_INPUT", "Invalid address or signature");
        const challenge = store.getWalletChallenge(nonce);
        if (!challenge || challenge.playerId !== passport.playerId || challenge.address !== address.toLowerCase() || challenge.usedAt || Date.now() >= Date.parse(challenge.expiresAt)) {
          fail(409, "CHALLENGE_INVALID", "Ownership challenge is missing, expired, or already used");
        }
        let valid = false;
        try { valid = await verifyMessage({ address: address as Address, message: challenge.message, signature: signature as `0x${string}` }); } catch { /* invalid signature */ }
        if (!valid) fail(400, "INVALID_SIGNATURE", "Ownership wallet signature did not verify");
        const state = store.confirmWalletChallenge(challenge);
        if (state === "already_linked") fail(409, "WALLET_LINKED", "Ownership wallet is already linked to another player");
        if (state === "used") fail(409, "CHALLENGE_INVALID", "Ownership challenge is missing, expired, or already used");
        return respond(response, 200, { passport: store.getPassport(passport.playerId) });
      }
      if (method === "DELETE" && /^\/api\/me\/ownership\/[^/]+$/.test(path)) {
        const identity = await auth.authenticate(request);
        const passport = store.getOrCreatePassport(identity.id);
        const address = decodeURIComponent(path.split("/")[4]);
        if (!isAddress(address)) fail(400, "INVALID_ADDRESS", "Invalid ownership wallet address");
        return respond(response, 200, { passport: store.unlinkWallet(passport.playerId, address) });
      }
      if (method === "GET" && /^\/api\/me\/communities\/[^/]+\/eligibility$/.test(path)) {
        const identity = await auth.authenticate(request);
        const passport = store.getOrCreatePassport(identity.id);
        const communityId = decodeURIComponent(path.split("/")[4]);
        const community = store.listGames(true).map((game) => game.community).find((asset) => asset?.id === communityId);
        if (!community) fail(404, "NOT_FOUND", "Community Asset not found");
        if (!ownership.configured) return respond(response, 200, { eligible: false, configured: false, reason: "MONAD_RPC_URL is not configured" });
        const eligible = await ownership.isEligible(passport, community);
        return respond(response, 200, { eligible, configured: true });
      }

      if ((method === "POST" && path === "/api/creator/submissions") || (method === "PATCH" && /^\/api\/creator\/submissions\/[^/]+$/.test(path))) {
        const identity = await auth.authenticate(request);
        const body = await readJson(request);
        const previous = method === "PATCH" ? store.getGame(decodeURIComponent(path.split("/")[4])) : undefined;
        if (method === "PATCH" && (!previous || previous.creatorId !== identity.id)) fail(404, "NOT_FOUND", "Your submission was not found");
        if (previous?.status === "published") fail(409, "GAME_PUBLISHED", "An admin must pause the game before revision");
        const name = requiredString(body.name, "name", 80);
        const sourceUrl = requiredString(body.sourceUrl, "sourceUrl", 2000);
        let source: URL;
        try { source = new URL(sourceUrl); } catch { fail(400, "INVALID_SOURCE", "Enter an HTTPS repository or source download link"); }
        if (source!.protocol !== "https:" || source!.username || source!.password) fail(400, "INVALID_SOURCE", "Use an HTTPS link without embedded credentials");
        if (body.preparation !== "help" && body.preparation !== "agent") fail(400, "INVALID_INPUT", "Choose help or agent preparation");
        const requestedModes = body.requestedModes;
        if (!Array.isArray(requestedModes) || !requestedModes.length || requestedModes.some(m => !["free", "ranked", "raid"].includes(String(m)))) fail(400, "INVALID_INPUT", "Choose supported play modes");
        const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45).replace(/-$/g, "") || "game";
        const id = previous?.manifest.id ?? stem + "-" + randomUUID().slice(0, 8);
        const now = new Date().toISOString();
        const game: GameRecord = { manifest: { id, name, description: requiredString(body.description, "description", 2000), developer: requiredString(body.developer, "developer", 100), version: "1.0.0", adapterId: id, skeletonId: id, supportedModes: ["free"], supportedObjectives: ["score"], communityOptional: true, minicoinOptional: true },
          creatorId: identity.id, status: "submitted", createdAt: now, submittedAt: now,
          submission: { sourceUrl: source!.href, preparation: body.preparation, requestedModes: [...new Set(["free", ...requestedModes])] as ("free" | "ranked" | "raid")[], playGuide: validatePlayGuide(body.playGuide, requestedModes as string[]) },
          communityConcept: validateConcept(body.communityConcept), economy: { status: "pending", reason: "Optional economy awaits protocol review." } };
        if (previous) { game.manifest = { ...previous.manifest, name, description: game.manifest.description, developer: game.manifest.developer }; game.createdAt = previous.createdAt; game.publishedAt = previous.publishedAt; game.community = previous.community; game.communityStrategy = previous.communityStrategy; game.minicoin = previous.minicoin; game.economy = previous.economy; }
        store.saveGame(game);
        return respond(response, method === "POST" ? 201 : 200, { game });
      }
      if (path.startsWith("/api/creator/games")) {
        const identity = await auth.authenticate(request);
        const readiness = (game: GameRecord) => ({ ...game, readiness: { ready: gameBlockers(game, adapters, configuredCartridgeOrigins(), request.headers.host).length === 0, blockers: gameBlockers(game, adapters, configuredCartridgeOrigins(), request.headers.host) } });
        if (method === "GET" && path === "/api/creator/games") return respond(response, 200, { games: store.listGames().filter((game) => game.creatorId === identity.id).map(readiness) });
        if (method === "POST" && path === "/api/creator/games") {
          const body = await readJson(request);
          if (body.minicoin !== undefined) fail(409, "SETTLEMENT_NOT_READY", "Minicoin association requires a verified onchain deployment");
          const manifest = validateManifest(body.manifest);
          if (manifest.id === WARMUP_GAME_ID || store.getGame(manifest.id)) fail(409, "GAME_EXISTS", "A game with this ID already exists");
          const now = new Date().toISOString();
          const game: GameRecord = { manifest, status: "submitted", creatorId: identity.id, createdAt: now, submittedAt: now,
            community: validateCommunity(body.community), communityStrategy: optionalString(body.communityStrategy, "communityStrategy", 120),
            communityConcept: validateConcept(body.communityConcept), economy: validateEconomy(body.economy) };
          const blockers = artifactBlockers(game, configuredCartridgeOrigins(), request.headers.host);
          if (blockers.length) fail(400, "INVALID_ARTIFACT", "Cartridge entry is not supported", blockers);
          store.saveGame(game);
          return respond(response, 201, { game: readiness(game) });
        }
        if (/^\/api\/creator\/games\/[^/]+(?:\/deploy)?$/.test(path)) {
          const game = store.getGame(decodeURIComponent(path.split("/")[4]));
          if (!game || game.creatorId !== identity.id) fail(404, "NOT_FOUND", "Your submission was not found");
          if (method === "POST" && path.endsWith("/deploy")) {
            if (game.status !== "approved") fail(409, "NOT_APPROVED", "Admin approval is required before Developer Deploy");
            const blockers = gameBlockers(game, adapters, configuredCartridgeOrigins(), request.headers.host);
            if (blockers.length) fail(409, "NOT_READY", "Approved cartridge is not ready to deploy", blockers);
            game.status = "published"; game.publishedAt ??= new Date().toISOString(); store.saveGame(game);
            return respond(response, 200, { game });
          }
          if (method === "PATCH" && !path.endsWith("/deploy")) {
            if (game.status === "published") fail(409, "GAME_PUBLISHED", "An admin must pause the game before its approved configuration changes");
            const body = await readJson(request);
            if (Object.keys(body).some((key) => !["manifest", "community", "communityStrategy", "communityConcept", "economy"].includes(key))) fail(400, "INVALID_INPUT", "Only launch configuration can be changed here");
            if (game.minicoin && (body.community !== undefined || body.communityStrategy !== undefined)) fail(409, "IMMUTABLE_ASSOCIATION", "Community Asset and Strategy are locked after Minicoin association");
            if (body.manifest !== undefined) {
              const manifest = validateManifest(body.manifest);
              if (manifest.id !== game.manifest.id) fail(400, "INVALID_MANIFEST", "Game ID cannot change");
              if (game.publishedAt && manifest.version === game.manifest.version && JSON.stringify(manifest.playGuide ?? {}) !== JSON.stringify(game.manifest.playGuide ?? {})) fail(409, "VERSION_REQUIRED", "Use a new build version when changing a published challenge");
              if (store.listRaids().some((raid) => raid.gameId === manifest.id && raid.status === "open")) fail(409, "ACTIVE_RAID", "Close and finalize open raids before changing the cartridge");
              if (store.db.prepare("SELECT 1 FROM run_sessions WHERE game_id = ? AND consumed_at IS NULL AND julianday(json_extract(json, '$.expiresAt')) > julianday('now') LIMIT 1").get(manifest.id)) fail(409, "ACTIVE_RUNS", "Wait for issued runs to finish or expire before updating this game");
              game.manifest = manifest;
            }
            if (body.community !== undefined) game.community = validateCommunity(body.community);
            if (body.communityStrategy !== undefined) game.communityStrategy = optionalString(body.communityStrategy, "communityStrategy", 120);
            if (body.communityConcept !== undefined) game.communityConcept = validateConcept(body.communityConcept);
            if (body.economy !== undefined) game.economy = validateEconomy(body.economy);
            const blockers = artifactBlockers(game, configuredCartridgeOrigins(), request.headers.host);
            if (blockers.length) fail(400, "INVALID_ARTIFACT", "Cartridge entry is not supported", blockers);
            if (game.submission) { delete game.submission.configuredAt; delete game.submission.configuredBy; }
            game.status = "submitted"; game.submittedAt = new Date().toISOString(); delete game.review; store.saveGame(game);
            return respond(response, 200, { game: readiness(game) });
          }
        }
      }

      if (method === "POST" && path === "/api/runs") {
        const identity = await auth.authenticate(request);
        const passport = store.getOrCreatePassport(identity.id);
        const body = await readJson(request);
        const gameId = requiredString(body.gameId, "gameId", 64);
        const mode = body.mode;
        if (mode !== "ranked" && mode !== "raid") fail(400, "INVALID_MODE", "Run mode must be ranked or raid");
        const game = store.getGame(gameId);
        if (!game || game.status !== "published") fail(404, "NOT_FOUND", "Published game not found");
        if (!game.manifest.supportedModes.includes(mode)) fail(409, "MODE_UNAVAILABLE", "Game does not support this mode");
        const adapter = adapters.get(game.manifest.adapterId);
        if (!adapter?.verifier) fail(409, "VERIFIER_UNAVAILABLE", "Game-specific verifier is not installed");
        const now = Date.now();
        let raid: Raid | undefined;
        if (mode === "raid") {
          const raidId = requiredString(body.raidId, "raidId", 80);
          raid = store.getRaid(raidId);
          if (!raid || raid.gameId !== gameId) fail(404, "NOT_FOUND", "Raid not found for this game");
          if (raid.status !== "open" || now < Date.parse(raid.startsAt) || now >= Date.parse(raid.endsAt)) fail(409, "RAID_CLOSED", "Raid is not open for entries");
          const blockers = raidBlockers(raid, store, adapters);
          if (blockers.length) fail(409, "RAID_NOT_READY", "Raid cannot issue runs", blockers);
        }
        const issuedRules = mode === "raid" ? raid?.rules : game.manifest.adapterId === "skip-to-10k-v2" ? requestedSkipRules(body.board ?? "zero") : game.manifest.adapterId === "two-places-v2" ? requestedTwoRules(body.level ?? 0) : adapter.rankedRules;
        if (mode === "ranked" && game.manifest.adapterId === "two-places-v2" &&
            Number(issuedRules?.level) >= twoPlacesUnlockedCount(readProgress(store, passport.playerId, gameId))) {
          fail(403, "LEVEL_LOCKED", "Unlock this level in Free Play first. Open Free Play while signed in to sync your progress.");
        }
        if (raid?.funding) fundedRaids.snapshotWallet(raid, passport);
        const config: GameRunConfig = {
          runId: randomUUID(), gameId, gameVersion: game.manifest.version, mode,
          objective: raid?.objective ?? game.manifest.supportedObjectives[0],
          seed: game.manifest.adapterId === "coindle-v2" ? randomBytes(16).toString("hex") : raid?.seed ?? randomBytes(16).toString("hex"),
          ...(raid ? { raidId: raid.id, maxAttempts: raid.maxAttempts } : {}),
          ...(issuedRules ? { rules: issuedRules } : {}),
          startedAt: new Date(now).toISOString(), expiresAt: new Date(Math.min(now + (adapter.runTimeoutMs ?? 120_000), raid ? Date.parse(raid.endsAt) : Infinity)).toISOString(),
        };
        const created = store.createSession({ playerId: passport.playerId, config }, raid?.maxAttempts,
          raid && game.manifest.adapterId === "skip-to-10k-v2" ? attempt => { config.rules = requestedSkipRules(skipRules.RAID_BOARDS[attempt]); } : undefined);
        if (!created) fail(409, "ATTEMPT_LIMIT", "No raid attempts remain");
        return respond(response, 201, { run: config });
      }

      if (method === "GET" && /^\/api\/runs\/[^/]+\/result$/.test(path)) {
        const identity = await auth.authenticate(request);
        const passport = store.getOrCreatePassport(identity.id);
        const runId = decodeURIComponent(path.split("/")[3]);
        const session = store.getSession(runId);
        if (!session || session.playerId !== passport.playerId) fail(404, "NOT_FOUND", "Run session not found");
        const result = store.getAcceptedResult(runId);
        return respond(response, 200, { verified: !!result, result: result ?? null });
      }

      if (method === "POST" && /^\/api\/runs\/[^/]+\/complete$/.test(path)) {
        const identity = await auth.authenticate(request);
        const passport = store.getOrCreatePassport(identity.id);
        const runId = decodeURIComponent(path.split("/")[3]);
        const session = store.getSession(runId);
        if (!session || session.playerId !== passport.playerId) fail(404, "NOT_FOUND", "Run session not found");
        if (session.consumedAt) fail(409, "RUN_CONSUMED", "Run result was already accepted");
        if (Date.now() > Date.parse(session.config.expiresAt ?? "")) fail(409, "RUN_EXPIRED", "Run session expired");
        // A bounded 905-second Skip replay contains up to 108,600 input chars.
        const body = await readJson(request, (session.config.rules?.format === skipRules.FORMAT || session.config.rules?.format === twoRules.FORMAT) ? 131_072 : 65_536);
        if (Date.now() >= Date.parse(session.config.expiresAt ?? "")) fail(409, "RUN_EXPIRED", "Run submission must arrive before its deadline");
        const checked = validateRunResultShape(session.config, isRecord(body.result) ? body.result : body);
        if (!checked.valid) fail(400, "INVALID_RESULT", checked.reason);
        const result = checked.result;
        if (result.result !== "completed") fail(400, "INVALID_RESULT", "Only completed runs can enter standings");
        if (Date.parse(result.finishedAt) > Date.now() + 5_000) fail(400, "INVALID_RESULT", "Run finish is in the future");
        const game = store.getGame(result.gameId);
        if (game?.status !== "published" && game?.status !== "paused") fail(409, "GAME_UNAVAILABLE", "Game is no longer available for completing issued runs");
        if (game?.manifest.version !== session.config.gameVersion) fail(409, "GAME_VERSION_CHANGED", "Game version changed during this run");
        const verifier = game && adapters.get(game.manifest.adapterId)?.verifier;
        const currentRules = game!.manifest.adapterId === "skip-to-10k-v2" ? requestedSkipRules(session.config.rules?.board) : game!.manifest.adapterId === "two-places-v2" ? requestedTwoRules(session.config.rules?.level) : adapters.get(game!.manifest.adapterId)?.rankedRules;
        if (result.mode === "ranked" && JSON.stringify(session.config.rules ?? {}) !== JSON.stringify(currentRules ?? {})) {
          fail(409, "RULES_CHANGED", "Passport Play rules changed during this run");
        }
        if (!verifier) fail(409, "VERIFIER_UNAVAILABLE", "Game-specific verifier is not installed");
        // The verifier must see the server-issued rules, never a browser-authored copy.
        const { rules: _untrustedRules, ...claimedResult } = result;
        const verifiedResult: GameRunResult = { ...claimedResult, ...(session.config.rules ? { rules: session.config.rules } : {}) };
        const pendingRaidId = session.config.raidId;
        if (pendingRaidId) verifyingRaids.set(pendingRaidId, (verifyingRaids.get(pendingRaidId) ?? 0) + 1);
        try {
          const verdict = await verifier.verify(session.config, verifiedResult);
          if (!verdict.valid) fail(400, "UNVERIFIED_RESULT", verdict.reason ?? "Verifier rejected the result");
          const raid = result.raidId ? store.getRaid(result.raidId) : undefined;
          if (raid && Date.parse(result.finishedAt) >= Date.parse(raid.endsAt)) fail(409, "RAID_CLOSED", "Run finished after the raid ended");
          const updated = store.acceptResult(session, verifiedResult, (current) => updatePassport(store, current, verifiedResult, raid));
          if (!updated) fail(409, "RUN_CONSUMED", "Run result was already accepted or the raid is final");
          const entries = leaderboard(store, result.gameId, result.mode as "ranked" | "raid", result.raidId, result.objective, result.mode === "ranked" ? game?.manifest.version : undefined, session.config.rules);
          return respond(response, 200, { verified: true, result: verifiedResult, passport: updated, leaderboardEntry: entries.find((entry) => entry.playerId === passport.playerId) });
        } finally {
          if (pendingRaidId) {
            const remaining = (verifyingRaids.get(pendingRaidId) ?? 1) - 1;
            if (remaining) verifyingRaids.set(pendingRaidId, remaining);
            else verifyingRaids.delete(pendingRaidId);
          }
        }
      }

      if (path.startsWith("/api/admin/")) {
        const identity = await auth.authenticate(request);
        if (localMinicoinRehearsalRequested && identity.source === "local-demo") fail(403, "FORBIDDEN", "Local demo identities cannot curate the founder rehearsal");
        requireAdmin(identity);
        if (method === "GET" && path === "/api/admin/creators") return respond(response, 200, { creators: store.listCreatorAccounts() });
        if (method === "POST" && /^\/api\/admin\/games\/[^/]+\/transfer$/.test(path)) {
          const game = store.getGame(decodeURIComponent(path.split("/")[4]));
          if (!game || game.status === "published" || game.minicoin) fail(409, "INVALID_STATE", "Only an unpublished game without a MiniCoin can be reassigned");
          const body = await readJson(request);
          const owner = store.identityForPlayer(requiredString(body.playerId, "playerId", 80));
          if (!owner) fail(404, "NOT_FOUND", "Creator account not found");
          game.creatorId = owner; game.status = "submitted"; delete game.review;
          store.saveGame(game); return respond(response, 200, { game });
        }
        if (method === "GET" && path === "/api/admin/games") {
          return respond(response, 200, { games: store.listGames().map((game) => ({ ...game, readiness: { ready: gameBlockers(game, adapters).length === 0, blockers: gameBlockers(game, adapters) } })) });
        }
        if (method === "POST" && path === "/api/admin/games") {
          const body = await readJson(request);
          if (body.minicoin !== undefined) fail(409, "SETTLEMENT_NOT_READY", "Minicoin association requires a verified onchain deployment");
          const manifest = validateManifest(body.manifest);
          if (store.getGame(manifest.id)) fail(409, "GAME_EXISTS", "A game with this ID already exists");
          const community = validateCommunity(body.community);
          const communityStrategy = optionalString(body.communityStrategy, "communityStrategy", 120);
          const game: GameRecord = { manifest, status: "draft", creatorId: identity.id, createdAt: new Date().toISOString(), ...(community ? { community } : {}), ...(communityStrategy ? { communityStrategy } : {}), communityConcept: validateConcept(body.communityConcept), economy: validateEconomy(body.economy) };
          store.saveGame(game);
          return respond(response, 201, { game: { ...game, readiness: { ready: false, blockers: gameBlockers(game, adapters) } } });
        }
        if (method === "POST" && /^\/api\/admin\/games\/[^/]+\/(validate|approve|reject)$/.test(path)) {
          const game = store.getGame(decodeURIComponent(path.split("/")[4]));
          if (!game) fail(404, "NOT_FOUND", "Game not found");
          if (!game.creatorId || game.status === "published") fail(409, "INVALID_STATE", "Review requires an unpublished creator submission");
          const action = path.split("/")[5];
          const now = new Date().toISOString();
          if (action === "validate") {
            const body = await readJson(request);
            if (validationKeys.some((key) => typeof body[key] !== "boolean")) fail(400, "INVALID_VALIDATION", "Technical review must attest builds, mounts, destroys, resultSchema, mobile and sourceReviewed");
            const checks = Object.fromEntries(validationKeys.map((key) => [key, body[key]])) as Record<typeof validationKeys[number], boolean>;
            const notes = optionalString(body.notes, "notes", 2_000);
            game.review = { validation: { ...checks, reviewedAt: now, reviewedBy: identity.id, ...(notes ? { notes } : {}) } };
            game.status = "submitted";
          } else if (action === "approve") {
            if (game.status !== "submitted" && game.status !== "draft") fail(409, "INVALID_STATE", "Only a submitted cartridge can be approved");
            if (validationKeys.some((key) => game.review?.validation?.[key] !== true)) fail(409, "NOT_VALIDATED", "Complete technical validation before approval");
            const blockers = gameBlockers(game, adapters, configuredCartridgeOrigins(), request.headers.host);
            if (blockers.length) fail(409, "NOT_READY", "Cartridge is not ready for approval", blockers);
            game.status = "approved"; game.review = { ...game.review, approvedAt: now, approvedBy: identity.id };
          } else {
            const body = await readJson(request);
            const reason = requiredString(body.reason, "reason", 2_000);
            game.status = "rejected"; game.review = { validation: game.review?.validation, rejectedAt: now, rejectedBy: identity.id, note: reason };
          }
          store.saveGame(game);
          return respond(response, 200, { game: { ...game, readiness: { ready: gameBlockers(game, adapters).length === 0, blockers: gameBlockers(game, adapters) } } });
        }
        if (method === "POST" && /^\/api\/admin\/games\/[^/]+\/minicoin(?:\/rehearse)?$/.test(path)) {
          const rehearsal = path.endsWith("/rehearse");
          const game = store.getGame(decodeURIComponent(path.split("/")[4]));
          if (!game) fail(404, "NOT_FOUND", "Game not found");
          if (game.manifest.id === WARMUP_GAME_ID) fail(409, "INVALID_GAME", "Internal test cartridge cannot deploy a Minicoin");
          if (game.minicoin) fail(409, "MINICOIN_EXISTS", "Game already has an associated Minicoin");
          if (rehearsal) {
            if (!rehearsalReady) fail(503, "REHEARSAL_NOT_READY", "Local-chain rehearsal is not configured");
            if (game.status !== "published") fail(409, "INVALID_STATE", "Rehearsal requires a published playable Cabinet");
            if (game.community) fail(409, "REHEARSAL_ASSET_UNSUPPORTED", "Local token rehearsal cannot encode a Community Asset");
          } else {
            if ((game.legacyImportRevision && game.economy?.status !== "enabled") || game.communityConcept?.verification === "unverified" || (game.economy && game.economy.status !== "enabled")) fail(409, "ECONOMY_PENDING", "This Cabinet's economy awaits supported asset and strategy approval in the protocol pass");
            if (!game.manifest.communityOptional && !game.community) fail(409, "COMMUNITY_REQUIRED", "Configure the required Community Asset before deploying a Minicoin");
            if (game.community && !game.communityStrategy) fail(409, "STRATEGY_REQUIRED", "Configure the Community Strategy before deploying a Minicoin");
          }
          const body = await readJson(request);
          const name = requiredString(body.name, "name", 80);
          const symbol = requiredString(body.symbol, "symbol", 20);
          const metadataURI = requiredString(body.metadataURI, "metadataURI", 2_000);
          const localRehearsalMetadata = rehearsal && rehearsalReady && game.manifest.id === "emonad-cabinet" && metadataURI === LOCAL_EMONAD_METADATA_URI;
          if (!localRehearsalMetadata && !/^https:\/\//.test(metadataURI) && !/^ipfs:\/\//.test(metadataURI)) fail(400, "INVALID_INPUT", "metadataURI must use HTTPS or IPFS, except for the eMONAD local rehearsal file");
          const supply = requiredString(body.initialSupply, "initialSupply", 78);
          if (!/^\d+$/.test(supply) || BigInt(supply) <= 0n || BigInt(supply) >= 2n ** 256n) fail(400, "INVALID_INPUT", "initialSupply must be a positive uint256 integer in base units");
          game.minicoin = await minicoin.deploy(game, { name, symbol, metadataURI, initialSupply: BigInt(supply) });
          store.saveGame(game);
          return respond(response, 201, { game, minicoin: game.minicoin });
        }
        if (method === "POST" && /^\/api\/admin\/games\/[^/]+\/minicoin(?:\/rehearse)?\/reconcile$/.test(path)) {
          const rehearsal = path.includes("/minicoin/rehearse/");
          const game = store.getGame(decodeURIComponent(path.split("/")[4]));
          if (!game) fail(404, "NOT_FOUND", "Game not found");
          if (game.minicoin) fail(409, "MINICOIN_EXISTS", "Game already has an associated Minicoin");
          if (rehearsal) {
            if (!rehearsalReconcileReady) fail(503, "REHEARSAL_NOT_READY", "Local-chain rehearsal receipt checks are not configured");
            if (game.status !== "published") fail(409, "INVALID_STATE", "Rehearsal requires a published playable Cabinet");
            if (game.community) fail(409, "REHEARSAL_ASSET_UNSUPPORTED", "Local token rehearsal cannot encode a Community Asset");
          } else {
            if ((game.legacyImportRevision && game.economy?.status !== "enabled") || game.communityConcept?.verification === "unverified" || (game.economy && game.economy.status !== "enabled")) fail(409, "ECONOMY_PENDING", "This Cabinet's economy awaits supported asset and strategy approval in the protocol pass");
            if (!game.manifest.communityOptional && !game.community) fail(409, "COMMUNITY_REQUIRED", "Configure the required Community Asset before reconciling a Minicoin");
            if (game.community && !game.communityStrategy) fail(409, "STRATEGY_REQUIRED", "Configure the Community Strategy before reconciling a Minicoin");
          }
          const body = await readJson(request);
          const transactionHash = requiredString(body.transactionHash, "transactionHash", 66);
          if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) fail(400, "INVALID_INPUT", "transactionHash must be a 32-byte hex value");
          game.minicoin = await minicoin.reconcile(game, transactionHash as `0x${string}`);
          store.saveGame(game);
          return respond(response, 200, { game, minicoin: game.minicoin });
        }
        if (method === "GET" && path === "/api/admin/raids") {
          return respond(response, 200, { raids: store.listRaids().map((saved) => { const raid = currentRaid(saved); return { ...raid, readiness: { ready: raidBlockers(raid, store, adapters).length === 0, blockers: raidBlockers(raid, store, adapters) } }; }) });
        }
        if (method === "POST" && path === "/api/admin/raids") {
          const body = await readJson(request);
          const raid = validateRaidInput(body);
          if (store.getGame(raid.gameId)?.manifest.adapterId === "mood-swings") raid.gameVersion = "2.0.0";
          const adapterId = store.getGame(raid.gameId)?.manifest.adapterId ?? "";
          const defaults = adapterId === "skip-to-10k-v2" ? SKIP_RAID_RULES : adapterId === "coindle-v2" ? RAPID_RAID_RULES : adapters.get(adapterId)?.rankedRules;
          if (defaults || raid.rules) raid.rules = normalizeRunRules({ ...defaults, ...raid.rules });
          if (store.getGame(raid.gameId)?.manifest.adapterId === "two-places-v2") raid.rules = normalizeRunRules(twoRaidRules(raid.seed));
          const blockers = raidBlockers(raid, store, adapters);
          if (!store.getGame(raid.gameId)) fail(404, "NOT_FOUND", "Game not found");
          if (!blockers.length) raid.status = currentRaid({ ...raid, status: "open" }).status;
          store.saveRaid(raid);
          return respond(response, 201, { raid: { ...raid, readiness: { ready: blockers.length === 0, blockers } } });
        }
        if (method === "POST" && /^\/api\/admin\/raids\/[^/]+\/open$/.test(path)) {
          const raid = store.getRaid(decodeURIComponent(path.split("/")[4]));
          if (!raid) fail(404, "NOT_FOUND", "Raid not found");
          const blockers = raidBlockers(raid, store, adapters);
          if (blockers.length) fail(409, "NOT_READY", "Raid is not ready to open", blockers);
          if (Date.now() >= Date.parse(raid.endsAt)) fail(409, "RAID_CLOSED", "Raid end time has passed");
          raid.status = "open";
          store.saveRaid(raid);
          return respond(response, 200, { raid });
        }
        if (method === "POST" && /^\/api\/admin\/games\/[^/]+\/publish$/.test(path)) {
          const game = store.getGame(decodeURIComponent(path.split("/")[4]));
          if (!game) fail(404, "NOT_FOUND", "Game not found");
          if (game.manifest.id === WARMUP_GAME_ID && !auth.localDemoMode) fail(409, "NOT_READY", "Internal test cartridge is available only in local demo mode");
          fail(409, "DEVELOPER_DEPLOY_REQUIRED", "Admin approval and Developer Deploy are separate actions. The submitting creator must deploy the approved cartridge.");
        }
        if (method === "POST" && /^\/api\/admin\/games\/[^/]+\/resume$/.test(path)) {
          const game = store.getGame(decodeURIComponent(path.split("/")[4]));
          if (!game) fail(404, "NOT_FOUND", "Game not found");
          if (game.status !== "paused" || !game.publishedAt || !game.review?.approvedBy) fail(409, "INVALID_STATE", "Only an unchanged, previously approved and published cabinet can resume");
          const blockers = gameBlockers(game, adapters, configuredCartridgeOrigins(), request.headers.host);
          if (blockers.length) fail(409, "NOT_READY", "Cabinet is not ready to resume", blockers);
          game.status = "published"; store.saveGame(game);
          return respond(response, 200, { game });
        }
        if (method === "PATCH" && /^\/api\/admin\/games\/[^/]+$/.test(path)) {
          const game = store.getGame(decodeURIComponent(path.split("/")[4]));
          if (!game) fail(404, "NOT_FOUND", "Game not found");
          const body = await readJson(request);
          if (body.minicoin !== undefined) fail(409, "SETTLEMENT_NOT_READY", "Minicoin association requires a verified onchain deployment");
          if (game.minicoin && (body.community !== undefined || body.communityStrategy !== undefined)) fail(409, "IMMUTABLE_ASSOCIATION", "Community Asset and Strategy are locked after Minicoin association");
          if (body.status !== undefined) {
            if (body.status !== "paused" || game.status !== "published") fail(400, "INVALID_STATUS", "Only a published game can be paused here");
            if (store.listRaids().some((raid) => raid.gameId === game.manifest.id && raid.status === "open")) fail(409, "ACTIVE_RAID", "Close and finalize open raids before pausing the game");
            game.status = "paused";
          }
          if (body.manifest !== undefined || body.community !== undefined || body.communityStrategy !== undefined || body.communityConcept !== undefined || body.economy !== undefined) {
            if (game.status === "published") fail(409, "GAME_PUBLISHED", "Pause the game before changing its configuration");
            if (store.db.prepare("SELECT 1 FROM run_sessions WHERE game_id = ? AND consumed_at IS NULL AND julianday(json_extract(json, '$.expiresAt')) > julianday('now') LIMIT 1").get(game.manifest.id)) fail(409, "ACTIVE_RUNS", "Wait for issued runs to finish or expire before updating this game");
            if (store.listRaids().some((raid) => raid.gameId === game.manifest.id && raid.status === "open")) fail(409, "ACTIVE_RAID", "Close and finalize open raids before updating this game");
            if (body.manifest !== undefined) {
              const manifest = validateManifest(body.manifest);
              if (manifest.id !== game.manifest.id) fail(400, "INVALID_MANIFEST", "Game ID cannot change");
              if (game.publishedAt && manifest.version === game.manifest.version && JSON.stringify(manifest.playGuide ?? {}) !== JSON.stringify(game.manifest.playGuide ?? {})) fail(409, "VERSION_REQUIRED", "Use a new build version when changing a published challenge");
              if ((manifest.version !== game.manifest.version || JSON.stringify(manifest.supportedObjectives) !== JSON.stringify(game.manifest.supportedObjectives)) &&
                  store.listRaids().some((raid) => raid.gameId === manifest.id && raid.status === "open" && Date.parse(raid.endsAt) > Date.now())) {
                fail(409, "ACTIVE_RAID", "End or close active raids before changing the game version or objectives");
              }
              game.manifest = manifest;
            }
            if (body.community !== undefined) {
              const community = validateCommunity(body.community);
              if (community) game.community = community; else delete game.community;
            }
            if (body.communityStrategy !== undefined) {
              const strategy = optionalString(body.communityStrategy, "communityStrategy", 120);
              if (strategy) game.communityStrategy = strategy; else delete game.communityStrategy;
            }
            if (body.communityConcept !== undefined) game.communityConcept = validateConcept(body.communityConcept);
            if (body.economy !== undefined) game.economy = validateEconomy(body.economy);
            if (game.submission && body.manifest !== undefined) {
              const blockers = artifactBlockers(game, configuredCartridgeOrigins(), request.headers.host);
              if (!game.manifest.entry || blockers.length) fail(400, "INVALID_ARTIFACT", "Configure an approved, versioned cartridge build", blockers);
              game.submission.configuredAt = new Date().toISOString(); game.submission.configuredBy = identity.id;
            }
            delete game.review;
            game.status = game.creatorId ? "submitted" : "draft";
          }
          store.saveGame(game);
          return respond(response, 200, { game: { ...game, readiness: { ready: gameBlockers(game, adapters).length === 0, blockers: gameBlockers(game, adapters) } } });
        }
      }
      fail(404, "NOT_FOUND", "API route not found");
    } catch (error) {
      if (response.headersSent) return response.end();
      if (error instanceof HttpError) return respond(response, error.status, { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
      if (error instanceof AuthError) return respond(response, error.status, { error: { code: error.code, message: error.message } });
      if (error instanceof MinicoinError) return respond(response, error.status, { error: { code: error.code, message: error.message } });
      if (error instanceof FundedRaidError) return respond(response, error.status, { error: { code: error.code, message: error.message } });
      console.error("API request failed", error);
      respond(response, 500, { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });
  let payoutTimer: ReturnType<typeof setInterval> | undefined;
  server.on("listening", () => {
    if (!payouts.enabled) return;
    payoutTimer = setInterval(() => void payouts.tick(publicRaid), 15_000);
    payoutTimer.unref();
    void payouts.tick(publicRaid);
  });
  server.on("close", () => clearInterval(payoutTimer));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  if (process.env.LOCAL_DEMO_MODE === "true" && process.env.NODE_ENV !== "production" && !["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new Error("LOCAL_DEMO_MODE is only available when the API binds to loopback");
  }
  const server = createArcadeServer();
  server.listen(port, host, () => console.log(`Token Arcade API listening on http://${host}:${port}`));
}
