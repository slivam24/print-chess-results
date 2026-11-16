// Cloudflare Worker – CORS proxy pro chess-results.com
// ---------------------------------------------------------------
// Použití:  GET https://<worker>.workers.dev/?url=<zakódovaná URL chess-results>
//           volitelně &fresh=1  → obejde cache (tlačítko „Aktualizovat data“)
//
// Bezpečnost:
//   * povolené jsou jen domény chess-results.com a její subdomény (s1, s2, …),
//   * jen metoda GET (a OPTIONS pro preflight),
//   * volitelně omezení na stránky appky přes proměnnou ALLOWED_ORIGINS,
//   * odpovědi se krátce cachují (CACHE_SECONDS, výchozí 60 s).
//
// Staré turnaje (víc než 2 týdny po skončení) skrývají detaily za tlačítkem
// „Show tournament details“. Worker to pozná a automaticky odešle postback,
// takže appka dostane plnou stránku.

const ALLOWED_HOST = /^(?:[a-z0-9-]+\.)*chess-results\.com$/i;
const ALLOWED_PATH = /^\/(?:tnr\d+\.aspx|[A-Za-z]+\.aspx)$/i;
const DEFAULT_CACHE_SECONDS = 60;
const MAX_REDIRECTS = 5;
const UA = 'Mozilla/5.0 (compatible; chess-print-proxy/1.0; +https://github.com/)';

/** Ověří cílovou URL. Vrací URL objekt nebo vyhodí chybu se zprávou. */
export function validateTarget(raw) {
  if (!raw) throw new HttpError(400, 'Chybí parametr url.');
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, 'Neplatná URL.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Povolen je jen http/https.');
  if (!ALLOWED_HOST.test(u.hostname)) throw new HttpError(403, 'Povolena je jen doména chess-results.com.');
  if (u.username || u.password) throw new HttpError(400, 'URL nesmí obsahovat přihlašovací údaje.');
  if (u.port && u.port !== '443' && u.port !== '80') throw new HttpError(400, 'Nestandardní port není povolen.');
  if (!ALLOWED_PATH.test(u.pathname)) throw new HttpError(403, 'Tato stránka chess-results není povolena.');
  u.protocol = 'https:';
  u.hash = '';
  return u;
}

/** Normalizovaný klíč do cache (bez SNode a s jednotným hostem). */
export function cacheKeyFor(u) {
  const k = new URL(u.toString());
  k.searchParams.delete('SNode');
  k.searchParams.sort();
  k.hostname = 'chess-results.com';
  return `https://chess-results-proxy.cache${k.pathname}?${k.searchParams.toString()}`;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function originAllowed(origin, env) {
  const list = String((env && env.ALLOWED_ORIGINS) || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.includes('*')) return true;
  if (!origin) return false;
  return list.includes(origin);
}

function corsHeaders(origin, env) {
  const list = String((env && env.ALLOWED_ORIGINS) || '*');
  return {
    'Access-Control-Allow-Origin': list.trim() === '*' ? '*' : origin || 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Proxy-Fetched-At, X-Proxy-Cache, X-Proxy-Final-Url',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** GET s ručním sledováním přesměrování – každý skok musí zůstat na chess-results. */
async function fetchFollow(url, init = {}) {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(current.toString(), { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current);
      validateTarget(next.toString());
      current = next;
      // Po přesměrování POST → GET (chování prohlížeče u 302/303)
      if (init.method === 'POST' && (res.status === 302 || res.status === 303)) {
        init = { headers: init.headers };
      }
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new HttpError(502, 'Příliš mnoho přesměrování.');
}

function hiddenField(html, name) {
  const re = new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i');
  const m = html.match(re);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : '';
}

/** Starý turnaj: odešle formulář „Show tournament details“. */
async function revealDetails(html, finalUrl, headers) {
  const button = html.match(/<input[^>]*name="cb_alleDetails"[^>]*value="([^"]*)"/i)
    || html.match(/<input[^>]*value="([^"]*)"[^>]*name="cb_alleDetails"/i);
  if (!button) return null;
  const body = new URLSearchParams();
  for (const f of ['__EVENTTARGET', '__EVENTARGUMENT', '__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) {
    body.set(f, hiddenField(html, f));
  }
  body.set('cb_alleDetails', button[1]);
  const { res } = await fetchFollow(finalUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return null;
  return res.text();
}

export async function handle(request, env = {}, ctx = {}) {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, env);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const reply = (status, body, extra = {}) =>
    new Response(body, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', ...extra } });

  try {
    if (request.method !== 'GET') throw new HttpError(405, 'Povolena je jen metoda GET.');
    if (!originAllowed(origin, env)) throw new HttpError(403, 'Tento web nemá k proxy přístup (ALLOWED_ORIGINS).');

    const reqUrl = new URL(request.url);
    if (reqUrl.pathname === '/health' || (!reqUrl.searchParams.has('url') && reqUrl.pathname === '/')) {
      return reply(200, 'chess-print proxy OK');
    }
    const target = validateTarget(reqUrl.searchParams.get('url'));
    const fresh = reqUrl.searchParams.get('fresh') === '1';
    const ttl = Number(env.CACHE_SECONDS) > 0 ? Number(env.CACHE_SECONDS) : DEFAULT_CACHE_SECONDS;

    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const key = new Request(cacheKeyFor(target), { method: 'GET' });
    if (cache && !fresh) {
      const hit = await cache.match(key);
      if (hit) {
        const r = new Response(hit.body, hit);
        for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
        r.headers.set('X-Proxy-Cache', 'HIT');
        return r;
      }
    }

    const headers = {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en,cs;q=0.8',
    };
    const { res, finalUrl } = await fetchFollow(target, { headers });
    if (!res.ok) throw new HttpError(502, `chess-results vrátil chybu ${res.status}.`);
    let html = await res.text();
    if (html.length > 8_000_000) throw new HttpError(502, 'Odpověď je příliš velká.');
    if (/name="cb_alleDetails"/i.test(html)) {
      const revealed = await revealDetails(html, finalUrl, headers);
      if (revealed) html = revealed;
    }

    const out = new Response(html, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}`,
        'X-Proxy-Fetched-At': new Date().toISOString(),
        'X-Proxy-Cache': fresh ? 'BYPASS' : 'MISS',
        'X-Proxy-Final-Url': finalUrl.toString(),
      },
    });
    if (cache) {
      const toCache = out.clone();
      const p = cache.put(key, toCache);
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
    }
    return out;
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 502;
    return reply(status, e instanceof HttpError ? e.message : `Chyba proxy: ${e && e.message}`);
  }
}

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
};
