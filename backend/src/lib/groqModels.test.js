'use strict';

const { resolveLiveGroqModel, clearGroqModelCache } = require('./groqModels');

describe('resolveLiveGroqModel', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    clearGroqModelCache();
  });

  test('skips a retired preferred id and uses the first live preference', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'whisper-large-v3' },
          { id: 'openai/gpt-oss-20b' },
          { id: 'openai/gpt-oss-120b' },
        ],
      }),
    });
    const id = await resolveLiveGroqModel('gsk_testkey_xxxxxxxxxxxxxxxxxxxx', 'llama3-70b-8192');
    expect(id).toBe('openai/gpt-oss-20b');
  });

  test('keeps preferred id when Groq still lists it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }],
      }),
    });
    const id = await resolveLiveGroqModel('gsk_testkey_xxxxxxxxxxxxxxxxxxxx', 'openai/gpt-oss-120b');
    expect(id).toBe('openai/gpt-oss-120b');
  });
});
