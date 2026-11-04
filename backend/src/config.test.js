'use strict';

describe('resolveGroqModel', () => {
  const original = process.env.GROQ_MODEL;

  afterEach(() => {
    if (original === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = original;
    jest.resetModules();
  });

  test('remaps decommissioned llama3-70b-8192', () => {
    process.env.GROQ_MODEL = 'llama3-70b-8192';
    jest.resetModules();
    const { resolveGroqModel, DEFAULT_GROQ_MODEL } = require('./config');
    expect(resolveGroqModel()).toBe(DEFAULT_GROQ_MODEL);
  });

  test('keeps a current model id', () => {
    process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
    jest.resetModules();
    const { resolveGroqModel } = require('./config');
    expect(resolveGroqModel()).toBe('openai/gpt-oss-120b');
  });
});
