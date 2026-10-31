# UI audit
Target: frontend/src/components/Engagement.jsx, frontend/src/pages/ArticlePage.jsx, frontend/src/styles.css (rating/comment rules); live /articles/<slug> at 1280 and 375 px (anon, unverified, verified)
Baseline: DESIGN.md (Style: vstyle-minimalism-swiss)
Mode: with-screenshots
Counts: block 0, major 0, minor 1

| id | severity | location | evidence | rule | note | suggested fix | status |
|---|---|---|---|---|---|---|---|
| F1 | minor | styles.css `h2 { margin: 0 }` in `.article`; Rating / Comments sections | "Comments (n)" heading sat directly under "Report" / "Reported. Thank you." (0 gap); sections had no vertical rhythm | LAY-GROUPING | vbase-layout-spacing#Spacing scale | `.article section { margin-top: 40px }`, `.article h2 { margin-bottom: 8px }` | FIXED (gap now ~40px at 375) |

Passed (live): no horizontal scroll at 1280/375; all article buttons/links/textarea >= 44px; stars are text + aria-pressed (not colour only); focus ring 3px; user HTML rendered as text; anon/unverified see a notice and no controls; one filled primary per block.
Not checked (visual/other): 200% zoom, dark theme (none), 320px.
