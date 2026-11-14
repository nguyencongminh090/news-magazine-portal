import { query } from '../../db.js';

/** Record a staff/admin action in audit_log. */
export async function recordAudit({ actorId = null, action, entityType, entityId = null, details = null }, db = { query }) {
  await db.query(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, entityType, entityId != null ? String(entityId) : null, details ? JSON.stringify(details) : null],
  );
}
