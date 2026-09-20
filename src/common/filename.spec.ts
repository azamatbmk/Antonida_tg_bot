import { formatLessonLabel, parseLessonName } from './filename';

describe('parseLessonName', () => {
  it('reads number and title from a file name', () => {
    expect(parseLessonName('01 Разминка и постановка корпуса.mp4')).toEqual({
      number: 1,
      title: 'Разминка и постановка корпуса',
    });
  });

  it('accepts underscore and extra spaces', () => {
    expect(parseLessonName('02_Базовый   шаг.mov')).toEqual({
      number: 2,
      title: 'Базовый шаг',
    });
  });

  it('returns null without a leading number', () => {
    expect(parseLessonName('Разминка.mp4')).toBeNull();
  });
});

describe('formatLessonLabel', () => {
  it('pads the lesson number', () => {
    expect(formatLessonLabel(2, 'Базовый шаг')).toBe('02 Базовый шаг');
  });
});
