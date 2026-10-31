import { query, withTransaction } from '../../db.js';

const USER_SQL = `SELECT u.id, u.email, u.display_name, u.password_hash, u.is_active,
    COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id`;

export async function findUserByEmail(email) {
  const { rows } = await query(`${USER_SQL} WHERE lower(u.email) = lower($1) GROUP BY u.id`, [email]);
  return rows[0] ?? null;
}

export async function findUserById(id) {
  const { rows } = await query(`${USER_SQL} WHERE u.id = $1 GROUP BY u.id`, [id]);
  return rows[0] ?? null;
}

/** Creates a user with the given roles in one transaction. Throws pg 23505 on duplicate email. */
export async function createUser({ email, passwordHash, displayName, roles }) {
  return withTransaction(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
      [email, passwordHash, displayName],
    );
    await c.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2)',
      [rows[0].id, roles],
    );
    return rows[0].id;
  });
}

export async function anyAdminExists() {
  const { rows } = await query(
    `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'admin' LIMIT 1`,
  );
  return rows.length > 0;
}

/** Replace a user's roles; revokes their refresh tokens so the change cannot be outlived by a session. Returns false if the user is missing. */
export async function setRoles(userId, roles) {
  return withTransaction(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!rowCount) return false;
    await c.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await c.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2)',
      [userId, roles],
    );
    await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    return true;
  });
}

export async function insertRefreshToken({ userId, hash, expiresAt, familyId }) {
  const { rows } = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id)
     VALUES ($1, $2, $3, COALESCE($4::uuid, gen_random_uuid())) RETURNING family_id`,
    [userId, hash, expiresAt, familyId ?? null],
  );
  return rows[0].family_id;
}

/**
 * Atomically consume a refresh token and issue its successor in the same family.
 * -> { status: 'ok', userId } | { status: 'reuse' } (a revoked token was replayed: family revoked) | { status: 'invalid' }
 */
export async function rotateRefreshToken({ oldHash, newHash, expiresAt }) {
  return withTransaction(async (c) => {
    const { rows } = await c.query(
      'SELECT id, user_id, family_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
      [oldHash],
    );
    const t = rows[0];
    if (!t) return { status: 'invalid' };
    if (t.revoked_at) {
      await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [t.family_id]);
      return { status: 'reuse' };
    }
    if (new Date(t.expires_at) <= new Date()) return { status: 'invalid' };
    await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [t.id]);
    await c.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, $4)',
      [t.user_id, newHash, t.family_id, expiresAt],
    );
    return { status: 'ok', userId: String(t.user_id) };
  });
}

/** Revoke the whole family of the presented token (logout). Idempotent; unknown token is a no-op. */
export async function revokeFamilyByHash(hash) {
  await query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE revoked_at IS NULL AND family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
    [hash],
  );
}
