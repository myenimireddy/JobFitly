# Backend (API)

Express + Prisma (SQLite) API for JobFitly. Serves the web app and the Chrome extension.

Default URL: `http://localhost:3000`

## What this block owns

| Area | Path | Notes |
|------|------|--------|
| HTTP entry | `src/index.js` | Mounts routers, timeouts for long LLM calls |
| Config | `src/config.js` | Env vars (`.env`) |
| Profile / resume | `src/modules/profile/` | Upload, parse, application-field catalog |
| Jobs | `src/modules/job/` | Store / extract job text |
| Match | `src/modules/match/` | Heuristic score + optional LLM narrative |
| Autofill planner | `src/modules/autofill/` | Intents → buckets (`known` / `ask` / `missing`) |
| Settings | `src/modules/settings/` | Groq key via UI (`GET/PUT /api/settings/llm`) |
| LLM providers | `src/llm/` | Factory → Groq or Ollama |
| Shared libs | `src/lib/` | Parsers, PII sanitizer, LLM settings file |
| Schema | `prisma/` | SQLite models |

## LLM resolution (important)

Effective provider is **not** only `LLM_PROVIDER` in `.env`.

Order (see `src/lib/llmSettings.js`):

1. If settings file has `forceOllama: true` → **Ollama**
2. Else if a usable Groq key exists (UI file **or** `GROQ_API_KEY`) → **Groq**
3. Else → **Ollama**

UI-saved keys live in `data/llm-settings.json` (gitignored). Never commit that file.

**Privacy:** Profiles live in local SQLite only (no JobFitly cloud store). Cloud prompts (Groq) must go through `src/lib/piiSanitizer.js` (placeholders → restore). Resume parse prefers Ollama when Groq is selected — see `llmResumeParser.js`.

## Commands

```bash
# from repo root
make setup          # .env + prisma
make dev-backend    # nodemon on :3000
make test-backend   # Jest
make ollama         # local LLM (separate terminal)

cd backend && npm test -- --testPathPattern=llmSettings
```

Health / status:

- `GET /health`
- `GET /api/llm/status` — effective provider
- `GET /api/settings/llm` — public settings (key suffix only)

## Adding or changing behavior

| Goal | Touch |
|------|--------|
| New form wording for an existing fact | Phrase on an intent in `modules/autofill/logic.js` |
| New shared application fact | `APPLICATION_FIELD_CATALOG` in `applicationFields.js` + `buildFacts` |
| New match narrative rule | `lib/llmMatchAnalyzer.js` (heuristics stay in `lib/fallback/`) |
| New LLM provider | Implement `llm/base.js` contract + wire `llm/factory.js` |
| Settings surface | `modules/settings/router.js` + `lib/llmSettings.js` |

Prefer **unit tests next to the module** (`*.test.js`). Autofill planner changes should not invent portal-specific `if (greenhouse)` branches in the backend.

## Response shape

Most JSON routes return:

```json
{ "success": true, "data": {}, "error": null }
```

## Related docs

- Root [CONTRIBUTING.md](../CONTRIBUTING.md)
- Agent skill: [`.cursor/skills/jobfitly-dev/`](../.cursor/skills/jobfitly-dev/)
- Extension HITL UI: [../extension/README.md](../extension/README.md)
