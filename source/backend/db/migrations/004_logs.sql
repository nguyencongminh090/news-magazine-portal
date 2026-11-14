-- Phase-2 search click log and the system audit log.

-- user_id is NULL for anonymous searches.
CREATE TABLE search_click_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        bigint REFERENCES users (id) ON DELETE SET NULL,
  query_string   text NOT NULL CHECK (length(query_string) <= 500),
  clicked_doc_id bigint NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_click_log_clicked_doc_id_idx ON search_click_log (clicked_doc_id);
CREATE INDEX search_click_log_created_at_idx ON search_click_log (created_at);

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    bigint REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor_id_idx ON audit_log (actor_id);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
