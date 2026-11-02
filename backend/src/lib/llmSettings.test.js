'use strict';

const fs = require('fs');
const path = require('path');
const {
  isUsableGroqKey,
  resolveLlmRuntime,
  setGroqApiKey,
  getPublicLlmSettings,
  SETTINGS_PATH,
} = require('./llmSettings');

describe('llmSettings', () => {
  const backupPath = `${SETTINGS_PATH}.bak-test`;
  let hadFile = false;
  let original = null;

  beforeAll(() => {
    if (fs.existsSync(SETTINGS_PATH)) {
      hadFile = true;
      original = fs.readFileSync(SETTINGS_PATH, 'utf8');
      fs.copyFileSync(SETTINGS_PATH, backupPath);
    }
  });

  afterAll(() => {
    if (hadFile && fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, SETTINGS_PATH);
      fs.unlinkSync(backupPath);
    } else if (fs.existsSync(SETTINGS_PATH) && !hadFile) {
      fs.unlinkSync(SETTINGS_PATH);
    } else if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(SETTINGS_PATH)) fs.unlinkSync(SETTINGS_PATH);
  });

  test('isUsableGroqKey rejects placeholders', () => {
    expect(isUsableGroqKey('')).toBe(false);
    expect(isUsableGroqKey('your_key_here')).toBe(false);
    expect(isUsableGroqKey('gsk_short')).toBe(false);
    expect(isUsableGroqKey('gsk_' + 'x'.repeat(30))).toBe(true);
  });

  test('saving a key selects groq; clearing forces ollama', () => {
    const key = 'gsk_' + 'a'.repeat(40);
    const saved = setGroqApiKey(key);
    expect(saved.provider).toBe('groq');
    expect(saved.hasGroqKey).toBe(true);
    expect(resolveLlmRuntime().provider).toBe('groq');
    expect(resolveLlmRuntime().source).toBe('settings');

    const cleared = setGroqApiKey(null);
    expect(cleared.provider).toBe('ollama');
    expect(cleared.forceOllama).toBe(true);
    expect(resolveLlmRuntime().provider).toBe('ollama');
    expect(resolveLlmRuntime().source).toBe('forced-local');
  });

  test('public settings never expose full key', () => {
    const key = 'gsk_' + 'b'.repeat(40);
    setGroqApiKey(key);
    const pub = getPublicLlmSettings();
    expect(JSON.stringify(pub)).not.toContain(key);
    expect(pub.groqKeySuffix).toBe(key.slice(-4));
  });
});
