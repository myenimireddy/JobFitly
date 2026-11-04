'use strict';

/**
 * Pick a Groq chat model from the live /v1/models list.
 * Preference order lives in backend/config/groq-models.json (edit that file —
 * no code change — when you want a different default).
 * If the preferred id was retired, the next live match is used automatically.
 */
const fs = require('fs');
const path = require('path');

const PREFS_PATH = path.join(__dirname, '../../config/groq-models.json');
const CACHE_MS = 60 * 60 * 1000;

let cache = { at: 0, keySuffix: '', ids: null };

function loadPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
    return {
      prefer: Array.isArray(raw.prefer) ? raw.prefer.map(String) : [],
      skip: new Set(Array.isArray(raw.skip) ? raw.skip.map(String) : []),
    };
  } catch {
    return { prefer: ['openai/gpt-oss-20b'], skip: new Set() };
  }
}

function isChatModel(id) {
  const s = String(id || '').toLowerCase();
  if (!s) return false;
  if (/whisper|tts|guard|embed/.test(s)) return false;
  return true;
}

async function listChatModels(apiKey) {
  const suffix = String(apiKey || '').slice(-6);
  if (cache.ids && cache.keySuffix === suffix && Date.now() - cache.at < CACHE_MS) {
    return cache.ids;
  }
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Groq models HTTP ${res.status}`);
  }
  const body = await res.json();
  const ids = (body.data || []).map((m) => m.id).filter(isChatModel);
  cache = { at: Date.now(), keySuffix: suffix, ids };
  return ids;
}

/**
 * @param {string} apiKey
 * @param {string} [preferred] GROQ_MODEL from env, if set
 * @returns {Promise<string>}
 */
async function resolveLiveGroqModel(apiKey, preferred) {
  const { prefer, skip } = loadPrefs();
  const wanted = String(preferred || '').trim();

  let live = [];
  try {
    if (apiKey) live = await listChatModels(apiKey);
  } catch (err) {
    console.warn(`[groq] could not list models (${err.message}) — using preference file`);
  }

  const liveSet = new Set(live);
  const pick = (id) => id && !skip.has(id) && (liveSet.size === 0 || liveSet.has(id));

  if (pick(wanted)) return wanted;
  if (wanted && liveSet.size && !liveSet.has(wanted)) {
    console.warn(`[groq] GROQ_MODEL=${wanted} is not in the live model list — picking a current one`);
  }

  for (const id of prefer) {
    if (pick(id)) {
      if (wanted && wanted !== id) console.warn(`[groq] using ${id}`);
      return id;
    }
  }

  const fallback = live.find((id) => !skip.has(id));
  if (fallback) {
    console.warn(`[groq] preference list had no live match — using ${fallback}`);
    return fallback;
  }

  return prefer[0] || 'openai/gpt-oss-20b';
}

function clearGroqModelCache() {
  cache = { at: 0, keySuffix: '', ids: null };
}

module.exports = {
  resolveLiveGroqModel,
  loadPrefs,
  clearGroqModelCache,
  PREFS_PATH,
};
