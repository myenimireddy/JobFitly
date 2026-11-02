# Frontend (web app)

React + Vite + Tailwind UI for resume upload, profile editing, job analysis, and saved answers.

Default URL: `http://localhost:5173`  
Talks to the backend at `http://localhost:3000`.

## What this block owns

| Area | Path | Notes |
|------|------|--------|
| Entry | `src/main.jsx`, `src/App.jsx` | Router + `AppProvider` |
| Global state | `src/context/AppContext.jsx` | Profile / LLM status shared across pages |
| API hook | `src/hooks/useApi.js` | Fetch helpers to backend |
| Home | `src/pages/Home.jsx` | Upload, editor, analyzer, match report |
| Saved answers | `src/pages/SavedAnswers.jsx` | Reused HITL / missing answers |
| Components | `src/components/` | ProfileEditor, JobAnalyzer, MatchReport, etc. |

The **Chrome Side Panel** is the primary product surface for Analyze + Fill on real ATS pages. This web app is useful for profile setup and deeper editing; keep behaviors aligned with the extension where they share the same API.

## Commands

```bash
# from repo root
make install-frontend
make dev-frontend

cd frontend && npm run build
```

## Contributing

- Prefer existing components and Tailwind tokens over new design systems.
- Call the same backend routes the extension uses (`/api/profile`, `/api/job`, `/api/match`, …).
- Do not store real candidate PII in fixtures or screenshots.
- Phone model: `personalInfo.phone` is a **national string**; structured dial lives under `applicationProfile.phone` (see backend `applicationFields.js`).

## Related docs

- [../backend/README.md](../backend/README.md) — APIs and LLM settings
- [../extension/README.md](../extension/README.md) — Side Panel / autofill UX
- [../CONTRIBUTING.md](../CONTRIBUTING.md)
