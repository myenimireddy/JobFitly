---
name: jobfitly-dev
description: >-
  Develop JobFitly features across backend (Express/Prisma/Ollama/Groq), frontend
  (React/Vite), and Chrome MV3 Side Panel autofill. Use when adding portals,
  autofill intents, application-profile fields, resume parsing, match scoring,
  HITL fill UX, LLM settings, e2e/offline tests, beta setup, or any JobFitly
  product change.
---

# JobFitly development

Read this skill before changing autofill, portals, profile capture, match, or LLM paths.
Deeper maps: [architecture.md](architecture.md) · hard-won traps: [autofill-pitfalls.md](autofill-pitfalls.md).

Tester / non-dev setup: [`docs/setup.md`](../../../docs/setup.md) (`scripts/bootstrap.sh`, `scripts/start.sh` — no `make` required). Docs index: [`docs/README.md`](../../../docs/README.md).

## Stack at a glance

| Layer | Path | Role |
|-------|------|------|
| API | `backend/` | Profile, match, autofill planner, settings, Ollama/Groq |
| Web | `frontend/` | Resume upload, profile editor (optional for beta fill) |
| Extension | `extension/` | Side Panel HITL + scrape/inject on ATS pages |
| LLM | Groq if key, else Ollama | Resolved by `lib/llmSettings.js` (not env alone) |

**Privacy goal:** Profiles stay on the user’s machine (local SQLite). JobFitly does not host cloud copies. Cloud (Groq) prompts for Analyze / Ask AI / docs go through `piiSanitizer` (placeholders → restore). Resume parse **prefers reachable Ollama** even when Groq is configured; Groq fallback scrubs emails/phones first.

## LLM resolution

Order in `backend/src/lib/llmSettings.js`:

1. `forceOllama: true` in `backend/data/llm-settings.json` → Ollama  
2. Else usable Groq key (settings file **or** `GROQ_API_KEY`) → Groq  
3. Else → Ollama  

API: `GET/PUT /api/settings/llm` (never returns full key). Extension: `popup/SettingsPanel.jsx` via Side Panel gear.

## Autofill pipeline (do not invent a parallel path)

```
Page DOM
  → PortalEngine.scrape()          extension/src/portalEngine.js (+ portals/*)
  → POST /api/autofill/...         backend modules/autofill
  → planField / applyLlmAnswer     logic.js (intents + buckets)
  → AutofillSection one-by-one     Side Panel HITL
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
| New ATS wording for an existing fact | Phrase on an intent in `backend/src/modules/autofill/logic.js` `INTENTS` — **not** a new if-branch |
| New shared application fact | `APPLICATION_FIELD_CATALOG` in `applicationFields.js` + `buildFacts` |
| New portal scrape/inject | `extension/src/portals/<name>.js` + register in `portalEngine.js` |
| Greenhouse Job Board / React-Select | `portals/greenhouseJobBoard.js` only |
| Fill UX / HITL | `popup/AutofillSection.jsx` + `sidepanel/Panel.jsx` (**Side Panel**, not transient popup) |
| Job fit Analyze UI | `popup/MatchSection.jsx` (cancel must abort in-flight work) |
| Groq / Ollama Settings UI | `popup/SettingsPanel.jsx` + `modules/settings/` + `lib/llmSettings.js` |
| Resume parse | `lib/llmResumeParser.js` (prefer Ollama when reachable) |
| Match score + narrative | Heuristic `modules/match/` + `lib/llmMatchAnalyzer.js` (sanitize profile first) |
| Cover letter / tailored bullets API | `modules/documents/` + `lib/llmDocumentGenerator.js` — **not** in extension (`/api/documents` forbidden there) |

### Supported autofill portals (code, not marketing)

Dedicated: **Lever**, **Greenhouse** (+ Job Board), **Workday**, **Ashby**, plus **Generic** fallback.  
**LinkedIn:** job-text extract for Analyze only — **not** Easy Apply autofill.

Phone model:

- `applicationProfile.phone` = `{ country, countryCode, nationalNumber }`
- `personalInfo.phone` = **national string only** (ProfileEditor + sanitizer)

Country dial vs mailing country: persist dial under `phone_country` via `storageKeyForAnswer`; never let `+1` / `United States +1` poison address `country` or EEO fields.

## Feature workflow

1. **Scope the layer** — planner (backend), DOM (portal), or HITL (Side Panel). Keep test-only churn out of core fill.
2. **Match existing style** — CommonJS in `backend/`; ESM + Vite in `frontend/` and `extension/`.
3. **Add/adjust unit tests** next to the module (`*.test.js`) for planner, fields, sanitizer, llmSettings.
4. **Offline first** — `extension/tests` (jsdom mocks). Live Playwright only in `extension/e2e` with URLs from `e2e/portals.json`.
5. **Rebuild extension** after UI/DOM edits: `make build-extension` or `make dev-extension`, then refresh on `chrome://extensions`.
6. **No real PII** in fixtures, seeds, or committed screenshots — Alex Rivera mock pattern.
7. Update this skill / architecture map when ownership or LLM/privacy rules change.

### Commands

```bash
# Testers (no make)
./scripts/bootstrap.sh && ./scripts/start.sh

# Devs
make install && make setup
make ollama                         # separate terminal (or Groq key in Settings)
make dev-backend / make build-extension
make test-fast                      # stack + Jest + offline mocks (pre-commit)
cd extension && npm run test:e2e    # live portals (not in pre-commit)
```

## Hard rules

- **Do not** bulk-scrape every React-Select menu into options (GH removeChild crashes; dial codes leak into orientation).
- **Do not** `.remove()` Greenhouse option menus from the DOM — React owns that tree.
- **Do not** reorganize `tests/` ↔ `e2e/` by rewriting `PortalEngine` / portal inject.
- **Do not** store structured phone on `personalInfo.phone`.
- **Do not** wire the extension to `/api/documents` (cover letter API is web/backend only).
- Prefer one-field human pacing over “fill everything silently.”
- Prefer intent phrases over portal-specific answer logic in the backend.
- Cloud LLM: sanitize in; restore out. Keep sponsorship/clearance/certs when sanitizing for match.

## PR / change checklist

- [ ] Intent or catalog updated if new question wording / fact
- [ ] Dial/country keys still split (`phone_country` vs `country`)
- [ ] LLM answers still `bucket: ask` + Side Panel review
- [ ] Unit tests for planner / applicationFields / llmSettings when touched
- [ ] Offline mock or e2e artifact updated only if portal behavior changed
- [ ] Extension rebuilt if shippable UI/DOM code changed
- [ ] No real candidate PII / API keys in seeds, fixtures, screenshots, or issues
- [ ] Skill / README portals table still accurate if portal or LLM ownership changed
