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

const insertSuccessor = async (c, t, newHash, expiresAt) => (await c.query(
  'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
  [t.user_id, newHash, t.family_id, expiresAt],
)).rows[0].id;

/**
 * Grace re-mint (A16): `t` was rotated less than `graceMs` ago and its successor is still live (never used,
 * not revoked by logout / role change), so the rotation response was most likely lost. Revoke that successor
 * and issue a new one; keep t's used_at so the window never extends. Returns false when grace does not apply.
 */
async function graceRemint(c, t, newHash, expiresAt, graceMs) {
  if (!graceMs || t.used_ago_ms === null || t.used_ago_ms > graceMs) return false;
  const { rows } = await c.query('SELECT id, revoked_at FROM refresh_tokens WHERE id = $1 FOR UPDATE', [t.replaced_by]);
  if (!rows[0] || rows[0].revoked_at) return false;
  const newId = await insertSuccessor(c, t, newHash, expiresAt);
  // The revoked sibling points at the new token too, so an out-of-order cookie write still gets grace. It inherits
  // t's used_at: the whole chain stays inside the window of the original rotation (no ping-pong re-mints).
  await c.query('UPDATE refresh_tokens SET revoked_at = now(), used_at = $3, replaced_by = $2 WHERE id = $1', [rows[0].id, newId, t.used_at]);
  await c.query('UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1', [t.id, newId]);
  return true;
}

/**
 * Atomically consume a refresh token and issue its successor in the same family.
 * A replay within `graceMs` of rotation re-mints (see graceRemint); any other replay revokes the family.
 * -> { status: 'ok', userId } | { status: 'reuse' } (a revoked token was replayed: family revoked) | { status: 'invalid' }
 */
export async function rotateRefreshToken({ oldHash, newHash, expiresAt, graceMs = 0 }) {
  return withTransaction(async (c) => {
    const { rows } = await c.query(
      // Age measured on the DB clock, the same clock that wrote used_at.
      `SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by, used_at,
              (extract(epoch FROM now() - used_at) * 1000)::float8 AS used_ago_ms
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [oldHash],
    );
    const t = rows[0];
    if (!t) return { status: 'invalid' };
    if (t.revoked_at) {
      if (await graceRemint(c, t, newHash, expiresAt, graceMs)) return { status: 'ok', userId: String(t.user_id) };
      await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [t.family_id]);
      return { status: 'reuse' };
    }
    if (new Date(t.expires_at) <= new Date()) return { status: 'invalid' };
    const newId = await insertSuccessor(c, t, newHash, expiresAt);
    await c.query('UPDATE refresh_tokens SET revoked_at = now(), used_at = now(), replaced_by = $2 WHERE id = $1', [t.id, newId]);
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
