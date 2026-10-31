import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { closePool, initPool } from './db.js';
import { bootstrapAdmin } from './modules/auth/bootstrap.js';

const config = loadConfig(); // throws listing every problem -> process exits before listening
initPool(config);
if (config.bootstrapAdmin) {
  console.log(`Admin bootstrap: ${await bootstrapAdmin(config.bootstrapAdmin)}`);
}

const server = createApp(config).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
  server.closeIdleConnections?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
