import { Lesson } from '@prisma/client';
import { formatLessonLabel } from '../common/filename';

export const texts = {
  guestWelcome: (courseTitle: string, priceRub: number) =>
    [
      `Это бот курса «${courseTitle}».`,
      '',
      'После оплаты в этот чат придёт первый урок и ссылка на канал.',
      'Дальше нажимайте «Следующий урок» — видео приходит сразу.',
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
    `Курс «${courseTitle}» открыт. Можно пересмотреть уроки или взять следующий.`,

  noLessonsYet: 'Уроки ещё не загружены. Преподаватель скоро пришлёт первый файл.',

  nextSent: (label: string) => `Открыл урок: ${label}`,

  allLessonsOpen: 'Все загруженные уроки уже открыты.',

  ownerHome:
    'Режим преподавателя.\n\n1) Пришлите видео\n2) Номер и название\n\nУченики сами открывают следующие уроки кнопкой.\nОтмена загрузки: /cancel',

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
