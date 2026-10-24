import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { createArcadeServer } from "../src/server.ts";
import { ArcadeStore } from "../src/store.ts";
import { CANONICAL_ORIGIN, publicOrigin } from "../src/shareMeta.ts";

const shareDir = resolve("apps/web/public/share");
const clips = ["arcade", "coindle", "uppers", "skip-to-10k", "skrumpey-slide", "two-places"] as const;

test("public share origins stay absolute HTTPS off loopback", () => {
  assert.equal(publicOrigin({ host: "token-arcade.onrender.com" }), CANONICAL_ORIGIN);
  assert.equal(publicOrigin({ host: "127.0.0.1:8787", "x-forwarded-host": "token-arcade.onrender.com", "x-forwarded-proto": "http" }), CANONICAL_ORIGIN);
  assert.equal(publicOrigin({ host: "localhost:5173" }), "http://localhost:5173");
  assert.equal(publicOrigin({}), CANONICAL_ORIGIN);
});

test("promo clips are short faststart MP4s with matching posters", () => {
  for (const name of clips) {
    const file = join(shareDir, `${name}.mp4`);
    const video = readFileSync(file);
    const image = readFileSync(join(shareDir, `${name}.png`));
    assert.ok(video.byteLength > 20_000 && video.byteLength < 2_200_000, `${name} ${video.byteLength}`);
    assert.equal(video.subarray(4, 8).toString(), "ftyp");
    assert.ok(video.subarray(0, 64).includes(Buffer.from("moov")), `${name} faststart`);
    assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name,pix_fmt,avg_frame_rate", "-of", "csv=p=0", file], { encoding: "utf8" });
    if (probe.status === 0) {
      const [codec, width, height, pix, rate] = probe.stdout.trim().split(",");
      assert.equal(`${codec},${width},${height},${pix}`, "h264,1280,720,yuv420p", name);
      const [num, den] = rate.split("/").map(Number);
      assert.ok(Math.abs(num / den - 30) < 0.2, `${name} fps ${rate}`);
    }
    const duration = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
    if (duration.status === 0) {
      const seconds = Number(duration.stdout.trim());
      assert.ok(seconds >= 4 && seconds <= 6.2, `${name} duration ${seconds}`);
    }
  }
});

test("arcade shell and cartridge pages return absolute og:video tags", async () => {
  const directory = mkdtempSync(join(tmpdir(), "token-arcade-share-"));
  writeFileSync(join(directory, "index.html"), readFileSync(resolve("apps/web/index.html")));
  symlinkSync(shareDir, join(directory, "share"));
  const store = new ArcadeStore(":memory:", false);
  const server = createArcadeServer({ store, authSettings: {}, staticRoot: directory });
  const cartridgeModule = "../../../scripts/cartridges.mjs";
  const cartridges = await import(cartridgeModule) as { createCartridgeServer: () => Server };
  const cartridgeServer = cartridges.createCartridgeServer();
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", () => resolveListen()));
  await new Promise<void>((resolveListen) => cartridgeServer.listen(0, "127.0.0.1", () => resolveListen()));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cartridgeOrigin = `http://127.0.0.1:${(cartridgeServer.address() as AddressInfo).port}`;
  const headers = { "x-forwarded-host": "token-arcade.onrender.com", "x-forwarded-proto": "https" };
  const page = async (path: string) => {
    const response = await fetch(origin + path, { headers });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    return response.text();
  };
  try {
    const home = await page("/");
    assert.match(home, /<title>Token Arcade — The Internet Is Fun<\/title>/);
    assert.match(home, /property="og:type" content="video\.other"/);
    assert.match(home, /property="og:video" content="https:\/\/token-arcade\.onrender\.com\/share\/arcade\.mp4"/);
    assert.match(home, /property="og:video:secure_url" content="https:\/\/token-arcade\.onrender\.com\/share\/arcade\.mp4"/);
    assert.match(home, /property="og:video:type" content="video\/mp4"/);
    assert.match(home, /property="og:video:width" content="1280"/);
    assert.match(home, /property="og:video:height" content="720"/);
    assert.match(home, /property="og:image" content="https:\/\/token-arcade\.onrender\.com\/share\/arcade\.png"/);
    assert.match(home, /property="og:url" content="https:\/\/token-arcade\.onrender\.com\/"/);
    assert.equal(home.match(/property="og:video"(?!:)/g)?.length, 1);

    const games: Array<[string, string, string]> = [
      ["/games/coindle", "Coindle", "coindle.mp4"],
      ["/play/coindle?mode=ranked", "Coindle", "coindle.mp4"],
      ["/games/emonad-cabinet", "Uppers", "uppers.mp4"],
      ["/games/skip-to-10k", "Skip to 10K", "skip-to-10k.mp4"],
      ["/games/skrumpey-slide", "Skrumpey Slide", "skrumpey-slide.mp4"],
      ["/play/two-places", "Two Places at Once", "two-places.mp4"],
    ];
    for (const [path, title, file] of games) {
      const html = await page(path);
      assert.match(html, new RegExp(`<title>${title}</title>`), path);
      assert.match(html, new RegExp(`property="og:title" content="${title}"`), path);
      assert.match(html, new RegExp(`property="og:video" content="https://token-arcade\\.onrender\\.com/share/${file}"`), path);
      assert.match(html, /property="og:video:secure_url"/, path);
      assert.match(html, /property="og:image"/, path);
      assert.equal(html.match(/property="og:video"(?!:)/g)?.length, 1, path);
    }
    const plain = await (await fetch(origin + "/games/not-a-cabinet", { headers })).text();
    assert.equal(plain.includes("og:video"), false);
    const repeated = await page("/games/coindle");
    assert.equal(repeated.match(/share-meta:start/g)?.length, 1);

    const coindle = store.getGame("coindle");
    assert.ok(coindle);
    store.saveGame({ ...coindle, manifest: { ...coindle.manifest, description: 'Daily "coins" & more' } });
    const renamed = await page("/games/coindle");
    assert.match(renamed, /content="Daily &quot;coins&quot; &amp; more"/);

    const video = await fetch(origin + "/share/coindle.mp4");
    assert.equal(video.headers.get("content-type"), "video/mp4");
    assert.equal(video.status, 200);
    assert.ok(Number(video.headers.get("content-length")) > 1000);
    const partial = await fetch(origin + "/share/coindle.mp4", { headers: { range: "bytes=0-3" } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get("content-type"), "video/mp4");
    assert.equal((await partial.arrayBuffer()).byteLength, 4);

    const uppers = await (await fetch(`${cartridgeOrigin}/emonad-cabinet/v/1.0.0/`)).text();
    assert.match(uppers, /property="og:title" content="Uppers"/);
    assert.match(uppers, /property="og:type" content="video\.other"/);
    assert.match(uppers, /property="og:video:secure_url" content="https:\/\/token-arcade\.onrender\.com\/share\/uppers\.mp4"/);
    assert.match(uppers, /property="og:video:type" content="video\/mp4"/);
    assert.equal(uppers.match(/property="og:video"(?!:)/g)?.length, 1);

    const skip = await (await fetch(`${cartridgeOrigin}/skip-to-10k/v/1.0.0/`, { headers: { "x-forwarded-host": "token-arcade-cartridges.onrender.com" } })).text();
    assert.match(skip, /property="og:title" content="Skip to 10K"/);
    assert.match(skip, /property="og:video" content="https:\/\/token-arcade\.onrender\.com\/share\/skip-to-10k\.mp4"/);
    assert.match(skip, /property="og:url" content="https:\/\/token-arcade-cartridges\.onrender\.com\/skip-to-10k\/v\/1\.0\.0\/"/);
    assert.match(skip, /\/sdk\/bridge\.js/);

    const slide = await (await fetch(`${cartridgeOrigin}/skrumpey-slide/v/1.2.0/`)).text();
    assert.match(slide, /property="og:title" content="Skrumpey Slide"/);
    assert.match(slide, /property="og:video:secure_url" content="https:\/\/token-arcade\.onrender\.com\/share\/skrumpey-slide\.mp4"/);
    assert.match(slide, /TA\.register/);

    const places = await (await fetch(`${cartridgeOrigin}/two-places/v/1.0.0/arcade.html`)).text();
    assert.match(places, /property="og:video" content="https:\/\/token-arcade\.onrender\.com\/share\/two-places\.mp4"/);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await new Promise<void>((resolveClose) => cartridgeServer.close(() => resolveClose()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
