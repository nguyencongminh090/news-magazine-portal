import { formatDate } from './format.js';

test('formatDate returns empty string for null and invalid input', () => {
  expect(formatDate(null)).toBe('');
  expect(formatDate('not a date')).toBe('');
});

test('formatDate formats an ISO date', () => {
  expect(formatDate('2026-10-31T00:00:00Z')).toBe('31 Oct 2026');
});

import { parsePage } from './format.js';

test('parsePage falls back to 1 for anything that is not an integer >= 1', () => {
  expect(parsePage('0')).toBe(1);
  expect(parsePage('-1')).toBe(1);
  expect(parsePage('abc')).toBe(1);
  expect(parsePage('1.5')).toBe(1);
  expect(parsePage(null)).toBe(1);
  expect(parsePage('3')).toBe(3);
});
