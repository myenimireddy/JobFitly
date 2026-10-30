'use strict';

const mockChat = jest.fn().mockResolvedValue({ message: { content: '[]' } });

jest.mock('ollama', () => ({
  Ollama: jest.fn().mockImplementation(() => ({ chat: mockChat })),
}));

const OllamaLLM = require('./ollama');

describe('OllamaLLM', () => {
  test('sends format json and temperature 0', async () => {
    const llm = new OllamaLLM();
    await llm.extract('sys', 'user');
    expect(mockChat).toHaveBeenCalled();
    const arg = mockChat.mock.calls[0][0];
    expect(arg.format).toBe('json');
    expect(arg.options.temperature).toBe(0);
  });
});
