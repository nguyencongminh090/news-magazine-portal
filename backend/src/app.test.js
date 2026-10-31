import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';

test('GET /api/health returns ok', async () => {
  const server = createApp().listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  } finally {
    server.close();
  }
});

test('unknown /api route returns JSON 404', async () => {
  const server = createApp().listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
  } finally {
    server.close();
  }
});
