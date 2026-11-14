import { query } from '../../db.js';
import { SUMMARY_COLUMNS } from '../engagement/summary.js';

/** Load all published documents with full content, category, tags, and engagement stats for indexing. */
export async function loadPublishedDocuments() {
  const { rows } = await query(
    `SELECT d.id, d.slug, d.title, d.summary, d.content, d.published_at, d.author_name,
            d.views_count, d.og_image_url, d.image_alt, d.seo_keywords,
            d.meta_title, d.meta_description,
            (SELECT count(*)::int FROM article_likes al WHERE al.document_id = d.id) AS like_count,
            c.slug AS category_slug, c.name AS category_name,
            COALESCE((SELECT array_agg(t.name ORDER BY t.name)
                        FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                       WHERE dt.document_id = d.id), '{}') AS tags,${SUMMARY_COLUMNS}
       FROM documents d
       JOIN categories c ON c.id = d.category_id
      WHERE d.status = 'published'
      ORDER BY d.id ASC`,
  );
  return rows;
}

/** Load one article (any status) for SEO audit / tag suggestion. */
export async function findDocumentByIdOrSlug({ id, slug }) {
  const where = id != null ? 'd.id = $1' : 'd.slug = $1';
  const val = id != null ? id : slug;
  const { rows } = await query(
    `SELECT d.id, d.slug, d.title, d.summary, d.content, d.status, d.published_at, d.author_name,
            d.views_count, d.og_image_url, d.image_alt, d.seo_keywords,
            d.meta_title, d.meta_description,
            c.slug AS category_slug, c.name AS category_name,
            COALESCE((SELECT array_agg(t.name ORDER BY t.name)
                        FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                       WHERE dt.document_id = d.id), '{}') AS tags
       FROM documents d
       JOIN categories c ON c.id = d.category_id
      WHERE ${where}`,
    [val],
  );
  return rows[0] ?? null;
}

/** Persist a search query execution into search_query_log (Chapter 9.3). */
export async function insertSearchQueryLog({
  userId = null,
  queryString,
  model = 'bm25',
  filters = {},
  resultDocIds = [],
  totalResults = 0,
  latencyMs = 0,
}) {
  const { rows } = await query(
    `INSERT INTO search_query_log (user_id, query_string, retrieval_model, filters, result_doc_ids, total_results, latency_ms)
     VALUES ($1, $2, $3, $4::jsonb, $5::bigint[], $6, $7)
     RETURNING id, created_at`,
    [
      userId,
      queryString.slice(0, 500),
      model,
      JSON.stringify(filters),
      resultDocIds,
      totalResults,
      latencyMs,
    ],
  );
  return rows[0];
}

/** Load recent query & click logs for Chapter 9 online/CTR evaluation. */
export async function loadEvaluationLogs(limit = 500) {
  const [qRes, cRes] = await Promise.all([
    query(
      `SELECT id, user_id, query_string, retrieval_model, result_doc_ids, total_results, latency_ms, created_at
         FROM search_query_log
        ORDER BY created_at DESC, id DESC
        LIMIT $1`,
      [limit],
    ),
    query(
      `SELECT id, user_id, query_string, clicked_doc_id, query_log_id, rank_position, retrieval_model, created_at
         FROM search_click_log
        ORDER BY created_at DESC, id DESC
        LIMIT $1`,
      [limit],
    ),
  ]);
  return { queryLogs: qRes.rows, clickLogs: cRes.rows };
}

/** Load user profile tags, liked doc IDs, and global rating matrix for Chapter 11 collaborative filtering. */
export async function loadRecommendationContext(userId = null) {
  const ratingsRes = await query(`SELECT user_id, document_id, score FROM ratings`);
  if (userId == null) {
    return { userTagNames: [], likedDocIds: [], allRatings: ratingsRes.rows };
  }
  const [tagsRes, likesRes] = await Promise.all([
    query(
      `SELECT t.name
         FROM user_tags ut
         JOIN tags t ON t.id = ut.tag_id
        WHERE ut.user_id = $1`,
      [userId],
    ),
    query(`SELECT document_id FROM article_likes WHERE user_id = $1`, [userId]),
  ]);
  return {
    userTagNames: tagsRes.rows.map((r) => r.name),
    likedDocIds: likesRes.rows.map((r) => Number(r.document_id)),
    allRatings: ratingsRes.rows,
  };
}

/** Load tags with published article counts for tag cloud. */
export async function loadTagsWithCounts() {
  const { rows } = await query(
    `SELECT t.id, t.slug, t.name, count(d.id)::int AS article_count
       FROM tags t
       LEFT JOIN document_tags dt ON dt.tag_id = t.id
       LEFT JOIN documents d ON d.id = dt.document_id AND d.status = 'published'
      GROUP BY t.id
      HAVING count(d.id) > 0
      ORDER BY article_count DESC, t.name ASC`,
  );
  return rows;
}
