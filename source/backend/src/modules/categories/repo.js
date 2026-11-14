import { query } from '../../db.js';

/** All categories with their published-article counts (0 included), by name. */
export async function listWithCounts() {
  const { rows } = await query(
    `SELECT c.id, c.slug, c.name, count(d.id) FILTER (WHERE d.status = 'published') AS article_count
       FROM categories c LEFT JOIN documents d ON d.category_id = c.id
      GROUP BY c.id ORDER BY c.name`,
  );
  return rows;
}
