-- ADR-003: single-use emailed tokens (password reset, email verification). Only the SHA-256 digest is stored.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz NULL;

CREATE TABLE user_tokens (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('reset', 'verify')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_tokens_user_purpose_idx ON user_tokens (user_id, purpose);
