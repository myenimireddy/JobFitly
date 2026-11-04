'use strict';

describe('safeLogger', () => {
  const original = process.env.DEBUG_LLM_CONTENT;

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    if (original === undefined) delete process.env.DEBUG_LLM_CONTENT;
    else process.env.DEBUG_LLM_CONTENT = original;
  });

  test('does not log content by default', () => {
    delete process.env.DEBUG_LLM_CONTENT;
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = require('./safeLogger');
    logger.content('resume', 'name@example.com');
    expect(logger.contentDebugEnabled).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  test('logs content only after explicit opt-in', () => {
    process.env.DEBUG_LLM_CONTENT = 'true';
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = require('./safeLogger');
    logger.content('resume', 'debug sample');
    expect(logger.contentDebugEnabled).toBe(true);
    expect(log).toHaveBeenCalledWith('[content-debug] resume:', 'debug sample');
  });
});
