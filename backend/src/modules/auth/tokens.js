import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const ALG = 'HS256';
const key = (secret) => new TextEncoder().encode(secret);

/** Access JWT: fixed alg, exp/iss/aud set, sub = user id only (no role: roles are read from the DB per request). */
export function signAccess(userId, jwt) {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(String(userId))
    .setIssuer(jwt.issuer)
    .setAudience(jwt.audience)
    .setIssuedAt()
    .setExpirationTime(jwt.accessTtl)
    .sign(key(jwt.secret));
}

/** Returns the user id (string) or null for any invalid/expired/wrong-alg token. */
export async function verifyAccess(token, jwt) {
  try {
    const { payload } = await jwtVerify(token, key(jwt.secret), {
      algorithms: [ALG], issuer: jwt.issuer, audience: jwt.audience, requiredClaims: ['sub', 'exp'],
    });
    return payload.sub;
  } catch {
    return null;
  }
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** Opaque refresh token: 32 random bytes; only the SHA-256 hex digest is stored. */
export function newRefreshToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
