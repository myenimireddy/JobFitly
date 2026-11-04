#!/usr/bin/env bash
# JobFitly — one-time setup for beta / test users (macOS + Linux).
# Does NOT require `make`. Installs only what is missing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info()  { printf '\n==> %s\n' "$*"; }
ok()    { printf '    ✓ %s\n' "$*"; }
warn()  { printf '    ! %s\n' "$*"; }
fail()  { printf '    ✗ %s\n' "$*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

# ── 1. Platform helpers ──────────────────────────────────────────────────────
info "Checking platform tools"
OS="$(uname -s)"

if [[ "$OS" == "Darwin" ]]; then
  if ! need_cmd brew; then
    info "Installing Homebrew (needed once for Node / Ollama on Mac)"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Apple Silicon path
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  else
    ok "Homebrew present"
  fi
fi

# ── 2. Node.js (required) ────────────────────────────────────────────────────
info "Checking Node.js (required)"
if ! need_cmd node || ! need_cmd npm; then
  if [[ "$OS" == "Darwin" ]] && need_cmd brew; then
    brew install node
  elif need_cmd apt-get; then
    sudo apt-get update && sudo apt-get install -y nodejs npm
  else
    fail "Install Node 18+ from https://nodejs.org then re-run this script"
  fi
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  fail "Node 18+ required (found $(node -v)). Upgrade from https://nodejs.org"
fi
ok "Node $(node -v) / npm $(npm -v)"

# ── 3. Ollama (optional — skip if you will use a Groq key in Settings) ───────
INSTALL_OLLAMA="${INSTALL_OLLAMA:-ask}"
if [[ "$INSTALL_OLLAMA" == "ask" ]]; then
  echo
  echo "Fast Analyze needs a free Groq key in the extension Settings gear."
  echo "Without Groq, local Ollama works but is slower (~30–60s)."
  printf "Install Ollama now as a fallback? [y/N] "
  read -r ans || ans=n
  case "$ans" in
    y|Y|yes|YES) INSTALL_OLLAMA=yes ;;
    *) INSTALL_OLLAMA=no ;;
  esac
fi

if [[ "$INSTALL_OLLAMA" == "yes" ]]; then
  info "Installing / checking Ollama"
  # Never `brew install ollama` — Homebrew often compiles huge deps from source
  # when bottles/CLT are mismatched. Prefer the official binary installer.
  if ! need_cmd ollama; then
    info "Installing Ollama via https://ollama.com/install.sh (prebuilt binary)"
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  if need_cmd ollama; then
    ok "Ollama $(command -v ollama)"
    # Small model for local fill / parse when Groq is off
    MODEL="${OLLAMA_MODEL:-qwen2.5:3b}"
    info "Pulling model $MODEL (one-time download)"
    ollama pull "$MODEL" || warn "Could not pull model now — run later: ollama pull $MODEL"
  else
    warn "ollama CLI not on PATH yet."
    if [[ "$OS" == "Darwin" ]]; then
      warn "On Mac: download the app from https://ollama.com/download/mac , open it, then re-run bootstrap."
    else
      warn "Re-run: curl -fsSL https://ollama.com/install.sh | sh"
    fi
  fi
else
  warn "Skipping Ollama — add a Groq key in Side Panel → Settings after first run"
fi

# ── 4. Project deps + database (backend + extension only; no web app needed) ─
info "Installing backend dependencies"
(cd backend && npm install && npx prisma generate)

info "Installing extension dependencies"
(cd extension && npm install)

info "Creating backend/.env and database"
if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
  # Prefer empty Groq placeholder so Settings UI owns the key
  if grep -q '^GROQ_API_KEY=your_key_here' backend/.env 2>/dev/null; then
    sed -i.bak 's/^GROQ_API_KEY=your_key_here/GROQ_API_KEY=/' backend/.env && rm -f backend/.env.bak
  fi
  ok "Created backend/.env"
else
  ok "backend/.env already exists"
fi
(cd backend && npx prisma db push --accept-data-loss)

info "Building Chrome extension"
(cd extension && npm run build)
ok "Built → extension/dist/"

info "Generating fictional sample resume PDFs (gitignored)"
npm run generate:fake-resumes
ok "Sample PDFs → docs/samples/resumes/"

cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Initial setup complete.

  Next (one-time in Chrome):
    1. Open chrome://extensions
    2. Enable Developer mode (top right)
    3. Load unpacked → select:
         $ROOT/extension/dist
    4. Pin JobFitly

  Every day after this, run:
    ./scripts/start.sh

  Optional but recommended:
    Side Panel → Settings (gear) → paste Groq key from
    https://console.groq.com/keys
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
