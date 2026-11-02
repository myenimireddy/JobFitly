'use strict';

/**
 * Runtime LLM settings (Groq for speed, Ollama as local fallback).
 *
 * Persistence: backend/data/llm-settings.json (gitignored) — may hold a Groq API key.
 * Public API: getPublicLlmSettings() never returns the full key (suffix only).
 *
 * Resolution order — see resolveLlmRuntime():
 *   1. forceOllama === true  → Ollama (even if .env has a Groq key)
 *   2. usable key in settings file or GROQ_API_KEY → Groq
 *   3. else → Ollama
 *
 * Extension Settings gear calls PUT /api/settings/llm (modules/settings/router.js).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const SETTINGS_PATH = path.join(__dirname, '../../data/llm-settings.json');

function isUsableGroqKey(key) {
  const k = String(key || '').trim();
  if (!k || k === 'your_key_here') return false;
  return k.startsWith('gsk_') && k.length > 20;
}

function readFileSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writeFileSettings(data) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getStoredGroqKey() {
  const file = readFileSettings();
  if (isUsableGroqKey(file.groqApiKey)) return String(file.groqApiKey).trim();
  return null;
}

function getEnvGroqKey() {
  if (isUsableGroqKey(config.groqApiKey)) return String(config.groqApiKey).trim();
  return null;
}

/**
 * Prefer UI/stored key, then .env. forceOllama skips Groq even if a key exists.
 */
function resolveLlmRuntime() {
  const file = readFileSettings();
  if (file.forceOllama === true) {
    return {
      provider: 'ollama',
      groqApiKey: null,
      groqModel: config.groqModel || 'llama3-70b-8192',
      ollamaModel: config.ollamaModel || 'llama3.2',
      ollamaBaseUrl: config.ollamaBaseUrl || 'http://localhost:11434',
      source: 'forced-local',
    };
  }

  const groqApiKey = getStoredGroqKey() || getEnvGroqKey();
  if (groqApiKey) {
    return {
      provider: 'groq',
      groqApiKey,
      groqModel: config.groqModel || 'llama3-70b-8192',
      ollamaModel: config.ollamaModel,
      ollamaBaseUrl: config.ollamaBaseUrl,
      source: getStoredGroqKey() ? 'settings' : 'env',
    };
  }
  return {
    provider: 'ollama',
    groqApiKey: null,
    groqModel: config.groqModel || 'llama3-70b-8192',
    ollamaModel: config.ollamaModel || 'llama3.2',
    ollamaBaseUrl: config.ollamaBaseUrl || 'http://localhost:11434',
    source: 'fallback',
  };
}

function getPublicLlmSettings() {
  const runtime = resolveLlmRuntime();
  const stored = getStoredGroqKey();
  const env = getEnvGroqKey();
  const file = readFileSettings();
  const key = stored || env;
  return {
    provider: runtime.provider,
    source: runtime.source,
    forceOllama: file.forceOllama === true,
    hasGroqKey: !!key,
    groqKeySuffix: key ? key.slice(-4) : null,
    groqFromSettings: !!stored,
    groqFromEnv: !!env && !stored,
    groqModel: runtime.groqModel,
    ollamaModel: runtime.ollamaModel,
    message: runtime.provider === 'groq'
      ? `Groq (fast) — key …${key.slice(-4)}`
      : 'Ollama (local) — add a Groq key for faster Analyze / Ask AI',
  };
}

function setGroqApiKey(apiKey) {
  const current = readFileSettings();
  if (apiKey == null || String(apiKey).trim() === '') {
    delete current.groqApiKey;
    current.forceOllama = true;
    writeFileSettings(current);
    return getPublicLlmSettings();
  }
  const key = String(apiKey).trim();
  if (!isUsableGroqKey(key)) {
    const err = new Error('Invalid Groq API key — expected a key starting with gsk_');
    err.statusCode = 400;
    throw err;
  }
  current.groqApiKey = key;
  delete current.forceOllama;
  writeFileSettings(current);
  return getPublicLlmSettings();
}

module.exports = {
  isUsableGroqKey,
  resolveLlmRuntime,
  getPublicLlmSettings,
  setGroqApiKey,
  SETTINGS_PATH,
};
