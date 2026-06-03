# E2E Testing for JobFitly Extension

## Quick Start

### 1. Manual Browser Test (Fastest)
Open any job application page, open DevTools console, and paste:
```javascript
// Copy contents of manual-test.js and paste
```

This checks:
- ✅ Portal detection working
- ✅ Field scraping
- ✅ Blur listeners attached
- ✅ Profile ID exists
- ✅ Backend connectivity

### 2. Mock Portal Pages
Open these files in browser to test specific portals:

```bash
# Workday
open tests/mock-workday.html

# Ashby
open tests/mock-ashby.html

# Lever
open tests/mock-lever.html

# Greenhouse
open tests/mock-greenhouse.html
```

Each page auto-runs tests and shows results.

### 3. Automated Test Runner
```bash
cd extension/tests
node e2e-runner.js
```

## Current Status

| Portal | Scraping | Injection | Blur Save | Indicator |
|--------|----------|-----------|-----------|-----------|
| Workday | ✅ | ⚠️ (text only) | ✅ | ✅ |
| Ashby | ✅ | ✅ | ✅ | ✅ |
| Lever | ✅ | ✅ | ✅ | ✅ |
| Greenhouse | ✅ | ✅ | ✅ | ✅ |

Legend:
- ✅ Working
- ⚠️ Partial (see notes)
- ❌ Broken

## Known Issues

### Workday Injection
**Problem:** Dropdown injection triggers API errors
**Solution:** Skip dropdowns, use blur capture instead

### Save Indicator Not Showing
**Problem:** Indicator flashes once then disappears
**Solution:** Check indicator CSS animation reset

## Debugging Tips

1. **Extension not loading:**
   - Go to `chrome://extensions`
   - Enable Developer Mode
   - Click "Reload" on JobFitly extension
   - Check for red errors

2. **Content script errors:**
   - Open job page
   - DevTools > Console
   - Look for `[JobFitly]` or `[PortalEngine]` logs

3. **Backend not saving:**
   - Check `localhost:3000/api/health`
   - Verify `extraAnswers` in profile
   - Check backend console for errors

## Writing New Tests

Add to `e2e-runner.js`:
```javascript
myportal: {
  url: 'file://' + __dirname + '/mock-myportal.html',
  expectedFields: 5,
  fieldsToTest: ['name', 'email'],
  complexFields: ['country'] // Fields to skip
}
```
