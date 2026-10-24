import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';
import {
  formatLessonLabel,
  isLessonNumber,
  parseLessonName,
} from '../common/filename';
import { takeRateLimit } from '../common/rate-limit';
import { readAppConfig } from '../config/app-config';
import { CourseService } from '../course/course.service';
import { LessonsService } from '../lessons/lessons.service';
import { PaymentsService } from '../payments/payments.service';
import { SelfworkService } from '../payments/selfwork.service';
import { UsersService } from '../users/users.service';
import { TELEGRAM_BOT } from './bot.constants';
import {
  backHomeKeyboard,
  confirmDeleteLessonKeyboard,
  guestKeyboard,
  ownerKeyboard,
  ownerLessonsKeyboard,
  studentKeyboard,
  suggestLessonNumberKeyboard,
} from './keyboards';
import {
  clearPendingUpload,
  getPendingUpload,
  nextLessonNumber,
  setPendingUpload,
} from './pending-upload';
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
    this.bot.command('reset_invite', (ctx) => this.onResetInvite(ctx));
    this.bot.command('cancel', (ctx) => this.onCancelUpload(ctx));

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
    this.bot.callbackQuery(/^lesson:get:(\d+(?:\.\d+)*)$/, (ctx) => this.onGetLesson(ctx));
    this.bot.callbackQuery(/^lesson:del:(\d+(?:\.\d+)*)$/, (ctx) => this.onDeleteLessonAsk(ctx));
    this.bot.callbackQuery(/^lesson:delok:(\d+(?:\.\d+)*)$/, (ctx) => this.onDeleteLessonConfirm(ctx));
    this.bot.callbackQuery(/^unlock:ok:(.+)$/, (ctx) => this.onUnlock(ctx, 'approved'));
    this.bot.callbackQuery(/^unlock:no:(.+)$/, (ctx) => this.onUnlock(ctx, 'rejected'));
    this.bot.callbackQuery(/^upload:num:(\d+(?:\.\d+)*)$/, (ctx) => this.onUploadPickNumber(ctx));
    this.bot.callbackQuery('upload:cancel', (ctx) => this.onCancelUpload(ctx));

    this.bot.on('message:document', (ctx) => this.onOwnerFile(ctx));
    this.bot.on('message:video', (ctx) => this.onOwnerFile(ctx));
    this.bot.on('message:text', (ctx) => this.onOwnerText(ctx));
  }

  private async showHome(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user) {
      return;
    }

    // Owner gets admin UI only — not the payment/guest flow
    if (this.course.isOwner(user.telegramId)) {
      await ctx.reply(texts.ownerHome, { reply_markup: ownerKeyboard() });
      return;
    }

    const app = readAppConfig(this.config);
    if (!user.hasAccess) {
      await ctx.reply(texts.guestWelcome(app.courseTitle, app.coursePriceRub), {
        reply_markup: guestKeyboard(app.mockPayEnabled),
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

  private async onResetInvite(ctx: Context): Promise<void> {
    const actor = await this.actor(ctx);
    if (!actor || !this.ensureOwner(ctx, actor.telegramId)) {
      return;
    }
    const raw = ctx.message?.text?.split(/\s+/)[1]?.trim();
    if (!raw) {
      await ctx.reply(
        'Сброс ссылки в канал:\n/reset_invite TELEGRAM_ID\nУченик получит новую одноразовую ссылку.',
      );
      return;
    }
    const student = await this.users.findByTelegramId(raw);
    if (!student?.hasAccess) {
      await ctx.reply('Ученик с доступом не найден.');
      return;
    }
    const link = await this.course.rotateChannelInvite(student);
    if (!link) {
      await ctx.reply(texts.noChannel);
      return;
    }
    await this.bot.api.sendMessage(
      Number(student.telegramId),
      `Новая ссылка в канал (старая отозвана):\n${link}`,
    );
    await ctx.reply(
      `Новая ссылка для ${this.users.displayName(student)} отправлена ученику.`,
    );
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
    if (this.course.isOwner(user.telegramId)) {
      await ctx.answerCallbackQuery({ text: 'Для преподавателя оплата не нужна' });
      return;
    }
    await ctx.answerCallbackQuery();
    if (user.hasAccess) {
      await ctx.reply(texts.alreadyPaid);
      await this.replyStudentHome(ctx, user.id);
      return;
    }

    if (!takeRateLimit(`pay:${user.telegramId}`, 5, 60_000)) {
      await ctx.reply('Слишком много попыток. Подождите минуту.');
      return;
    }

    const app = readAppConfig(this.config);
    if (!this.selfwork.isConfigured()) {
      if (app.mockPayEnabled) {
        await ctx.reply(texts.testPayHint, {
          reply_markup: guestKeyboard(true),
        });
        return;
      }
      await ctx.reply('Оплата временно недоступна. Напишите преподавателю.');
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
    const app = readAppConfig(this.config);
    if (!app.mockPayEnabled || this.course.isOwner(user.telegramId)) {
      await ctx.answerCallbackQuery({ text: 'Тестовая оплата выключена' });
      return;
    }
    if (!takeRateLimit(`mockpay:${user.telegramId}`, 3, 60_000)) {
      await ctx.answerCallbackQuery({ text: 'Подождите минуту' });
      return;
    }
    await ctx.answerCallbackQuery({ text: 'Оплата засчитана' });
    if (user.hasAccess) {
      await ctx.reply(texts.alreadyPaid);
      return;
    }
    const payment = await this.payments.createInvoice(user);
    await this.payments.fulfill(payment.orderId, { skipAmountCheck: true });
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
    const number = ctx.match?.[1];
    if (!user?.hasAccess || !number || !isLessonNumber(number)) {
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
    if (!takeRateLimit(`invite:${user.telegramId}`, 10, 60_000)) {
      await ctx.answerCallbackQuery({ text: 'Подождите минуту' });
      return;
    }
    const link = await this.course.getChannelInvite(user);
    await ctx.answerCallbackQuery();
    await ctx.reply(
      link
        ? `${link}\n\nСсылка одноразовая. Если уже использовали — напишите преподавателю.`
        : texts.noChannel,
    );
  }

  private async onOwnerLessons(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user || !this.ensureOwner(ctx, user.telegramId)) {
      return;
    }
    await ctx.answerCallbackQuery();
    const lessons = await this.lessons.list();
    if (lessons.length === 0) {
      await ctx.reply(texts.ownerLessonsEmpty, { reply_markup: backHomeKeyboard() });
      return;
    }
    await ctx.reply(texts.ownerLessons(lessons), {
      reply_markup: ownerLessonsKeyboard(lessons),
    });
  }

  private async onDeleteLessonAsk(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user || !this.ensureOwner(ctx, user.telegramId)) {
      return;
    }
    const number = ctx.match?.[1];
    const lesson =
      number && isLessonNumber(number)
        ? await this.lessons.findByNumber(number)
        : null;
    if (!lesson) {
      await ctx.answerCallbackQuery({ text: texts.ownerDeleteMissing });
      return;
    }
    await ctx.answerCallbackQuery();
    const label = formatLessonLabel(lesson.number, lesson.title);
    await ctx.reply(texts.ownerDeleteConfirm(label), {
      reply_markup: confirmDeleteLessonKeyboard(lesson.number),
    });
  }

  private async onDeleteLessonConfirm(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user || !this.ensureOwner(ctx, user.telegramId)) {
      return;
    }
    const number = ctx.match?.[1];
    if (!number || !isLessonNumber(number)) {
      await ctx.answerCallbackQuery();
      return;
    }
    const deleted = await this.lessons.deleteByNumber(number);
    if (!deleted) {
      await ctx.answerCallbackQuery({ text: texts.ownerDeleteMissing });
      return;
    }
    const label = formatLessonLabel(deleted.number, deleted.title);
    await ctx.answerCallbackQuery({ text: 'Удалено' });
    await ctx.editMessageText(texts.ownerDeleted(label));
    const lessons = await this.lessons.list();
    if (lessons.length === 0) {
      await ctx.reply(texts.ownerLessonsEmpty, { reply_markup: backHomeKeyboard() });
      return;
    }
    await ctx.reply(texts.ownerLessons(lessons), {
      reply_markup: ownerLessonsKeyboard(lessons),
    });
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

    const pending = await this.lessons.findRequest(requestId);
    if (!pending || pending.status !== 'pending') {
      await ctx.answerCallbackQuery({ text: texts.requestGone });
      return;
    }

    const lesson = await this.lessons.findByNumber(pending.lessonNumber);
    if (status === 'approved' && !lesson) {
      await ctx.answerCallbackQuery({
        text: texts.lessonMissing(pending.lessonNumber),
      });
      return;
    }

    const request = await this.lessons.claimPendingRequest(requestId, status);
    if (!request) {
      await ctx.answerCallbackQuery({ text: texts.requestGone });
      return;
    }

    const label = lesson
      ? formatLessonLabel(lesson.number, lesson.title)
      : `урок ${request.lessonNumber}`;
    const who = this.users.displayName(request.user);

    if (status === 'approved' && lesson) {
      await this.course.sendLesson(request.user, lesson);
      await this.bot.api.sendMessage(
        Number(request.user.telegramId),
        texts.studentApproved(label),
      );
      await ctx.answerCallbackQuery({ text: 'Отправлено' });
      await ctx.editMessageText(texts.requestApproved(who, label));
      return;
    }

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

    const fileName =
      document?.file_name ?? `video-${Date.now()}.mp4`;
    const mimeType = document?.mime_type ?? video?.mime_type;
    const parsed =
      parseLessonName(ctx.message?.caption ?? '') ??
      parseLessonName(document?.file_name ?? '');

    if (parsed) {
      await this.saveOwnerLesson(ctx, {
        number: parsed.number,
        title: parsed.title,
        fileId,
        fileName,
        mimeType,
      });
      return;
    }

    const lessons = await this.lessons.list();
    const suggested = nextLessonNumber(lessons.map((lesson) => lesson.number));
    setPendingUpload(user.telegramId, { fileId, fileName, mimeType });
    await ctx.reply(texts.ownerNeedName(suggested), {
      reply_markup: suggestLessonNumberKeyboard(suggested),
    });
  }

  private async onOwnerText(ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private' || ctx.message?.text?.startsWith('/')) {
      return;
    }
    const user = await this.actor(ctx);
    if (!user || !this.course.isOwner(user.telegramId)) {
      return;
    }

    const pending = getPendingUpload(user.telegramId);
    if (!pending) {
      return;
    }

    const text = ctx.message?.text?.trim() ?? '';
    if (!text) {
      return;
    }

    if (pending.number) {
      const title = text.replace(/\s+/g, ' ').trim();
      if (title.length === 0) {
        await ctx.reply(texts.ownerAskTitle(pending.number));
        return;
      }
      clearPendingUpload(user.telegramId);
      await this.saveOwnerLesson(ctx, {
        number: pending.number,
        title,
        fileId: pending.fileId,
        fileName: pending.fileName,
        mimeType: pending.mimeType,
      });
      return;
    }

    const parsed = parseLessonName(text);
    if (!parsed) {
      const lessons = await this.lessons.list();
      const suggested = nextLessonNumber(lessons.map((lesson) => lesson.number));
      await ctx.reply(texts.ownerNeedName(suggested), {
        reply_markup: suggestLessonNumberKeyboard(suggested),
      });
      return;
    }

    clearPendingUpload(user.telegramId);
    await this.saveOwnerLesson(ctx, {
      number: parsed.number,
      title: parsed.title,
      fileId: pending.fileId,
      fileName: pending.fileName,
      mimeType: pending.mimeType,
    });
  }

  private async onUploadPickNumber(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user || !this.ensureOwner(ctx, user.telegramId)) {
      return;
    }
    const number = ctx.match?.[1];
    const pending = getPendingUpload(user.telegramId);
    if (!number || !isLessonNumber(number) || !pending) {
      await ctx.answerCallbackQuery({
        text: pending ? 'Неверный номер' : texts.ownerUploadExpired,
      });
      return;
    }
    setPendingUpload(user.telegramId, { ...pending, number });
    await ctx.answerCallbackQuery();
    await ctx.reply(texts.ownerAskTitle(number));
  }

  private async onCancelUpload(ctx: Context): Promise<void> {
    const user = await this.actor(ctx);
    if (!user || !this.course.isOwner(user.telegramId)) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery();
      }
      return;
    }
    clearPendingUpload(user.telegramId);
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'Отменено' });
    }
    await ctx.reply(texts.ownerUploadCancelled);
  }

  private async saveOwnerLesson(
    ctx: Context,
    input: {
      number: string;
      title: string;
      fileId: string;
      fileName: string;
      mimeType?: string;
    },
  ): Promise<void> {
    const existing = await this.lessons.findByNumber(input.number);
    const lesson = await this.lessons.saveFile({
      number: input.number,
      title: input.title,
      fileId: input.fileId,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
    await ctx.reply(
      texts.ownerSaved(
        formatLessonLabel(lesson.number, lesson.title),
        Boolean(existing),
      ),
    );
    const delivered = await this.course.sendLessonToWaitingStudents(lesson);
    if (delivered > 0) {
      await ctx.reply(
        `Первый урок ушёл ${delivered} ученикам, которые уже оплатили.`,
      );
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
