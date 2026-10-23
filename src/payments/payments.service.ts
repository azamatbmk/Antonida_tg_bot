import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment, User } from '@prisma/client';
import { readAppConfig } from '../config/app-config';
import { CourseService } from '../course/course.service';
import { PrismaService } from '../prisma/prisma.service';

export type FulfillResult =
  | 'granted'
  | 'already_paid'
  | 'not_found'
  | 'amount_mismatch';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly course: CourseService,
  ) {}

  async createInvoice(user: User): Promise<Payment> {
    const app = readAppConfig(this.config);
    return this.prisma.payment.create({
      data: {
        userId: user.id,
        orderId: `ant-${randomUUID()}`,
        amountKopecks: app.coursePriceRub * 100,
        provider: 'selfwork',
      },
    });
  }

  findByOrderId(orderId: string): Promise<(Payment & { user: User }) | null> {
    return this.prisma.payment.findUnique({
      where: { orderId },
      include: { user: true },
    });
  }

  paymentUrl(orderId: string): string {
    return `${readAppConfig(this.config).publicUrl}/pay/${orderId}`;
  }

  async fulfill(
    orderId: string,
    options?: { amountKopecks?: number | null; skipAmountCheck?: boolean },
  ): Promise<FulfillResult> {
    const payment = await this.findByOrderId(orderId);
    if (!payment) {
      this.logger.warn(`Payment not found: ${orderId}`);
      return 'not_found';
    }
    if (payment.status === 'paid') {
      return 'already_paid';
    }

    if (!options?.skipAmountCheck) {
      if (
        options?.amountKopecks == null ||
        options.amountKopecks !== payment.amountKopecks
      ) {
        this.logger.warn(
          `Amount mismatch for ${orderId}: got ${String(options?.amountKopecks)}, expected ${payment.amountKopecks}`,
        );
        return 'amount_mismatch';
      }
    }

    const claimed = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'pending' },
      data: { status: 'paid', paidAt: new Date() },
    });
    if (claimed.count === 0) {
      return 'already_paid';
    }

    const fresh = await this.prisma.user.findUnique({
      where: { id: payment.userId },
    });
    if (!fresh) {
      return 'not_found';
    }

    await this.course.grantAccess(fresh);
    return 'granted';
  }
}
