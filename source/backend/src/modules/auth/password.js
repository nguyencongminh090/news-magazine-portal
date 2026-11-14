import argon2 from 'argon2';
import { z } from 'zod';

// OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane.
const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Small bundled blocklist of very common passwords (NIST 800-63B: reject commonly used values).
const BLOCKLIST = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'iloveyou', 'admin123', 'welcome1', 'letmein1', 'abc12345', 'passw0rd', '11111111', '00000000', 'football1',
]);

/** Length 8-128, no composition rules, no truncation; common passwords rejected. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((p) => !BLOCKLIST.has(p.toLowerCase()), 'Password is too common');

export const hashPassword = (plain) => argon2.hash(plain, OPTS);

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false; // malformed hash must not turn into a 500 or reveal anything
  }
}

let dummy;
/** Verify against a throwaway hash so unknown-email logins cost the same as wrong-password ones. */
export async function burnVerify(plain) {
  dummy ??= await hashPassword('timing-equalisation-only');
  await verifyPassword(dummy, plain);
}
