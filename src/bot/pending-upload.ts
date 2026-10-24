export type PendingUpload = {
  fileId: string;
  fileName: string;
  mimeType?: string;
  /** If set, next text message is only the title */
  number?: string;
  createdAt: number;
};

export type QuestionDraft = { question: string; answer: string };

export type PendingQuestions = {
  lessonId: string;
  lessonLabel: string;
  step: 'question' | 'answer';
  draftQuestion?: string;
  items: QuestionDraft[];
  createdAt: number;
};

export type PendingQuiz = {
  currentLessonId: string;
  nextLessonId: string;
  nextLabel: string;
  index: number;
  questions: QuestionDraft[];
  createdAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const pending = new Map<string, PendingUpload>();
const pendingQuestions = new Map<string, PendingQuestions>();
const pendingQuiz = new Map<string, PendingQuiz>();

function alive<T extends { createdAt: number }>(
  map: Map<string, T>,
  telegramId: string,
): T | null {
  const value = map.get(telegramId);
  if (!value) {
    return null;
  }
  if (Date.now() - value.createdAt > TTL_MS) {
    map.delete(telegramId);
    return null;
  }
  return value;
}

export function setPendingUpload(
  telegramId: string,
  upload: Omit<PendingUpload, 'createdAt'>,
): void {
  pending.set(telegramId, { ...upload, createdAt: Date.now() });
}

export function getPendingUpload(telegramId: string): PendingUpload | null {
  return alive(pending, telegramId);
}

export function clearPendingUpload(telegramId: string): void {
  pending.delete(telegramId);
}

export function setPendingQuestions(
  telegramId: string,
  value: Omit<PendingQuestions, 'createdAt'>,
): void {
  pendingQuestions.set(telegramId, { ...value, createdAt: Date.now() });
}

export function getPendingQuestions(
  telegramId: string,
): PendingQuestions | null {
  return alive(pendingQuestions, telegramId);
}

export function clearPendingQuestions(telegramId: string): void {
  pendingQuestions.delete(telegramId);
}

export function setPendingQuiz(
  telegramId: string,
  value: Omit<PendingQuiz, 'createdAt'>,
): void {
  pendingQuiz.set(telegramId, { ...value, createdAt: Date.now() });
}

export function getPendingQuiz(telegramId: string): PendingQuiz | null {
  return alive(pendingQuiz, telegramId);
}

export function clearPendingQuiz(telegramId: string): void {
  pendingQuiz.delete(telegramId);
}

export function clearAllOwnerSessions(telegramId: string): void {
  clearPendingUpload(telegramId);
  clearPendingQuestions(telegramId);
}

export function nextLessonNumber(existing: string[]): string {
  if (existing.length === 0) {
    return '1.0';
  }
  const last = existing[existing.length - 1];
  const parts = last.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) {
    return '1.0';
  }
  parts[parts.length - 1] += 1;
  return parts.join('.');
}
