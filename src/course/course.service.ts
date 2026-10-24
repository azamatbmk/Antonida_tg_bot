import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Lesson, User } from '@prisma/client';
import { Bot } from 'grammy';
import { TELEGRAM_BOT } from '../bot/bot.constants';
import { formatLessonLabel } from '../common/filename';
import { readAppConfig } from '../config/app-config';
import { LessonsService } from '../lessons/lessons.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Bot,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly lessons: LessonsService,
    private readonly users: UsersService,
  ) {}

  isOwner(telegramId: string): boolean {
    return readAppConfig(this.config).ownerIds.includes(telegramId);
  }

  async grantAccess(user: User): Promise<void> {
    const claimed = await this.prisma.user.updateMany({
      where: { id: user.id, hasAccess: false },
      data: { hasAccess: true, accessGrantedAt: new Date() },
    });
    // Another concurrent grant already finished — do not spam lessons
    if (claimed.count === 0) {
      return;
    }

    const updated =
      (await this.prisma.user.findUnique({ where: { id: user.id } })) ?? {
        ...user,
        hasAccess: true,
        accessGrantedAt: new Date(),
      };

    const invite = await this.ensureChannelInvite(updated);
    const lesson = await this.lessons.firstLesson();
    const chatId = Number(updated.telegramId);

    const lines = [
      'Оплата прошла. Курс открыт.',
      invite ? `\nКанал: ${invite}` : '',
    ];

    if (lesson) {
      await this.lessons.unlock(updated.id, lesson.id);
      await this.bot.api.sendMessage(chatId, lines.filter(Boolean).join('\n'));
      await this.sendLesson(updated, lesson);
    } else {
      await this.bot.api.sendMessage(
        chatId,
        `${lines.filter(Boolean).join('\n')}\n\nПервый урок ещё загружают — пришлю сюда, как только он появится.`,
      );
    }

    await this.notifyOwners(
      `Новая оплата: ${this.users.displayName(updated)}`,
    );
  }

  async sendLesson(user: User, lesson: Lesson): Promise<void> {
    const caption = formatLessonLabel(lesson.number, lesson.title);
    const chatId = Number(user.telegramId);
    try {
      await this.bot.api.sendDocument(chatId, lesson.fileId, { caption });
    } catch {
      await this.bot.api.sendVideo(chatId, lesson.fileId, { caption });
    }
    await this.lessons.unlock(user.id, lesson.id);
  }

  async sendLessonToWaitingStudents(lesson: Lesson): Promise<number> {
    const first = await this.lessons.firstLesson();
    if (!first || first.id !== lesson.id) {
      return 0;
    }
    const waiting = await this.lessons.usersWaitingForLesson(lesson.id);
    for (const student of waiting) {
      try {
        await this.sendLesson(student, lesson);
        await this.bot.api.sendMessage(
          Number(student.telegramId),
          'Первый урок готов — отправил его выше.',
        );
      } catch (error) {
        this.logger.warn(
          `Could not send first lesson to ${student.telegramId}: ${String(error)}`,
        );
      }
    }
    return waiting.length;
  }

  async requestNextLesson(user: User): Promise<
    | { kind: 'none' }
    | { kind: 'quiz'; current: Lesson; next: Lesson }
    | { kind: 'pending'; lesson: Lesson }
    | { kind: 'created'; lesson: Lesson }
  > {
    const next = await this.lessons.nextLockedLesson(user.id);
    if (!next) {
      return { kind: 'none' };
    }

    const current = await this.lessons.lastUnlockedLesson(user.id);
    if (current) {
      const questions = await this.lessons.listQuestions(current.id);
      if (questions.length > 0) {
        return { kind: 'quiz', current, next };
      }
    }

    const result = await this.lessons.createRequestSafe(user.id, next.number);
    if (result.kind === 'existing') {
      return { kind: 'pending', lesson: next };
    }

    const label = formatLessonLabel(next.number, next.title);
    await this.notifyOwners(
      `Заявка на урок\n\nУченик: ${this.users.displayName(user)}\n${label}\n(к текущему уроку нет вопросов — нужно подтверждение)`,
      [
        [
          { text: 'Отправить', callback_data: `unlock:ok:${result.request.id}` },
          { text: 'Отклонить', callback_data: `unlock:no:${result.request.id}` },
        ],
      ],
    );
    return { kind: 'created', lesson: next };
  }

  private async ensureChannelInvite(user: User): Promise<string | undefined> {
    if (user.channelInvite) {
      return user.channelInvite;
    }

    const channelId = readAppConfig(this.config).channelId;
    if (!channelId) {
      return undefined;
    }

    try {
      const invite = await this.bot.api.createChatInviteLink(channelId, {
        member_limit: 1,
        name: `u${user.telegramId}`.slice(0, 32),
      });
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          channelInvite: invite.invite_link,
          channelInviteCreatedAt: new Date(),
        },
      });
      return invite.invite_link;
    } catch (error) {
      this.logger.error(`Invite link failed: ${String(error)}`);
      await this.notifyOwners(
        `Не удалось создать ссылку в канал для ${this.users.displayName(user)}. Проверьте, что бот — админ канала.`,
      );
      return undefined;
    }
  }

  /** Returns existing invite only — no new links (prevents sharing/farming). */
  async getChannelInvite(user: User): Promise<string | undefined> {
    if (user.channelInvite) {
      return user.channelInvite;
    }
    return this.ensureChannelInvite(user);
  }

  /**
   * Owner-only: revoke previous invite and issue a new single-use link.
   */
  async rotateChannelInvite(user: User): Promise<string | undefined> {
    const channelId = readAppConfig(this.config).channelId;
    if (!channelId) {
      return undefined;
    }

    if (user.channelInvite) {
      try {
        await this.bot.api.revokeChatInviteLink(channelId, user.channelInvite);
      } catch (error) {
        this.logger.warn(`Revoke invite failed: ${String(error)}`);
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { channelInvite: null, channelInviteCreatedAt: null },
    });

    return this.ensureChannelInvite({
      ...user,
      channelInvite: null,
      channelInviteCreatedAt: null,
    });
  }

  private async notifyOwners(
    text: string,
    replyMarkup?: { text: string; callback_data: string }[][],
  ): Promise<void> {
    const { ownerIds } = readAppConfig(this.config);
    for (const ownerId of ownerIds) {
      try {
        await this.bot.api.sendMessage(Number(ownerId), text, {
          reply_markup: replyMarkup
            ? { inline_keyboard: replyMarkup }
            : undefined,
        });
      } catch (error) {
        this.logger.warn(`Owner notify failed ${ownerId}: ${String(error)}`);
      }
    }
  }
}
