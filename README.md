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

## Video tutorials (beta)

Watch in order after [setup](docs/setup.md). Details: **[docs/tutorials/](docs/tutorials/)**.  
Click a thumbnail to open YouTube (GitHub can’t play video inline).

**1. Configure Groq** — paste API key in Settings  
<a href="https://youtu.be/7iTxzJjfT50"><img src="https://img.youtube.com/vi/7iTxzJjfT50/maxresdefault.jpg" alt="Configure Groq" width="480" /></a>

**2. Add a profile** — upload resume + application capture  
<a href="https://youtu.be/h0eY4h-l2Ls"><img src="https://img.youtube.com/vi/h0eY4h-l2Ls/maxresdefault.jpg" alt="Add a profile" width="480" /></a>

**3. Analyze a job** — fit score on the open posting  
<a href="https://youtu.be/vcPUH-qn8-U"><img src="https://img.youtube.com/vi/vcPUH-qn8-U/maxresdefault.jpg" alt="Analyze a job" width="480" /></a>

**4. HITL form fill** — review each field; never auto-Submit  
<a href="https://youtu.be/lTqOIXQa-9E"><img src="https://img.youtube.com/vi/lTqOIXQa-9E/maxresdefault.jpg" alt="HITL form fill" width="480" /></a>

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
| [docs/tutorials/](docs/tutorials/) | Video walkthroughs (Groq → Fill Form) |
| [docs/beta.md](docs/beta.md) | Beta scope / gaps |
| [docs/development.md](docs/development.md) | Make, env, layout |
| [docs/portals.md](docs/portals.md) | ATS support |
| [docs/llm-and-privacy.md](docs/llm-and-privacy.md) | Groq / Ollama / PII |
| [docs/README.md](docs/README.md) | Docs index |

---

## License

[MIT](LICENSE)
