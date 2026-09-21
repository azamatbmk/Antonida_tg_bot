import { InlineKeyboard } from 'grammy';
import { Lesson } from '@prisma/client';
import { formatLessonLabel } from '../common/filename';

export function guestKeyboard(testPay: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard().text('Оплатить курс', 'pay:create');
  if (testPay) {
    keyboard.row().text('Тестовая оплата', 'pay:mock');
  }
  return keyboard;
}

export function studentKeyboard(
  unlocked: Lesson[],
  hasNext: boolean,
  hasChannel: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const lesson of unlocked) {
    keyboard
      .text(formatLessonLabel(lesson.number, lesson.title).slice(0, 64), `lesson:get:${lesson.number}`)
      .row();
  }
  if (hasNext) {
    keyboard.text('Следующий урок', 'lesson:next').row();
  }
  if (hasChannel) {
    keyboard.text('Ссылка на канал', 'channel:invite').row();
  }
  return keyboard;
}

export function ownerKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Уроки', 'admin:lessons')
    .text('Заявки', 'admin:requests');
}

export function ownerLessonsKeyboard(lessons: Lesson[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const lesson of lessons) {
    const label = formatLessonLabel(lesson.number, lesson.title).slice(0, 48);
    keyboard
      .text(`🗑 ${label}`, `lesson:del:${lesson.number}`)
      .row();
  }
  keyboard.text('В меню', 'nav:home');
  return keyboard;
}

export function confirmDeleteLessonKeyboard(number: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('Да, удалить', `lesson:delok:${number}`)
    .text('Отмена', 'admin:lessons');
}

export function backHomeKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('В меню', 'nav:home');
}
