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
