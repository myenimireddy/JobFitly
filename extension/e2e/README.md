# Portal e2e (local fixtures by default)

Side Panel / PortalEngine tests against **saved HTML** under `extension/tests/mocks/`. Playwright fulfills those fixtures at portal-looking URLs so `PortalEngine.detect()` still picks Lever / Greenhouse / Ashby / Workday — **no live ATS traffic** unless you opt in.

```
e2e/
  portals.json              # live apply URLs (only used with LIVE_ATS=1)
  fixtures/                 # answer catalogs for inject asserts
  helpers/                  # portalUrl(), openPortalPage(), UI helpers
  live-*.spec.js            # Playwright specs
  artifacts/                # screenshots / JSON dumps (gitignored)
```

Local HTML sources: [`../tests/mocks/`](../tests/mocks/) (`reddit-greenhouse.html`, `lever.html`, `ashby.html`, `workday.html`).

## Live ATS (opt-in only)

```bash
LIVE_ATS=1 npm run test:e2e:ui          # real Greenhouse/Lever/Ashby/Workday
LIVE_ATS=1 npm run test:e2e             # inject-only against live DOM
```

Optional live URL overrides (only when `LIVE_ATS=1`):

| Env | Portal |
|-----|--------|
| `GH_JOB_URL` | Greenhouse |
| `LEVER_JOB_URL` | Lever |
| `ASHBY_JOB_URL` | Ashby |
| `WORKDAY_JOB_URL` | Workday |

## Commands

```bash
cd extension
# backend on :3000 for UI suite (resume parse)
npm run test:e2e:ui              # Side Panel × local fixtures (default)
ROLE_KEY=fullstack PORTAL=lever npm run test:e2e:ui
npx playwright test --project=e2e-ui e2e/live-extension-ui-refill.spec.js
npm run test:e2e                 # inject specs — also local unless LIVE_ATS=1
npm run test:e2e:ui:live         # explicit live ATS (can get you flagged)
```

### Extension UI suite (`e2e-ui`)

`live-extension-ui.spec.js` loads unpacked `dist/`, opens the Side Panel page, and for **each** of the 10 sample résumés × **4** portals:

1. Upload PDF → wait until parse finishes  
2. Complete application capture  
3. Click **Fill Form** and drive HITL prompts  
4. Assert `identified === filled + skipped`, focus stamps, and **form DOM matches persona** (email / name / phone)  

Artifacts: `e2e/artifacts/extension-ui/summary.json`

**Not in git pre-commit.** Pre-commit runs `make test-fast` (stack + Jest + offline mocks) only.

Manual CI: GitHub Actions → **Extension UI e2e (manual)** (`workflow_dispatch` only).  
Defaults to `ROLE_KEY=fullstack` (~1–2 min when healthy). Empty `role_key` runs all 10×4.  
**Requires** repo secret `GROQ_API_KEY` — without it the backend waits on Ollama and each upload burns ~3 minutes until Playwright times out.
