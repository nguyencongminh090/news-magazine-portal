import { query } from '../../db.js';
import { SUMMARY_COLUMNS, myRatingColumn } from '../engagement/summary.js';

/** Fields needed for head meta of a published article, or null (draft/archived/unknown). */
export async function findPublishedMetaBySlug(slug) {
  const { rows } = await query(
    `SELECT slug, title, summary, meta_title, meta_description, og_image_url, image_alt, seo_keywords, published_at, updated_at
       FROM documents WHERE slug = $1 AND status = 'published'`,
    [slug],
  );
  return rows[0] ?? null;
}

const PUBLIC_COLUMNS = `d.id, d.slug, d.title, d.summary, d.published_at, d.author_name,
       d.views_count, d.og_image_url, d.image_alt,
       (SELECT count(*)::int FROM article_likes al WHERE al.document_id = d.id) AS like_count,
       c.slug AS category_slug, c.name AS category_name,
       COALESCE((SELECT array_agg(t.name ORDER BY t.name) FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                  WHERE dt.document_id = d.id), '{}') AS tags,${SUMMARY_COLUMNS}`;

/** LIKE-escape user input so % and _ match literally. */
const likePattern = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

const SORT_SQL = {
  latest: 'd.published_at DESC, d.id DESC',
  views: 'd.views_count DESC, d.published_at DESC, d.id DESC',
  oldest: 'd.published_at ASC, d.id ASC',
};

/** Published articles only, filtered and paginated. Returns { rows, total }. */
export async function listPublished({ page, pageSize, category, q, tag, from, to, sort = 'latest' }) {
  const params = [pageSize, (page - 1) * pageSize];
  const where = [`d.status = 'published'`];
  if (category) {
    params.push(category);
    where.push(`c.slug = $${params.length}`);
  }
  if (q) {
    params.push(likePattern(q));
    where.push(`(d.title ILIKE $${params.length} OR d.summary ILIKE $${params.length} OR d.content ILIKE $${params.length})`);
  }
  if (tag) {
    params.push(tag);
    where.push(
      `EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id AND (t.slug = lower($${params.length}) OR lower(t.name) = lower($${params.length})))`,
    );
  }
  if (from) {
    params.push(from);
    where.push(`d.published_at >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      where.push(`d.published_at < ($${params.length}::date + interval '1 day')`);
    } else {
      where.push(`d.published_at <= $${params.length}::timestamptz`);
    }
  }
  const orderBy = SORT_SQL[sort] ?? SORT_SQL.latest;
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, count(*) OVER () AS total
       FROM documents d JOIN categories c ON c.id = d.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

/** Full published article (with body) or null. `userId` (optional) adds the caller's own rating as my_rating + user tags. */
export async function findPublishedBySlug(slug, userId = null) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, d.content AS body, d.seo_keywords, ${myRatingColumn('$2')},
            EXISTS (SELECT 1 FROM article_likes al WHERE al.document_id = d.id AND al.user_id = $2::bigint) AS liked_by_me,
            COALESCE((SELECT array_agg(t.name ORDER BY t.name)
                        FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                       WHERE dt.document_id = d.id AND dt.is_user_tag = true AND dt.added_by = $2::bigint), '{}') AS my_user_tags
       FROM documents d JOIN categories c ON c.id = d.category_id
      WHERE d.slug = $1 AND d.status = 'published'`,
    [slug, userId],
  );
  return rows[0] ?? null;
}
