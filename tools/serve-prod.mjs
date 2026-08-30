// serve-prod.mjs — the static server behind the Cloudflare tunnel.
//
// serve.mjs is the dev one: it reads whole files into memory, answers every request
// with `no-store`, and has never heard of a byte range. That is fine on localhost and
// wrong on a public host for three reasons:
//
//   * Safari will not play an <audio> element from an origin that cannot answer a
//     Range request with a 206. Both soundtracks are served from here, so without
//     ranges the game is silent on every iPhone and half the Macs that open it.
//   * `no-store` makes every visitor re-download ~29 MB of models and audio on every
//     single load, including a reload after a crash.
//   * readFile() on a 4 MB mp3, per request, per visitor, is a lot of resident memory
//     on a box that is already running a dozen other things.
//
// So: streamed, ranged, cached, and bound to loopback only — cloudflared is the only
// thing that should ever reach it.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8047;
const host = process.env.HOST || '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

// index.html is the entry point and has to be re-fetched, or a deploy never reaches
// anyone who has already played. Everything else is content-addressed by mtime in its
// ETag, so it can be held for a good while and revalidated cheaply.
function cacheFor(file) {
  if (file.endsWith('.html')) return 'no-cache';
  if (/\.(glb|mp3|wav|png|jpe?g|ico|woff2)$/i.test(file)) return 'public, max-age=604800';
  return 'public, max-age=3600';
}

const send = (res, code, body = '') => { res.writeHead(code, { 'Content-Length': Buffer.byteLength(body) }); res.end(body); };

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    // normalize() has already flattened any ../, so this is the whole traversal check
    if (file !== root.replace(/\/$/, '') && !file.startsWith(root.endsWith(sep) ? root : root + sep)) {
      return send(res, 403, 'forbidden');
    }
    const st = await stat(file);
    if (st.isDirectory()) return send(res, 404, 'not found');

    const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    const headers = {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cacheFor(file),
      'Last-Modified': st.mtime.toUTCString(),
      ETag: etag,
      // Media needs this advertised, and the leaderboard lives in localStorage, so
      // nothing here is cross-origin anyway.
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    };

    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }

    // ---- byte ranges, which is what makes the audio work ----
    const range = req.headers.range;
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      let start, end;
      if (m[1]) { start = Number(m[1]); end = m[2] ? Number(m[2]) : st.size - 1; }
      else { start = st.size - Number(m[2]); end = st.size - 1; }   // suffix range
      start = Math.max(0, start);
      end = Math.min(st.size - 1, end);
      if (start > end || Number.isNaN(start) || Number.isNaN(end)) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1,
      });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(file, { start, end }).pipe(res);
    }

    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'not found');
  }
});

server.listen(port, host, () => {
  console.log(`Departure Bay Speedway serving ${root} on http://${host}:${port}`);
});
