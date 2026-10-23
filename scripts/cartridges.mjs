import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('cartridges');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
export function createCartridgeServer() {
  const hosts = (process.env.ARCADE_HOST_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8787,http://localhost:8787').split(',').map(s => new URL(s.trim()).origin);
  return createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', `frame-ancestors ${hosts.join(' ')}; object-src 'none'; base-uri 'self'`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin');
    try {
      const url = new URL(req.url, 'http://localhost');
      const rapid = /^\/api\/coindle\/rapid\/[0-9a-f-]{36}\/(start|state|guess|skip|finish)$/.exec(url.pathname);
      if (rapid) {
        // Rapid Fire judge: forwarded as-is (bounded body), no cookies or auth headers.
        const method = rapid[1] === 'state' ? 'GET' : 'POST';
        if (req.method !== method) { res.writeHead(405); res.end(); return; }
        let body = '';
        if (method === 'POST') for await (const chunk of req) { body += chunk; if (body.length > 1024) { res.writeHead(413); res.end(); return; } }
        const reply = await fetch(new URL(url.pathname, process.env.ARCADE_API_ORIGIN || 'http://127.0.0.1:8787'), {
          method, signal: AbortSignal.timeout(12_000), ...(method === 'POST' ? { body: body || '{}', headers: { 'Content-Type': 'application/json' } } : {}),
        });
        res.writeHead(reply.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(await reply.text()); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
      if (/^\/api\/coindle\/(prices|live|history)$/.test(url.pathname)) {
        if (url.search.length > 8192) { res.writeHead(400); res.end(); return; }
        const upstream = new URL(url.pathname + url.search, process.env.ARCADE_API_ORIGIN || 'http://127.0.0.1:8787');
        const reply = await fetch(upstream, { signal: AbortSignal.timeout(12_000) });
        res.writeHead(reply.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(await reply.text()); return;
      }
      if (url.pathname === '/sdk/hosts.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(`window.TA_HOST_ORIGINS=${JSON.stringify(hosts)};`); return; }
      let file;
      if (url.pathname === '/sdk/bridge.js') file = resolve('packages/sdk/browser/bridge.js');
      else {
        const match = /^\/([a-z0-9-]+)\/v\/(1\.0\.0|1\.1\.0|1\.2\.0)\/(.*)$/.exec(decodeURIComponent(url.pathname));
        if (!match || !/^[a-z0-9-]+$/.test(match[1])) { res.writeHead(404); res.end('Cartridge not found'); return; }
        if (match[2] !== '1.0.0' && match[1] !== 'skrumpey-slide') { res.writeHead(404); res.end('Cartridge version not found'); return; }
        const requested = match[3] || (match[1] === 'coindle' ? 'index.html' : 'arcade.html');
        // Legacy entry points and executable files stay frozen. Art assets are shared
        // unchanged between these two releases; never fall back for executable files.
        const frozen = match[1] === 'skrumpey-slide' && !requested.startsWith('assets/');
        const gameRoot = resolve(root, match[1], frozen ? `releases/${match[2]}` : match[1] === 'coindle' ? 'arcade-dist' : '.');
        if (requested.includes('\\') || requested.split('/').some(p => p.startsWith('.') || ['tools', 'tests', 'test', 'api', 'node_modules'].includes(p.toLowerCase()))) { res.writeHead(404); res.end(); return; }
        file = resolve(gameRoot, requested);
        if (!file.startsWith(gameRoot + sep) || !types[extname(file)]) { res.writeHead(404); res.end(); return; }
      }
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch { res.writeHead(404); res.end('Cartridge asset not found'); }
  });
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.CARTRIDGE_PORT || 8788);
  // CARTRIDGE_HOST=0.0.0.0 is for container hosting only (cartridge origin has no auth surface).
  const host = process.env.CARTRIDGE_HOST || '127.0.0.1';
  createCartridgeServer().listen(port, host, () => console.log(`Cartridges: http://${host}:${port}`));
}
