import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { loadConfig } from '../../config.js';
import { buildMetaTags, escapeHtml, injectMeta } from './seo.js';
import { articleShellRouter } from './shellRoute.js';

const SHELL = '<html><head><title>News Portal</title>\n    <!--seo-meta-->\n</head><body><div id="root"></div></body></html>';
const BASE = 'https://news.example.com';
const row = (o = {}) => ({ slug: 'hello-world', title: 'Hello', summary: 'Sum', meta_title: null, meta_description: null, og_image_url: null, ...o });

test('escapeHtml neutralises a "><script> payload', () => {
  const out = buildMetaTags(row({ meta_title: '"><script>alert(1)</script>', meta_description: `'x" onload="y` }), BASE);
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&quot;&gt;&lt;script&gt;'));
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('fallbacks, truncation, canonical from PUBLIC_BASE_URL', () => {
  const out = buildMetaTags(row({ title: 'T'.repeat(100), summary: 'S'.repeat(400) }), BASE);
  assert.ok(out.includes(`<title>${'T'.repeat(70)}</title>`));
  assert.ok(out.includes(`content="${'S'.repeat(320)}"`));
  assert.ok(out.includes(`<link rel="canonical" href="${BASE}/articles/hello-world" />`));
});

test('og:image only for https URLs', () => {
  assert.ok(buildMetaTags(row({ og_image_url: 'https://cdn.x/a.png' }), BASE).includes('og:image'));
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://x/a.png']) {
    assert.ok(!buildMetaTags(row({ og_image_url: bad }), BASE).includes('og:image'));
  }
});

test('injectMeta replaces static title once and does not expand $ patterns', () => {
  const out = injectMeta(SHELL, buildMetaTags(row({ meta_title: 'Cost $& $1' }), BASE));
  assert.equal(out.match(/<title>/g).length, 1);
  assert.ok(out.includes('Cost $&amp; $1'));
  assert.ok(!out.includes('seo-meta'));
});

async function get(path, findBySlug) {
  const app = express().use(articleShellRouter({ shell: SHELL, baseUrl: BASE, findBySlug }));
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { res, text: await res.text() };
  } finally {
    server.close();
  }
}

test('published slug -> 200 with meta; unknown/draft -> 404 default shell', async () => {
  const find = async (s) => (s === 'hello-world' ? row() : null); // repo returns null for drafts
  const ok = await get('/articles/hello-world', find);
  assert.equal(ok.res.status, 200);
  assert.ok(ok.text.includes('og:title') && ok.text.includes('id="root"'));
  assert.equal(ok.res.headers.get('cache-control'), 'public, max-age=60');
  const miss = await get('/articles/draft-one', find);
  assert.equal(miss.res.status, 404);
  assert.ok(miss.text.includes('<title>News Portal</title>') && !miss.text.includes('seo-meta'));
  assert.equal((await get('/articles/Bad_Slug', find)).res.status, 404);
});

test('production config requires a valid PUBLIC_BASE_URL', () => {
  const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(32), MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://relay.example:587', MAIL_FROM: 'News <no-reply@n.example.com>' };
  assert.throws(() => loadConfig(prod), /PUBLIC_BASE_URL is required/);
  assert.throws(() => loadConfig({ ...prod, PUBLIC_BASE_URL: 'javascript:alert(1)' }), /PUBLIC_BASE_URL must be/);
  assert.equal(loadConfig({ ...prod, PUBLIC_BASE_URL: 'https://n.example.com/' }).publicBaseUrl, 'https://n.example.com');
});

test('empty PUBLIC_BASE_URL is unset (dev mail links fall back to the CORS origin, #22)', () => {
  const dev = { NODE_ENV: 'development', DATABASE_URL: 'postgres://x' };
  assert.equal(loadConfig({ ...dev, PUBLIC_BASE_URL: '' }).publicBaseUrl, undefined);
  assert.equal(loadConfig({ ...dev, PUBLIC_BASE_URL: '  ' }).publicBaseUrl, undefined);
  const prod = { ...dev, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32), MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://relay.example:587', MAIL_FROM: 'News <no-reply@n.example.com>' };
  assert.throws(() => loadConfig({ ...prod, PUBLIC_BASE_URL: '' }), /PUBLIC_BASE_URL is required/);
});
