# Beta known gaps (v1 stable)

What JobFitly **does** for beta, and what it deliberately does **not**.

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

## Tester checklist

1. `./scripts/bootstrap.sh` (installs deps, builds extension, generates sample PDFs) then `./scripts/start.sh`
2. Load `extension/dist` unpacked · Settings → Groq key (or Ollama) · backend `http://localhost:3000`
3. Upload a **fictional** sample from [`docs/samples/resumes/`](samples/resumes/) (if missing: `npm run generate:fake-resumes`)
4. Smoke Greenhouse / Lever / Workday / Ashby — **never Submit**
5. Confirm Clear (hide in panel) vs Delete (DB row gone)
6. Optional offline gate: `cd extension && npm test` · field sheet: [`portal-field-coverage.md`](portal-field-coverage.md)

## Maintainer release checklist

1. `make test-fast` · optionally `cd extension && npm run test:offline`
2. Manual smoke (checklist above) with Groq preferred
3. Open/update PR → merge to `main` (delete remote branch on merge)
4. Tag beta when smoke is boring: e.g. `v0.1.0-beta` (optional)
5. CI: ensure repo secret **`GROQ_API_KEY`** for manual UI e2e workflow
6. Do **not** ship Chrome Web Store yet — unpacked `extension/dist` only

## CI note (maintainers)

Manual UI e2e (`.github/workflows/e2e-ui-manual.yml`) requires repository secret **`GROQ_API_KEY`**. Without it, resume parse waits on Ollama and hangs.

## Issues

Milestone: [v1 beta stable](https://github.com/myenimireddy/JobFitly/milestone/1)
