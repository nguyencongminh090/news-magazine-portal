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

test('migration 005 hardening constraints', { skip: !testDb }, async () => {
  const client = new pg.Client({ connectionString: testDb });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(testDb);

    // refresh_tokens: family_id has no default; rotation is recorded via used_at/replaced_by.
    await client.query(`INSERT INTO users (email, password_hash, display_name) VALUES ('a@x.io', 'h', 'A')`);
    await assert.rejects(
      client.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (1, 'h1', now())`),
      /null value in column "family_id"/,
    );
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES (1, 'h1', gen_random_uuid(), now()), (1, 'h2', gen_random_uuid(), now())`,
    );
    await client.query(`UPDATE refresh_tokens SET used_at = now(), replaced_by = 2 WHERE id = 1`);

    // updated_at trigger
    await client.query(`UPDATE users SET updated_at = '2000-01-01' WHERE id = 1`);
    const { rows: u } = await client.query(`SELECT updated_at > now() - interval '1 minute' AS fresh FROM users`);
    assert.equal(u[0].fresh, true);

    // reports: one per reporter per target; anonymous (NULL reporter) not deduplicated
    await client.query(`INSERT INTO categories (name, slug) VALUES ('World', 'world')`);
    await client.query(
      `INSERT INTO documents (title, slug, content, category_id, author_name, status, published_at)
       VALUES ('Quick brown fox', 'fox', 'jumps over lazy dogs', 1, 'a', 'published', now())`,
    );
    await client.query(`INSERT INTO comments (document_id, user_id, body) VALUES (1, 1, 'hi')`);
    await client.query(`INSERT INTO reports (reporter_id, document_id, reason) VALUES (1, 1, 'spam')`);
    await assert.rejects(
      client.query(`INSERT INTO reports (reporter_id, document_id, reason) VALUES (1, 1, 'again')`),
      /duplicate key/,
    );
    await client.query(`INSERT INTO reports (reporter_id, comment_id, reason) VALUES (1, 1, 'spam')`);
    await assert.rejects(
      client.query(`INSERT INTO reports (reporter_id, comment_id, reason) VALUES (1, 1, 'again')`),
      /duplicate key/,
    );
    await client.query(`INSERT INTO reports (document_id, reason) VALUES (1, 'anon1'), (1, 'anon2')`);

    // generated tsvector: matches on stemmed title/content, title weighted above content
    const { rows: hit } = await client.query(
      `SELECT tsv @@ to_tsquery('english', 'jump') AS content_hit, tsv::text AS t FROM documents`,
    );
    assert.equal(hit[0].content_hit, true);
    assert.match(hit[0].t, /'fox':3A/);
    assert.match(hit[0].t, /'dog':\d+B/);

    // indexes: new ones exist, dropped one is gone
    const { rows: idx } = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
    const names = idx.map((r) => r.indexname);
    for (const n of ['documents_category_published_idx', 'documents_tsv_idx', 'reports_reporter_document_key']) {
      assert.ok(names.includes(n), n);
    }
    assert.ok(!names.includes('documents_created_at_idx'));
  } finally {
    await client.end();
  }
});

test('migration 005 applies on a database already at 004', { skip: !testDb }, async () => {
  const { mkdtemp, cp, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const src = new URL('./migrations/', import.meta.url);
  const dir = await mkdtemp(path.join(tmpdir(), 'mig-'));
  for (const f of (await readdir(src)).filter((f) => f < '005')) await cp(new URL(f, src), path.join(dir, f));

  const client = new pg.Client({ connectionString: testDb });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    assert.equal((await migrate(testDb, `${dir}/`)).length, 4);
    await client.query(`INSERT INTO categories (name, slug) VALUES ('World', 'world')`);
    await client.query(
      `INSERT INTO documents (title, slug, content, category_id, author_name) VALUES ('t', 't', 'c', 1, 'a')`,
    );
    assert.deepEqual(await migrate(testDb), ['005_schema_hardening.sql']);
    const { rows } = await client.query('SELECT tsv IS NOT NULL AS ok FROM documents');
    assert.equal(rows[0].ok, true);
  } finally {
    await client.end();
  }
});

