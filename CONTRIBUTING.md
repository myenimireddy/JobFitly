# Contributing to JobFitly

Thanks for helping. JobFitly is a local-first job-fit + autofill assistant: **analyze fit**, then **fill one field at a time** with human review. It never submits applications for the user.

## Repo map

| Block | README | Role |
|-------|--------|------|
| Backend API | [backend/README.md](backend/README.md) | Profile, match, autofill planner, LLM |
| Web app | [frontend/README.md](frontend/README.md) | Resume upload / profile editor |
| Chrome extension | [extension/README.md](extension/README.md) | Side Panel, scrape/inject, HITL fill |
| Scripts | [scripts/README.md](scripts/README.md) | Fast stack guards |
| Git hooks | [.githooks/README.md](.githooks/README.md) | `pre-commit` → `make test-fast` |

Deeper agent guidance: [`.cursor/skills/jobfitly-dev/`](.cursor/skills/jobfitly-dev/).

## Setup

**Beta / non-dev testers:** follow [docs/setup.md](docs/setup.md) (`./scripts/bootstrap.sh` then `./scripts/start.sh`). No `make` required.

**Developers:**

```bash
make install && make setup
brew install ollama && ollama pull llama3.2   # or use a Groq key in Settings / .env
make ollama          # terminal 1
make dev             # backend + frontend + extension watch
```

Load `extension/dist/` unpacked on `chrome://extensions` (Developer mode).

## Workflow

End-to-end process (design → develop → test → release): **[docs/process.md](docs/process.md)**.

Short version:

1. **Pick the layer** — backend planner, portal DOM, or Side Panel HITL. Don’t invent a second autofill path.
2. **Match existing style** — CommonJS in `backend/`; ESM + Vite in `frontend/` and `extension/`.
3. **Test** — `make test-fast`; offline portal mocks before live e2e.
4. **Rebuild extension** after UI/DOM changes, then refresh on `chrome://extensions`.
5. **No real PII** in fixtures, seeds, or committed screenshots (fictional personas only).

## Hard rules (autofill)

- LLM drafts stay in bucket `ask` — human reviews before inject.
- Prefer new **intent phrases** in `backend/src/modules/autofill/logic.js` over portal-specific backend branches.
- Greenhouse React-Select: only `extension/src/portals/greenhouseJobBoard.js`; never bulk-scrape or `.remove()` React-owned menus.
- Keep phone dial (`phone_country`) separate from mailing `country` / national number.

## PR checklist

- [ ] Right block README still accurate if you changed ownership/layout
- [ ] Tests updated (Jest and/or offline mocks)
- [ ] `make test-fast` passes (or will via pre-commit)
- [ ] Extension rebuilt if shippable UI/DOM changed
- [ ] No secrets / `llm-settings.json` / real resumes committed

## Questions / bugs

Use the GitHub **Bug report** template: https://github.com/myenimireddy/JobFitly/issues/new/choose  

Include OS, Chrome version, Side Panel version, LLM (Groq/Ollama), job URL, steps, expected vs actual. No API keys or real PII — see [docs/setup.md](docs/setup.md).
