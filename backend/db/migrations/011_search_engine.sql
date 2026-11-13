-- Phase 2: Search Engine query logging & click-through evaluation extensions.

CREATE TABLE IF NOT EXISTS search_query_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         bigint REFERENCES users (id) ON DELETE SET NULL,
  query_string    text NOT NULL CHECK (length(query_string) BETWEEN 1 AND 500),
  retrieval_model text NOT NULL DEFAULT 'bm25'
                  CHECK (retrieval_model IN ('bm25', 'tfidf', 'ql', 'boolean', 'hybrid', 'ilike')),
  filters         jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_doc_ids  bigint[] NOT NULL DEFAULT '{}',
  total_results   int NOT NULL DEFAULT 0 CHECK (total_results >= 0),
  latency_ms      double precision NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_query_log_created_at_idx ON search_query_log (created_at DESC);
CREATE INDEX IF NOT EXISTS search_query_log_query_idx ON search_query_log (lower(trim(query_string)));

ALTER TABLE search_click_log
  ADD COLUMN IF NOT EXISTS query_log_id bigint REFERENCES search_query_log (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rank_position int CHECK (rank_position IS NULL OR rank_position >= 1),
  ADD COLUMN IF NOT EXISTS retrieval_model text;

CREATE INDEX IF NOT EXISTS search_click_log_query_log_idx ON search_click_log (query_log_id) WHERE query_log_id IS NOT NULL;
