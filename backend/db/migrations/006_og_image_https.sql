-- og_image_url must be an absolute https URL (blocks javascript:/data: before it reaches a meta tag).
UPDATE documents SET og_image_url = NULL WHERE og_image_url IS NOT NULL AND og_image_url !~ '^https://[^[:space:]]+$';
ALTER TABLE documents ADD CONSTRAINT documents_og_image_url_https CHECK (og_image_url IS NULL OR og_image_url ~ '^https://[^[:space:]]+$');
