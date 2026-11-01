import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

// Regression: `.wrap` supplies the 16px side gutter; a `padding:` shorthand on a class that is
// combined with `.wrap` (<div className="wrap home">) resets it to 0 and content touches the screen edge.
describe('styles.css gutters', () => {
  it.each(['.home', '.page', '.state'])('%s does not reset the .wrap side padding', (selector) => {
    const rule = css.split('\n').find((l) => l.startsWith(`${selector} {`));
    if (!rule) return;
    expect(rule).not.toMatch(/(^|[;{\s])padding:/);
  });
});

// Regression: the status badge is "<icon> <label>"; without nowrap a narrow table cell breaks after the icon
// and the glyph sits alone on its own line above the label.
describe('styles.css status badge', () => {
  it('.status never wraps between icon and label', () => {
    const rule = css.split('\n').find((l) => l.startsWith('.status {'));
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });
});

// DESIGN.md: every colour literal lives in :root (tokens); the rest of the sheet only uses var(--token).
describe('styles.css tokens', () => {
  it('has no colour literals outside :root and the data-URI grain', () => {
    const outside = css.replace(/:root\s*\{[\s\S]*?\n\}/, '').replace(/url\("data:[^"]*"\)/g, '');
    // category tint pairs (.cat-*) are token definitions too
    const body = outside.split('\n').filter((l) => !/^\.cat-[a-z]+ \{/.test(l) && !/^\.cat-[a-z]+ \{.*\} \.cat-/.test(l)).join('\n');
    expect(body.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
  });
  it('declares exactly 2 font families, 4 files', () => {
    expect(css.match(/@font-face/g)).toHaveLength(4);
    expect([...css.matchAll(/font-family: "([^"]+)"; font-style/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i)).toEqual(['Fraunces', 'Nunito Sans']);
  });
  it('honours prefers-reduced-motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});
