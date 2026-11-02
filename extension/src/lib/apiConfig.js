/**
 * Backend origin for the Side Panel (default local JobFitly API).
 * Stored in chrome.storage.local so testers can point at a non-default host
 * without rebuilding. Never defaults to a cloud JobFitly server.
 */

export const DEFAULT_API_ORIGIN = 'http://localhost:3000';
const STORAGE_KEY = 'apiOrigin';

/**
 * @param {string} [input]
 * @returns {string} origin without trailing slash or /api suffix
 */
export function normalizeApiOrigin(input) {
  let s = String(input ?? '').trim();
  if (!s) return DEFAULT_API_ORIGIN;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return DEFAULT_API_ORIGIN;
    let path = u.pathname.replace(/\/+$/, '');
    if (path.toLowerCase() === '/api') path = '';
    return `${u.origin}${path === '/' ? '' : path}`.replace(/\/+$/, '') || u.origin;
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

/** @returns {Promise<string>} */
export async function getApiOrigin() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    return normalizeApiOrigin(data[STORAGE_KEY] || DEFAULT_API_ORIGIN);
  } catch {
    return DEFAULT_API_ORIGIN;
  }
}

/** @param {string} origin @returns {Promise<string>} */
export async function setApiOrigin(origin) {
  const normalized = normalizeApiOrigin(origin);
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

/** @returns {Promise<string>} e.g. http://localhost:3000/api */
export async function getApiBase() {
  return `${await getApiOrigin()}/api`;
}

/** @returns {Promise<string>} e.g. http://localhost:3000/health */
export async function getHealthUrl() {
  return `${await getApiOrigin()}/health`;
}
