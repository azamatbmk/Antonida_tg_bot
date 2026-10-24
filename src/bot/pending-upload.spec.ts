import { nextLessonNumber } from './pending-upload';

describe('nextLessonNumber', () => {
  it('starts from 1.0', () => {
    expect(nextLessonNumber([])).toBe('1.0');
  });

  it('increments the last segment', () => {
    expect(nextLessonNumber(['1.0', '1.1'])).toBe('1.2');
  });
});
