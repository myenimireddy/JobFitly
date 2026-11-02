# JobFitly architecture map

## Backend (`backend/src`)

| Module | Responsibility |
|--------|----------------|
| `modules/profile/` | Upload, parse, editor payload, `applicationFields` catalog/merge |
| `modules/autofill/` | `logic.js` planner + `service.js` LLM generate / save answers |
| `modules/match/` | Heuristic fit + optional LLM narrative (`llmMatchAnalyzer`) |
| `modules/job/` | Job posting CRUD / extract |
| `modules/settings/` | `GET/PUT /api/settings/llm` (Groq key; never full key in responses) |
| `modules/documents/` | Tailored resume / cover letter API (web only — not extension) |
| `llm/` | Factory → Groq or Ollama via `lib/llmSettings.resolveLlmRuntime()` |
| `lib/llmSettings.js` | Settings file + env key resolution / `forceOllama` |
| `lib/piiSanitizer.js` | Placeholder swap + restore for cloud providers |
| `lib/llmResumeParser.js` | Structured resume extraction (prefer reachable Ollama) |
| `lib/resumeSections.js` | Section helpers for parse |

Profile JSON (SQLite via Prisma) roughly:

```
parsedData: {
  personalInfo: { fullName, email, phone: string, ... },
  workExperience, education, skills, ...,
  applicationProfile: { phone: {country,countryCode,nationalNumber}, ... },
  extraAnswers: { [storageKey]: string }   // saved HITL / missing answers
}
```

### Autofill service flow

1. Scrape labels (+ options when safe) from extension.
2. `planField` each label → known / missing / skip.
3. LLM only for open / narrative intents; results become `bucket: ask`.
4. Client injects one field at a time; human answers may call save with `storageKeyForAnswer`.

## Extension (`extension/src`)

| File | Role |
|------|------|
| `content.js` | Message bridge → `PortalEngine` |
| `portalEngine.js` | Detect portal, scrape, inject, generic fallback, `scrapeOptionsForLabel` |
| `portals/greenhouseJobBoard.js` | GH boards React-Select / consent / dial-safe options |
| `sidepanel/` | Primary UI — Chrome Side Panel (stays open during HITL) |
| `popup/AutofillSection.jsx` | Generate → ordered one-by-one fill → HITL ask / Ask AI |
| `popup/MatchSection.jsx` | Analyze job fit on active tab (abort on Cancel) |
| `popup/SettingsPanel.jsx` | Groq key / Use Ollama |
| `popup/Popup.jsx` | Re-exports Panel for legacy imports |
| `lib/contentBridge.js` | Ensure content script + messaging helpers |
| `background.js` | `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` |

Legacy `parsers/` directory may be empty; **live path is PortalEngine + portals/**.

### Messaging

Popup → `chrome.tabs.sendMessage` → content script:

- scrape fields
- inject answers (label, answer)
- scrape options for one label (on-demand for HITL)

## Frontend (`frontend/src`)

| Area | Role |
|------|------|
| `ProfileUpload.jsx` | Resume upload + confidence |
| `ApplicationProfileCapture.jsx` | Post-parse application catalog wizard |
| `context/AppContext.jsx` | Session / profile sync with extension |

## Tests

| Suite | Location | Use |
|-------|----------|-----|
| Backend unit | `backend/src/**/*.test.js` | Planner, fields, LLM helpers |
| Extension offline | `extension/tests/` | jsdom mock HTML scrape/inject |
| Extension e2e | `extension/e2e/` | Playwright live ATS; URLs in `portals.json` |

Keep e2e helpers from rewriting core fill — they load/drive `PortalEngine` only.
