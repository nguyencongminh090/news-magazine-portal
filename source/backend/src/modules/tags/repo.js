import { query } from '../../db.js';

/** Public tags ordered by published article count (descending), then name. */
export async function listWithCounts(limit = 100) {
  const { rows } = await query(
    `SELECT t.id, t.slug, t.name, count(d.id) AS article_count
       FROM tags t
       LEFT JOIN document_tags dt ON dt.tag_id = t.id
       LEFT JOIN documents d ON d.id = dt.document_id AND d.status = 'published'
      GROUP BY t.id
      HAVING count(d.id) > 0
      ORDER BY article_count DESC, t.name ASC
      LIMIT $1`,
    [limit],
  );
  return rows;
}
