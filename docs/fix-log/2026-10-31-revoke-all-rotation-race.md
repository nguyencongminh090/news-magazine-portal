# 2026-10-31 20:06 — #15 revoke-all raced an in-flight refresh rotation
## Prompt
Automated security review of 68b7214 (MEDIUM, incomplete session revocation in `updatePassword`).
## Root cause
`rotateRefreshToken` locked only the token row, then inserted the successor. A concurrent `updatePassword`
(also `setRoles`, pre-existing) blocked on that row; under READ COMMITTED its `UPDATE refresh_tokens … WHERE user_id`
re-checks blocked rows but never sees rows inserted after its snapshot, so the successor stayed live and the
session survived the password change / role change.
## Fix
One lock order, user row first: `updatePassword` takes `users FOR UPDATE` (as `setRoles` already did);
rotation takes `users FOR SHARE` before `refresh_tokens FOR UPDATE` (rotations of one user still run in parallel).
## Verification
New deterministic test in `repo.test.js` (third connection holds the token lock, rotation queued, then password change)
failed first (1 live token), passes now; backend 49/49 with TEST_DATABASE_URL.
