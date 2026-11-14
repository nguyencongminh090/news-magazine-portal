import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer } from './mailer.js';

const msg = { to: 'r@example.com', subject: 'Hi', text: 'Body line' };

test('log transport prints recipient, subject and body', async () => {
  const lines = [];
  await createMailer({ transport: 'log', log: (l) => lines.push(l) }).send(msg);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[mail:log\] to=r@example\.com subject=Hi\nBody line$/);
});

test('smtp transport sends through nodemailer with the configured URL and sender', async () => {
  const calls = [];
  const createTransport = (url) => ({ sendMail: async (m) => calls.push({ url, ...m }) });
  await createMailer({ transport: 'smtp', smtpUrl: 'smtp://relay:587', from: 'News <n@x.io>', createTransport }).send(msg);
  assert.deepEqual(calls, [{ url: 'smtp://relay:587', from: 'News <n@x.io>', ...msg }]);
});

test('smtp transport surfaces delivery errors; unknown transport fails fast', async () => {
  const createTransport = () => ({ sendMail: async () => { throw Object.assign(new Error('down'), { code: 'ECONNECTION' }); } });
  await assert.rejects(createMailer({ transport: 'smtp', smtpUrl: 'smtp://x', createTransport }).send(msg), { code: 'ECONNECTION' });
  assert.throws(() => createMailer({ transport: 'carrier-pigeon' }), /Unknown mail transport/);
});
