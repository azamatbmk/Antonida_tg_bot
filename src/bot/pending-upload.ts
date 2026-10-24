export type PendingUpload = {
  fileId: string;
  fileName: string;
  mimeType?: string;
  /** If set, next text message is only the title */
  number?: string;
  createdAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const pending = new Map<string, PendingUpload>();

function alive(telegramId: string): PendingUpload | null {
  const value = pending.get(telegramId);
  if (!value) {
    return null;
  }
  if (Date.now() - value.createdAt > TTL_MS) {
    pending.delete(telegramId);
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
  return alive(telegramId);
}

export function clearPendingUpload(telegramId: string): void {
  pending.delete(telegramId);
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
