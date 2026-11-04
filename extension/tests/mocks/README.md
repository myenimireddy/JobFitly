# Demo portal HTML fixtures

Static application forms used by offline mock-runner and Side Panel UI e2e
(`LIVE_ATS` unset). Playwright serves these at portal-looking URLs so
`PortalEngine.detect()` still selects Lever / Greenhouse / Ashby / Workday.

| File | Portal |
|------|--------|
| `lever.html` | Lever |
| `greenhouse.html` | Classic Greenhouse |
| `reddit-greenhouse.html` | Greenhouse Job Board (React-Select) — used by UI matrix |
| `ashby.html` | Ashby |
| `workday.html` | Workday |
| `generic.html` | Generic fallback (any host) |

Kitchen-sink controls use `data-testid="ks-*"` (textarea, select, radio, checkbox, file). Coverage sheet: [`docs/portal-field-coverage.md`](../../../docs/portal-field-coverage.md).

These are **structural** stand-ins (hostname + widget patterns), not pixel clones of every employer board. Prefer fixing a failing control type here first; confirm stubborn live-only markup with a real apply URL afterward.

Keep these in git. Prefer editing fixtures over hitting live ATS for day-to-day inject work.
