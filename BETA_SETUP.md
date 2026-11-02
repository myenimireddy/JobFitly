# JobFitly — setup for beta testers

You do **not** need to know the whole codebase. You need **Chrome**, **Node**, and either a **Groq key** (recommended, fast) or **Ollama** (slower, local).

`make` is **not** required. macOS does not ship a usable `make` until Xcode Command Line Tools are installed — these scripts avoid that.

## Privacy (read this)

**Goal:** JobFitly should not ship your personal data to our servers, and cloud AI should not see raw contact PII.

| What | Where it lives |
|------|----------------|
| Resume / profile / answers | **Only on your machine** (local SQLite + extension storage) |
| JobFitly cloud account | **None** — we don’t host your profile |
| **Ollama** | Everything stays on your Mac |
| **Groq** (optional, for speed) | Analyze / Ask AI send **sanitized** prompts — name, email, phone, LinkedIn, website, location become placeholders like `[CANDIDATE_EMAIL]` before the request leaves your machine |
| Resume **upload** parse | Prefers **local Ollama** even if Groq is configured; if Ollama is down and Groq is used, emails/phones are scrubbed first (name/school may still appear so the local profile can be filled) |

**Never** put API keys or a real resume in GitHub issues.

---

## A. First time only (≈10–15 min)

### 1. Get the project

```bash
git clone https://github.com/myenimireddy/JobFitly.git
cd JobFitly
```

(Or unzip a release folder you were sent and `cd` into it.)

### 2. Install tools + project (one script)

```bash
chmod +x scripts/bootstrap.sh scripts/start.sh
./scripts/bootstrap.sh
```

What it installs **only if missing**:

| Tool | Required? | Why |
|------|-----------|-----|
| Homebrew (Mac) | If Node/Ollama need installing | Package manager |
| **Node 18+** | **Yes** | Runs the JobFitly API |
| **Ollama** | Optional | Local AI if you skip Groq |
| Project deps | Yes | Backend + Chrome extension |

It will ask whether to install Ollama. Prefer **N** if you will use a Groq key (faster).

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → choose the folder:  
   `JobFitly/extension/dist`
4. Pin JobFitly

### 4. Add a Groq key (recommended)

1. Create a free key: https://console.groq.com/keys  
2. Open the JobFitly **side panel** → **gear (Settings)**  
3. Paste the key → **Save key**

Without a key, Analyze uses Ollama (~30–60s) if you installed it.

### 5. Upload a resume

Side panel → upload PDF → wait for parse → you are ready.

---

## B. Every later day (≈30 seconds)

```bash
cd JobFitly
./scripts/start.sh
```

Leave that terminal open. Then open Chrome and use JobFitly as usual.

If the extension UI looks stale after a pull/update:

```bash
cd JobFitly/extension && npm run build
```

Then click **Reload** on `chrome://extensions`.

Stop JobFitly with **Ctrl+C** in the start terminal.

---

## C. What you use day to day

| Do this | Where |
|---------|--------|
| Score a job | Open the posting → Side Panel → **Analyze this job** |
| Fill a form | **Fill Form** → review each field (never auto-Submit) |
| Speed up AI | Settings → Groq key |
| Use local AI only | Settings → **Use Ollama** |

You do **not** need the web app at `localhost:5173` for normal beta testing.

---

## D. Troubleshooting

| Symptom | Fix |
|---------|-----|
| “Backend offline” | Run `./scripts/start.sh` |
| Port 3000 busy | `start.sh` kills the old process; or restart the terminal |
| Analyze fails / LLM offline | Add Groq key **or** install Ollama and re-run bootstrap with `INSTALL_OLLAMA=yes ./scripts/bootstrap.sh` |
| Extension missing / old UI | Rebuild: `cd extension && npm run build` → Reload on `chrome://extensions` |
| Node too old | Install Node 18+ from https://nodejs.org |

---

## E. How to report an issue

Open a GitHub issue: https://github.com/myenimireddy/JobFitly/issues/new/choose  
Prefer the **Bug report** form so we get the right details.

**Always include**

| Detail | Where to find it |
|--------|------------------|
| OS | macOS / Windows (+ WSL if used) |
| Chrome version | `chrome://version` |
| JobFitly version | Side Panel header (`v1.2.x`) |
| LLM | Groq (Settings) or Ollama |
| Job / form URL | The tab you were on (ATS link) |
| Steps | What you clicked, in order |
| Expected vs actual | What should happen vs what did |
| Screenshot | Optional; **blur name, email, phone** |

**Also helpful**

- Exact error text (“Backend offline”, “Analyze failed”, …)
- Backend terminal lines from `./scripts/start.sh`
- Portal name if you know it (Greenhouse, Workday, Lever, …)

**Never paste**

- Groq / API keys  
- Full resume PDF or real personal data  

Use a fake profile when possible. JobFitly’s goal is **no cloud storage of your data** and **no raw contact PII to Groq** for Analyze / Ask AI (see Privacy above).

---

## F. For developers (optional)

If you already have Node + Make + Ollama:

```bash
make install && make setup
make ollama          # terminal 1
make dev-backend     # terminal 2
make build-extension # then load extension/dist
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [scripts/README.md](scripts/README.md).
