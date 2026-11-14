/** Wavy section divider; colour comes from `color` (token) of the parent. */
export function Wave({ flip = false }) {
  return (
    <svg className={`wave${flip ? ' flip' : ''}`} viewBox="0 0 1200 46" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 46V22C100 2 200 2 300 18s200 24 300 8 200-24 300-8 200 18 300 6V46z" fill="currentColor" />
    </svg>
  );
}
