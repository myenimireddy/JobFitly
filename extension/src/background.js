// Background script - handles HTTP requests bypassing CORS/mixed content
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveAnswers') {
    const { profileId, answers } = request;
    
    fetch('http://localhost:3000/api/autofill/save-answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, answers }),
    })
    .then(res => res.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true; // Keep message channel open for async response
  }
});
