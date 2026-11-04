# Offline portal tests

Fast checks against **mock HTML** — no network, no Playwright browsers required for `npm test`.

```
tests/
  mocks/           # static portal HTML
  mock-runner.js   # jsdom scrape + inject
  offline/         # Playwright against local fixtures
  manual-test.js   # paste into DevTools on a real page
```

## Commands

```bash
cd extension
npm test                 # mock-runner (jsdom) — also run via `make test-fast` / git pre-commit
npm run test:offline     # greenhouse fixture inject (Playwright, no live sites)
npm run test:e2e:ui      # Side Panel UI matrix on local mocks (default)
LIVE_ATS=1 npm run test:e2e:ui   # opt-in live ATS (avoid unless needed)
```

`npm test` also verifies the fill-mode policy: Required only removes confirmed optional fields, keeps unknown requirement state for review, and All fields preserves every field.

**Coverage note:** offline + live e2e exercise **PortalEngine scrape/inject**. Side Panel HITL UX (Ask AI, Start over, tab switch) is guarded by `scripts/check-stack.js` + backend planner Jest tests, not full UI e2e.

## Mock pages

Open in a browser if you want to poke at markup:

- `mocks/greenhouse.html`
- `mocks/lever.html`
- `mocks/ashby.html`
- `mocks/workday.html`
- `mocks/reddit-greenhouse.html` (React-Select Job Board fixture)

Live ATS URLs and Playwright e2e live under [`../e2e`](../e2e/).
