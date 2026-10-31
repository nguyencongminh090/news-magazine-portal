import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../migrate.js';
import { seed, seededRandom, slugify, summarize } from './seed.js';

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
    assert.deepEqual(before, [2, 2, 3, 4]); // duplicate title got a distinct slug
  } finally {
    await client.end();
  }
});
