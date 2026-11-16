import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateTarget, cacheKeyFor, handle, HttpError } from '../worker/worker.js';
import { fixtureHtml } from './helpers.js';

describe('validateTarget', () => {
  test('povolí chess-results a subdomény', () => {
    assert.equal(validateTarget('https://chess-results.com/tnr1495793.aspx?lan=1&art=2&rd=7').hostname, 'chess-results.com');
    assert.equal(validateTarget('https://s2.chess-results.com/tnr1.aspx').hostname, 's2.chess-results.com');
    assert.equal(validateTarget('http://chess-results.com/tnr1.aspx').protocol, 'https:');
  });
  test('odmítne cizí domény a triky', () => {
    for (const bad of [
      'https://evil.com/tnr1.aspx',
      'https://chess-results.com.evil.com/tnr1.aspx',
      'https://evilchess-results.com/tnr1.aspx',
      'https://user:pw@chess-results.com/tnr1.aspx',
      'https://chess-results.com:8443/tnr1.aspx',
      'ftp://chess-results.com/tnr1.aspx',
      'https://chess-results.com/../../etc/passwd',
      'https://chess-results.com/admin/secret.php',
      'nesmysl',
      '',
    ]) {
      assert.throws(() => validateTarget(bad), HttpError, bad);
    }
  });
  test('klíč cache ignoruje SNode a server', () => {
    const a = cacheKeyFor(validateTarget('https://s1.chess-results.com/tnr5.aspx?lan=1&art=2&SNode=S0'));
    const b = cacheKeyFor(validateTarget('https://chess-results.com/tnr5.aspx?art=2&lan=1'));
    assert.equal(a, b);
  });
});

describe('handle (s podvrženým fetch)', () => {
  let realFetch;
  let calls;
  beforeEach(() => {
    realFetch = globalThis.fetch;
    calls = [];
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  const req = (url, init = {}) => new Request(url, { headers: { Origin: 'https://example.github.io' }, ...init });

  test('přidá CORS hlavičky a vrátí HTML', async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response('<html>ok</html>', { status: 200 });
    };
    const res = await handle(req('https://proxy.test/?url=' + encodeURIComponent('https://chess-results.com/tnr1.aspx?lan=1')));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(await res.text(), '<html>ok</html>');
    assert.equal(calls.length, 1);
  });

  test('následuje přesměrování jen v rámci chess-results', async () => {
    globalThis.fetch = async (url) => {
      calls.push(url);
      if (calls.length === 1) return new Response('', { status: 302, headers: { Location: 'https://s1.chess-results.com/tnr1.aspx?lan=1&SNode=S0' } });
      return new Response('cil', { status: 200 });
    };
    const res = await handle(req('https://proxy.test/?url=' + encodeURIComponent('https://chess-results.com/tnr1.aspx?lan=1')));
    assert.equal(await res.text(), 'cil');
    assert.match(res.headers.get('X-Proxy-Final-Url'), /s1\.chess-results\.com/);
  });

  test('odmítne přesměrování mimo chess-results', async () => {
    globalThis.fetch = async () => new Response('', { status: 302, headers: { Location: 'https://evil.com/x' } });
    const res = await handle(req('https://proxy.test/?url=' + encodeURIComponent('https://chess-results.com/tnr1.aspx')));
    assert.equal(res.status, 403);
  });

  test('starý turnaj: odešle postback pro zobrazení detailů', async () => {
    const hidden = '<form><input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc" />'
      + '<input type="submit" value="Show tournament details" id="cb_alleDetails" name="cb_alleDetails" /></form>';
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      if (!init.method || init.method === 'GET') return new Response(hidden, { status: 200 });
      return new Response('<html>detaily</html>', { status: 200 });
    };
    const res = await handle(req('https://proxy.test/?url=' + encodeURIComponent('https://chess-results.com/tnr1.aspx?art=2&rd=1')));
    assert.equal(await res.text(), '<html>detaily</html>');
    assert.equal(calls[1].init.method, 'POST');
    assert.match(calls[1].init.body, /__VIEWSTATE=abc/);
    assert.match(calls[1].init.body, /cb_alleDetails=Show\+tournament\+details/);
  });

  test('ALLOWED_ORIGINS omezí přístup', async () => {
    globalThis.fetch = async () => new Response('x');
    const env = { ALLOWED_ORIGINS: 'https://moje.github.io' };
    const bad = await handle(req('https://proxy.test/?url=' + encodeURIComponent('https://chess-results.com/tnr1.aspx')), env);
    assert.equal(bad.status, 403);
    const ok = await handle(new Request('https://proxy.test/?url=' + encodeURIComponent('https://chess-results.com/tnr1.aspx'), { headers: { Origin: 'https://moje.github.io' } }), env);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://moje.github.io');
  });

  test('jiné metody než GET odmítne, OPTIONS projde', async () => {
    const post = await handle(req('https://proxy.test/?url=x', { method: 'POST', body: 'a' }));
    assert.equal(post.status, 405);
    const opt = await handle(req('https://proxy.test/', { method: 'OPTIONS' }));
    assert.equal(opt.status, 204);
  });

  test('skutečná stránka projde beze změny', async () => {
    const html = fixtureHtml('swiss-pairings-r7');
    globalThis.fetch = async () => new Response(html, { status: 200 });
    const res = await handle(req('https://proxy.test/?url=' + encodeURIComponent('https://chess-results.com/tnr1495793.aspx?lan=1&art=2&rd=7')));
    assert.equal((await res.text()).length, html.length);
  });
});

describe('wrangler.toml', () => {
  test('proxy je omezená na appku (ne "*") a zahrnuje GitHub Pages i lokální vývoj', async () => {
    const { readFileSync } = await import('node:fs');
    const toml = readFileSync(new URL('../worker/wrangler.toml', import.meta.url), 'utf8');
    const m = toml.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m);
    assert.ok(m, 'ALLOWED_ORIGINS chybí');
    const list = m[1].split(',').map((s) => s.trim());
    assert.ok(!list.includes('*'), 'ALLOWED_ORIGINS nesmí být "*"');
    assert.ok(list.includes('https://slivam24.github.io'));
    assert.ok(list.includes('http://localhost:8787'));
    assert.match(toml, /^name\s*=\s*"chess-print-proxy"/m);
  });
});
