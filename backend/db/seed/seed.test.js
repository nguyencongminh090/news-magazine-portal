import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../migrate.js';
import { assertSeedAllowed, seed, seededRandom, slugify, summarize } from './seed.js';
import { anonymousUser } from './fetch-wikinews.js';

const testDb = process.env.TEST_DATABASE_URL;

test('slugify produces valid, bounded slugs', () => {
  assert.equal(slugify('Café: "Big" news — today!'), 'cafe-big-news-today');
  assert.match(slugify('word '.repeat(60)), /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(slugify('word '.repeat(60)).length <= 80);
});

test('seededRandom is deterministic per seed', () => {
  assert.equal(seededRandom('a')(), seededRandom('a')());
  assert.notEqual(seededRandom('a')(), seededRandom('b')());
});

test('summarize keeps whole leading sentences within the cap', () => {
  const text = 'First sentence here. Second one follows. ' + 'Long tail. '.repeat(50);
  const summary = summarize(text, 45);
  assert.equal(summary, 'First sentence here. Second one follows.');
});

test('seed is idempotent', { skip: !testDb }, async () => {
  const client = new pg.Client({ connectionString: testDb });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(testDb);
    const articles = [
      { title: 'A story', category: 'Politics', author: 'Reporter', publishedAt: '2026-01-02T03:04:05Z', tags: ['Iran', 'Oil'], content: 'One. Two. Three.' },
      { title: 'A story', category: 'Sports', author: 'Other', publishedAt: '2026-01-03T03:04:05Z', tags: ['Iran'], content: 'Four. Five.' },
    ];
    await seed(testDb, articles);
    const count = async (sql) => Number((await client.query(sql)).rows[0].n);
    const before = [
      await count('SELECT count(*) n FROM documents'),
      await count('SELECT count(*) n FROM tags'),
      await count('SELECT count(*) n FROM document_tags'),
      await count('SELECT count(*) n FROM user_roles'),
    ];
    await seed(testDb, articles);
    const after = [
      await count('SELECT count(*) n FROM documents'),
      await count('SELECT count(*) n FROM tags'),
      await count('SELECT count(*) n FROM document_tags'),
      await count('SELECT count(*) n FROM user_roles'),
    ];
    assert.deepEqual(after, before);
    assert.deepEqual(before, [2, 2, 3, 5]); // duplicate title got a distinct slug
  } finally {
    await client.end();
  }
});

test('seed refuses production unless explicitly overridden', async () => {
  assert.throws(() => assertSeedAllowed({ NODE_ENV: 'production' }), /Refusing to seed/);
  await assert.rejects(seed('postgres://unused', [], { env: { NODE_ENV: 'production' } }), /Refusing to seed/);
  assert.doesNotThrow(() => assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: '1' }));
  assert.doesNotThrow(() => assertSeedAllowed({ NODE_ENV: 'development' }));
  assert.doesNotThrow(() => assertSeedAllowed({}));
});

test('anonymousUser flags IP editors only', () => {
  assert.equal(anonymousUser('192.168.1.10'), true);
  assert.equal(anonymousUser('2001:db8::ff00:42:8329'), true);
  assert.equal(anonymousUser('2001:DB8:0:0:0:0:0:1'), true);
  assert.equal(anonymousUser('Jane Doe'), false);
  assert.equal(anonymousUser('Bot123'), false);
  assert.equal(anonymousUser('1.2.3.4abc'), false);
});

test('seed rerun keeps views_count that changed after the first seed', { skip: !testDb }, async () => {
  const client = new pg.Client({ connectionString: testDb });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(testDb);
    const articles = [{ title: 'Counted', category: 'Politics', author: 'R', publishedAt: '2026-01-02T03:04:05Z', tags: [], content: 'One. Two.' }];
    await seed(testDb, articles);
    await client.query(`UPDATE documents SET views_count = 123456 WHERE slug = 'counted'`);
    await seed(testDb, [{ ...articles[0], content: 'Changed body. Two.' }]);
    const { rows } = await client.query(`SELECT views_count, content FROM documents WHERE slug = 'counted'`);
    assert.equal(Number(rows[0].views_count), 123456);
    assert.equal(rows[0].content, 'Changed body. Two.'); // other columns still update
  } finally {
    await client.end();
  }
});
