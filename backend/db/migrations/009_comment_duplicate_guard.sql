-- #18: atomic double-submit / copy-paste spam guard: one identical comment body per user per article.
-- md5() keeps the index small for 2000-char bodies; NULL user_id (deleted account) never collides.
CREATE UNIQUE INDEX comments_user_document_body_key ON comments (user_id, document_id, md5(body));
