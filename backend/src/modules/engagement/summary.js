/** SQL for the one engagement summary shared by article list + detail (rule 7). Expects the documents table aliased `d`. */
export const SUMMARY_COLUMNS = `
       (SELECT round(avg(r.score), 1) FROM ratings r WHERE r.document_id = d.id) AS rating_avg,
       (SELECT count(*) FROM ratings r WHERE r.document_id = d.id) AS rating_count,
       (SELECT count(*) FROM comments cm WHERE cm.document_id = d.id AND cm.status = 'visible') AS comment_count`;

/** Own score of user $n (null when anonymous). */
export const myRatingColumn = (param) =>
  `(SELECT r.score FROM ratings r WHERE r.document_id = d.id AND r.user_id = ${param}::bigint) AS my_rating`;

/** Row (SUMMARY_COLUMNS [+ my_rating]) -> API summary. The only serialiser of these counts. */
export function toEngagementSummary(row) {
  return {
    ratingAvg: row.rating_avg == null ? null : Number(row.rating_avg),
    ratingCount: Number(row.rating_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    myRating: row.my_rating == null ? null : Number(row.my_rating),
  };
}

/** Public comment: never exposes user id, email or roles. */
export function toCommentPayload(row) {
  const payload = {
    id: Number(row.id),
    body: row.body,
    createdAt: row.created_at,
    author: row.author_name ? { displayName: row.author_name } : null,
  };
  if (row.status !== undefined) payload.status = row.status; // staff views only
  return payload;
}
