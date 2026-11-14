// Category slug -> illustration (frontend/public/art/<art>.svg), sprite icon and tint class (.cat-<key> in styles.css).
const BY_SLUG = {
  politics: { art: 'politics', icon: 'landmark' },
  sports: { art: 'sports', icon: 'ball' },
  'science-technology': { art: 'science', icon: 'atom' },
  health: { art: 'health', icon: 'heart' },
  'crime-law': { art: 'law', icon: 'scale' },
  environment: { art: 'environment', icon: 'leaf' },
  disasters: { art: 'disasters', icon: 'alert' },
  weather: { art: 'weather', icon: 'cloud' },
};
const FALLBACK = { art: 'empty', icon: 'bookmarks' };

export function categoryArt(slug) {
  const hit = BY_SLUG[slug];
  return { ...(hit ?? FALLBACK), key: hit ? hit.art : 'default' };
}
