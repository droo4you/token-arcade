import { isAddress, recoverMessageAddress } from "viem";

type SignMessage = (input: { message: string }, options: { address: string; uiOptions: { title: string; showWalletUIs: boolean } }) => Promise<{ signature: string }>;

// This is a local diagnostic, never a login credential or permission grant.
export async function checkWalletSigning(wallet: string, origin: string, signMessage: SignMessage): Promise<void> {
  if (!isAddress(wallet)) throw new Error("Your Passport needs a valid arcade wallet before checking signing.");
  const message = [
    "Token Arcade wallet signing check",
    `Site: ${origin}`,
    `Passport wallet: ${wallet}`,
    "This message only checks that I can sign with my arcade wallet.",
    "It does not authorize a transaction, asset transfer, login, or spending permission.",
    `Time: ${new Date().toISOString()}`,
    `Nonce: ${crypto.randomUUID()}`,
  ].join("\n");
  const { signature } = await signMessage({ message }, { address: wallet, uiOptions: { title: "Check arcade wallet signing", showWalletUIs: true } });
  const signer = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
  if (signer.toLowerCase() !== wallet.toLowerCase()) throw new Error("The signature does not match your Passport arcade wallet. Signing check failed.");
}
