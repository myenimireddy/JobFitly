/**
 * Side Panel ↔ tab helpers.
 * Ensures the content script (with matching SCRIPT_VERSION) is alive before scrape/inject.
 * Bump CONTENT_SCRIPT_VERSION in lockstep with content.js when message contracts change.
 */

export const CONTENT_SCRIPT_VERSION = 'v2025-11-01-job-match';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sendMessageSafe(tabId, message, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export async function ensureContentScript(tabId) {
  const alive = await sendMessageSafe(tabId, { action: 'ping' }, 1200);
  if (alive?.ok && alive?.version === CONTENT_SCRIPT_VERSION) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
      injectImmediately: true,
    });
  } catch { /* page may already have an older inject */ }
  await sleep(350);
}

export async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id || null;
}
