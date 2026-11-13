import { hasPool, query } from '../../db.js';

export const DEFAULT_SETTINGS = Object.freeze({
  site_name: 'News Portal',
  site_tagline: 'Plain-language news explainers, organised by topic and easy to scan.',
  allow_registration: true,
  allow_comments: true,
  articles_per_page: 20,
  maintenance_mode: false,
});

/** Read global site_settings with safe defaults when DB is uninitialised (e.g. unit tests). */
export async function getPublicSettings() {
  if (!hasPool()) return { ...DEFAULT_SETTINGS };
  try {
    const { rows } = await query('SELECT key, value FROM site_settings');
    const merged = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (r.key in merged) merged[r.key] = r.value;
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
