import { formatDate } from './format.js';

test('formatDate returns empty string for null and invalid input', () => {
  expect(formatDate(null)).toBe('');
  expect(formatDate('not a date')).toBe('');
});

test('formatDate formats an ISO date', () => {
  expect(formatDate('2026-10-31T00:00:00Z')).toBe('31 Oct 2026');
});
