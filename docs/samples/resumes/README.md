# Fake demo resumes

**Fictional personas only** — for JobFitly Side Panel demos, LinkedIn videos, and parser tests.
Do not use as your identity on real job applications.

Phones are masked as `(000) 000-00NN` (not real numbers). **PDF files are gitignored** — generate locally:

```bash
npm run generate:fake-resumes
# or: (cd scripts/fake-resumes && npm install) && node scripts/fake-resumes/generate.mjs
```

JSON + `index.json` stay in git; CI regenerates PDFs before UI e2e.

| # | Name | Role | PDF |
|---|------|------|-----|
| 1 | Priya Sharma | Business Analyst | [`01-business-priya-sharma.pdf`](01-business-priya-sharma.pdf) |
| 2 | Alex Chen | Full Stack Engineer | [`02-fullstack-alex-chen.pdf`](02-fullstack-alex-chen.pdf) |
| 3 | Jordan Nguyen | DevOps Engineer | [`03-devops-jordan-nguyen.pdf`](03-devops-jordan-nguyen.pdf) |
| 4 | Sam Okoye | Frontend Engineer | [`04-frontend-sam-okoye.pdf`](04-frontend-sam-okoye.pdf) |
| 5 | Diego Martinez | Backend Engineer | [`05-backend-diego-martinez.pdf`](05-backend-diego-martinez.pdf) |
| 6 | Maya Patel | Data Scientist | [`06-data-maya-patel.pdf`](06-data-maya-patel.pdf) |
| 7 | Chris Baker | Product Manager | [`07-product-chris-baker.pdf`](07-product-chris-baker.pdf) |
| 8 | Riley Kim | QA Engineer | [`08-qa-riley-kim.pdf`](08-qa-riley-kim.pdf) |
| 9 | Taylor Brooks | Mobile Engineer | [`09-mobile-taylor-brooks.pdf`](09-mobile-taylor-brooks.pdf) |
| 10 | Aisha Hassan | Security Engineer | [`10-security-aisha-hassan.pdf`](10-security-aisha-hassan.pdf) |
