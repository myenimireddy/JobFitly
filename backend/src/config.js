/**
 * Env-backed config for the API.
 *
 * Effective LLM provider is resolved in lib/llmSettings.js (UI key / forceOllama /
 * GROQ_API_KEY → Groq, else Ollama). `llmProvider` here is legacy; prefer resolveLlmRuntime().
 */
const path = require('path');

require('dotenv').config();

const packageJson = require('../package.json');

const isDev = (process.env.NODE_ENV || 'development') === 'development';

/** Free/dev-tier defaults — remaps retired Groq ids still sitting in old .env files. */
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const DECOMMISSIONED_GROQ_MODELS = new Set([
  'llama3-70b-8192',
  'llama3-8b-8192',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-specdec',
  'gemma-7b-it',
  'mixtral-8x7b-32768',
]);

function resolveGroqModel() {
  const raw = String(process.env.GROQ_MODEL || '').trim();
  if (!raw) return DEFAULT_GROQ_MODEL;
  if (DECOMMISSIONED_GROQ_MODELS.has(raw)) {
    console.warn(
      `[config] GROQ_MODEL=${raw} is decommissioned on Groq — using ${DEFAULT_GROQ_MODEL}. `
      + `Update backend/.env (see .env.example).`,
    );
    return DEFAULT_GROQ_MODEL;
  }
  return raw;
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Dev CORS is wide so extension content scripts on ATS hosts can call the API.
  corsOrigin: isDev 
    ? ['http://localhost:5173', 'http://localhost:3000', 'https://*.myworkdayjobs.com', 'https://*.ashbyhq.com', 'https://*.lever.co', 'https://*.greenhouse.io', null]
    : (process.env.CORS_ORIGIN || 'http://localhost:5173'),
  dbPath: process.env.DB_PATH || './data/jobfitcheck.db',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  openaiApiKey: process.env.OPENAI_API_KEY,
  version: packageJson.version,

  llmProvider: process.env.LLM_PROVIDER || 'ollama',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: resolveGroqModel(),
};

module.exports = config;
module.exports.resolveGroqModel = resolveGroqModel;
module.exports.DEFAULT_GROQ_MODEL = DEFAULT_GROQ_MODEL;
module.exports.DECOMMISSIONED_GROQ_MODELS = DECOMMISSIONED_GROQ_MODELS;
