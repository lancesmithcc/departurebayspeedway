// serve.mjs — static file server with no caching (dev)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.css': 'text/css', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

// If the preferred port is taken (e.g. a server is already running), step up
// instead of dying with an unhandled EADDRINUSE.
const first = Number(process.env.PORT) || 8043;
let port = first;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && port < first + 10) {
    console.warn(`port ${port} busy, trying ${port + 1}…`);
    server.listen(++port);
  } else {
    console.error(err.message);
    process.exit(1);
  }
});
server.listen(port, () => {
  console.log(`\n  Departure Bay Speedway → http://localhost:${port}\n  (open that URL in a browser; do NOT open index.html directly)\n`);
});
