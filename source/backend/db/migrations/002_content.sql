-- Categories, tags and documents (articles).

CREATE TABLE categories (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX categories_name_lower_key ON categories (lower(name));

CREATE TABLE tags (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX tags_name_lower_key ON tags (lower(name));

CREATE TABLE documents (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title            text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  summary          text NOT NULL DEFAULT '',
  content          text NOT NULL,
  category_id      bigint NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  author_name      text NOT NULL CHECK (length(author_name) BETWEEN 1 AND 200),
  author_id        bigint REFERENCES users (id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  views_count      bigint NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  meta_title       text CHECK (length(meta_title) <= 70),
  meta_description text CHECK (length(meta_description) <= 320),
  og_image_url     text,
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX documents_category_id_idx ON documents (category_id);
CREATE INDEX documents_created_at_idx ON documents (created_at DESC);
CREATE INDEX documents_published_idx ON documents (published_at DESC) WHERE status = 'published';
CREATE INDEX documents_author_id_idx ON documents (author_id);

-- Tags live only here; the API payload exposes them as a list (one entity = one source).
CREATE TABLE document_tags (
  document_id bigint NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  tag_id      bigint NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);
CREATE INDEX document_tags_tag_id_idx ON document_tags (tag_id);
