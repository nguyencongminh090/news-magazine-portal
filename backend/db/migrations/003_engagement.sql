-- Comments, ratings and moderation reports.

CREATE TABLE comments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  user_id     bigint REFERENCES users (id) ON DELETE SET NULL,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status      text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_document_id_created_at_idx ON comments (document_id, created_at);
CREATE INDEX comments_user_id_idx ON comments (user_id);

CREATE TABLE ratings (
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  document_id bigint NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  score       smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);
CREATE INDEX ratings_document_id_idx ON ratings (document_id);

-- A report targets exactly one of a document or a comment.
CREATE TABLE reports (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporter_id bigint REFERENCES users (id) ON DELETE SET NULL,
  document_id bigint REFERENCES documents (id) ON DELETE CASCADE,
  comment_id  bigint REFERENCES comments (id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((document_id IS NULL) <> (comment_id IS NULL))
);
CREATE INDEX reports_status_created_at_idx ON reports (status, created_at);
CREATE INDEX reports_document_id_idx ON reports (document_id);
CREATE INDEX reports_comment_id_idx ON reports (comment_id);
