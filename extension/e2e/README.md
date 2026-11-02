# Live portal e2e

Real Greenhouse / Lever / Ashby / Workday apply pages. **Does not change core fill logic** — only drives `PortalEngine` against live DOM.

```
e2e/
  portals.json              # single source of apply URLs
  fixtures/                 # answer catalogs for inject asserts
  helpers/                  # DOM verify, engine loader, portalUrl()
  live-*.spec.js            # Playwright specs
  artifacts/                # screenshots / JSON dumps (gitignored)
```

## Portal URLs

Edit [`portals.json`](./portals.json) or override:

| Env | Portal |
|-----|--------|
| `GH_JOB_URL` | Greenhouse |
| `LEVER_JOB_URL` | Lever |
| `ASHBY_JOB_URL` | Ashby |
| `WORKDAY_JOB_URL` | Workday |

## Commands

```bash
cd extension
# backend must be up for generateAnswers specs
npm run test:e2e                 # all live specs
npm run test:e2e:customer        # Test Customer 1 × 4 portals
npm run test:e2e -- e2e/live-consolidated-validate.spec.js
# or from repo root:
make test-e2e
```

**Not in git pre-commit** — live ATS needs network and can take minutes. Pre-commit runs `make test-fast` (stack + Jest + offline mocks) only.

Manual: open a URL from `portals.json`, load the extension, **Fill Form** (do not submit).
