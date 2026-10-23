import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { escapeHtml, page } from '../common/html';
import { takeRateLimit } from '../common/rate-limit';
import { readAppConfig } from '../config/app-config';
import { PaymentsService } from './payments.service';
import { SelfworkService } from './selfwork.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly selfwork: SelfworkService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  home(): string {
    const app = readAppConfig(this.config);
    const verify = app.selfwork.siteVerify
      ? `<p class="muted">${escapeHtml(app.selfwork.siteVerify)}</p>`
      : '';
    return page(
      app.courseTitle,
      `<h1>${escapeHtml(app.courseTitle)}</h1>
       <p>Оплата и уроки идут через Telegram-бота.</p>
       ${verify}`,
    );
  }

  @Get('pay/success')
  @Header('Content-Type', 'text/html; charset=utf-8')
  success(): string {
    return page(
      'Оплата прошла',
      `<h1>Оплата принята</h1>
       <p>Вернитесь в Telegram — бот пришлёт первый урок и ссылку на канал.</p>`,
    );
  }

  @Get('pay/:orderId')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async payPage(
    @Param('orderId') orderId: string,
    @Req() req: Request,
  ): Promise<string> {
    const ip = req.ip ?? 'unknown';
    if (!takeRateLimit(`pay-page:${ip}`, 30, 60_000)) {
      throw new ForbiddenException('Too many requests');
    }

    const payment = await this.payments.findByOrderId(orderId);
    if (!payment) {
      throw new NotFoundException();
    }
    if (payment.status === 'paid') {
      return this.success();
    }

    const app = readAppConfig(this.config);
    if (!this.selfwork.isConfigured()) {
      return page(
        'Оплата недоступна',
        `<h1>Оплата недоступна</h1>
         <p>Эквайринг ещё не настроен. Вернитесь в Telegram-бота.</p>`,
      );
    }

    const fields = this.selfwork.buildInitFields({
      orderId: payment.orderId,
      amountKopecks: payment.amountKopecks,
      itemName: app.courseTitle,
    });
    const inputs = Object.entries(fields)
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
      )
      .join('');

    return page(
      'Оплата курса',
      `<h1>${escapeHtml(app.courseTitle)}</h1>
       <p>Переходим на страницу самозанятые.рф…</p>
       <form id="pay" method="post" action="${escapeHtml(app.selfwork.initUrl)}">${inputs}</form>
       <script>document.getElementById('pay').submit()</script>`,
    );
  }

  @Post('payments/selfwork/callback')
  @HttpCode(200)
  async callback(
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, string>,
    @Req() req: Request,
  ): Promise<string> {
    const ip = req.ip ?? 'unknown';
    if (!takeRateLimit(`pay-cb:${ip}`, 60, 60_000)) {
      throw new ForbiddenException('Too many requests');
    }

    // Body wins over query for token — avoids relying on secret only in URL
    const payload = { ...query, ...body };
    const verified = this.selfwork.verifyCallback(payload);
    if (!verified) {
      throw new ForbiddenException('Invalid callback');
    }

    const result = await this.payments.fulfill(verified.orderId, {
      amountKopecks: verified.amountKopecks,
    });

    if (result === 'granted' || result === 'already_paid') {
      return 'ok';
    }
    if (result === 'not_found') {
      throw new NotFoundException('Order not found');
    }
    throw new BadRequestException('Amount mismatch');
  }
}
