# Setup (beta testers)

You do **not** need the whole codebase. You need **Chrome**, **Node 18+**, and either a **Groq key** (recommended, fast) or **Ollama** (slower, local).

`make` is **not** required on a stock Mac. Use the scripts below.

Full privacy rules: [llm-and-privacy.md](llm-and-privacy.md).

---

## First time (≈10–15 min)

```bash
git clone https://github.com/myenimireddy/JobFitly.git
cd JobFitly
chmod +x scripts/bootstrap.sh scripts/start.sh
./scripts/bootstrap.sh
```

Prefer **skipping Ollama** in the prompt if you will paste a Groq key.

`extension/dist` is **not** in git — `bootstrap.sh` builds it. After bootstrap finishes, in Chrome:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → `JobFitly/extension/dist` (created by the build step above)
3. Open the Side Panel → **Settings (gear)** → paste a key from [console.groq.com/keys](https://console.groq.com/keys) → **Save key**  
   Confirm the status line shows **Groq — fast (cloud)** (not Ollama) before uploading.
4. (Optional) Settings → **Backend URL** if your API is not on `http://localhost:3000`  
   (Changing URL clears the loaded profile — re-upload or pick from the switcher on the new backend.)
5. Upload a resume PDF from [`docs/samples/resumes/`](samples/resumes/)  
   (`bootstrap.sh` generates them; if missing: `npm run generate:fake-resumes`)  
   Backend log should say `[llmParser] Using groq` (not ollama).

Known gaps: **[beta.md](beta.md)**. Full design/dev/test/release flow: **[process.md](process.md)**.

---

## Every later day

```bash
cd JobFitly
./scripts/start.sh
```

Keep that terminal open. Reload the extension on `chrome://extensions` after pulls/rebuilds.

---

## Day-to-day use

| Do this | Where |
|---------|--------|
| Score a job | Open the posting → **Analyze this job** |
| Fill a form | **Fill Form** → review each field (never auto-Submit) |
| Speed up AI | Settings → Groq key |
| Local AI only | Settings → **Use Ollama** |
| Point at another API | Settings → Backend URL → Save & check (clears loaded profile) |
| Hide profile in panel | **Clear** (keeps local DB row) |
| Remove profile forever | **Delete** → confirm (removes DB row + matches) |
| Resume a saved profile | **Load latest on this machine** or the profile switcher |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Backend offline | `./scripts/start.sh` · check Settings → Backend URL |
| Analyze / LLM offline | Groq key **or** install Ollama from [ollama.com/download](https://ollama.com/download) (do **not** `brew install ollama` — that can compile for hours) |
| Homebrew compiling LLVM/Rust for Ollama | Cancel with Ctrl+C · skip Ollama in bootstrap · use Groq, **or** install the Mac app from [ollama.com/download/mac](https://ollama.com/download/mac) |
| Stale UI | `cd extension && npm run build` → Reload extension |
| Wrong person’s resume | Clear, then upload or pick from switcher — panel no longer auto-loads `/latest` |
| Windows | Use [WSL](https://learn.microsoft.com/windows/wsl/) and the same scripts, or install [Node](https://nodejs.org) and run backend/extension `npm` commands manually |

---

## Report an issue

https://github.com/myenimireddy/JobFitly/issues/new/choose  

Include: OS, Chrome version, Side Panel version (`v…`), Groq/Ollama, job URL, steps, expected vs actual.  
**Never** paste API keys or a real resume.

---

## Developers

See [development.md](development.md) and [../CONTRIBUTING.md](../CONTRIBUTING.md).
