import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { escapeHtml, page } from '../common/html';
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
  async payPage(@Param('orderId') orderId: string): Promise<string> {
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
        'Тестовая оплата',
        `<h1>Тестовый режим</h1>
         <p>Эквайринг самозанятые.рф ещё не подключен. Засчитайте оплату кнопкой в боте.</p>`,
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
  ): Promise<string> {
    const payload = { ...query, ...body };
    const { callbackSecret } = readAppConfig(this.config).selfwork;
    if (callbackSecret && payload.token !== callbackSecret && query.token !== callbackSecret) {
      return 'forbidden';
    }
    const orderId = this.selfwork.verifyCallback(payload);
    if (!orderId) {
      return 'ignored';
    }
    await this.payments.fulfill(orderId);
    return 'ok';
  }

  @Get('payments/selfwork/callback')
  async callbackGet(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.callback(query, query);
    res.status(200).send(result);
  }
}
