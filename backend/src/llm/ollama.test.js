'use strict';

const mockJson = jest.fn().mockResolvedValue({ message: { content: '[]' } });
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: mockJson,
  text: async () => '',
});

global.fetch = mockFetch;

const OllamaLLM = require('./ollama');

describe('OllamaLLM', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockJson.mockClear();
  });

  test('POSTs /api/chat with format json and temperature 0', async () => {
    const llm = new OllamaLLM();
    await llm.extract('sys', 'user');
    expect(mockFetch).toHaveBeenCalled();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/chat$/);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
    expect(body.keep_alive).toBe('30m');
    expect(body.options.temperature).toBe(0);
    expect(body.options.num_ctx).toBe(8192);
  });
});
