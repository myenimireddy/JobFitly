'use strict';

const { splitResumeSections, classifyHeader } = require('./resumeSections');

describe('splitResumeSections', () => {
  test('splits on real resume headers, not random pages', () => {
    const text = [
      'Ada Lovelace',
      'ada@example.com',
      'Professional Summary',
      'Builder of engines.',
      'Professional Experience',
      'Engineer — Shop',
      'Education',
      'University of Math',
      'Skills',
      'Algebra, Punch cards',
    ].join('\n');

    const chunks = splitResumeSections(text);
    const types = chunks.map((c) => c.type);
    expect(types).toContain('header');
    expect(types).toContain('experience');
    expect(types).toContain('education');
    expect(types).toContain('skills');
    expect(chunks.find((c) => c.type === 'education').text).toMatch(/University of Math/);
  });

  test('classifyHeader ignores long job lines', () => {
    expect(classifyHeader('Senior Software Engineer — Acme Corp')).toBeNull();
    expect(classifyHeader('Educational Qualifications:')).toBe('education');
  });
});
