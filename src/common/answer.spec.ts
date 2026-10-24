import { answersMatch, normalizeAnswer } from './answer';

describe('normalizeAnswer', () => {
  it('ignores case, spaces and ё', () => {
    expect(normalizeAnswer('  Ёлка  ')).toBe('елка');
  });
});

describe('answersMatch', () => {
  it('matches soft variants', () => {
    expect(answersMatch('Базовый шаг', 'базовый   шаг')).toBe(true);
  });
});
