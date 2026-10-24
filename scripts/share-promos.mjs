// Rebuild the Open Graph promo spots in apps/web/public/share.
// Renders each scene in headless Chrome from the games' own art, then encodes
// 1280x720 30fps H.264 with ffmpeg. Titles use Space Grotesk and DM Sans (SIL OFL).
//
//   node scripts/share-promos.mjs
//   node scripts/share-promos.mjs coindle skrumpey-slide
//   node scripts/share-promos.mjs --frames 30 skrumpey-slide

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, rmSync, writeFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/web/public/share");
const sheetDir = "/opt/cursor/artifacts/share-promos";
const names = ["arcade", "coindle", "uppers", "skip-to-10k", "skrumpey-slide", "two-places"];

const mounts = [
  ["/stage.html", join(root, "scripts/share-promos/stage.html")],
  ["/fonts/", join(root, "scripts/share-promos/fonts")],
  ["/skrumpey/", join(root, "cartridges/skrumpey-slide/assets/png")],
  ["/nuts/", join(root, "cartridges/skrumpey-slide/assets/nuts")],
  ["/skr-fonts/", join(root, "cartridges/skrumpey-slide/assets/fonts")],
  ["/coindle/", join(root, "cartridges/coindle/public")],
  ["/coins/", join(root, "scripts/share-promos/coins")],
  ["/sprites/skip.png", join(root, "cartridges/skip-to-10k/assets/sprites.png")],
  ["/sprites/two.png", join(root, "cartridges/two-places/assets/sprites.png")],
];

const types = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2", ".jpg": "image/jpeg" };

function contentType(file) {
  return types[extname(file)] ?? "application/octet-stream";
}

function resolveRequest(urlPath) {
  const path = decodeURIComponent(urlPath.split("?")[0]);
  for (const [prefix, target] of mounts) {
    if (prefix.endsWith("/")) {
      if (!path.startsWith(prefix)) continue;
      const rel = path.slice(prefix.length);
      if (!rel || rel.includes("..")) return null;
      const file = resolve(target, rel);
      if (!file.startsWith(resolve(target))) return null;
      return file;
    }
    if (path === prefix) return target;
  }
  if (path === "/") return mounts[0][1];
  return null;
}

function startServer() {
  const server = createServer((request, response) => {
    const file = resolveRequest(request.url ?? "/");
    if (!file || !existsSync(file)) {
      response.writeHead(404);
      response.end("missing");
      return;
    }
    response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
    response.end(readFileSync(file));
  });
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen(server));
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      last = `${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(200);
  }
  throw new Error(`Chrome debug port did not open (${last})`);
}

function connect(url) {
  const ws = new WebSocket(url);
  let next = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: done, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else done(message.result);
  });
  const ready = new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener("open", () => resolveOpen());
    ws.addEventListener("error", () => rejectOpen(new Error("CDP socket failed")));
  });
  return {
    ready,
    send(method, params = {}, timeoutMs = 30000) {
      const id = ++next;
      return new Promise((resolveSend, rejectSend) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectSend(new Error(`CDP timeout ${method}`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (value) => { clearTimeout(timer); resolveSend(value); },
          reject: (error) => { clearTimeout(timer); rejectSend(error); },
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { ws.close(); },
  };
}

async function evaluate(cdp, expression, timeoutMs) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error(details.exception?.description || details.text || JSON.stringify(details));
  }
  return result.result?.value;
}

function encode(frameDir, file, frames) {
  let last = "";
  for (const crf of ["20", "24", "28"]) {
    const result = spawnSync("ffmpeg", [
      "-y",
      "-framerate", "30",
      "-i", join(frameDir, "%04d.png"),
      "-frames:v", String(frames),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-profile:v", "high",
      "-crf", crf,
      "-preset", "medium",
      "-movflags", "+faststart",
      "-an",
      file,
    ], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "ffmpeg encode failed");
    last = crf;
    if (statSync(file).size <= 2_000_000) break;
  }
  return last;
}

function contactSheet(video, sheet) {
  const result = spawnSync("ffmpeg", [
    "-y",
    "-i", video,
    "-vf", "select='not(mod(n\\,15))',scale=320:-1,tile=5x2:padding=4:color=0x111111",
    "-frames:v", "1",
    "-fps_mode", "vfr",
    sheet,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "contact sheet failed");
}

const args = process.argv.slice(2);
const frameFlag = args.indexOf("--frames");
const frames = frameFlag >= 0 ? Number(args[frameFlag + 1]) : 150;
const stillFlag = args.indexOf("--still");
const still = stillFlag >= 0 ? Number(args[stillFlag + 1]) : null;
const only = args.filter((arg, index) => {
  if (arg === "--frames" || arg === "--still") return false;
  if (frameFlag >= 0 && index === frameFlag + 1) return false;
  if (stillFlag >= 0 && index === stillFlag + 1) return false;
  return true;
});
const clips = only.length ? only : names;
if (!Number.isFinite(frames) || frames < 1) throw new Error("--frames needs a positive number");
for (const name of clips) {
  if (!names.includes(name) && name !== "debug") throw new Error(`unknown clip ${name}`);
}

const server = await startServer();
const port = server.address().port;
const userData = `/tmp/chrome-promo-${process.pid}`;
const debugPort = 9222 + (process.pid % 1000);
rmSync(userData, { recursive: true, force: true });
const chrome = spawn("google-chrome", [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--hide-scrollbars",
  "--mute-audio",
  "--no-first-run",
  "--disable-extensions",
  `--remote-debugging-port=${debugPort}`,
  "--remote-debugging-address=127.0.0.1",
  `--user-data-dir=${userData}`,
  "--window-size=1280,720",
  "--force-device-scale-factor=1",
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
let chromeLog = "";
chrome.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });

try {
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const browser = connect(version.webSocketDebuggerUrl);
  await browser.ready;
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const pages = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page = pages.find((entry) => entry.id === created.targetId);
  if (!page?.webSocketDebuggerUrl) throw new Error("Chrome page target missing");
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/stage.html` });
  const report = await evaluate(cdp, "window.__ready", 120000);
  console.log(JSON.stringify(report));
  mkdirSync(sheetDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  for (const name of clips) {
    if (still !== null) {
      const frame = Math.min(149, Math.max(0, Math.round(still * 150)));
      await evaluate(cdp, `window.render(${JSON.stringify(name)}, ${frame}, 150)`);
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 },
      }, 20000);
      const stillFile = join(sheetDir, `still-${name}-${frame}.png`);
      writeFileSync(stillFile, Buffer.from(shot.data, "base64"));
      console.log(stillFile);
      continue;
    }
    const frameDir = `/tmp/share-promo-frames/${name}`;
    rmSync(frameDir, { recursive: true, force: true });
    mkdirSync(frameDir, { recursive: true });
    const posterFrame = await evaluate(cdp, `window.posterFrame(${JSON.stringify(name)}, ${frames})`);
    const started = Date.now();
    for (let frame = 0; frame < frames; frame++) {
      await evaluate(cdp, `window.render(${JSON.stringify(name)}, ${frame}, ${frames})`);
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1 },
      }, 20000);
      const png = Buffer.from(shot.data, "base64");
      writeFileSync(join(frameDir, `${String(frame).padStart(4, "0")}.png`), png);
      if (frame === posterFrame) writeFileSync(join(outDir, `${name}.png`), png);
      if (frame % 15 === 0) console.log(`${name} frame ${frame}/${frames}`);
    }
    const video = join(outDir, `${name}.mp4`);
    encode(frameDir, video, frames);
    const sheet = join(sheetDir, `${name}-sheet.png`);
    contactSheet(video, sheet);
    const bytes = statSync(video).size;
    console.log(`${name} ${bytes} bytes in ${((Date.now() - started) / 1000).toFixed(1)}s poster=${posterFrame} sheet=${sheet}`);
    rmSync(frameDir, { recursive: true, force: true });
  }
  cdp.close();
  browser.close();
} catch (error) {
  console.error(chromeLog.slice(-4000));
  throw error;
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
