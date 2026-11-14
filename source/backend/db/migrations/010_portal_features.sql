-- Phase-1 completion: moderator role, user profiles & tagging, article likes, image alt/keywords, site settings.

INSERT INTO roles (name) VALUES ('moderator') ON CONFLICT (name) DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 500),
  ADD COLUMN IF NOT EXISTS avatar_url text CHECK (avatar_url IS NULL OR avatar_url ~ '^https://[^[:space:]]+$');

CREATE TABLE IF NOT EXISTS user_tags (
  user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tag_id     bigint NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag_id)
);
CREATE INDEX IF NOT EXISTS user_tags_tag_id_idx ON user_tags (tag_id);

ALTER TABLE document_tags
  ADD COLUMN IF NOT EXISTS added_by bigint REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_user_tag boolean NOT NULL DEFAULT false;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS image_alt text CHECK (length(image_alt) <= 250),
  ADD COLUMN IF NOT EXISTS seo_keywords text NOT NULL DEFAULT '' CHECK (length(seo_keywords) <= 300);

CREATE TABLE IF NOT EXISTS article_likes (
  user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  document_id bigint NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);
CREATE INDEX IF NOT EXISTS article_likes_document_id_idx ON article_likes (document_id);

CREATE TABLE IF NOT EXISTS site_settings (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  value      jsonb NOT NULL,
  updated_by bigint REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO site_settings (key, value) VALUES
  ('site_name', '"News Portal"'),
  ('site_tagline', '"Plain-language news explainers, organised by topic and easy to scan."'),
  ('allow_registration', 'true'),
  ('allow_comments', 'true'),
  ('articles_per_page', '20'),
  ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;
