import { hashPassword, passwordSchema } from './password.js';
import * as defaultRepo from './repo.js';

/**
 * Create the first admin from env when no admin exists yet. Never logs the password.
 * Returns 'created' | 'exists' | 'email-taken' | 'weak-password'. Never promotes an existing account
 * (someone may have self-registered that address first) and never throws on operator mistakes.
 */
export async function bootstrapAdmin({ email, password }, repo = defaultRepo) {
  if (await repo.anyAdminExists()) return 'exists';
  const normalised = email.trim().toLowerCase();
  if (await repo.findUserByEmail(normalised)) return 'email-taken';
  if (!passwordSchema.safeParse(password).success) return 'weak-password';
  try {
    await repo.createUser({ email: normalised, passwordHash: await hashPassword(password), displayName: 'Administrator', roles: ['admin'], emailVerifiedAt: new Date() }); // ADR-003 #4: operator-supplied address
  } catch (err) {
    if (err?.code === '23505') return 'email-taken'; // lost a race with a registration
    throw err;
  }
  return 'created';
}
