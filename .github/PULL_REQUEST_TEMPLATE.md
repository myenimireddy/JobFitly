## Summary
<!-- What changed and why. Link issues with Fixes. -->

Fixes #

## Checks
Copy the list that matches this PR. Every box must be done before merge.

### All PRs
- [ ] `make test` passes
- [ ] Code is small and easy to follow (no extra frameworks)

### #7 Remove unused fill stack
- [ ] No `/api/autofill/inject` or `generateInjections`
- [ ] `extension/src/parsers/` removed; scrape/inject uses `portalEngine.js`
- [ ] Dead `backend/src/app.js` and unused popup.js gone
- [ ] Makefile does not mention Docker/Postgres unless those files exist
- [ ] `node scripts/check-stack.js` passes
- [ ] `node extension/tests/e2e-runner.js` scrapes/injects mock portals

### #8 Remove match/docs from the extension
- [ ] Popup has profile + autofill only
- [ ] Extension does not call `/api/match` or `/api/documents`

### #9 No-guess autofill
- [ ] `npm test` in backend: visa/salary/start date/on-site stay missing without profile facts

### #10 known / ask / missing
- [ ] `/generate` answers include `bucket`
- [ ] Popup lists Known / Please check / Need your input

### #11 Review-then-inject
- [ ] Scan does not write the page
- [ ] **Fill Form Now** writes the page
- [ ] Submit buttons are never clicked

### #12 Persist answers
- [ ] Fill Form Now saves answers
- [ ] Paraphrased work-auth labels reuse the saved value
- [ ] Saved Answers uses `current` — no hardcoded profile id

### #13 Ollama JSON
- [ ] Ollama chat uses `format: 'json'` and `temperature: 0`
- [ ] `backend` ollama unit test passes
