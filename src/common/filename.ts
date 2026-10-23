export type ParsedLessonName = {
  number: string;
  title: string;
};

const LESSON_NAME_RE =
  /^(\d+(?:\.\d+)*)[\s._-]+(.+?)(?:\.[a-z0-9]{2,8})?$/i;

export function parseLessonName(raw: string): ParsedLessonName | null {
  const value = raw.trim().replace(/\s+/g, ' ');
  const match = LESSON_NAME_RE.exec(value);
  if (!match) {
    return null;
  }

  const number = normalizeLessonNumber(match[1]);
  const title = match[2].trim().replace(/\.[a-z0-9]{2,8}$/i, '');
  if (!number || title.length === 0) {
    return null;
  }

  return { number, title };
}

export function normalizeLessonNumber(raw: string): string | null {
  const parts = raw
    .trim()
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }
  if (parts.length === 1) {
    return null;
  }
  return parts.join('.');
}

export function compareLessonNumbers(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10));
  const right = b.split('.').map((part) => Number.parseInt(part, 10));
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) {
      return x - y;
    }
  }
  return 0;
}

export function formatLessonLabel(number: string, title: string): string {
  return `${number} ${title}`;
}

export function isLessonNumber(value: string): boolean {
  return normalizeLessonNumber(value) !== null;
}
