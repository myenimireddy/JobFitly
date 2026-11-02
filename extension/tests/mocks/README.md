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

Keep these in git. Prefer editing fixtures over hitting live ATS.
