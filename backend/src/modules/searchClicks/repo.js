import { query } from '../../db.js';

/** Resolve a published document id by slug or numeric id. Returns null if not found/not published. */
export async function findPublishedDocId({ slug, documentId }) {
  if (documentId != null) {
    const { rows } = await query(`SELECT id FROM documents WHERE id = $1 AND status = 'published'`, [documentId]);
    return rows[0] ? Number(rows[0].id) : null;
  }
  const { rows } = await query(`SELECT id FROM documents WHERE slug = $1 AND status = 'published'`, [slug]);
  return rows[0] ? Number(rows[0].id) : null;
}

/** Insert one search click log entry for Phase-2 ranking/CTR analysis. */
export async function insertSearchClick({
  userId = null,
  queryString,
  clickedDocId,
  queryLogId = null,
  rankPosition = null,
  retrievalModel = null,
}) {
  const { rows } = await query(
    `INSERT INTO search_click_log (user_id, query_string, clicked_doc_id, query_log_id, rank_position, retrieval_model)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, query_string, clicked_doc_id, query_log_id, rank_position, retrieval_model, created_at`,
    [userId, queryString, clickedDocId, queryLogId, rankPosition, retrievalModel],
  );
  return rows[0];
}
