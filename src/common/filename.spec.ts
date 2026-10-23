import {
  compareLessonNumbers,
  formatLessonLabel,
  parseLessonName,
} from './filename';

describe('parseLessonName', () => {
  it('reads dotted number and title from a file name', () => {
    expect(parseLessonName('1.0 Разминка и постановка корпуса.mp4')).toEqual({
      number: '1.0',
      title: 'Разминка и постановка корпуса',
    });
  });

  it('accepts underscore and extra spaces', () => {
    expect(parseLessonName('1.1_Базовый   шаг.mov')).toEqual({
      number: '1.1',
      title: 'Базовый шаг',
    });
  });

  it('normalizes leading zeros in segments', () => {
    expect(parseLessonName('01.02 Введение.mp4')).toEqual({
      number: '1.2',
      title: 'Введение',
    });
  });

  it('returns null without a dotted number', () => {
    expect(parseLessonName('Разминка.mp4')).toBeNull();
    expect(parseLessonName('01 Разминка.mp4')).toBeNull();
  });
});

describe('compareLessonNumbers', () => {
  it('orders lessons by major then minor', () => {
    const sorted = ['2.0', '1.10', '1.2', '1.0', '1.1'].sort(compareLessonNumbers);
    expect(sorted).toEqual(['1.0', '1.1', '1.2', '1.10', '2.0']);
  });
});

describe('formatLessonLabel', () => {
  it('keeps the dotted number', () => {
    expect(formatLessonLabel('1.2', 'Базовый шаг')).toBe('1.2 Базовый шаг');
  });
});
