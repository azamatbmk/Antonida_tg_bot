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
    const alreadyHadAccess = user.hasAccess;
    if (!alreadyHadAccess) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { hasAccess: true, accessGrantedAt: new Date() },
      });
    }

    const invite = await this.ensureChannelInvite(user);
    const lesson = await this.lessons.findByNumber(1);
    const chatId = Number(user.telegramId);

    const lines = [
      'Оплата прошла. Курс открыт.',
      invite ? `\nКанал: ${invite}` : '',
    ];

    if (lesson) {
      await this.lessons.unlock(user.id, lesson.id);
      await this.bot.api.sendMessage(chatId, lines.filter(Boolean).join('\n'));
      await this.sendLesson(user, lesson);
    } else {
      await this.bot.api.sendMessage(
        chatId,
        `${lines.filter(Boolean).join('\n')}\n\nПервый урок ещё загружают — пришлю сюда, как только он появится.`,
      );
    }

    await this.notifyOwners(
      `Новая оплата: ${this.users.displayName(user)}`,
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
    if (lesson.number !== 1) {
      return 0;
    }
    const waiting = await this.lessons.usersWaitingForLesson(lesson.id);
    for (const user of waiting) {
      try {
        await this.sendLesson(user, lesson);
        await this.bot.api.sendMessage(
          Number(user.telegramId),
          'Первый урок готов — отправил его выше.',
        );
      } catch (error) {
        this.logger.warn(
          `Could not send lesson 1 to ${user.telegramId}: ${String(error)}`,
        );
      }
    }
    return waiting.length;
  }

  async requestNextLesson(user: User): Promise<
    | { kind: 'none' }
    | { kind: 'pending'; lesson: Lesson }
    | { kind: 'created'; lesson: Lesson }
  > {
    const lesson = await this.lessons.nextLockedLesson(user.id);
    if (!lesson) {
      return { kind: 'none' };
    }

    const existing = await this.lessons.findPendingRequest(user.id, lesson.number);
    if (existing) {
      return { kind: 'pending', lesson };
    }

    const request = await this.lessons.createRequest(user.id, lesson.number);
    const label = formatLessonLabel(lesson.number, lesson.title);
    await this.notifyOwners(
      `Заявка на урок\n\nУченик: ${this.users.displayName(user)}\n${label}`,
      [
        [
          { text: 'Отправить', callback_data: `unlock:ok:${request.id}` },
          { text: 'Отклонить', callback_data: `unlock:no:${request.id}` },
        ],
      ],
    );
    return { kind: 'created', lesson };
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
        data: { channelInvite: invite.invite_link },
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

  async refreshChannelInvite(user: User): Promise<string | undefined> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { channelInvite: null },
    });
    return this.ensureChannelInvite({ ...user, channelInvite: null });
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
