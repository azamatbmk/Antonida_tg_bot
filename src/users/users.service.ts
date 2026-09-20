import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TelegramProfile = {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  upsertFromTelegram(profile: TelegramProfile): Promise<User> {
    return this.prisma.user.upsert({
      where: { telegramId: profile.telegramId },
      create: profile,
      update: {
        username: profile.username,
        firstName: profile.firstName,
        lastName: profile.lastName,
      },
    });
  }

  findByTelegramId(telegramId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { telegramId } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  displayName(user: Pick<User, 'firstName' | 'lastName' | 'username' | 'telegramId'>): string {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    if (name && user.username) {
      return `${name} (@${user.username})`;
    }
    if (name) {
      return name;
    }
    if (user.username) {
      return `@${user.username}`;
    }
    return `id ${user.telegramId}`;
  }
}
