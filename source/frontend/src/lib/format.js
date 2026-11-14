const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/** Query-string page → integer >= 1; anything else (0, -1, "abc", "1.5", null) becomes 1. */
export function parsePage(value) {
  return /^\d+$/.test(value ?? '') && Number(value) >= 1 ? Number(value) : 1;
}
