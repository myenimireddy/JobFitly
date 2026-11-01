/**
 * Service worker — open Side Panel on toolbar click; proxy a few API calls.
 * Side Panel stays open while the user clicks the application form (unlike a popup).
 */

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

    fetch('http://localhost:3000/api/autofill/save-answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, answers }),
    })
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
  }
});
