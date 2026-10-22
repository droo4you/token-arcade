// Local-only comparison; frozen published cartridges and verifier remain unchanged.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const base = resolve('cartridges/skrumpey-slide');
const host = process.env.PREVIEW_HOST || '127.0.0.1';
const port = Number(process.env.PREVIEW_PORT || 8797);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.json': 'application/json' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const match = /^\/(preview|1\.0\.0|1\.1\.0)\/(.*)$/.exec(decodeURIComponent(url.pathname));
    if (!match || req.method !== 'GET') { res.writeHead(404).end(); return; }
    const name = match[2] || 'index.html';
    if (name.includes('\\') || name.split('/').some(p => p.startsWith('.'))) { res.writeHead(404).end(); return; }
    const root = match[1] === 'preview' || name.startsWith('assets/') ? base : resolve(base, 'releases', match[1]);
    const file = resolve(root, name);
    if (!file.startsWith(root + sep) || !types[extname(file)]) { res.writeHead(404).end(); return; }
    let body = await readFile(file);
    if (name === 'index.html') body = Buffer.from(body.toString().replace('</body>', `<div style="position:fixed;bottom:0;left:0;z-index:9999;background:#121212;color:white;font:12px monospace;padding:6px">LOCAL PLAYTEST · ${match[1]} · scores are not submitted · <a style="color:#6ff" href="/preview/?seed=1800810676">Preview</a> / <a style="color:#6ff" href="/1.1.0/?seed=1800810676">Raid version</a></div></body>`));
    res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(port, host, () => console.log(`Flow preview: http://${host}:${port}/preview/?seed=1800810676`));
