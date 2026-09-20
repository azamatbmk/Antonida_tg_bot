export type ParsedLessonName = {
  number: number;
  title: string;
};

const LESSON_NAME_RE =
  /^(\d{1,3})[\s._-]+(.+?)(?:\.[a-z0-9]{2,8})?$/i;

export function parseLessonName(raw: string): ParsedLessonName | null {
  const value = raw.trim().replace(/\s+/g, ' ');
  const match = LESSON_NAME_RE.exec(value);
  if (!match) {
    return null;
  }

  const number = Number.parseInt(match[1], 10);
  const title = match[2].trim().replace(/\.[a-z0-9]{2,8}$/i, '');
  if (!Number.isFinite(number) || number < 1 || title.length === 0) {
    return null;
  }

  return { number, title };
}

export function formatLessonLabel(number: number, title: string): string {
  return `${String(number).padStart(2, '0')} ${title}`;
}
