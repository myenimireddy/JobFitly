#!/usr/bin/env bash
# JobFitly — everyday start for beta / test users (no `make` required).
# Starts the API. Optionally starts Ollama if no Groq key is configured.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info() { printf '\n==> %s\n' "$*"; }
ok()   { printf '    ✓ %s\n' "$*"; }
fail() { printf '    ✗ %s\n' "$*"; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node missing — run ./scripts/bootstrap.sh first"
[[ -f backend/.env ]] || fail "backend/.env missing — run ./scripts/bootstrap.sh first"
[[ -d extension/dist ]] || {
  info "Building extension"
  (cd extension && npm run build)
}

# Free port 3000 if a stale process is stuck
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${PIDS}" ]]; then
    info "Stopping previous process on port 3000"
    # shellcheck disable=SC2086
    kill -9 $PIDS 2>/dev/null || true
    sleep 0.4
  fi
fi

# Mirror backend resolveLlmRuntime(): forceOllama wins even if a Groq key exists.
force_ollama=false
if [[ -f backend/data/llm-settings.json ]] && grep -q '"forceOllama": *true' backend/data/llm-settings.json 2>/dev/null; then
  force_ollama=true
fi

use_groq=false
if [[ "$force_ollama" == false ]]; then
  if grep -E '^GROQ_API_KEY=gsk_' backend/.env >/dev/null 2>&1; then
    use_groq=true
  fi
  if [[ -f backend/data/llm-settings.json ]] && grep -q '"groqApiKey": *"gsk_' backend/data/llm-settings.json 2>/dev/null; then
    use_groq=true
  fi
fi

OLLAMA_PID=""
if [[ "$use_groq" == false ]] && command -v ollama >/dev/null 2>&1; then
  if ! curl -sf http://localhost:11434 >/dev/null 2>&1; then
    info "Starting Ollama (forced local or no Groq key)"
    ollama serve >/tmp/jobfitly-ollama.log 2>&1 &
    OLLAMA_PID=$!
    sleep 1
    ok "Ollama pid $OLLAMA_PID (log: /tmp/jobfitly-ollama.log)"
  else
    ok "Ollama already running"
  fi
elif [[ "$use_groq" == true ]]; then
  ok "Groq key active — LLM calls use Groq (Ollama ignored even if already running)"
else
  printf '    ! No Groq key and no Ollama — Analyze will fail until you add one\n'
fi

cleanup() {
  if [[ -n "${OLLAMA_PID}" ]]; then
    kill "$OLLAMA_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

info "Starting backend on http://localhost:3000"
echo "    Keep this terminal open. Ctrl+C stops JobFitly."
echo "    Extension folder: $ROOT/extension/dist"
echo "    Chrome: chrome://extensions → reload JobFitly if you rebuilt"
echo

(cd backend && npm run dev)
