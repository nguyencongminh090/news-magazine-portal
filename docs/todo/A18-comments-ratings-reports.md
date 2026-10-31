# A18 — Comments, ratings and reports (API + UI)
**Status:** ✅ DONE 2026-10-31 — backend + ArticlePage UI + jsdom + real-browser pass + ui-audit (0 block/major); admin reports UI = new item
**Area:** `backend/src/` (new routes), `frontend/src/pages/ArticlePage.jsx`, admin moderation view
**From:** split out of #10 on 2026-10-31 (user: "tạo item riêng cho comments/rating/report")   **Depends:** A14 (auth), A17 (admin API pattern); schema exists (A02, A04: `comments`, `ratings`, `reports`)

## Problem
Article page shows only the placeholder "Comments are not available yet."; no endpoints exist for comments, ratings or reports. `rateLimit.js` already anticipates comment/rating/report limits (A05).
## Scope
1. Design first (`features/<slug>/`): endpoints, RBAC (who may post/rate/report/moderate), moderation flow, anti-spam, comment threading yes/no.
2. Public API: list/post comment, rate article (one rating per user), report article or comment (partial unique indexes from A04).
3. Frontend on ArticlePage: rating control, comments list + form (visible signifiers per DESIGN.md), report link.
4. Admin moderation of comments/reports (may be a follow-up item).
## Don't
- Don't start without the design sign-off; don't add a second source for counts (one entity = one source).
- Don't render user text as HTML (escape; text nodes only).
## Traps
- Rate limits + CSRF/auth on write endpoints; anonymous vs signed-in rules must be decided in the design.
- Rating/comment counts must come from one payload builder shared by list and article views.
- Status shown by text/icon, never colour alone; touch targets >= 44px.
## Why this way
Cross-layer (DB + API + UI + moderation) → size L per tracking rules.
## Done when
- Design approved; backend tests cover RBAC, uniqueness, rate limit; jsdom + real-browser pass on ArticlePage; ui-audit has no block/major.
