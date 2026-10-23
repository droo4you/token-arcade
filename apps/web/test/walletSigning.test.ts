import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { checkWalletSigning } from "../src/walletSigning.ts";

// Public, deterministic test keys; never funded or used by the application.
const player = privateKeyToAccount(`0x${"01".repeat(32)}`);
const other = privateKeyToAccount(`0x${"02".repeat(32)}`);

test("signing check targets the Passport wallet and verifies a real personal signature", async () => {
  const messages: string[] = [];
  for (let i = 0; i < 2; i++) {
    await checkWalletSigning(player.address, "https://arcade.example", async ({ message }, options) => {
      assert.equal(options.address, player.address);
      assert.equal(options.uiOptions.showWalletUIs, true);
      assert.ok(message.includes("Site: https://arcade.example"));
      assert.ok(message.includes(player.address));
      messages.push(message);
      return { signature: await player.signMessage({ message }) };
    });
  }
  assert.notEqual(messages[0], messages[1], "each check needs a fresh challenge");
});

test("another wallet or a changed message cannot pass the signing check", async () => {
  await assert.rejects(checkWalletSigning(player.address, "https://arcade.example", async ({ message }) => ({
    signature: await other.signMessage({ message }),
  })), /does not match/);
  await assert.rejects(checkWalletSigning(player.address, "https://arcade.example", async () => ({
    signature: await player.signMessage({ message: "different challenge" }),
  })), /does not match/);
});

test("invalid wallets, malformed signatures and cancelled prompts never pass", async () => {
  await assert.rejects(checkWalletSigning("", "https://arcade.example", async () => {
    assert.fail("must not request signing without a wallet");
  }), /valid arcade wallet/);
  await assert.rejects(checkWalletSigning(player.address, "https://arcade.example", async () => ({ signature: "0x00" })));
  await assert.rejects(checkWalletSigning(player.address, "https://arcade.example", async () => { throw new Error("User cancelled"); }), /User cancelled/);
});
