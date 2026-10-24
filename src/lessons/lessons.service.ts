import { Injectable } from '@nestjs/common';
import {
  Lesson,
  LessonProgress,
  LessonQuestion,
  UnlockRequest,
  User,
} from '@prisma/client';
import { normalizeAnswer } from '../common/answer';
import { compareLessonNumbers } from '../common/filename';
import { PrismaService } from '../prisma/prisma.service';

export type LessonFileInput = {
  number: string;
  title: string;
  fileId: string;
  fileName: string;
  mimeType?: string;
};

export type QuestionInput = { question: string; answer: string };

export type UnlockRequestWithUser = UnlockRequest & { user: User };

@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  saveFile(input: LessonFileInput): Promise<Lesson> {
    return this.prisma.lesson.upsert({
      where: { number: input.number },
      create: input,
      update: {
        title: input.title,
        fileId: input.fileId,
        fileName: input.fileName,
        mimeType: input.mimeType,
      },
    });
  }

  async list(): Promise<Lesson[]> {
    const lessons = await this.prisma.lesson.findMany();
    return lessons.sort((a, b) => compareLessonNumbers(a.number, b.number));
  }

  findByNumber(number: string): Promise<Lesson | null> {
    return this.prisma.lesson.findUnique({ where: { number } });
  }

  findById(id: string): Promise<Lesson | null> {
    return this.prisma.lesson.findUnique({ where: { id } });
  }

  async firstLesson(): Promise<Lesson | null> {
    const lessons = await this.list();
    return lessons[0] ?? null;
  }

  async deleteByNumber(number: string): Promise<Lesson | null> {
    const lesson = await this.findByNumber(number);
    if (!lesson) {
      return null;
    }
    await this.prisma.unlockRequest.updateMany({
      where: { lessonNumber: number, status: 'pending' },
      data: { status: 'rejected', resolvedAt: new Date(), pendingKey: null },
    });
    await this.prisma.lesson.delete({ where: { id: lesson.id } });
    return lesson;
  }

  async unlockedLessons(userId: string): Promise<Lesson[]> {
    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId },
      include: { lesson: true },
    });
    return rows
      .map((row) => row.lesson)
      .sort((a, b) => compareLessonNumbers(a.number, b.number));
  }

  async lastUnlockedLesson(userId: string): Promise<Lesson | null> {
    const unlocked = await this.unlockedLessons(userId);
    return unlocked[unlocked.length - 1] ?? null;
  }

  listQuestions(lessonId: string): Promise<LessonQuestion[]> {
    return this.prisma.lessonQuestion.findMany({
      where: { lessonId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async replaceQuestions(
    lessonId: string,
    items: QuestionInput[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.lessonQuestion.deleteMany({ where: { lessonId } }),
      ...items.map((item, index) =>
        this.prisma.lessonQuestion.create({
          data: {
            lessonId,
            sortOrder: index + 1,
            question: item.question.trim(),
            answer: normalizeAnswer(item.answer),
          },
        }),
      ),
    ]);
  }

  isUnlocked(userId: string, lessonId: string): Promise<LessonProgress | null> {
    return this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
  }

  unlock(userId: string, lessonId: string): Promise<LessonProgress> {
    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId },
      update: {},
    });
  }

  async nextLockedLesson(userId: string): Promise<Lesson | null> {
    const lessons = await this.list();
    const unlocked = new Set(
      (await this.unlockedLessons(userId)).map((lesson) => lesson.id),
    );
    return lessons.find((lesson) => !unlocked.has(lesson.id)) ?? null;
  }

  findPendingRequest(
    userId: string,
    lessonNumber: string,
  ): Promise<UnlockRequest | null> {
    return this.prisma.unlockRequest.findFirst({
      where: { userId, lessonNumber, status: 'pending' },
    });
  }

  async createRequestSafe(
    userId: string,
    lessonNumber: string,
  ): Promise<
    | { kind: 'created'; request: UnlockRequest }
    | { kind: 'existing'; request: UnlockRequest }
  > {
    const pendingKey = `${userId}:${lessonNumber}`;
    const existing = await this.findPendingRequest(userId, lessonNumber);
    if (existing) {
      return { kind: 'existing', request: existing };
    }

    try {
      const request = await this.prisma.unlockRequest.create({
        data: {
          userId,
          lessonNumber,
          pendingKey,
          status: 'pending',
        },
      });
      return { kind: 'created', request };
    } catch {
      const raced = await this.findPendingRequest(userId, lessonNumber);
      if (raced) {
        return { kind: 'existing', request: raced };
      }
      throw new Error('Could not create unlock request');
    }
  }

  resolveRequest(
    id: string,
    status: 'approved' | 'rejected',
  ): Promise<UnlockRequest> {
    return this.prisma.unlockRequest.update({
      where: { id },
      data: {
        status,
        resolvedAt: new Date(),
        pendingKey: null,
      },
    });
  }

  /** Atomically claim a pending request; returns null if already resolved. */
  async claimPendingRequest(
    id: string,
    status: 'approved' | 'rejected',
  ): Promise<UnlockRequestWithUser | null> {
    const claimed = await this.prisma.unlockRequest.updateMany({
      where: { id, status: 'pending' },
      data: {
        status,
        resolvedAt: new Date(),
        pendingKey: null,
      },
    });
    if (claimed.count === 0) {
      return null;
    }
    return this.findRequest(id);
  }

  findRequest(id: string): Promise<UnlockRequestWithUser | null> {
    return this.prisma.unlockRequest.findUnique({
      where: { id },
      include: { user: true },
    });
  }

  listPendingRequests(): Promise<UnlockRequestWithUser[]> {
    return this.prisma.unlockRequest.findMany({
      where: { status: 'pending' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  usersWaitingForLesson(lessonId: string, hasAccess = true): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        hasAccess,
        progress: { none: { lessonId } },
      },
    });
  }
}
