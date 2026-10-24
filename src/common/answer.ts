export const MAX_LESSON_QUESTIONS = 20;
export const MAX_QA_TEXT_LENGTH = 500;

export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ');
}

export function answersMatch(expected: string, actual: string): boolean {
  return normalizeAnswer(expected) === normalizeAnswer(actual);
}

export function sanitizeQaText(value: string): string | null {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0 || trimmed.length > MAX_QA_TEXT_LENGTH) {
    return null;
  }
  return trimmed;
}
