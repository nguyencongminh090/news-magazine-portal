import { query, withTransaction } from '../../db.js';
import { HttpError } from '../../http/errors.js';

const likePattern = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

export async function listReports({ page, pageSize, status }) {
  const params = [pageSize, (page - 1) * pageSize];
  const where = ['TRUE'];
  if (status) {
    params.push(status);
    where.push(`r.status = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT r.id, r.reason, r.status, r.created_at, r.resolved_at,
            r.document_id, r.comment_id,
            rep.display_name AS reporter_name, rep.email AS reporter_email,
            resv.display_name AS resolver_name,
            d.slug AS article_slug, d.title AS article_title, d.status AS article_status,
            c.body AS comment_body, c.status AS comment_status, c.user_id AS comment_author_id,
            ca.display_name AS comment_author_name,
            cd.slug AS comment_article_slug, cd.title AS comment_article_title,
            count(*) OVER () AS total
       FROM reports r
       LEFT JOIN users rep ON rep.id = r.reporter_id
       LEFT JOIN users resv ON resv.id = r.resolved_by
       LEFT JOIN documents d ON d.id = r.document_id
       LEFT JOIN comments c ON c.id = r.comment_id
       LEFT JOIN users ca ON ca.id = c.user_id
       LEFT JOIN documents cd ON cd.id = c.document_id
      WHERE ${where.join(' AND ')}
      ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC
      LIMIT $1 OFFSET $2`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

export async function resolveReport(id, { status, hideTarget = false, resolvedBy }) {
  return withTransaction(async (c) => {
    const { rows } = await c.query(
      `UPDATE reports
          SET status = $2, resolved_by = $3, resolved_at = now()
        WHERE id = $1
        RETURNING id, status, resolved_at, document_id, comment_id`,
      [id, status, resolvedBy],
    );
    const report = rows[0];
    if (!report) return null;
    if (hideTarget) {
      if (report.comment_id) {
        await c.query(`UPDATE comments SET status = 'hidden' WHERE id = $1`, [report.comment_id]);
      } else if (report.document_id) {
        await c.query(`UPDATE documents SET status = 'archived' WHERE id = $1`, [report.document_id]);
      }
    }
    return report;
  });
}

export async function listComments({ page, pageSize, status, q }) {
  const params = [pageSize, (page - 1) * pageSize];
  const where = ['TRUE'];
  if (status) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (q) {
    params.push(likePattern(q));
    where.push(`(c.body ILIKE $${params.length} OR u.display_name ILIKE $${params.length} OR d.title ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT c.id, c.body, c.status, c.created_at, c.user_id,
            u.display_name AS author_name, u.email AS author_email, u.is_active AS author_active,
            d.id AS document_id, d.slug AS article_slug, d.title AS article_title,
            (SELECT count(*)::int FROM reports r WHERE r.comment_id = c.id AND r.status = 'open') AS open_reports,
            count(*) OVER () AS total
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       JOIN documents d ON d.id = c.document_id
      WHERE ${where.join(' AND ')}
      ORDER BY open_reports DESC, c.created_at DESC, c.id DESC
      LIMIT $1 OFFSET $2`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

export async function spamAction(targetUserId, action) {
  return withTransaction(async (c) => {
    const { rows: userRows } = await c.query(
      `SELECT u.id, u.is_active,
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id = $1
        GROUP BY u.id`,
      [targetUserId],
    );
    const target = userRows[0];
    if (!target) return null;
    if (action === 'suspend' && target.roles.some((r) => ['admin', 'editor', 'moderator', 'seo'].includes(r))) {
      throw new HttpError(403, 'Forbidden', { detail: 'Moderators cannot suspend staff accounts' });
    }
    const hidden = await c.query(
      `UPDATE comments SET status = 'hidden' WHERE user_id = $1 AND status = 'visible'`,
      [targetUserId],
    );
    let suspended = false;
    if (action === 'suspend') {
      await c.query(`UPDATE users SET is_active = false WHERE id = $1`, [targetUserId]);
      await c.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [targetUserId]);
      suspended = true;
    }
    return { userId: Number(target.id), hiddenComments: hidden.rowCount, suspended };
  });
}
