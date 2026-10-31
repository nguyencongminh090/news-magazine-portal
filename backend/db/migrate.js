import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
// Arbitrary constant: serialises concurrent runners via a session advisory lock.
const LOCK_KEY = 727001;

export const checksum = (sql) => createHash('sha256').update(sql).digest('hex');

export async function listMigrations(dir = MIGRATIONS_DIR) {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(path.join(dir, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    }),
  );
}

/** Apply pending migrations in order, one transaction each. Returns the names applied now. */
export async function migrate(databaseUrl, dir = MIGRATIONS_DIR) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(rows.map((row) => [row.name, row.checksum]));

    const ran = [];
    for (const migration of await listMigrations(dir)) {
      const previous = applied.get(migration.name);
      if (previous !== undefined) {
        if (previous !== migration.checksum) {
          throw new Error(`Migration ${migration.name} was edited after being applied; add a new migration instead`);
        }
        continue;
      }
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          migration.name,
          migration.checksum,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.name} failed: ${err.message}`, { cause: err });
      }
      ran.push(migration.name);
    }
    return ran;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { config } = await import('../src/config.js');
  const ran = await migrate(config.databaseUrl());
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date');
}
