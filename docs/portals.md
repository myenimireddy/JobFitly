# Supported job portals

Portal-specific scrape/inject lives in `extension/src/portalEngine.js` and `extension/src/portals/`.

| Portal | Domain | Notes |
|--------|--------|--------|
| **Lever** | `jobs.lever.co` | Dedicated scrape/inject |
| **Greenhouse** | `boards.greenhouse.io`, `job-boards.greenhouse.io` | Classic + Job Board (React-Select) |
| **Workday** | `*.myworkdayjobs.com` | Native + custom selects; indexed work experience |
| **Ashby** | `jobs.ashbyhq.com` | Dedicated scrape/inject |
| **Generic** | Any site | Standard `<input>` / `<textarea>` / `<select>` via label / aria / placeholder |

**LinkedIn:** job-text extract for **Analyze** only — not Easy Apply autofill.

**Field-type coverage (kitchen-sink fixtures):** [portal-field-coverage.md](portal-field-coverage.md) — green/red sheet for text, select, radio, checkbox, React-Select, file, etc.

## Adding a portal

1. Prefer `extension/src/portals/<name>.js` + register in `portalEngine.js`
2. Greenhouse Job Board / React-Select → only `portals/greenhouseJobBoard.js`
3. Do not bulk-scrape React-Select menus or `.remove()` React-owned option trees
4. Add a mock under `extension/tests/mocks/`; live URLs in `extension/e2e/portals.json`
5. `make build-extension` and reload unpacked `extension/dist`

See [`.cursor/skills/jobfitly-dev/`](../.cursor/skills/jobfitly-dev/).
