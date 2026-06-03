# JobFitly

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Chrome Extension](https://img.shields.io/badge/chrome-extension-yellow.svg)

**AI-powered job application assistant** — analyze job fit, match your skills, and autofill applications directly from your browser.

> All AI processing runs **locally** via [Ollama](https://ollama.com) — your resume and personal data never leave your machine.

---

## Features

- **AI Resume Parsing** — Upload your PDF resume; the LLM extracts skills, experience, education, contact info, projects, certifications, languages, and more into a structured profile with a **parse confidence score**
- **Profile Editor** — Review and correct every parsed field before it is used for matching or autofill
- **Job Match Scoring** — Compares your profile against any job posting and returns a match score (0–100), matched skills, missing skills, blockers, and pros — **no LLM required for this step**
- **Smart Recommendations** — AI-generated suggestions for closing skill gaps
- **Browser Extension** — One-click job analysis on any job board; results appear instantly in the popup
- **Autofill Applications** — Scrapes form fields from a job application page, sends them to the LLM with your resume context, and fills the form for you
- **Session Sync** — Profile saved in the extension automatically syncs to the web app and vice versa
- **Missing Answer Memory** — Answers you provide manually for unknown fields are stored in your profile and reused in future applications
- **Privacy Protection** — PII (name, email, phone) is replaced with placeholders before any data reaches a cloud LLM and restored locally after; the LLM is explicitly instructed not to retain any personal data

---

## Running the Application

### First-time setup (do this once)

```bash
git clone https://github.com/myenimireddy/JobFitly.git
cd JobFitly

# 1. Install all dependencies
make install

# 2. Create .env and initialise the SQLite database
make setup

# 3. Install Ollama and pull the AI model (~2 GB, one-time download)
brew install ollama
ollama pull llama3.2
```

---

### Every time you develop (4 terminals)

Open **4 separate terminal tabs/windows** and run one command in each:

**Terminal 1 — Ollama LLM server**
```bash
make ollama
# Starts the local AI server at http://localhost:11434
# Keep this running — required for resume parsing and autofill
```

**Terminal 2 — Backend API**
```bash
make dev-backend
# Starts Express API at http://localhost:3000
# Auto-restarts on file changes (nodemon)
```

**Terminal 3 — Frontend web app**
```bash
make dev-frontend
# Starts React app at http://localhost:5173
# Open this in your browser
```

**Terminal 4 — Chrome Extension (watch mode)**
```bash
make dev-extension
# Rebuilds extension/dist/ on every file change
```

> **Alternative:** Run `make dev` to start terminals 2, 3, and 4 together in one command.
> Still run `make ollama` separately — it must stay in its own terminal.

---

### Load the Chrome Extension

After the first `make dev-extension` or `make build-extension`:

1. Open **`chrome://extensions`** in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the **`extension/dist/`** folder
5. Pin the extension to your toolbar

> After any code change to the extension, the watch mode rebuilds automatically.
> Click the **refresh icon** on `chrome://extensions` to reload it.

---

### Verify everything is running

| Service | URL | Expected |
|---|---|---|
| Backend API | `http://localhost:3000/health` | `{"success":true}` |
| LLM status | `http://localhost:3000/api/llm/status` | `{"data":{"available":true,...}}` |
| Frontend | `http://localhost:5173` | JobFitly web app |
| Ollama | `http://localhost:11434` | `Ollama is running` |

The web app header shows **green dots** for Backend and LLM when both are up.

---

### Troubleshooting

**Backend Offline in the UI**
```bash
# Check if port 3000 is stuck from a previous crash
lsof -ti:3000 | xargs kill -9
# Then restart: make dev-backend
```

**`model 'llama3.2' not found`**
```bash
ollama pull llama3.2
```

**`ollama.chat is not a function`** — stale node_modules
```bash
cd backend && npm install
```

**Extension not autofilling**
- Rebuild: `make build-extension`
- Reload on `chrome://extensions` (click the refresh icon)
- Make sure backend is running at `localhost:3000`

---

## Supported Job Portals

The autofill engine includes **portal-specific parsers** for accurate field detection and injection on each ATS.

| Portal | Domain | Fields Supported |
|--------|--------|-----------------|
| **Lever** | `jobs.lever.co` | Text inputs, email, phone, location, radio (multiple choice), dropdowns, textareas |
| **Greenhouse** | `boards.greenhouse.io` | Text inputs, radio groups, checkboxes, selects, textareas |
| **Workday** | `*.myworkdayjobs.com` | Native inputs, custom select widgets (click-to-open), radio groups, textareas |
| **LinkedIn Easy Apply** | `linkedin.com` | Text inputs, selects, radio fieldsets, textareas |
| **Generic** | Any site | Standard `<input>`, `<textarea>`, `<select>` matched via `label[for]`, `aria-label`, placeholder |

> **Portal not listed?** The Generic parser works on any standard HTML form. For best results on a specific ATS, [open a request](#contact--support).

---

## Project Structure

```
JobFitly/
├── backend/                    # Node.js / Express API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── profile/        # Resume upload & parsing
│   │   │   ├── job/            # Job posting management
│   │   │   ├── match/          # Job fit scoring (no LLM needed)
│   │   │   ├── autofill/       # Autofill — LLM prompt + answer cache
│   │   │   └── documents/      # Document storage
│   │   ├── llm/                # LLM provider abstraction (Ollama / Groq)
│   │   └── lib/                # Shared utilities
│   ├── prisma/                 # SQLite schema
│   └── .env.example            # Environment template
│
├── frontend/                   # React web app (Vite + Tailwind)
│   └── src/
│
├── extension/                  # Chrome Extension (MV3, Vite)
│   └── src/
│       ├── parsers/            # Portal-specific autofill parsers
│       │   ├── lever.js        # jobs.lever.co
│       │   ├── greenhouse.js   # boards.greenhouse.io
│       │   ├── workday.js      # *.myworkdayjobs.com
│       │   ├── linkedin.js     # linkedin.com/jobs
│       │   └── generic.js      # Fallback — any standard HTML form
│       ├── content.js          # Page scraper + form injector
│       ├── background.js       # Service worker / orchestrator
│       └── popup/              # React popup UI
│
└── Makefile                    # Common commands
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

```env
# Database (SQLite by default)
DATABASE_URL="file:./dev.db"

# Server
PORT=3000
NODE_ENV=development

# LLM Provider: 'ollama' (local, default) or 'groq' (cloud)
LLM_PROVIDER=ollama

# Ollama (local) — install from https://ollama.com
OLLAMA_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434

# Groq (cloud, optional) — get key from https://console.groq.com
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama3-70b-8192

# CORS origin for the web frontend
CORS_ORIGIN=http://localhost:5173
```

---

## Commands

| Command | Description |
|---------|-------------|
| `make install` | Install all dependencies (backend + frontend + extension) |
| `make setup` | Create `.env` and initialize SQLite database |
| `make ollama` | Start Ollama LLM server on `localhost:11434` (run in a separate terminal) |
| `make dev` | Start all services in dev mode (backend + frontend + extension watch) |
| `make build-extension` | One-shot production build of the extension |
| `make run` | Run production backend only |
| `make test` | Run backend tests |
| `make db-push` | Apply schema changes |
| `make db-reset` | Reset database |
| `make clean` | Remove all `node_modules` and `dist` folders |
| `make help` | Show help |

---

## LLM Setup

JobFitly uses an LLM for **resume parsing** and **autofill**. Job matching works without one.

### Option A — Ollama (local, free, private)

```bash
# 1. Install Ollama
brew install ollama          # macOS
# or download from https://ollama.com

# 2. Pull the model (one-time, ~2 GB)
ollama pull llama3.2

# 3. Start the server (keep this terminal open)
make ollama
# or: ollama serve
```

Set in `backend/.env`:
```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434
```

### Option B — Groq (cloud, free tier, no install)

Get a free API key from [console.groq.com](https://console.groq.com) and set:
```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama3-70b-8192
```

> **Privacy note:** When using Groq or any cloud provider, PII (name, email, phone) is automatically replaced with anonymous placeholders before the request is sent, and restored locally in the response. The LLM is also instructed via its system prompt not to retain any personal data.

### LLM status indicator

The web app header shows live status dots:
- 🟢 **Backend** — Express API is reachable
- 🟢 **LLM (ollama)** — Ollama server is reachable and a model is loaded
- 🔴 **LLM Offline** — hover to see the reason (e.g. *"Ollama is not running"*)

---

## Resume Parsing & Confidence Score

When you upload a resume the LLM parses it into a structured profile and returns a **parse confidence score** (0–100):

| Score | Meaning |
|---|---|
| **80–100** | All key sections found and clearly structured |
| **50–79** | Some sections missing or ambiguous — review recommended |
| **< 50** | Major sections missing — manual correction needed |

The banner on the profile card shows the score, what was missing, and a direct link to **Edit Profile** to fix anything.

If the LLM is offline, parsing falls back to a regex engine — the banner switches to amber and flags that accuracy may be lower.

---

## Adding a New Portal Parser

1. Create `extension/src/parsers/myportal.js` implementing:
   ```js
   export const MyPortalParser = {
     name: 'MyPortal',
     matches(hostname) { return hostname.includes('myportal.com'); },
     scrapeFields(doc) { /* return FieldDescriptor[] */ },
     injectAnswer(label, answer, doc) { /* return boolean */ },
   };
   ```
2. Import and add it to the `PARSERS` array in `extension/src/parsers/index.js` (before `GenericParser`)
3. Run `make build-extension` and reload in `chrome://extensions`

---

## Contact & Support

- **Bug reports & feature requests:** [Open an issue](https://github.com/myenimireddy/JobFitly/issues)

---

## License

MIT
