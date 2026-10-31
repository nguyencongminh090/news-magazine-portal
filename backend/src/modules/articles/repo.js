import { query } from '../../db.js';
import { SUMMARY_COLUMNS, myRatingColumn } from '../engagement/summary.js';

/** Fields needed for head meta of a published article, or null (draft/archived/unknown). */
export async function findPublishedMetaBySlug(slug) {
  const { rows } = await query(
    `SELECT slug, title, summary, meta_title, meta_description, og_image_url, published_at, updated_at
       FROM documents WHERE slug = $1 AND status = 'published'`,
    [slug],
  );
  return rows[0] ?? null;
}

const PUBLIC_COLUMNS = `d.id, d.slug, d.title, d.summary, d.published_at, d.author_name,
       c.slug AS category_slug, c.name AS category_name,
       COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                  WHERE dt.document_id = d.id), '{}') AS tags,${SUMMARY_COLUMNS}`;

/** LIKE-escape user input so % and _ match literally. */
const likePattern = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

/** Published articles only, newest first. Returns { rows, total }. */
export async function listPublished({ page, pageSize, category, q }) {
  const params = [pageSize, (page - 1) * pageSize];
  const where = [`d.status = 'published'`];
  if (category) { params.push(category); where.push(`c.slug = $${params.length}`); }
  if (q) { params.push(likePattern(q)); where.push(`(d.title ILIKE $${params.length} OR d.summary ILIKE $${params.length})`); }
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, count(*) OVER () AS total
       FROM documents d JOIN categories c ON c.id = d.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.published_at DESC, d.id DESC LIMIT $1 OFFSET $2`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

/** Full published article (with body) or null. `userId` (optional) adds the caller's own rating as my_rating. */
export async function findPublishedBySlug(slug, userId = null) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, d.content AS body, ${myRatingColumn('$2')}
       FROM documents d JOIN categories c ON c.id = d.category_id
      WHERE d.slug = $1 AND d.status = 'published'`,
    [slug, userId],
  );
  return rows[0] ?? null;
}
