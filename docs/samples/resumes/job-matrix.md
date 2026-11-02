# Demo personas × live ATS apply pages

Fill e2e (`live-role-profiles.spec.js`) runs **every persona against all four portals** using these stable apply URLs (resume left empty — never submit).

Role-matched **titles** below are for LinkedIn demos; the DOM under test is the portal’s application form, not job-fit scoring.

| Persona | Role | Greenhouse | Lever | Ashby | Workday |
|---------|------|------------|-------|-------|---------|
| Priya Sharma | Business Analyst | Reddit SWE board | Lever demo apply | Ramp GTM apply | Adobe Eng apply |
| Alex Chen | Full Stack | ↑ | ↑ | ↑ | ↑ |
| Jordan Nguyen | DevOps | ↑ | ↑ | ↑ | ↑ |
| Sam Okoye | Frontend | ↑ | ↑ | ↑ | ↑ |
| Diego Martinez | Backend | ↑ | ↑ | ↑ | ↑ |
| Maya Patel | Data Scientist | ↑ | ↑ | ↑ | ↑ |
| Chris Baker | Product Manager | ↑ | ↑ | ↑ | ↑ |
| Riley Kim | QA | ↑ | ↑ | ↑ | ↑ |
| Taylor Brooks | Mobile | ↑ | ↑ | ↑ | ↑ |
| Aisha Hassan | Security | ↑ | ↑ | ↑ | ↑ |

## URLs (single source: `extension/e2e/portals.json`)

- **Greenhouse:** https://job-boards.greenhouse.io/reddit/jobs/8194576
- **Lever:** https://jobs.lever.co/leverdemo/58db3f8e-b108-47d1-9e6e-87a1712497cd/apply
- **Ashby:** https://jobs.ashbyhq.com/ramp/cc0af88a-2a19-493d-93cf-c5090f986f1f/application
- **Workday:** https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Director-of-Engineering--Real-Time-Experience--RTX-_R172776

## Run

```bash
cd backend && npm run seed:role-profiles
cd ../extension && npm run test:e2e -- e2e/live-role-profiles.spec.js
# one role or portal:
ROLE_KEY=fullstack PORTAL=lever npm run test:e2e -- e2e/live-role-profiles.spec.js
```

Artifacts: `extension/e2e/artifacts/roles/summary.json`

## Latest run (2026-11-02)

`42 passed` in ~7.8m (`live-role-profiles.spec.js`).

| Persona | GH | Lever | Ashby | Workday |
|---------|----|-------|-------|---------|
| Priya Sharma (BA) | pass | pass | pass | pass* |
| Alex Chen (Full Stack) | pass | pass | pass | pass* |
| Jordan Nguyen (DevOps) | pass* | pass* | pass | pass* |
| Sam Okoye (Frontend) | pass | pass | pass | pass* |
| Diego Martinez (Backend) | pass* | pass | pass | pass* |
| Maya Patel (Data) | pass | pass | pass | pass* |
| Chris Baker (PM) | pass | pass | pass | pass* |
| Riley Kim (QA) | pass | pass | pass | pass* |
| Taylor Brooks (Mobile) | pass | pass | pass | pass* |
| Aisha Hassan (Security) | pass | pass | pass | pass* |

\* Soft DOM miss still under portal threshold (`catalogDomRatio` ≥ 0.85–0.9): Workday often misses **How Did You Hear About Us?**; rare Greenhouse ethnicity / Lever gender option snaps. Identity (name/email/phone) passed on every run.
