# Extension (Chrome MV3)

Chrome Side Panel + content script that scrapes ATS pages, scores job fit, and fills forms **one field at a time** (human-in-the-loop). Never clicks Submit.

Load unpacked from `extension/dist/` after build. Manifest: `public/manifest.json`.

## What this block owns

| Area | Path | Notes |
|------|------|--------|
| Side Panel UI | `src/sidepanel/` | **Primary UI** (stays open while clicking the form) |
| Shared popup sections | `src/popup/` | Profile, Match, Autofill, Settings — reused by Side Panel |
| Content script | `src/content.js` | Job text extract + message bridge → PortalEngine |
| Portal scrape/inject | `src/portalEngine.js` + `src/portals/` | Per-ATS quirks |
| Service worker | `src/background.js` | Open Side Panel on toolbar click |
| Tab helpers | `src/lib/contentBridge.js` | Ping / inject content script safely |
| Offline tests | `tests/` | jsdom mocks (fast, pre-commit) |
| Live e2e | `e2e/` | Playwright against real ATS URLs |

API origin defaults to `http://localhost:3000` (`src/lib/apiConfig.js`). Testers can change it in Side Panel **Settings → Backend URL** (stored in `chrome.storage.local`).

## HITL autofill pipeline

```
Page DOM
  → PortalEngine.scrape()
  → classify requirement: required | optional | unknown
  → Required only (default) or All fields
  → POST /api/autofill/...
  → planField buckets: known | ask | missing
  → AutofillSection (Fill / Ask AI / Skip / Start over)
  → PortalEngine.inject()
```

- `known` — inject after short pacing (profile / saved)
- `ask` — **always** show draft for human review before inject
- `missing` — human types; optional Ask AI still lands in the textarea

### Fill modes and required fields

- **Required only** skips fields confirmed optional before they reach the backend or LLM.
- **All fields** preserves the full-form behavior.
- A field with unclear ATS metadata stays `unknown` and is reviewed; it is never silently treated as optional.
- Detection uses native `required`, `aria-required`, visible required markers, and portal wrappers.
- Required consent, file upload, CAPTCHA, authentication, signature, and Submit remain manual.
- The last mode is stored only in `chrome.storage.local`, never in the job site's page storage.

## Settings (Groq vs Ollama)

Gear icon in the Side Panel header → `SettingsPanel.jsx` → `GET/PUT /api/settings/llm`.

- With a Groq key → fast Analyze / Ask AI
- **Use Ollama** → force local (slower)

## Commands

```bash
# from repo root
make build-extension   # one-shot → dist/
make dev-extension     # Vite watch
make test-extension    # offline mocks
make test-e2e          # live ATS (not in pre-commit)

cd extension
npm test
npm run test:offline
```

After UI/DOM changes: rebuild (or watch), then **refresh** the extension on `chrome://extensions`.

## Adding a portal

1. Prefer `src/portals/<name>.js` + register in `portalEngine.js`
2. Greenhouse Job Board / React-Select → only `portals/greenhouseJobBoard.js`
3. Do **not** bulk-scrape React-Select menus or `.remove()` option trees React owns
4. Add a mock under `tests/mocks/` when possible; live URLs in `e2e/portals.json`

More traps: [`.cursor/skills/jobfitly-dev/autofill-pitfalls.md`](../.cursor/skills/jobfitly-dev/autofill-pitfalls.md)

## Related docs

- [tests/README.md](tests/README.md) — offline mocks
- [e2e/README.md](e2e/README.md) — Playwright
- [../backend/README.md](../backend/README.md) — planner + LLM
- [../CONTRIBUTING.md](../CONTRIBUTING.md)
