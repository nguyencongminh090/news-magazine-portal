import { categoryArt } from './categoryArt.js';

test('every seeded category slug has its own scene (no shared thumbnails)', () => {
  const slugs = ['politics', 'sports', 'science-technology', 'health', 'crime-law', 'environment', 'disasters', 'weather'];
  const arts = slugs.map((s) => categoryArt(s).art);
  expect(new Set(arts).size).toBe(slugs.length);
});
test('unknown slug falls back to the neutral sprout', () => {
  expect(categoryArt('nope')).toMatchObject({ art: 'empty', key: 'default' });
});
