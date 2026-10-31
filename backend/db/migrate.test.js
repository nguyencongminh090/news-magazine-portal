import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { checksum, listMigrations, migrate } from './migrate.js';

// DB tests need a disposable database: TEST_DATABASE_URL=postgres://... npm --prefix backend test
const testDb = process.env.TEST_DATABASE_URL;

test('migration files are numbered, ordered and non-empty', async () => {
  const migrations = await listMigrations();
  assert.ok(migrations.length > 0);
  migrations.forEach((m, i) => {
    assert.match(m.name, /^\d{3}_[a-z_]+\.sql$/);
    assert.equal(Number(m.name.slice(0, 3)), i + 1, `${m.name} breaks the 001.. sequence`);
    assert.equal(m.checksum, checksum(m.sql));
  });
});

test('migrate applies on an empty database and is re-runnable', { skip: !testDb }, async () => {
  const client = new pg.Client({ connectionString: testDb });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const first = await migrate(testDb);
    assert.deepEqual(first, (await listMigrations()).map((m) => m.name));
    assert.deepEqual(await migrate(testDb), []);

    const { rows } = await client.query('SELECT name FROM roles ORDER BY id');
    assert.deepEqual(rows.map((r) => r.name), ['admin', 'editor', 'seo', 'reader']);

    // Constraints: published needs published_at; report targets exactly one entity.
    await client.query(`INSERT INTO categories (name, slug) VALUES ('World', 'world')`);
    await assert.rejects(
      client.query(
        `INSERT INTO documents (title, slug, content, category_id, author_name, status)
         VALUES ('t', 't', 'c', 1, 'a', 'published')`,
      ),
      /violates check constraint/,
    );
    await assert.rejects(client.query(`INSERT INTO reports (reason) VALUES ('x')`), /violates check constraint/);
  } finally {
    await client.end();
  }
});
