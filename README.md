# Antoinida — Telegram-бот курса

NestJS-бот: оплата начального курса танцев через самозанятые.рф, выдача первого урока и инвайта в канал, следующие уроки — после подтверждения преподавателя.

**Деплой на Beget VPS:** см. [DEPLOY_BEGET.md](./DEPLOY_BEGET.md).

## Запуск

1. Создайте бота у [@BotFather](https://t.me/BotFather) и скопируйте токен.
2. Напишите боту, затем узнайте свой Telegram id (например через `@userinfobot`).
3. Скопируйте `.env.example` в `.env` и заполните `BOT_TOKEN` и `OWNER_TELEGRAM_IDS`.
4. Установите зависимости и базу:

```bash
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```

5. Для локальных тестов в `.env` поставьте `ENABLE_MOCK_PAY=1` — в боте появится «Тестовая оплата».
6. Преподаватель присылает файлы: `1.0 Разминка.mp4`, `1.1 Базовый шаг.mp4`.
7. Создайте приватный канал, добавьте бота админом с правом приглашать, пропишите `CHANNEL_ID` (например `-100…`).
8. Сброс ссылки ученику (если одноразовая уже сгорела): `/reset_invite TELEGRAM_ID` от преподавателя.

## Оплата самозанятые.рф

Нужны **оба** значения: `SELFWORK_API_KEY` и `SELFWORK_CALLBACK_SECRET`. Без секрета callback отклоняется.

В кабинете Кошелька callback (секрет лучше в теле запроса; в URL — запасной вариант):

`https://ваш-домен/payments/selfwork/callback`

Редирект: `https://ваш-домен/pay/success`.  
`PUBLIC_URL` — тот же домен.

Тестовая оплата (`ENABLE_MOCK_PAY=1`) работает **только** с `PUBLIC_URL` на localhost и без боевых ключей Selfwork. На проде флаг не ставить.
