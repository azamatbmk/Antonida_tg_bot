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
    'Тестовый режим: ключ самозанятые.рф не задан. Нажмите кнопку, чтобы засчитать оплату без эквайринга.',

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
    'Режим преподавателя.\nПришлите файлы уроков с номером в начале имени, например:\n01 Разминка и постановка корпуса.mp4\n\nДальше бот будет рассылать их ученикам после вашего подтверждения.',

  ownerSaved: (label: string, replaced: boolean) =>
    replaced ? `Обновил урок: ${label}` : `Сохранил урок: ${label}`,

  ownerNeedName:
    'Не понял номер урока. Назовите файл так:\n01 Описание урока.mp4\nили напишите то же в подписи к файлу.',

  studentsCannotUpload: 'Файлы уроков загружает только преподаватель.',

  requestGone: 'Эта заявка уже обработана.',

  requestApproved: (who: string, label: string) =>
    `Отправил ${label} — ${who}`,

  requestRejected: (who: string, label: string) =>
    `Отклонил ${label} — ${who}`,

  studentApproved: (label: string) => `Преподаватель открыл урок: ${label}`,

  studentRejected: (label: string) =>
    `Преподаватель пока не открыл «${label}». Можно написать ему и запросить снова позже.`,

  lessonMissing: (number: number) =>
    `Урок ${String(number).padStart(2, '0')} ещё не загружен в бота.`,

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
