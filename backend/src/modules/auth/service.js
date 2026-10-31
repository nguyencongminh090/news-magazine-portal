import { HttpError } from '../../http/errors.js';
import { burnVerify, hashPassword, verifyPassword } from './password.js';
import { RESET_TTL_MINUTES, resetPasswordEmail } from './emails.js';
import { hashToken, newOpaqueToken, newRefreshToken, signAccess } from './tokens.js';

/** The one user shape returned by register / login / refresh / me. */
export const toUserPayload = (row) => ({
  id: Number(row.id), email: row.email, displayName: row.display_name, roles: row.roles,
});

const invalidLogin = () => new HttpError(401, 'Unauthorized', { detail: 'Invalid email or password' });
const wrongCurrentPassword = () => new HttpError(400, 'Bad Request', { detail: 'Current password is incorrect' });
const invalidResetLink = () => new HttpError(400, 'Bad Request', { detail: 'Invalid or expired reset link' });
const invalidRefresh = () => new HttpError(401, 'Unauthorized', { detail: 'Invalid or expired session' });

export function createAuthService({ repo, jwt, refreshTtlDays, refreshGraceSeconds = 0, mailer, appBaseUrl }) {
  const refreshExpiry = () => new Date(Date.now() + refreshTtlDays * 86_400_000);

  async function startSession(userRow) {
    const { token, hash } = newRefreshToken();
    await repo.insertRefreshToken({ userId: userRow.id, hash, expiresAt: refreshExpiry() });
    return { accessToken: await signAccess(userRow.id, jwt), refreshToken: token, user: toUserPayload(userRow) };
  }

  return {
    async register({ email, displayName, password }) {
      const passwordHash = await hashPassword(password);
      let id;
      try {
        id = await repo.createUser({ email, passwordHash, displayName, roles: ['reader'] });
      } catch (err) {
        if (err?.code === '23505') throw new HttpError(409, 'Conflict', { detail: 'Email is already registered' });
        throw err;
      }
      return startSession(await repo.findUserById(id));
    },

    async login({ email, password }) {
      const user = await repo.findUserByEmail(email);
      if (!user) {
        await burnVerify(password);
        throw invalidLogin();
      }
      // Same error for wrong password and inactive account: no account-state oracle.
      if (!(await verifyPassword(user.password_hash, password)) || !user.is_active) throw invalidLogin();
      return startSession(user);
    },

    async refresh(oldToken) {
      if (!oldToken) throw invalidRefresh();
      const next = newRefreshToken();
      const r = await repo.rotateRefreshToken({
        oldHash: hashToken(oldToken), newHash: next.hash, expiresAt: refreshExpiry(), graceMs: refreshGraceSeconds * 1000,
      });
      if (r.status !== 'ok') throw invalidRefresh();
      const user = await repo.findUserById(r.userId);
      if (!user || !user.is_active) {
        await repo.revokeFamilyByHash(next.hash);
        throw invalidRefresh();
      }
      return { accessToken: await signAccess(user.id, jwt), refreshToken: next.token, user: toUserPayload(user) };
    },

    /** ADR-003: re-auth with the current password; every session dies, the caller gets a fresh one. */
    async changePassword(user, { currentPassword, newPassword }) {
      if (!(await verifyPassword(user.password_hash, currentPassword))) throw wrongCurrentPassword();
      await repo.updatePassword(user.id, await hashPassword(newPassword), new Date());
      return startSession(user);
    },

    /**
     * ADR-003 #6: runs after the 202 has been sent, so known and unknown emails cost the caller the same. Unknown and
     * inactive accounts get no mail and no error.
     */
    async requestPasswordReset(email) {
      const user = await repo.findUserByEmail(email);
      if (!user || !user.is_active) return;
      const { token, hash } = newOpaqueToken();
      await repo.issueUserToken({ userId: user.id, purpose: 'reset', hash, expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) });
      await mailer.send(resetPasswordEmail({ to: user.email, appBaseUrl, token }));
    },

    /** One generic error for unknown / used / expired / superseded tokens and inactive users. No auto-login. */
    async confirmPasswordReset({ token, newPassword }) {
      const userId = await repo.resetPasswordWithToken({
        tokenHash: hashToken(token), passwordHash: await hashPassword(newPassword), changedAt: new Date(),
      });
      if (!userId) throw invalidResetLink();
    },

    async logout(token) {
      if (token) await repo.revokeFamilyByHash(hashToken(token));
    },
  };
}
