import type { MinicoinAssociation } from "./index.ts";

export interface TestnetTokenInput {
  name: string;
  symbol: string;
  metadataURI: string;
  initialSupply: string;
}
export interface TestnetTokenConfig {
  chainId: number;
  factoryAddress?: string;
  treasuryAddress?: string;
  supplyRecipient?: string;
  ready: boolean;
  reason?: string;
}
export interface TestnetTokenLaunch {
  id: string;
  gameId: string;
  creatorId: string;
  status: "submitted" | "approved" | "rejected" | "pending" | "deployed";
  input: TestnetTokenInput;
  config: TestnetTokenConfig;
  fingerprint: string;
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
  transactionHash?: string;
  token?: MinicoinAssociation;
}
