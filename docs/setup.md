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

Then in Chrome:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → `JobFitly/extension/dist`
3. Open the Side Panel → **Settings (gear)** → paste a key from [console.groq.com/keys](https://console.groq.com/keys)
4. Upload a resume PDF (use a fictional sample from [`docs/samples/resumes/`](samples/resumes/) for demos)

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

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Backend offline | `./scripts/start.sh` |
| Analyze / LLM offline | Groq key **or** `INSTALL_OLLAMA=yes ./scripts/bootstrap.sh` |
| Stale UI | `cd extension && npm run build` → Reload extension |
| Windows | Use [WSL](https://learn.microsoft.com/windows/wsl/) and the same scripts, or install [Node](https://nodejs.org) and run backend/extension `npm` commands manually |

---

## Report an issue

https://github.com/myenimireddy/JobFitly/issues/new/choose  

Include: OS, Chrome version, Side Panel version (`v…`), Groq/Ollama, job URL, steps, expected vs actual.  
**Never** paste API keys or a real resume.

---

## Developers

See [development.md](development.md) and [../CONTRIBUTING.md](../CONTRIBUTING.md).
