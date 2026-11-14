import { query, withTransaction } from '../../db.js';

const likePattern = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

export async function listUsers({ page, pageSize, q, role }) {
  const params = [pageSize, (page - 1) * pageSize];
  const where = ['TRUE'];
  if (q) {
    params.push(likePattern(q));
    where.push(`(u.email ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    where.push(`EXISTS (SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE ur2.user_id = u.id AND r2.name = $${params.length})`);
  }
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.is_active, u.email_verified_at, u.created_at,
            COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles,
            count(*) OVER () AS total
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE ${where.join(' AND ')}
      GROUP BY u.id
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT $1 OFFSET $2`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

export async function setUserActive(userId, isActive) {
  return withTransaction(async (c) => {
    const { rows } = await c.query(
      'UPDATE users SET is_active = $2 WHERE id = $1 RETURNING id, email, display_name, is_active',
      [userId, isActive],
    );
    if (!rows[0]) return null;
    if (!isActive) {
      await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    }
    return rows[0];
  });
}

export async function listLogs({ page, pageSize, action, entityType }) {
  const params = [pageSize, (page - 1) * pageSize];
  const where = ['TRUE'];
  if (action) {
    params.push(likePattern(action));
    where.push(`l.action ILIKE $${params.length}`);
  }
  if (entityType) {
    params.push(entityType);
    where.push(`l.entity_type = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT l.id, l.actor_id, u.display_name AS actor_name, u.email AS actor_email,
            l.action, l.entity_type, l.entity_id, l.details, l.created_at,
            count(*) OVER () AS total
       FROM audit_log l
       LEFT JOIN users u ON u.id = l.actor_id
      WHERE ${where.join(' AND ')}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $1 OFFSET $2`,
    params,
  );
  return { rows, total: rows.length ? Number(rows[0].total) : 0 };
}

export async function getSettings() {
  const { rows } = await query('SELECT key, value, updated_at FROM site_settings ORDER BY key');
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return { settings: map, items: rows };
}

export async function updateSettings(updates, actorId) {
  return withTransaction(async (c) => {
    for (const [key, value] of Object.entries(updates)) {
      await c.query(
        `INSERT INTO site_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value), actorId],
      );
    }
    const { rows } = await c.query('SELECT key, value, updated_at FROM site_settings ORDER BY key');
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    return { settings: map, items: rows };
  });
}
