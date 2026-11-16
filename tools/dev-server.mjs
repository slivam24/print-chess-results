#!/usr/bin/env node
// Lokální vývojový server: statické soubory appky + proxy (stejný kód jako Cloudflare Worker).
// Spuštění:  npm run dev   →  http://localhost:8787  (proxy: http://localhost:8787/proxy)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../worker/worker.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 8787;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/proxy' || url.pathname.startsWith('/proxy/')) {
      const request = new Request(`http://localhost:${port}/${url.search}`, { method: req.method, headers: { Origin: req.headers.origin || '' } });
      const r = await handle(request, { ALLOWED_ORIGINS: '*' }, {});
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      console.log(`proxy ${r.status} ${url.searchParams.get('url')}`);
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!path || path.endsWith('/')) path += 'index.html';
    const file = join(root, path);
    if (!file.startsWith(root) || /(^|[/\\])(node_modules|\.git)([/\\]|$)/.test(path)) throw Object.assign(new Error('forbidden'), { code: 403 });
    const s = await stat(file);
    if (!s.isFile()) throw Object.assign(new Error('nf'), { code: 404 });
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(e.code === 403 ? 403 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(e.code === 403 ? 'Zakázáno' : 'Nenalezeno');
  }
}).listen(port, () => console.log(`Šachový tisk: http://localhost:${port}  (proxy: http://localhost:${port}/proxy)`));
