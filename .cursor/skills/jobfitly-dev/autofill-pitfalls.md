# Autofill pitfalls (lessons from production ATS)

Treat these as invariants when changing fill code.

## Greenhouse / React-Select

- Opening every combobox to scrape options at plan time floods the DOM and can crash React (`removeChild`).
- Prefer **on-demand** `scrapeOptionsForLabel` when the human is on that field.
- Never call `.remove()` on menu nodes React created — let the library close them.
- Job Board path lives in `portals/greenhouseJobBoard.js`; classic GH `.field` markup stays in `portalEngine` greenhouse register.

## Dial codes vs other selects

- Options like `United States +1` belong only on phone-country / dial fields.
- Filter dial-looking options out of orientation / gender / ethnicity / EEO scrapes.
- Persist with `storageKeyForAnswer` so dial answers key as `phone_country`, not `country`.
- `lookupStored` must not reuse dial strings for mailing `Country`.

## Phone shape

- Structured object: `applicationProfile.phone` only.
- `personalInfo.phone` must stay a national **string** (UI + `piiSanitizer`).
- If sanitizer receives an object, coerce via `nationalNumber` (defense in depth).

## HITL / LLM

- `bucket: 'ask'` or `source: 'llm'` → popup must review before inject.
- Consent (“I agree…”) is often select-like or checkbox — match portal widget, don’t force text.
- Fill order: country dial before phone number when both present.

## Testing

- Splitting or moving tests must not rewrite scrape/inject core.
- Live URLs: single source `extension/e2e/portals.json` (env overrides OK).
- Seeds/fixtures: mock identity (e.g. Alex Rivera), never real candidate PII.
- After extension changes: rebuild + reload unpacked `extension/dist`.

## Inject result shape

- Prefer boolean / clear `{ filled }` unwrapping — nested `{ filled: { filled: n } }` caused false e2e failures.
- Assert phone by digits when portals format display differently from stored national.
