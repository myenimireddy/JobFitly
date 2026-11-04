# JobFitly

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)
![Chrome Extension](https://img.shields.io/badge/chrome-extension-yellow.svg)

<img src="docs/images/icon.png" alt="JobFitly" width="64" height="64" />

**Score job fit from the tab you’re on, then fill applications one field at a time — with you in control.**

Your profile stays on your machine. Optional Groq speeds AI; contact PII is sanitized before cloud calls. See [docs/llm-and-privacy.md](docs/llm-and-privacy.md).

---

## What it does

1. **Upload a resume** in the Chrome Side Panel  
2. **Analyze** the open job posting → score, gaps, blockers  
3. **Fill Form** one field at a time (review AI drafts; never auto-Submit)  
4. **Settings** → paste a Groq key for speed, or stay on local Ollama  

Works with Greenhouse, Lever, Workday, Ashby, plus a generic HTML fallback — details in [docs/portals.md](docs/portals.md).

---

## Quick setup

**Beta testers (recommended):**

```bash
./scripts/bootstrap.sh   # first time
./scripts/start.sh       # every day
```

Then load `extension/dist` in Chrome (`chrome://extensions` → Developer mode → Load unpacked).

Full steps & troubleshooting: **[docs/setup.md](docs/setup.md)**  
Product scope (in / out of beta): **[docs/beta.md](docs/beta.md)**  
**Design → develop → test → release:** **[docs/process.md](docs/process.md)**

**Developers:** [docs/development.md](docs/development.md) · [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Docs

| Doc | Topic |
|-----|--------|
| [docs/process.md](docs/process.md) | Design → develop → test → release |
| [docs/setup.md](docs/setup.md) | Install & daily run |
| [docs/beta.md](docs/beta.md) | Beta scope / gaps |
| [docs/development.md](docs/development.md) | Make, env, layout |
| [docs/portals.md](docs/portals.md) | ATS support |
| [docs/llm-and-privacy.md](docs/llm-and-privacy.md) | Groq / Ollama / PII |
| [docs/README.md](docs/README.md) | Docs index |

---

## License

[MIT](LICENSE)
