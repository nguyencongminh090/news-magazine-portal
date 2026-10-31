/** Shared fixtures for the auth HTTP tests (not a test file itself). */
import { createApp } from '../../app.js';

export const jwt = { secret: 's'.repeat(40), issuer: 'iss', audience: 'aud', accessTtl: '15m' };
export const ORIGIN = 'http://localhost:5173';

export async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

/** Minimal in-memory repo with the same contract as repo.js (SQL semantics are covered by the real-DB test). */
export function fakeRepo() {
  const users = [];
  const tokens = [];
  const userTokens = [];
  let seq = 0;
  const repo = {
    users, tokens, userTokens,
    findUserByEmail: async (e) => users.find((u) => u.email.toLowerCase() === e.toLowerCase()) ?? null,
    findUserById: async (id) => users.find((u) => String(u.id) === String(id)) ?? null,
    createUser: async ({ email, passwordHash, displayName, roles }) => {
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw Object.assign(new Error('dup'), { code: '23505' });
      users.push({ id: ++seq, email, password_hash: passwordHash, display_name: displayName, is_active: true, roles });
      return seq;
    },
    // One family per sign-in (like gen_random_uuid() in the DB); rotation keeps it.
    insertRefreshToken: async ({ userId, hash, expiresAt, familyId }) =>
      tokens.push({ userId, hash, family: familyId ?? `fam-${tokens.length}`, expiresAt, revoked: false }),
    rotateRefreshToken: async ({ oldHash, newHash, expiresAt }) => {
      const t = tokens.find((x) => x.hash === oldHash);
      if (!t) return { status: 'invalid' };
      if (t.revoked) { tokens.filter((x) => x.family === t.family).forEach((x) => (x.revoked = true)); return { status: 'reuse' }; }
      t.revoked = true;
      tokens.push({ userId: t.userId, hash: newHash, family: t.family, expiresAt, revoked: false });
      return { status: 'ok', userId: String(t.userId) };
    },
    revokeFamilyByHash: async (h) => {
      const t = tokens.find((x) => x.hash === h);
      if (t) tokens.filter((x) => x.family === t.family).forEach((x) => (x.revoked = true));
    },
    updatePassword: async (id, passwordHash, changedAt) => {
      const u = users.find((x) => String(x.id) === String(id));
      u.password_hash = passwordHash;
      u.password_changed_at = changedAt;
      tokens.filter((x) => String(x.userId) === String(id)).forEach((x) => (x.revoked = true));
    },
    issueUserToken: async ({ userId, purpose, hash, expiresAt }) => {
      for (let i = userTokens.length - 1; i >= 0; i--) {
        if (String(userTokens[i].userId) === String(userId) && userTokens[i].purpose === purpose) userTokens.splice(i, 1);
      }
      userTokens.push({ userId, purpose, hash, expiresAt, usedAt: null });
    },
    resetPasswordWithToken: async ({ tokenHash, passwordHash, changedAt }) => {
      const t = userTokens.find((x) => x.hash === tokenHash && x.purpose === 'reset' && !x.usedAt && x.expiresAt > new Date());
      if (!t) return null;
      t.usedAt = new Date();
      const u = users.find((x) => String(x.id) === String(t.userId));
      if (!u?.is_active) return null;
      u.password_hash = passwordHash;
      u.password_changed_at = changedAt;
      u.email_verified_at ??= changedAt;
      tokens.filter((x) => String(x.userId) === String(u.id)).forEach((x) => (x.revoked = true));
      return u.id;
    },
    setRoles: async (id, roles) => {
      const u = users.find((x) => x.id === id);
      if (!u) return false;
      u.roles = roles;
      tokens.filter((x) => x.userId === id).forEach((x) => (x.revoked = true));
      return true;
    },
  };
  return repo;
}

const pass = (_q, _s, n) => n();
export const open = () => ({ login: pass, register: pass, refresh: pass, changePassword: pass, resetRequest: pass, resetConfirm: pass });
export function makeApp(repo = fakeRepo(), limits = open(), auth = {}) {
  return { repo, app: createApp({ jwt, corsOrigin: ORIGIN, refreshTokenTtlDays: 14, auth: { repo, limits, ...auth } }) };
}
export const post = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
export const refreshCookie = (res) => /refresh_token=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
export const csrf = { 'x-requested-with': 'fetch', origin: ORIGIN };
export const reg = { email: 'Reader@Example.com', displayName: 'Rea', password: 'correct horse battery' };

/** Mailer double: captures messages. `background` collects the router's fire-and-forget work so a test can await it. */
export function fakeMail() {
  const sent = [];
  const pending = [];
  return {
    sent,
    mailer: { send: async (msg) => { sent.push(msg); } },
    background: (p) => { pending.push(p); },
    settle: () => Promise.all(pending.splice(0)),
  };
}
