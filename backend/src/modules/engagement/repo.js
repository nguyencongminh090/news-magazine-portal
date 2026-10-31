import { query } from '../../db.js';
import { SUMMARY_COLUMNS, myRatingColumn } from './summary.js';

/** Id of a published article, or null (draft/archived/unknown all look the same: 404). */
export async function findPublishedId(slug) {
  const { rows } = await query(`SELECT id FROM documents WHERE slug = $1 AND status = 'published'`, [slug]);
  return rows[0] ? Number(rows[0].id) : null;
}

/** Id of a visible comment on a published article, or null. */
export async function findReportableCommentId(id) {
  const { rows } = await query(
    `SELECT c.id FROM comments c JOIN documents d ON d.id = c.document_id
      WHERE c.id = $1 AND c.status = 'visible' AND d.status = 'published'`,
    [id],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** Visible comments, oldest first. Returns { rows, total }. */
export async function listVisibleComments(documentId, { page, pageSize }) {
  const [list, count] = await Promise.all([
    query(
      `SELECT c.id, c.body, c.created_at, u.display_name AS author_name
         FROM comments c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.document_id = $1 AND c.status = 'visible'
        ORDER BY c.created_at, c.id LIMIT $2 OFFSET $3`,
      [documentId, pageSize, (page - 1) * pageSize],
    ),
    query(`SELECT count(*) AS total FROM comments WHERE document_id = $1 AND status = 'visible'`, [documentId]),
  ]);
  return { rows: list.rows, total: Number(count.rows[0].total) };
}

/** Throws pg 23505 (-> 409) when the same user already posted this exact body on the article. */
export async function insertComment({ documentId, userId, body }) {
  const { rows } = await query(
    `INSERT INTO comments (document_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at`,
    [documentId, userId, body],
  );
  return rows[0];
}

export async function upsertRating({ documentId, userId, score }) {
  await query(
    `INSERT INTO ratings (user_id, document_id, score) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, document_id) DO UPDATE SET score = EXCLUDED.score`,
    [userId, documentId, score],
  );
}

export async function deleteRating({ documentId, userId }) {
  await query('DELETE FROM ratings WHERE user_id = $1 AND document_id = $2', [userId, documentId]);
}

/** Summary row (SUMMARY_COLUMNS + my_rating) for one article. */
export async function getSummaryRow(documentId, userId) {
  const { rows } = await query(
    `SELECT ${SUMMARY_COLUMNS}, ${myRatingColumn('$2')} FROM documents d WHERE d.id = $1`,
    [documentId, userId],
  );
  return rows[0];
}

/** Exactly one of documentId / commentId. Throws pg 23505 (-> 409) on a duplicate report. */
export async function insertReport({ reporterId, documentId = null, commentId = null, reason }) {
  await query(
    'INSERT INTO reports (reporter_id, document_id, comment_id, reason) VALUES ($1, $2, $3, $4)',
    [reporterId, documentId, commentId, reason],
  );
}

/** Staff: hide / unhide. Returns the comment row or null. */
export async function setCommentStatus(id, status) {
  const { rows } = await query(
    `WITH u AS (UPDATE comments SET status = $2 WHERE id = $1 RETURNING id, body, status, created_at, user_id)
     SELECT u.id, u.body, u.status, u.created_at, usr.display_name AS author_name
       FROM u LEFT JOIN users usr ON usr.id = u.user_id`,
    [id, status],
  );
  return rows[0] ?? null;
}

export async function deleteComment(id) {
  const { rowCount } = await query('DELETE FROM comments WHERE id = $1', [id]);
  return rowCount > 0;
}
