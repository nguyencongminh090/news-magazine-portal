import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import pg from 'pg';

const ARTICLES_FILE = new URL('./articles.json', import.meta.url);

// Dev-only credentials, documented in README. Never reuse outside a local database.
export const DEV_PASSWORD = 'DevPassw0rd!';
export const DEMO_USERS = [
  { email: 'admin@example.test', displayName: 'Demo Admin', role: 'admin' },
  { email: 'editor@example.test', displayName: 'Demo Editor', role: 'editor' },
  { email: 'seo@example.test', displayName: 'Demo SEO', role: 'seo' },
  { email: 'reader@example.test', displayName: 'Demo Reader', role: 'reader' },
];

export const slugify = (text, max = 80) => {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length <= max ? slug : slug.slice(0, max).replace(/-[^-]*$/, '') || slug.slice(0, max);
};

/** Deterministic PRNG (mulberry32) seeded from a string, so reruns give identical values. */
export function seededRandom(seedText) {
  let a = createHash('sha256').update(seedText).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First sentences of the body, capped at `max` chars. */
export function summarize(content, max = 280) {
  const sentences = content.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s|$)/g) ?? [content];
  let summary = '';
  for (const sentence of sentences) {
    if (summary && (summary + sentence).length > max) break;
    summary += sentence;
  }
  return (summary.trim() || content).slice(0, max).trim();
}

const nameKey = (name) => slugify(name, 100);

/** Idempotent: every row is keyed by slug/email, so reruns update in place. Returns counts. */
export async function seed(databaseUrl, articles) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
    for (const user of DEMO_USERS) {
      // DO NOTHING: argon2 hashes are salted, so updating would make every rerun a change.
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)
         ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
        [user.email, passwordHash, user.displayName],
      );
      if (rows.length) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2`,
          [rows[0].id, user.role],
        );
      }
    }

    const categoryIds = new Map();
    for (const name of new Set(articles.map((a) => a.category))) {
      const { rows } = await client.query(
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
      const views = Math.floor(50 + random() ** 3 * 19950); // skewed: a few popular, many quiet
      const { rows } = await client.query(
        `INSERT INTO documents
           (title, slug, summary, content, category_id, author_name, status, views_count, published_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'published', $7, $8, $8)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title, summary = EXCLUDED.summary, content = EXCLUDED.content,
           category_id = EXCLUDED.category_id, author_name = EXCLUDED.author_name,
           views_count = EXCLUDED.views_count, published_at = EXCLUDED.published_at
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
          const res = await client.query(
            `INSERT INTO tags (name, slug) VALUES ($1, $2)
             ON CONFLICT (slug) DO UPDATE SET name = tags.name RETURNING id`,
            [tag.slice(0, 50), tagSlug],
          );
          tagIds.set(tagSlug, res.rows[0].id);
        }
        await client.query(
          `INSERT INTO document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [documentId, tagIds.get(tagSlug)],
        );
      }
    }

    await client.query('COMMIT');
    return { documents: articles.length, categories: categoryIds.size, tags: tagIds.size, users: DEMO_USERS.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { config } = await import('../../src/config.js');
  const articles = JSON.parse(await readFile(ARTICLES_FILE, 'utf8'));
  console.log(await seed(config.databaseUrl(), articles));
}
