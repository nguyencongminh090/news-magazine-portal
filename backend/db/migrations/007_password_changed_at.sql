-- ADR-003 #8: access tokens issued before this instant are rejected (set on change/reset password).
ALTER TABLE users ADD COLUMN password_changed_at timestamptz NULL;
