-- Schema hardening from the architecture review (item #4).

-- 1. Refresh-token rotation: code must inherit the parent's family_id on rotation (no DEFAULT, so a forgotten
--    value fails loudly instead of silently starting a new family). used_at/replaced_by mark a token as rotated,
--    which revoked_at alone cannot tell apart from logout; presenting a used token again = reuse -> revoke the family.
ALTER TABLE refresh_tokens ALTER COLUMN family_id DROP DEFAULT;
ALTER TABLE refresh_tokens
  ADD COLUMN used_at     timestamptz,
  ADD COLUMN replaced_by bigint REFERENCES refresh_tokens (id) ON DELETE SET NULL;
CREATE INDEX refresh_tokens_replaced_by_idx ON refresh_tokens (replaced_by) WHERE replaced_by IS NOT NULL;

-- 2. updated_at is maintained by the database (one shared trigger function), not by application code.
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
CREATE TRIGGER users_set_updated_at     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER comments_set_updated_at  BEFORE UPDATE ON comments  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ratings_set_updated_at   BEFORE UPDATE ON ratings   FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Per-category published listing. documents_category_id_idx stays (FK on ON DELETE RESTRICT, covers drafts);
--    documents_author_id_idx stays (FK ON DELETE SET NULL scans it); documents_created_at_idx has no query yet.
CREATE INDEX documents_category_published_idx ON documents (category_id, published_at DESC) WHERE status = 'published';
DROP INDEX documents_created_at_idx;

-- 4. One report per reporter per target.
CREATE UNIQUE INDEX reports_reporter_document_key ON reports (reporter_id, document_id) WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX reports_reporter_comment_key  ON reports (reporter_id, comment_id)  WHERE comment_id IS NOT NULL;

-- 5. Phase-2 search baseline: weighted generated tsvector (title > content) + GIN. No ranking/query code yet.
ALTER TABLE documents ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', content), 'B')
) STORED;
CREATE INDEX documents_tsv_idx ON documents USING gin (tsv);
