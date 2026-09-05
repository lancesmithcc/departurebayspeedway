import {createMultiplayerHandler} from './multiplayer-server.mjs';
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
import { createReadStream, readdirSync, statSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8047;
const host = process.env.HOST || '127.0.0.1';

// ---- the version in the URL ----
// A deploy that changes the code is worthless if the CDN keeps handing out the old
// copy, and that is exactly what happened the first time: index.html came back fresh
// (it is no-cache) while `/src/main.js` was a four-hour-old HIT that had never heard
// of the file it was supposed to import. Purging by hand after every deploy is a step
// that will be forgotten.
//
// So the module graph is served under `/v/<token>/…` where the token is a hash of the
// source tree. Change any file and every URL in the graph changes with it — relative
// imports inside a module resolve against the module's own versioned URL, so the whole
// tree moves at once. Nothing has to be purged, ever, and because a given URL can now
// only ever mean one thing, it can be cached hard instead of revalidated.
//
// The token is computed once at boot, which is the right granularity: the service is
// restarted by the deploy that changes the files.
function sourceVersion() {
  const h = createHash('sha1');
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else h.update(`${full}:${st.size}:${st.mtimeMs}`);
    }
  };
  try {
    walk(join(root, 'src'));
    h.update(readFileSync(join(root, 'index.html')));
  } catch { /* missing tree: fall back to a per-boot token */ }
  return h.digest('hex').slice(0, 12);
}
const VERSION = sourceVersion();

// index.html is small, always revalidated, and the one place the entry URL is written,
// so the version is stamped into it on the way out rather than committed to the repo.
function indexHtml() {
  const raw = readFileSync(join(root, 'index.html'), 'utf8');
  return Buffer.from(raw.replace('src="./src/main.js"', `src="/v/${VERSION}/src/main.js"`), 'utf8');
}

const types = {
  '.xml': 'application/xml; charset=utf-8',
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
function cacheFor(file, versioned) {
  if (file.endsWith('.html')) return 'no-cache';
  // A versioned URL can only ever mean one thing, so it is safe to keep forever.
  if (versioned) return 'public, max-age=31536000, immutable';
  if (/\.(glb|mp3|wav|png|jpe?g|ico|woff2)$/i.test(file)) return 'public, max-age=604800';
  // Code reached without a version has to be revalidated every time — the ETag makes
  // that a 304 and a few bytes, and it is what stops a stale deploy going unnoticed.
  if (/\.(m?js|json|css)$/i.test(file)) return 'no-cache';
  return 'public, max-age=3600';
}

const send = (res, code, body = '') => { res.writeHead(code, { 'Content-Length': Buffer.byteLength(body) }); res.end(body); };

const multiplayerHandler = createMultiplayerHandler({maxPlayers:7});
const server = createServer(async (req, res) => {
  if (await multiplayerHandler(req,res)) return;
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    // `/v/<token>/src/game.js` is the same file as `/src/game.js`; the token is only
    // there to make the URL change when the code does. Any token is accepted, so an
    // old page that is still running keeps working off its own version's URLs.
    let versioned = false;
    const vm = /^\/v\/[0-9a-f]{6,64}(\/.*)$/.exec(p);
    if (vm) { versioned = true; p = vm[1]; }
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
      'Cache-Control': cacheFor(file, versioned),
      'Last-Modified': st.mtime.toUTCString(),
      ETag: etag,
      // Media needs this advertised, and the leaderboard lives in localStorage, so
      // nothing here is cross-origin anyway.
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    };

    // ---- the entry document ----
    // The version is stamped into it here rather than committed, so nothing in the
    // repo has to know about the deploy it is part of. Rewritten means it cannot be
    // streamed, which is fine at 15 KB and is why it gets its own length and ETag.
    if (file.endsWith('index.html')) {
      const body = indexHtml();
      const htmlTag = `W/"${body.length.toString(16)}-${VERSION}"`;
      const h = { ...headers, ETag: htmlTag, 'Content-Length': body.length };
      if (req.headers['if-none-match'] === htmlTag) { res.writeHead(304, h); return res.end(); }
      res.writeHead(200, h);
      return res.end(req.method === 'HEAD' ? undefined : body);
    }

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
  console.log(`Departure Bay Speedway serving ${root} on http://${host}:${port} (v${VERSION})`);
});
