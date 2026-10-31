import { hashPassword, passwordSchema } from './password.js';
import * as defaultRepo from './repo.js';

/** Create the first admin from env when no admin exists yet. Never logs the password. Returns 'created' | 'exists'. */
export async function bootstrapAdmin({ email, password }, repo = defaultRepo) {
  if (await repo.anyAdminExists()) return 'exists';
  passwordSchema.parse(password);
  await repo.createUser({
    email: email.trim().toLowerCase(), passwordHash: await hashPassword(password), displayName: 'Administrator', roles: ['admin'],
  });
  return 'created';
}
