// Zero-dependency static server for local play.
//   node tools/serve.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon'
};

// Route /api/* to the same handler files Vercel runs, so local play exercises the
// real endpoints instead of a mock. Handlers are required lazily and uncached, so
// editing one takes effect on the next request without restarting the server.
const API_ROUTES = {
  '/api/daily/start': '../api/daily/start.js',
  '/api/run/submit': '../api/run/submit.js',
  '/api/board': '../api/board.js',
  '/api/auth': '../api/auth.js',
  '/api/window/state': '../api/window/state.js',
  '/api/window/start': '../api/window/start.js'
};

function vercelRes(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function handleApi(route, req, res) {
  const file = path.join(__dirname, API_ROUTES[route]);
  delete require.cache[require.resolve(file)];
  try {
    await require(file)(req, vercelRes(res));
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'handler threw', detail: String(e && e.stack || e) }));
    }
    console.error('[api] ' + route + ': ' + (e && e.stack || e));
  }
}

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);

  if (Object.prototype.hasOwnProperty.call(API_ROUTES, rel)) {
    handleApi(rel, req, res);
    return;
  }

  if (rel === '/') rel = '/index.html';

  const file = path.join(ROOT, rel);
  // keep requests inside the project directory
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // always re-read from disk so a refresh shows the edit you just made
      'cache-control': 'no-store'
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('Buy Bounce on http://localhost:' + PORT);
  console.log('Ctrl+C to stop.');
});
