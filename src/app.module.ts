import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';
import { TELEGRAM_BOT } from './bot/bot.constants';
import { BotService } from './bot/bot.service';
import { CourseService } from './course/course.service';
import { LessonsService } from './lessons/lessons.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { SelfworkService } from './payments/selfwork.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersService } from './users/users.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
  ],
  controllers: [PaymentsController],
  providers: [
    {
      provide: TELEGRAM_BOT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const token = config.get<string>('BOT_TOKEN')?.trim();
        if (!token) {
          throw new Error('Set BOT_TOKEN in .env');
        }
        return new Bot(token);
      },
    },
    UsersService,
    LessonsService,
    SelfworkService,
    PaymentsService,
    CourseService,
    BotService,
  ],
})
export class AppModule {}
