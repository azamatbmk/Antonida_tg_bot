import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment, User } from '@prisma/client';
import { readAppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { CourseService } from '../course/course.service';

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
        orderId: `ant-${user.telegramId}-${Date.now()}`,
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

  async fulfill(orderId: string): Promise<boolean> {
    const payment = await this.findByOrderId(orderId);
    if (!payment) {
      this.logger.warn(`Payment not found: ${orderId}`);
      return false;
    }
    if (payment.status === 'paid') {
      return true;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'paid', paidAt: new Date() },
    });

    await this.course.grantAccess(payment.user);
    return true;
  }
}
