# Portal field coverage sheet

Control-type regression for JobFitly autofill. **Not** a replacement for the 10×4 persona UI matrix — this sheet answers: *does scrape/inject handle this widget on this portal?*

Machine status: [`portal-field-coverage.json`](portal-field-coverage.json) (update both when flipping a cell).

Fixtures: [`extension/tests/mocks/`](../extension/tests/mocks/) (one kitchen-sink HTML per ATS hostname — `PortalEngine.detect()` requires the right host).

### Can I debug on fixtures instead of live ATS?

**Mostly yes for control-type bugs** (text, select, radio, checkbox, GH React-Select, WD listbox open→option→commit, file skip). Fixtures use real hostnames, real-ish labels from [`consolidated-fill-context.json`](../extension/e2e/fixtures/consolidated-fill-context.json), and the same `PortalEngine` paths as production.

**Not a full clone of every live board.** Live pages add CSS hashes, multi-step wizards, A/B markup, and extra questions. If a live job fails after the fixture path is green, capture that DOM into the mock (or run `npm run test:e2e`) — don’t assume the kitchen-sink alone proves every company site.

Offline checks: `cd extension && npm test` (includes kitchen-sink). Playwright fixtures: `cd extension && npm run test:offline`.

## Legend

| Status | Meaning |
|--------|---------|
| **green** | Control exists in fixture; kitchen-sink smoke passes. Stronger cells also assert inject commit (e.g. Workday Country/State, classic GH cover+radio, Ashby Yes/No). GH Job Board React-Select is covered by `tests/offline/greenhouse-inject.spec.js`, not by the light kitchen-sink Country assert alone. |
| **red** | Gap — need real DOM example and/or inject fix |
| **deferred** | Intentionally out of scope for this sheet |

## Matrix

| Control | Greenhouse classic | GH Job Board | Lever | Ashby | Workday | Generic |
|---------|--------------------|--------------|-------|-------|---------|---------|
| text input | green | green | green | green | green | green |
| textarea | green | green | green | green | green | green |
| native `<select>` | green | green | green | green | green | green |
| radio | green | green | green | green | green | green |
| checkbox | green | green | green | green | green | green |
| custom select (React-Select / WD listbox / Ashby Yes-No) | deferred (native only) | green | deferred (native only) | green | green | deferred |
| file input (expect skip) | green | green | green | green | green | green |
| multipage Continue | deferred | deferred | deferred | deferred | deferred (#32) | deferred |

## Closing reds

No **red** cells currently. If a new gap appears:

1. Open a public apply URL from [`consolidated-fill-context.json`](../extension/e2e/fixtures/consolidated-fill-context.json) `_meta.sources` (or a safe demo board).
2. Copy the control markup into the matching kitchen-sink fixture under `extension/tests/mocks/`.
3. Fix scrape/inject in `extension/src/portalEngine.js` / `extension/src/portals/` — do not invent a second autofill path.
4. Extend `extension/tests/kitchen-sink-runner.js` (and offline Playwright kitchen-sink) → flip cell to **green** in JSON + this table.

Playwright: `cd extension && npm run test:offline` (includes `kitchen-sink.spec.js`).

## E2e flake note

UI matrix `data → greenhouse` timing out (~7m) on slow Ollama during application capture is a **flake**, not a coverage-sheet failure. Retry with Groq if it recurs; do not block beta on that alone.

## Related

- [portals.md](portals.md) — supported ATS overview
- [extension/tests/mocks/README.md](../extension/tests/mocks/README.md) — fixture map
