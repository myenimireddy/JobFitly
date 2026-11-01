---
name: jobfitly-dev
description: >-
  Develop JobFitly features across backend (Express/Prisma/Ollama), frontend
  (React/Vite), and Chrome MV3 extension autofill. Use when adding portals,
  autofill intents, application-profile fields, resume parsing, match scoring,
  HITL fill UX, e2e/offline tests, or any JobFitly product change.
---

# JobFitly development

Read this skill before changing autofill, portals, profile capture, or LLM paths.
Deeper maps: [architecture.md](architecture.md) · hard-won traps: [autofill-pitfalls.md](autofill-pitfalls.md).

## Stack at a glance

| Layer | Path | Role |
|-------|------|------|
| API | `backend/` | Profile, match, autofill planner, Ollama/Groq |
| Web | `frontend/` | Resume upload, profile editor, application capture |
| Extension | `extension/` | Scrape + inject on ATS pages; popup HITL fill |
| LLM | local Ollama default | Resume parse + narrative drafts only |

Privacy: cloud LLM paths must go through `piiSanitizer` (placeholders → restore).

## Autofill pipeline (do not invent a parallel path)

```
Page DOM
  → PortalEngine.scrape()          extension/src/portalEngine.js (+ portals/*)
  → POST /api/autofill/...         backend modules/autofill
  → planField / applyLlmAnswer     logic.js (intents + buckets)
  → AutofillSection one-by-one     popup HITL
  → PortalEngine.inject()          same portal module
  → optional saveMissingAnswers    storageKeyForAnswer (not raw canonicalKey)
```

**Buckets** from `planField` / `applyLlmAnswer`:

| bucket | source | Popup behavior |
|--------|--------|----------------|
| `known` | `profile` / saved | Inject after pacing (no review) |
| `ask` | `llm` | **Always** pause for human review before inject |
| `missing` | — | Ask human; free-text may **Ask AI** via `POST /api/autofill/draft` |

Never auto-inject LLM drafts. Never invent work-auth / salary / legal yes-no.
On-demand drafts still land in the HITL textarea for edit + Fill — they do not inject alone.

## Where to change what

| Goal | Touch |
|------|--------|
| New ATS wording for an existing fact | Add phrase on an intent in `backend/src/modules/autofill/logic.js` `INTENTS` — **not** a new if-branch |
| New shared application fact | `APPLICATION_FIELD_CATALOG` + merge in `applicationFields.js`; wire `buildFacts` |
| New portal scrape/inject | Prefer `extension/src/portals/<name>.js` + register in `portalEngine.js` |
| Greenhouse Job Board / React-Select | `extension/src/portals/greenhouseJobBoard.js` only |
| Fill UX / HITL / consent UI | `extension/src/popup/AutofillSection.jsx` |
| Resume parse | `backend/src/lib/llmResumeParser.js` + sections helpers |
| Match score (no LLM) | `backend/src/modules/match/` |

Phone model:

- `applicationProfile.phone` = `{ country, countryCode, nationalNumber }`
- `personalInfo.phone` = **national string only** (ProfileEditor + sanitizer)

Country dial vs mailing country: persist dial under `phone_country` via `storageKeyForAnswer`; never let `+1` / `United States +1` poison address `country` or EEO fields.

## Feature workflow

1. **Scope the layer** — planner (backend), DOM (portal), or HITL (popup). Keep test-only churn out of core fill.
2. **Match existing style** — CommonJS in backend modules; ESM in extension/frontend Vite.
3. **Add/adjust unit tests** next to the module (`*.test.js`) for planner, fields, sanitizer.
4. **Offline first** — `extension/tests` (jsdom mocks). Live Playwright only in `extension/e2e` with URLs from `e2e/portals.json`.
5. **Rebuild extension** after popup/content/portal edits: `make build-extension` or watch via `make dev-extension`, then refresh on `chrome://extensions`.
6. **No real PII in fixtures/seeds** — use the Alex Rivera mock pattern.

### Commands

```bash
make install && make setup          # once
make ollama                         # separate terminal
make dev-backend / dev-frontend / dev-extension
make test                           # backend Jest
cd extension && npm test            # offline mocks
cd extension && npm run test:e2e    # live portals (backend up as needed)
```

## Hard rules

- **Do not** bulk-scrape every React-Select menu into options (GH removeChild crashes; dial codes leak into orientation).
- **Do not** `.remove()` Greenhouse option menus from the DOM — React owns that tree.
- **Do not** reorganize `tests/` ↔ `e2e/` by rewriting `PortalEngine` / portal inject.
- **Do not** store structured phone on `personalInfo.phone`.
- Prefer one-field human pacing in the popup over “fill everything silently.”
- Prefer intent phrases over portal-specific answer logic in the backend.

## PR / change checklist

- [ ] Intent or catalog updated if new question wording / fact
- [ ] Dial/country keys still split (`phone_country` vs `country`)
- [ ] LLM answers still `bucket: ask` + popup review
- [ ] Unit tests for planner / applicationFields when touched
- [ ] Offline mock or e2e artifact updated only if portal behavior changed
- [ ] Extension rebuilt if shippable UI/DOM code changed
- [ ] No real candidate PII in seeds, fixtures, or screenshots committed
