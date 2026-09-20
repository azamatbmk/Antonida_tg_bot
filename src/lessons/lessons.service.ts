import { Injectable } from '@nestjs/common';
import { Lesson, LessonProgress, UnlockRequest, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type LessonFileInput = {
  number: number;
  title: string;
  fileId: string;
  fileName: string;
  mimeType?: string;
};

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

  list(): Promise<Lesson[]> {
    return this.prisma.lesson.findMany({ orderBy: { number: 'asc' } });
  }

  findByNumber(number: number): Promise<Lesson | null> {
    return this.prisma.lesson.findUnique({ where: { number } });
  }

  async unlockedLessons(userId: string): Promise<Lesson[]> {
    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId },
      include: { lesson: true },
    });
    return rows.map((row) => row.lesson).sort((a, b) => a.number - b.number);
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
    lessonNumber: number,
  ): Promise<UnlockRequest | null> {
    return this.prisma.unlockRequest.findFirst({
      where: { userId, lessonNumber, status: 'pending' },
    });
  }

  createRequest(userId: string, lessonNumber: number): Promise<UnlockRequest> {
    return this.prisma.unlockRequest.create({
      data: { userId, lessonNumber },
    });
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

  resolveRequest(
    id: string,
    status: 'approved' | 'rejected',
  ): Promise<UnlockRequest> {
    return this.prisma.unlockRequest.update({
      where: { id },
      data: { status, resolvedAt: new Date() },
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
