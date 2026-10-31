import pg from 'pg';

let pool;

/** One shared Pool per process. Only modules/<domain>/repo.js may import this file. */
export function initPool(cfg) {
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: cfg.databaseUrl(),
    max: cfg.db.max,
    connectionTimeoutMillis: cfg.db.connectionTimeoutMillis,
    idleTimeoutMillis: cfg.db.idleTimeoutMillis,
    statement_timeout: cfg.db.statementTimeoutMs,
  });
  // An idle client erroring must not crash the process.
  pool.on('error', (err) => console.error('pg idle client error:', err.code ?? err.message));
  return pool;
}

function need() {
  if (!pool) throw new Error('DB pool not initialised (call initPool at boot)');
  return pool;
}

export function query(text, params) {
  return need().query(text, params);
}

/** Run fn(client) in a transaction; the client is always released. */
export async function withTransaction(fn) {
  const client = await need().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  const p = pool;
  pool = undefined;
  if (p) await p.end();
}
