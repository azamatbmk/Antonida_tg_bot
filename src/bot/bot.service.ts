import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';
import { formatLessonLabel, parseLessonName } from '../common/filename';
import { readAppConfig } from '../config/app-config';
import { CourseService } from '../course/course.service';
import { LessonsService } from '../lessons/lessons.service';
import { PaymentsService } from '../payments/payments.service';
import { SelfworkService } from '../payments/selfwork.service';
import { UsersService } from '../users/users.service';
import { TELEGRAM_BOT } from './bot.constants';
import {
  backHomeKeyboard,
  guestKeyboard,
  ownerKeyboard,
  studentKeyboard,
} from './keyboards';
import { texts } from './texts';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Bot,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly lessons: LessonsService,
    private readonly payments: PaymentsService,
    private readonly selfwork: SelfworkService,
    private readonly course: CourseService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerHandlers();
    this.bot.catch((error) => {
      this.logger.error(`Bot error: ${String(error)}`);
    });
    if (process.env.BOT_SKIP_POLLING === '1' || process.env.NODE_ENV === 'test') {
      this.logger.log('Polling disabled');
      return;
    }
    if (readAppConfig(this.config).ownerIds.length === 0) {
      this.logger.warn('OWNER_TELEGRAM_IDS is empty — nobody can upload lessons');
    }
    void this.bot.start({
      onStart: (info) => this.logger.log(`Bot @${info.username} started`),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.bot.stop();
  }

  private registerHandlers(): void {
    this.bot.command('start', (ctx) => this.showHome(ctx));
    this.bot.command('admin', (ctx) => this.showOwnerHome(ctx));

    this.bot.callbackQuery('nav:home', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.showHome(ctx);
    });
    this.bot.callbackQuery('pay:create', (ctx) => this.onPay(ctx));
    this.bot.callbackQuery('pay:mock', (ctx) => this.onMockPay(ctx));
    this.bot.callbackQuery('lesson:next', (ctx) => this.onNextLesson(ctx));
    this.bot.callbackQuery('channel:invite', (ctx) => this.onChannelInvite(ctx));
    this.bot.callbackQuery('admin:lessons', (ctx) => this.onOwnerLessons(ctx));
    this.bot.callbackQuery('admin:requests', (ctx) => this.onOwnerRequests(ctx));
    this.bot.callbackQuery(/^lesson:get:(\d+)$/, (ctx) => this.onGetLesson(ctx));
    this.bot.callbackQuery(/^unlock:ok:(.+)$/, (ctx) => this.onUnlock(ctx, 'approved'));
    this.bot.callbackQuery(/^unlock:no:(.+)$/, (ctx) => this.onUnlock(ctx, 'rejected'));

    this.bot.on('message:document', (ctx) => this.onOwnerFile(ctx));
    this.bot.on('message:video', (ctx) => this.onOwnerFile(ctx));
  }

  private async showHome(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user) {
      return;
    }

    if (this.course.isOwner(user.telegramId)) {
      await ctx.reply(texts.ownerHome, { reply_markup: ownerKeyboard() });
    }

    const app = readAppConfig(this.config);
    if (!user.hasAccess) {
      await ctx.reply(texts.guestWelcome(app.courseTitle, app.coursePriceRub), {
        reply_markup: guestKeyboard(!this.selfwork.isConfigured()),
      });
      return;
    }

    await this.replyStudentHome(ctx, user.id);
  }

  private async showOwnerHome(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user || !this.ensureOwner(ctx, user.telegramId)) {
      return;
    }
    await ctx.reply(texts.ownerHome, { reply_markup: ownerKeyboard() });
  }

  private async replyStudentHome(ctx: Context, userId: string): Promise<void> {
    const app = readAppConfig(this.config);
    const unlocked = await this.lessons.unlockedLessons(userId);
    const next = await this.lessons.nextLockedLesson(userId);
    const text =
      unlocked.length === 0 ? texts.noLessonsYet : texts.studentHome(app.courseTitle);
    await ctx.reply(text, {
      reply_markup: studentKeyboard(unlocked, Boolean(next), Boolean(app.channelId)),
    });
  }

  private async onPay(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user) {
      return;
    }
    await ctx.answerCallbackQuery();
    if (user.hasAccess) {
      await ctx.reply(texts.alreadyPaid);
      await this.replyStudentHome(ctx, user.id);
      return;
    }

    if (!this.selfwork.isConfigured()) {
      await ctx.reply(texts.testPayHint, {
        reply_markup: guestKeyboard(true),
      });
      return;
    }

    const payment = await this.payments.createInvoice(user);
    await ctx.reply(texts.payLink(this.payments.paymentUrl(payment.orderId)));
  }

  private async onMockPay(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user) {
      return;
    }
    if (this.selfwork.isConfigured()) {
      await ctx.answerCallbackQuery({ text: 'Тестовая оплата выключена' });
      return;
    }
    await ctx.answerCallbackQuery({ text: 'Оплата засчитана' });
    if (user.hasAccess) {
      await ctx.reply(texts.alreadyPaid);
      return;
    }
    const payment = await this.payments.createInvoice(user);
    await this.payments.fulfill(payment.orderId);
  }

  private async onNextLesson(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user?.hasAccess) {
      await ctx.answerCallbackQuery();
      return;
    }
    const result = await this.course.requestNextLesson(user);
    if (result.kind === 'none') {
      await ctx.answerCallbackQuery({ text: texts.allLessonsOpen });
      return;
    }
    const label = formatLessonLabel(result.lesson.number, result.lesson.title);
    await ctx.answerCallbackQuery();
    await ctx.reply(
      result.kind === 'pending'
        ? texts.nextAlreadyPending(label)
        : texts.nextRequested(label),
    );
  }

  private async onGetLesson(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    const number = Number(ctx.match?.[1]);
    if (!user?.hasAccess || !Number.isFinite(number)) {
      await ctx.answerCallbackQuery();
      return;
    }
    const lesson = await this.lessons.findByNumber(number);
    if (!lesson || !(await this.lessons.isUnlocked(user.id, lesson.id))) {
      await ctx.answerCallbackQuery({ text: 'Урок ещё закрыт' });
      return;
    }
    await ctx.answerCallbackQuery();
    await this.course.sendLesson(user, lesson);
  }

  private async onChannelInvite(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user?.hasAccess) {
      await ctx.answerCallbackQuery();
      return;
    }
    const link = await this.course.refreshChannelInvite(user);
    await ctx.answerCallbackQuery();
    await ctx.reply(link ?? texts.noChannel);
  }

  private async onOwnerLessons(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user || !this.ensureOwner(ctx, user.telegramId)) {
      return;
    }
    await ctx.answerCallbackQuery();
    const lessons = await this.lessons.list();
    await ctx.reply(
      lessons.length === 0 ? texts.ownerLessonsEmpty : texts.ownerLessons(lessons),
      { reply_markup: backHomeKeyboard() },
    );
  }

  private async onOwnerRequests(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user || !this.ensureOwner(ctx, user.telegramId)) {
      return;
    }
    await ctx.answerCallbackQuery();
    const requests = await this.lessons.listPendingRequests();
    if (requests.length === 0) {
      await ctx.reply(texts.ownerRequestsEmpty, { reply_markup: backHomeKeyboard() });
      return;
    }
    const rows = [];
    for (const request of requests) {
      const lesson = await this.lessons.findByNumber(request.lessonNumber);
      rows.push({
        who: this.users.displayName(request.user),
        label: lesson
          ? formatLessonLabel(lesson.number, lesson.title)
          : `урок ${request.lessonNumber}`,
      });
    }
    await ctx.reply(texts.ownerRequests(rows), { reply_markup: backHomeKeyboard() });
  }

  private async onUnlock(
    ctx: Context,
    status: 'approved' | 'rejected',
  ): Promise<void> {
    const actor = await this.actor(ctx);
    if (!actor || !this.ensureOwner(ctx, actor.telegramId)) {
      return;
    }
    const requestId = ctx.match?.[1];
    if (!requestId) {
      await ctx.answerCallbackQuery();
      return;
    }
    const request = await this.lessons.findRequest(requestId);
    if (!request || request.status !== 'pending') {
      await ctx.answerCallbackQuery({ text: texts.requestGone });
      return;
    }

    const lesson = await this.lessons.findByNumber(request.lessonNumber);
    const label = lesson
      ? formatLessonLabel(lesson.number, lesson.title)
      : `урок ${request.lessonNumber}`;
    const who = this.users.displayName(request.user);

    if (status === 'approved') {
      if (!lesson) {
        await ctx.answerCallbackQuery({ text: texts.lessonMissing(request.lessonNumber) });
        return;
      }
      await this.course.sendLesson(request.user, lesson);
      await this.lessons.resolveRequest(request.id, 'approved');
      await this.bot.api.sendMessage(
        Number(request.user.telegramId),
        texts.studentApproved(label),
      );
      await ctx.answerCallbackQuery({ text: 'Отправлено' });
      await ctx.editMessageText(texts.requestApproved(who, label));
      return;
    }

    await this.lessons.resolveRequest(request.id, 'rejected');
    await this.bot.api.sendMessage(
      Number(request.user.telegramId),
      texts.studentRejected(label),
    );
    await ctx.answerCallbackQuery({ text: 'Отклонено' });
    await ctx.editMessageText(texts.requestRejected(who, label));
  }

  private async onOwnerFile(ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private') {
      return;
    }
    const user = await this.actor(ctx);
    if (!user) {
      return;
    }
    if (!this.course.isOwner(user.telegramId)) {
      await ctx.reply(texts.studentsCannotUpload);
      return;
    }

    const document = ctx.message?.document;
    const video = ctx.message?.video;
    const fileId = document?.file_id ?? video?.file_id;
    if (!fileId) {
      return;
    }

    const parsed =
      parseLessonName(ctx.message?.caption ?? '') ??
      parseLessonName(document?.file_name ?? '');
    if (!parsed) {
      await ctx.reply(texts.ownerNeedName);
      return;
    }

    const existing = await this.lessons.findByNumber(parsed.number);
    const lesson = await this.lessons.saveFile({
      number: parsed.number,
      title: parsed.title,
      fileId,
      fileName: document?.file_name ?? formatLessonLabel(parsed.number, parsed.title),
      mimeType: document?.mime_type ?? video?.mime_type,
    });
    await ctx.reply(texts.ownerSaved(formatLessonLabel(lesson.number, lesson.title), Boolean(existing)));
    const delivered = await this.course.sendLessonToWaitingStudents(lesson);
    if (delivered > 0) {
      await ctx.reply(`Первый урок ушёл ${delivered} ученикам, которые уже оплатили.`);
    }
  }

  private async actor(ctx: Context) {
    const from = ctx.from;
    if (!from) {
      return null;
    }
    return this.users.upsertFromTelegram({
      telegramId: String(from.id),
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
    });
  }

  private ensureOwner(ctx: Context, telegramId: string): boolean {
    if (this.course.isOwner(telegramId)) {
      return true;
    }
    void ctx.reply('Эта команда только для преподавателя.');
    if (ctx.callbackQuery) {
      void ctx.answerCallbackQuery();
    }
    return false;
  }
}
