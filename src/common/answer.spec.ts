import {
  answersMatch,
  normalizeAnswer,
  sanitizeQaText,
} from './answer';

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

describe('sanitizeQaText', () => {
  it('rejects empty and too long', () => {
    expect(sanitizeQaText('   ')).toBeNull();
    expect(sanitizeQaText('a'.repeat(501))).toBeNull();
    expect(sanitizeQaText('  ок  ')).toBe('ок');
  });
});
