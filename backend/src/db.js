import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool;
let initPromise = null;

class PGlitePoolAdapter {
  constructor(pglite) {
    this.pglite = pglite;
  }

  async query(text, params) {
    return this.pglite.query(text, params);
  }

  async connect() {
    return {
      query: (text, params) => this.pglite.query(text, params),
      release: () => {},
    };
  }

  async end() {
    if (this.pglite && typeof this.pglite.close === 'function') {
      await this.pglite.close();
    }
  }

  on() {}
}

async function applyMigrations(pglite) {
  const migrationsDir = path.resolve(__dirname, '../db/migrations');
  if (!fs.existsSync(migrationsDir)) return;

  await pglite.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const { rows } = await pglite.query('SELECT name, checksum FROM schema_migrations');
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));

  const crypto = await import('node:crypto');
  const checksum = (sql) => crypto.createHash('sha256').update(sql).digest('hex');

  const names = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) {
    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    const cs = checksum(sql);
    if (applied.has(name)) continue;

    try {
      await pglite.query('BEGIN');
      await pglite.exec(sql);
      await pglite.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, cs]);
      await pglite.query('COMMIT');
      console.log(`[db] Applied migration: ${name}`);
    } catch (err) {
      await pglite.query('ROLLBACK').catch(() => {});
      console.error(`[db] Migration ${name} failed:`, err);
      throw err;
    }
  }
}

async function autoSeedIfNeeded(pglite) {
  try {
    const { rows } = await pglite.query('SELECT count(*) AS count FROM documents');
    if (Number(rows[0]?.count) > 0) return;
  } catch {
    return;
  }

  const articlesFile = path.resolve(__dirname, '../db/seed/articles.json');
  if (!fs.existsSync(articlesFile)) return;

  console.log('[db] Initialising database: seeding Wikinews articles and demo users...');
  const articles = JSON.parse(fs.readFileSync(articlesFile, 'utf8'));

  const argon2 = (await import('argon2')).default;
  const crypto = await import('node:crypto');

  const DEV_PASSWORD = 'DevPassw0rd!';
  const DEMO_USERS = [
    { email: 'admin@example.test', displayName: 'Demo Admin', role: 'admin' },
    { email: 'editor@example.test', displayName: 'Demo Editor', role: 'editor' },
    { email: 'seo@example.test', displayName: 'Demo SEO', role: 'seo' },
    { email: 'reader@example.test', displayName: 'Demo Reader', role: 'reader' },
  ];

  const slugify = (text, max = 80) => {
    const slug = text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug.length <= max ? slug : slug.slice(0, max).replace(/-[^-]*$/, '') || slug.slice(0, max);
  };

  const seededRandom = (seedText) => {
    let a = crypto.createHash('sha256').update(seedText).digest().readUInt32LE(0);
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const summarize = (content, max = 280) => {
    const sentences = content.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s|$)/g) ?? [content];
    let summary = '';
    for (const sentence of sentences) {
      if (summary && (summary + sentence).length > max) break;
      summary += sentence;
    }
    return (summary.trim() || content).slice(0, max).trim();
  };

  const nameKey = (name) => slugify(name, 100);

  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
  for (const user of DEMO_USERS) {
    const { rows } = await pglite.query(
      `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)
       ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
      [user.email, passwordHash, user.displayName],
    );
    if (rows.length) {
      await pglite.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2`,
        [rows[0].id, user.role],
      );
    }
  }

  const categoryIds = new Map();
  for (const name of new Set(articles.map((a) => a.category))) {
    const { rows } = await pglite.query(
      `INSERT INTO categories (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name, nameKey(name)],
    );
    categoryIds.set(name, rows[0].id);
  }

  const tagIds = new Map();
  const slugs = new Set();
  for (const article of articles) {
    let slug = slugify(article.title);
    for (let n = 2; slugs.has(slug); n += 1) slug = `${slugify(article.title, 70)}-${n}`;
    slugs.add(slug);

    const random = seededRandom(slug);
    const views = Math.floor(50 + random() ** 3 * 19950);
    const { rows } = await pglite.query(
      `INSERT INTO documents
         (title, slug, summary, content, category_id, author_name, status, views_count, published_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'published', $7, $8, $8)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, summary = EXCLUDED.summary, content = EXCLUDED.content,
         category_id = EXCLUDED.category_id, author_name = EXCLUDED.author_name,
         published_at = EXCLUDED.published_at
       RETURNING id`,
      [
        article.title.slice(0, 300),
        slug,
        summarize(article.content),
        article.content,
        categoryIds.get(article.category),
        article.author.slice(0, 200),
        views,
        article.publishedAt,
      ],
    );
    const documentId = rows[0].id;

    for (const tag of article.tags) {
      const tagSlug = nameKey(tag);
      if (!tagSlug) continue;
      if (!tagIds.has(tagSlug)) {
        const res = await pglite.query(
          `INSERT INTO tags (name, slug) VALUES ($1, $2)
           ON CONFLICT (slug) DO UPDATE SET name = tags.name RETURNING id`,
          [tag.slice(0, 50), tagSlug],
        );
        tagIds.set(tagSlug, res.rows[0].id);
      }
      await pglite.query(
        `INSERT INTO document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [documentId, tagIds.get(tagSlug)],
      );
    }
  }

  console.log('[db] Seed completed successfully!');
}

/** One shared Pool per process. Only modules/<domain>/repo.js may import this file. */
export function initPool(cfg) {
  if (pool) return pool;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const databaseUrl = cfg.databaseUrl();
    let usePostgres = false;

    if (databaseUrl && !databaseUrl.startsWith('memory:') && !databaseUrl.startsWith('pglite:')) {
      const probeClient = new pg.Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: Math.min(cfg.db?.connectionTimeoutMillis || 1500, 1500),
      });
      try {
        await probeClient.connect();
        await probeClient.query('SELECT 1');
        await probeClient.end();
        usePostgres = true;
      } catch (err) {
        console.warn(`[db] PostgreSQL not accessible (${err.code || err.message}). Switching to embedded PGlite database.`);
      }
    }

    if (usePostgres) {
      pool = new pg.Pool({
        connectionString: databaseUrl,
        max: cfg.db.max,
        connectionTimeoutMillis: cfg.db.connectionTimeoutMillis,
        idleTimeoutMillis: cfg.db.idleTimeoutMillis,
        statement_timeout: cfg.db.statementTimeoutMs,
      });
      pool.on('error', (err) => console.error('pg idle client error:', err.code ?? err.message));
      return pool;
    }

    const { PGlite } = await import('@electric-sql/pglite');
    const dbDir = path.resolve(__dirname, '../db/.pgdata');
    const pglite = new PGlite(dbDir);
    await pglite.ready;

    await applyMigrations(pglite);
    await autoSeedIfNeeded(pglite);

    pool = new PGlitePoolAdapter(pglite);
    console.log(`[db] Embedded PGlite database ready at ${dbDir}`);
    return pool;
  })();

  return initPromise;
}

async function need() {
  if (initPromise) await initPromise;
  if (!pool) throw new Error('DB pool not initialised (call initPool at boot)');
  return pool;
}

export async function query(text, params) {
  const p = await need();
  return p.query(text, params);
}

/** Run fn(client) in a transaction; the client is always released. */
export async function withTransaction(fn) {
  const p = await need();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (initPromise) await initPromise.catch(() => {});
  const p = pool;
  pool = undefined;
  initPromise = null;
  if (p) await p.end();
}
