import { fallback, http } from "viem";

// Broadcasting through this transport retries the identical signed bytes.
export function testnetTransport(primary = process.env.TESTNET_RPC_URL) {
  const urls = [...new Set([primary, "https://rpc-testnet.monadinfra.com", "https://testnet-rpc.monad.xyz"].filter(Boolean) as string[])];
  return fallback(urls.map(url => http(url, { timeout: 10_000, retryCount: 0 })), { rank: false, retryCount: 0, shouldThrow: () => false });
}
