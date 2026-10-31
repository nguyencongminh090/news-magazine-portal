# 2026-10-31 14:50 — #10 Content touches the screen edge below 1152px
## Prompt
Task 7 real-browser pass (375px): Home/Category/Not-found text flush against the left edge while the masthead kept its 16px gutter.
## Root cause
`.wrap` sets `padding: 0 16px`; `.home`, `.page`, `.state` (used as `class="wrap home"` etc.) declared the `padding` shorthand later in the file, resetting the side padding to 0. Invisible on desktop because the 1120px container is centred.
## Fix
`padding-block` instead of the shorthand in those three rules. Regression test `frontend/src/styles.test.js` fails if a class combined with `.wrap` uses the `padding:` shorthand (verified red on `.state` before the fix).
## Verification
`npm --prefix frontend test` green; 375px iframe pass shows the 16px gutter on Home, Category, 404.
