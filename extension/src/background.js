/**
 * Service worker — open Side Panel on toolbar click; proxy a few API calls.
 * Side Panel stays open while the user clicks the application form (unlike a popup).
 * API origin mirrors extension/src/lib/apiConfig.js (chrome.storage.local apiOrigin).
 */

const DEFAULT_API_ORIGIN = 'http://localhost:3000';

async function getApiBase() {
  try {
    const data = await chrome.storage.local.get(['apiOrigin']);
    let s = String(data.apiOrigin || DEFAULT_API_ORIGIN).trim();
    if (!s) s = DEFAULT_API_ORIGIN;
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    s = s.replace(/\/+$/, '').replace(/\/api$/i, '');
    return `${s}/api`;
  } catch {
    return `${DEFAULT_API_ORIGIN}/api`;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[JobFitly] setPanelBehavior:', err));
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('[JobFitly] setPanelBehavior:', err));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveAnswers') {
    const { profileId, answers } = request;

    getApiBase()
      .then((base) =>
        fetch(`${base}/autofill/save-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, answers }),
        }),
      )
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
  }
});
