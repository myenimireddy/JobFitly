# Beta known gaps (v1 stable)

What JobFitly **does** for beta, and what it deliberately does **not**.

**How we design, build, test, and release:** [process.md](process.md) (single checklist).  
**How testers install:** [setup.md](setup.md).

## Supported now

- Side Panel: upload resume → application capture → **Analyze** → **Fill Form** (HITL, never auto-Submit)
- Portals: Greenhouse, Lever, Workday, Ashby + generic HTML fallback
- Local SQLite profile on your machine; optional Groq (sanitized) or Ollama
- Settings: backend URL (default `http://localhost:3000`) + Groq / Use Ollama
- **Clear** = hide profile in the panel only · **Delete** = remove DB row + matches

## Explicit gaps / non-goals

| Gap | Status |
|-----|--------|
| LinkedIn Easy Apply autofill | Analyze job text only — no Easy Apply fill |
| Auto-Submit | Never — human must submit in the browser |
| Hosted JobFitly cloud profiles | Not offered; data stays on your backend |
| Chrome Web Store package | Deferred until beta smoke is solid |
| Extra ATS (iCIMS, SmartRecruiters, Taleo, …) | After the four portals are boringly reliable |
| Accounts / cloud sync | Deferred (conflicts with local-first privacy) |
| Documents (cover letter / tailored bullets) UI | API exists; product UI is a follow-up milestone |
| Workday multi-page wizard depth | First screens work; deeper multi-step is tracked separately |

## Issues

Milestone: [v1 beta stable](https://github.com/myenimireddy/JobFitly/milestone/1)
