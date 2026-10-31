import { query } from '../../db.js';

/** Fields needed for head meta of a published article, or null (draft/archived/unknown). */
export async function findPublishedMetaBySlug(slug) {
  const { rows } = await query(
    `SELECT slug, title, summary, meta_title, meta_description, og_image_url, published_at, updated_at
       FROM documents WHERE slug = $1 AND status = 'published'`,
    [slug],
  );
  return rows[0] ?? null;
}
