# Development

## Quick start (`make`)

```bash
make install && make setup
brew install ollama && ollama pull llama3.2   # or use Groq in Settings
make ollama          # terminal 1
make dev-backend     # terminal 2 — :3000
make build-extension # then Load unpacked → extension/dist
# optional
make dev-frontend    # :5173
make dev-extension   # watch rebuild
```

Testers without `make`: [setup.md](setup.md).

## Verify

| Service | URL |
|---------|-----|
| API health | `http://localhost:3000/health` |
| LLM status | `http://localhost:3000/api/llm/status` |
| Frontend | `http://localhost:5173` |
| Ollama | `http://localhost:11434` |

## Environment

Copy `backend/.env.example` → `backend/.env`. Effective LLM provider is resolved by `backend/src/lib/llmSettings.js` (Settings UI / `forceOllama` / `GROQ_API_KEY`), not `LLM_PROVIDER` alone. See [llm-and-privacy.md](llm-and-privacy.md).

## Layout

```
JobFitly/
├── backend/       # Express API — backend/README.md
├── frontend/      # React web app — frontend/README.md
├── extension/     # Chrome Side Panel — extension/README.md
├── scripts/       # bootstrap.sh, start.sh, check-stack.js
├── docs/          # This folder
└── Makefile
```

## Commands

| Command | Description |
|---------|-------------|
| `make install` | Install all deps |
| `make setup` | `.env` + SQLite |
| `make test-fast` | Stack + Jest + offline portal mocks (pre-commit) |
| `make build-extension` | Build `extension/dist` |
| `make test-e2e` | Live Playwright ATS (not in pre-commit) |
| `make help` | All targets |

## Agent skill

[`.cursor/skills/jobfitly-dev/`](../.cursor/skills/jobfitly-dev/) — autofill pipeline, portals, privacy rules.
