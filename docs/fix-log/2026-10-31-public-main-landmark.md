# 2026-10-31 15:05 — #10 Article and 404 pages had no main landmark
## Prompt
Task 7 real-browser pass: Article and not-found views exposed 0 `<main>` landmarks; Home/Category/Search each declared their own, so the skip link target `#content` was a plain div.
## Root cause
`<main>` was declared per page instead of once in `PublicLayout`; pages added later (Article, NotFound) never got it. The 404 recovery link was also a 22px inline link.
## Fix
`PublicLayout` renders `<main id="content">`; pages use plain `div`. Back-to-home link uses `.btn secondary` (44px target). Test in `PublicLayout.test.jsx` (red without the layout change).
## Verification
`npm --prefix frontend test` 46 pass; 375px iframe: exactly one main on article and 404.
