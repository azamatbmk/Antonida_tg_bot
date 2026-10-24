import { Lesson } from '@prisma/client';
import { formatLessonLabel } from '../common/filename';

export const texts = {
  guestWelcome: (courseTitle: string, priceRub: number) =>
    [
      `Это бот курса «${courseTitle}».`,
      '',
      'После оплаты в этот чат придёт первый урок и ссылка на канал.',
      'Следующие уроки открывает преподаватель по вашей заявке.',
      '',
      `Стоимость: ${priceRub} ₽`,
    ].join('\n'),

  payLink: (url: string) =>
    [
      'Оплатите курс на странице самозанятые.рф.',
      'После оплаты вернитесь в бота — доступ откроется автоматически.',
      '',
      url,
    ].join('\n'),

  testPayHint:
    'Тестовый режим (ENABLE_MOCK_PAY=1). Нажмите кнопку, чтобы засчитать оплату без эквайринга.',

  alreadyPaid: 'Курс уже оплачен. Уроки ниже.',

  studentHome: (courseTitle: string) =>
    `Курс «${courseTitle}» открыт. Можно пересмотреть уроки или запросить следующий.`,

  noLessonsYet: 'Уроки ещё не загружены. Преподаватель скоро пришлёт первый файл.',

  nextRequested: (label: string) =>
    `Заявка на «${label}» отправлена преподавателю. Как подтвердит — пришлю видео сюда.`,

  nextAlreadyPending: (label: string) =>
    `Заявка на «${label}» уже у преподавателя. Ждём подтверждение.`,

  allLessonsOpen: 'Все загруженные уроки уже открыты.',

  ownerHome:
    'Режим преподавателя.\n\nС iPhone: просто пришлите видео как есть — бот спросит номер и название.\nМожно сразу подписью: 1.0 Разминка\n\nОтмена загрузки: /cancel',

  ownerSaved: (label: string, replaced: boolean) =>
    replaced ? `Обновил урок: ${label}` : `Сохранил урок: ${label}`,

  ownerNeedName: (suggested: string) =>
    [
      'Видео получил.',
      `Напишите следующим сообщением номер и название, например:`,
      `${suggested} Разминка и постановка корпуса`,
      '',
      'Или нажмите кнопку ниже и пришлите только название.',
      'Отмена: /cancel',
    ].join('\n'),

  ownerAskTitle: (number: string) =>
    `Номер ${number}. Теперь напишите название урока одним сообщением.\nОтмена: /cancel`,

  ownerUploadCancelled: 'Загрузку отменил.',

  ownerUploadExpired:
    'Сессия загрузки истекла. Пришлите видео ещё раз.',

  studentsCannotUpload: 'Файлы уроков загружает только преподаватель.',

  requestGone: 'Эта заявка уже обработана.',

  requestApproved: (who: string, label: string) =>
    `Отправил ${label} — ${who}`,

  requestRejected: (who: string, label: string) =>
    `Отклонил ${label} — ${who}`,

  studentApproved: (label: string) => `Преподаватель открыл урок: ${label}`,

  studentRejected: (label: string) =>
    `Преподаватель пока не открыл «${label}». Можно написать ему и запросить снова позже.`,

  lessonMissing: (number: string) =>
    `Урок ${number} ещё не загружен в бота.`,

  noChannel: 'Канал ещё не настроен. Урок всё равно придёт в этот чат.',

  ownerLessonsEmpty: 'Пока нет файлов. Пришлите урок как файл с номером в начале имени.',

  ownerLessons: (lessons: Lesson[]) =>
    [
      'Загруженные уроки.',
      'Чтобы заменить — пришлите новый файл с тем же номером.',
      'Чтобы удалить — нажмите кнопку ниже.',
      '',
      ...lessons.map((lesson) => formatLessonLabel(lesson.number, lesson.title)),
    ].join('\n'),

  ownerDeleteConfirm: (label: string) =>
    `Удалить «${label}»?\nУ учеников этот урок пропадёт из списка. Открытые заявки на него закроются.`,

  ownerDeleted: (label: string) => `Удалил урок: ${label}`,

  ownerDeleteMissing: 'Такого урока уже нет.',

  ownerRequestsEmpty: 'Открытых заявок нет.',

  ownerRequests: (
    rows: { who: string; label: string }[],
  ) => ['Заявки:', ...rows.map((row) => `• ${row.who} — ${row.label}`)].join('\n'),
};
