```mermaid
sequenceDiagram
  participant SPA
  participant API
  participant DB
  SPA->>API: POST /api/auth/login {email,password}
  API->>DB: user by lower(email); argon2 verify
  API->>DB: insert refresh_tokens (hash, new family)
  API-->>SPA: 200 {accessToken, user} + Set-Cookie refresh (HttpOnly, Path=/api/auth)
  SPA->>API: GET /api/... Authorization: Bearer access (memory only)
  Note over SPA,API: page reload or 401 expired
  SPA->>API: POST /api/auth/refresh (cookie + X-Requested-With)
  API->>DB: lookup hash; revoked? -> revoke whole family, 401
  API->>DB: revoke old, insert new (same family)
  API-->>SPA: 200 {accessToken, user} + rotated cookie
```
