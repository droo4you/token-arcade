import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.css': 'text/css; charset=utf-8',
};

export function start(port = 0, host = '127.0.0.1') {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = normalize(join(root, pathname));
      if (!file.startsWith(root) || pathname.split('/').some((part) => part === 'tests' || part === 'tools' || part === 'node_modules' || part.startsWith('.'))) {
        res.writeHead(404);
        res.end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile() || !types[extname(file)]) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((done) => {
    server.listen(port, host, () => {
      const address = server.address();
      done({
        url: `http://${host}:${address.port}/`,
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4178);
  const host = process.env.HOST || '127.0.0.1';
  start(port, host).then((site) => console.log(site.url));
}
