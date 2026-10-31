import { query, withTransaction } from '../../db.js';
import { HttpError } from '../../http/errors.js';
import { slugify } from './slug.js';

const COLUMNS = `d.id, d.slug, d.title, d.summary, d.published_at, d.author_name, d.status, d.views_count, d.updated_at,
       c.slug AS category_slug, c.name AS category_name,
       COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                  WHERE dt.document_id = d.id), '{}') AS tags`;
const FROM = 'FROM documents d JOIN categories c ON c.id = d.category_id';
const likePattern = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
const tagSlug = (name) => slugify(name, 50);

/** All statuses, newest update first. Returns { rows, total }. */
export async function list({ page, pageSize, status, q }) {
  const params = [pageSize, (page - 1) * pageSize];
  const where = ['TRUE'];
  if (status) { params.push(status); where.push(`d.status = $${params.length}`); }
  if (q) { params.push(likePattern(q)); where.push(`d.title ILIKE $${params.length}`); }
  const { rows } = await query(
    `SELECT ${COLUMNS}, count(*) OVER () AS total ${FROM} WHERE ${where.join(' AND ')}
      ORDER BY d.updated_at DESC, d.id DESC LIMIT $1 OFFSET $2`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

export async function findById(id, db = { query }) {
  const { rows } = await db.query(`SELECT ${COLUMNS}, d.content AS body ${FROM} WHERE d.id = $1`, [id]);
  return rows[0] ?? null;
}

async function categoryId(c, slug) {
  const { rows } = await c.query('SELECT id FROM categories WHERE slug = $1', [slug]);
  if (!rows[0]) throw new HttpError(422, 'Validation failed', { errors: [{ in: 'body', path: 'categorySlug', message: 'Unknown category' }] });
  return rows[0].id;
}

async function setTags(c, documentId, names) {
  await c.query('DELETE FROM document_tags WHERE document_id = $1', [documentId]);
  for (const name of names) {
    const { rows } = await c.query(
      `INSERT INTO tags (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
      [name, tagSlug(name)],
    );
    await c.query('INSERT INTO document_tags (document_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [documentId, rows[0].id]);
  }
}

/** First free slug: base, base-2, base-3, … */
async function freeSlug(c, base, exceptId = null) {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = base.slice(0, 200 - suffix.length) + suffix;
    const { rowCount } = await c.query('SELECT 1 FROM documents WHERE slug = $1 AND id IS DISTINCT FROM $2', [candidate, exceptId]);
    if (!rowCount) return candidate;
  }
}

/** Creates an article; slug derived from the title when omitted (explicit slug that is taken -> 409). */
export function create(data, author) {
  return withTransaction(async (c) => {
    const catId = await categoryId(c, data.categorySlug);
    let slug = data.slug;
    if (slug) {
      if ((await c.query('SELECT 1 FROM documents WHERE slug = $1', [slug])).rowCount) throw new HttpError(409, 'Conflict', { detail: 'Slug already in use' });
    } else slug = await freeSlug(c, slugify(data.title));
    const { rows } = await c.query(
      `INSERT INTO documents (title, slug, summary, content, category_id, author_name, author_id, status, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 = 'published' THEN now() END) RETURNING id`,
      [data.title, slug, data.summary, data.body, catId, author.name, author.id, data.status],
    );
    await setTags(c, rows[0].id, data.tags);
    return findById(rows[0].id, c);
  });
}

/** Full replace of editable fields. null = unknown id; 409 when `expectedUpdatedAt` is stale. */
export function update(id, data, expectedUpdatedAt) {
  return withTransaction(async (c) => {
    const { rows } = await c.query('SELECT status, published_at, updated_at FROM documents WHERE id = $1 FOR UPDATE', [id]);
    const cur = rows[0];
    if (!cur) return null;
    if (new Date(cur.updated_at).getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new HttpError(409, 'Conflict', { detail: 'Article was changed by someone else; reload and retry' });
    }
    const catId = await categoryId(c, data.categorySlug);
    if ((await c.query('SELECT 1 FROM documents WHERE slug = $1 AND id <> $2', [data.slug, id])).rowCount) {
      throw new HttpError(409, 'Conflict', { detail: 'Slug already in use' });
    }
    // published_at is set once, on the first publish, and kept afterwards.
    const publishedAt = cur.published_at ?? (data.status === 'published' ? new Date() : null);
    await c.query(
      `UPDATE documents SET title = $1, slug = $2, summary = $3, content = $4, category_id = $5, status = $6, published_at = $7
        WHERE id = $8`,
      [data.title, data.slug, data.summary, data.body, catId, data.status, publishedAt, id],
    );
    await setTags(c, id, data.tags);
    return findById(id, c);
  });
}

export async function remove(id) {
  const { rowCount } = await query('DELETE FROM documents WHERE id = $1', [id]);
  return rowCount > 0;
}
