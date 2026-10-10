export type CoinType =
  | "Memecoin"
  | "L1 Blockchain"
  | "L2"
  | "DeFi Token"
  | "Stablecoin"
  | "Oracle"
  | "AI Token"
  | "RWA"
  | "Gaming"
  | "Payment"
  | "Layer-0"
  | "Other";

export type LogoColor =
  | "Red"
  | "Orange"
  | "Yellow"
  | "Green"
  | "Blue"
  | "Purple"
  | "Pink"
  | "Black"
  | "White"
  | "Multi";

export type FDVBucket =
  | "<10M"
  | "10M-100M"
  | "100M-1B"
  | "1B-10B"
  | "10B-100B"
  | ">100B";

export interface Coin {
  name: string;
  ticker: string;
  pythFeedId: string;
  logoUrl: string;
  type: CoinType;
  primaryColor: LogoColor;
  launchYear: number;
  tickerLength: number;
  fdvBucket: FDVBucket;
  /**
   * Pyth stopped publishing this feed. The entry stays in COINS so that
   * COINS.length — and therefore every past daily answer — is unchanged, but
   * it is skipped for prices, daily selection and guessing.
   */
  retired?: boolean;
}

export type MatchResult = "green" | "yellow" | "red" | "unavailable";

export interface GuessResult {
  coin: Coin;
  type: MatchResult;
  color: MatchResult;
  launchYear: MatchResult;
  tickerLength: MatchResult;
  priceRange: MatchResult;
  fdvRange: MatchResult;
  // Directional arrows for numeric categories
  launchYearDirection: "up" | "down" | "match";
  tickerLengthDirection: "up" | "down" | "match";
  priceRangeDirection: "up" | "down" | "match";
  fdvRangeDirection: "up" | "down" | "match";
}

export type GameMode = "daily" | "freeplay";
export type Difficulty = "easy" | "hard";

export interface GameState {
  mode: GameMode;
  difficulty: Difficulty;
  guesses: GuessResult[];
  gameOver: boolean;
  won: boolean;
  secretCoinIndex: number;
}

export interface DailyStats {
  played: number;
  won: number;
  streak: number;
  maxStreak: number;
  distribution: number[]; // index 0 = won in 1 guess, etc.
  lastPlayedDate: string; // YYYY-MM-DD
}

export interface PriceTier {
  price: number;
  tier: number; // 0-9
}

export interface CachedPrices {
  [ticker: string]: PriceTier;
}
