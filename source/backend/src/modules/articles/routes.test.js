import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';
import { initPool, closePool, query } from '../../db.js';
import { migrate } from '../../../db/migrate.js';
import { toArticlePayload } from './payload.js';
import * as realRepo from './repo.js';
import * as realCategories from '../categories/repo.js';

const testDb = process.env.TEST_DATABASE_URL;

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

const row = (o = {}) => ({
  id: 1, slug: 'a-story', title: 'A story', summary: 'Sum', published_at: '2026-01-02T00:00:00Z',
  author_name: 'Reporter', category_slug: 'politics', category_name: 'Politics', tags: ['Oil'], ...o,
});

function fakeApp({ list, find, cats } = {}) {
  const calls = {};
  const app = createApp({
    articles: {
      repo: {
        listPublished: async (a) => ((calls.list = a), list ?? { rows: [row()], total: 1 }),
        findPublishedBySlug: async (s) => ((calls.find = s), find === undefined ? row({ body: 'Full text' }) : find),
      },
    },
    categories: { repo: { listWithCounts: async () => cats ?? [{ id: 1, slug: 'politics', name: 'Politics', article_count: '3' }] } },
  });
  return { app, calls };
}

test('payload: list row has no body; detail row has body', () => {
  assert.ok(!('body' in toArticlePayload(row())));
  assert.equal(toArticlePayload(row({ body: 'x' })).body, 'x');
  assert.deepEqual(toArticlePayload(row()).category, { slug: 'politics', name: 'Politics' });
});

test('GET /api/articles: defaults, filters passed through, envelope', async () => {
  const { app, calls } = fakeApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/articles?category=politics&q=oil&page=2&pageSize=5`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(calls.list, { page: 2, pageSize: 5, category: 'politics', q: 'oil' });
    assert.equal(body.total, 1);
    assert.equal(body.items[0].slug, 'a-story');
    assert.ok(!('body' in body.items[0]));
  });
});

test('GET /api/articles: invalid query -> 422; page size capped; unknown param rejected', async () => {
  await withServer(fakeApp().app, async (base) => {
    for (const qs of ['pageSize=51', 'page=0', 'category=Bad Slug', 'q=', 'status=draft']) {
      const res = await fetch(`${base}/api/articles?${qs}`);
      assert.equal(res.status, 422, qs);
      assert.match(res.headers.get('content-type'), /problem\+json/);
    }
  });
});

test('GET /api/articles/:slug: 200 with body, 404 unknown, 422 bad slug', async () => {
  await withServer(fakeApp().app, async (base) => {
    const ok = await fetch(`${base}/api/articles/a-story`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).body, 'Full text');
    assert.equal((await fetch(`${base}/api/articles/BAD_SLUG`)).status, 422);
  });
  await withServer(fakeApp({ find: null }).app, async (base) => {
    const res = await fetch(`${base}/api/articles/missing`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /problem\+json/);
  });
});

test('GET /api/categories returns counts as numbers', async () => {
  await withServer(fakeApp().app, async (base) => {
    const body = await (await fetch(`${base}/api/categories`)).json();
    assert.deepEqual(body.items, [{ id: 1, slug: 'politics', name: 'Politics', articleCount: 3 }]);
  });
});

test('read limiter returns 429 problem+json when exceeded', async () => {
  const { limiter } = await import('../../http/rateLimit.js');
  const app = createApp({ categories: { repo: { listWithCounts: async () => [] }, readLimit: limiter({ windowMs: 60_000, limit: 1 }) } });
  await withServer(app, async (base) => {
    assert.equal((await fetch(`${base}/api/categories`)).status, 200);
    assert.equal((await fetch(`${base}/api/categories`)).status, 429);
  });
});

test('SQL against real DB: drafts hidden, filters, search escaping, counts', { skip: !testDb }, async () => {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: testDb });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await c.end();
  await migrate(testDb);
  initPool({ databaseUrl: () => testDb, db: { max: 2, connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, statementTimeoutMs: 5000 } });
  try {
    await query(`INSERT INTO categories (name, slug) VALUES ('Politics','politics'), ('Sports','sports')`);
    await query(`INSERT INTO documents (title, slug, summary, content, category_id, author_name, status, published_at) VALUES
      ('Pub one','pub-one','about oil','Body 1',(SELECT id FROM categories WHERE slug='politics'),'A','published',now()),
      ('100% real','pct','s','Body 2',(SELECT id FROM categories WHERE slug='sports'),'A','published',now() - interval '1 day'),
      ('Secret draft','draft-one','s','Body 3',(SELECT id FROM categories WHERE slug='politics'),'A','draft',NULL)`);
    assert.equal((await realRepo.listPublished({ page: 1, pageSize: 20 })).total, 2);
    assert.equal((await realRepo.listPublished({ page: 1, pageSize: 20, category: 'politics' })).rows.length, 1);
    assert.equal((await realRepo.listPublished({ page: 1, pageSize: 20, q: 'OIL' })).rows[0].slug, 'pub-one');
    assert.equal((await realRepo.listPublished({ page: 1, pageSize: 20, q: '%' })).rows.length, 1); // literal %, not wildcard
    assert.equal((await realRepo.listPublished({ page: 1, pageSize: 20, q: 'draft' })).rows.length, 0);
    assert.equal(await realRepo.findPublishedBySlug('draft-one'), null);
    assert.equal((await realRepo.findPublishedBySlug('pub-one')).body, 'Body 1');
    const counts = Object.fromEntries((await realCategories.listWithCounts()).map((r) => [r.slug, Number(r.article_count)]));
    assert.deepEqual(counts, { politics: 1, sports: 1 });
  } finally {
    await closePool();
  }
});
