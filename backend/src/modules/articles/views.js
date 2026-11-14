import { query } from '../../db.js';

/**
 * Batched in-memory view counter (README: views_count must not be UPDATEd per page view on the hot row).
 * Flushes accumulated counts to PostgreSQL periodically and on shutdown.
 */
const pending = new Map();
let timer = null;

export function recordView(documentId) {
  const id = Number(documentId);
  if (!Number.isInteger(id) || id <= 0) return;
  pending.set(id, (pending.get(id) ?? 0) + 1);
  ensureTimer();
}

export function pendingViews(documentId) {
  return pending.get(Number(documentId)) ?? 0;
}

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => {
    flushViews().catch(() => {});
  }, 5_000);
  timer.unref();
}

export async function flushViews(dbQuery = query) {
  if (pending.size === 0) return 0;
  const entries = [...pending.entries()];
  pending.clear();
  const ids = entries.map(([id]) => id);
  const counts = entries.map(([, c]) => c);
  try {
    await dbQuery(
      `UPDATE documents AS d
          SET views_count = d.views_count + v.delta
         FROM unnest($1::bigint[], $2::bigint[]) AS v(id, delta)
        WHERE d.id = v.id`,
      [ids, counts],
    );
    return entries.length;
  } catch (err) {
    // Re-queue on transient failure so counts are not silently dropped.
    for (const [id, c] of entries) {
      pending.set(id, (pending.get(id) ?? 0) + c);
    }
    throw err;
  }
}

export function resetViewBuffer() {
  pending.clear();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
