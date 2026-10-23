# Деплой на Beget (VPS)

Обычный виртуальный хостинг Beget для этого бота **не подходит**: нужен процесс 24/7 (Telegram polling) и свой HTTPS для callback оплаты. Берём **VPS Beget** (Ubuntu 22.04 / 24.04).

Минимум: 1 vCPU, 1 GB RAM, публичный IPv4, домен (поддомен вроде `bot.ваш-домен.ru`).

## 0. Перед деплоем

1. **Остановите бота на ноутбуке** (`Ctrl+C` в терминале). Один токен = один процесс, иначе конфликт `getUpdates`.
2. В панели Beget создайте VPS с Ubuntu.
3. Привяжите домен/поддомен A-записью на IP сервера.
4. Убедитесь, что код на GitHub: `https://github.com/azamatbmk/Antonida_tg_bot.git`

## 1. Сервер: Node, nginx, certbot

По SSH (`root` или пользователь с sudo):

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. Код

```bash
cd ~
git clone https://github.com/azamatbmk/Antonida_tg_bot.git antoinida-bot
cd antoinida-bot
cp .env.example .env
nano .env
```

Заполните `.env` для боя:

```env
BOT_TOKEN=...
OWNER_TELEGRAM_IDS=...
CHANNEL_ID=...
COURSE_TITLE=Начальный курс танцев
COURSE_PRICE_RUB=3000
PUBLIC_URL=https://bot.ваш-домен.ru
DATABASE_URL="file:./prod.db"
PORT=3000
NODE_ENV=production
ENABLE_MOCK_PAY=0

SELFWORK_API_KEY=
SELFWORK_CALLBACK_SECRET=
SELFWORK_INIT_URL=https://pro.selfwork.ru/merchant/v1/init
```

Пока Selfwork не подключён — оставьте ключи пустыми, mock на проде **не включится** (нужен localhost). Оплата в боте будет «недоступна», пока не пропишете оба ключа.

## 3. Сборка и запуск

```bash
cd ~/antoinida-bot
chmod +x deploy/beget-setup.sh
./deploy/beget-setup.sh
# или вручную:
# npm ci && npx prisma generate && npx prisma db push && npm run build
# pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

Проверка:

```bash
pm2 status
curl -s http://127.0.0.1:3000/
```

## 4. Nginx + HTTPS

```bash
sudo nano /etc/nginx/sites-available/antoinida
```

Вставьте конфиг из `deploy/nginx.antoinida.conf.example`, замените `YOUR_DOMAIN`.

```bash
sudo ln -sf /etc/nginx/sites-available/antoinida /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d bot.ваш-домен.ru
```

`PUBLIC_URL` в `.env` должен быть `https://...` — после смены:

```bash
pm2 restart antoinida-bot
```

## 5. Уроки после переноса

`file_id` Telegram остаётся валидным при **том же** `BOT_TOKEN`.  
База на сервере новая — список уроков пустой. Преподаватель снова заливает файлы `1.0 …`, `1.1 …` в бота (или скопируйте `prod.db` / локальный `dev.db` на сервер в путь из `DATABASE_URL`).

Скопировать локальную базу (если уроки уже в SQLite):

```bash
# на ноутбуке (из каталога проекта):
scp prisma/dev.db user@IP:~/antoinida-bot/prisma/prod.db
# на сервере в .env: DATABASE_URL="file:./prod.db"
# путь относительно папки prisma/ у Prisma — обычно file:./prod.db лежит в prisma/
pm2 restart antoinida-bot
```

У Prisma `file:./prod.db` создаётся относительно каталога `prisma/`.

## 6. Самозанятые.рф

В кабинете:

- Callback URL: `https://bot.ваш-домен.ru/payments/selfwork/callback`
- Секрет → `SELFWORK_CALLBACK_SECRET`
- Redirect: `https://bot.ваш-домен.ru/pay/success`
- `SELFWORK_API_KEY` + секрет в `.env`, затем `pm2 restart antoinida-bot`

## 7. Обновление кода

```bash
cd ~/antoinida-bot
git pull
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 restart antoinida-bot
```

## Частые проблемы

| Симптом | Что проверить |
|--------|----------------|
| Бот молчит | `pm2 logs antoinida-bot`; не запущен ли ещё процесс на ноутбуке |
| 502 nginx | `pm2 status`, `curl 127.0.0.1:3000` |
| Нет уроков | база пустая — перезалить файлы или скопировать `.db` |
| Conflict getUpdates | два инстанса с одним токеном — остановите лишний |

## Виртуальный хостинг Beget (не VPS)

Технически Node в Docker-окружении возможен, но нестабилен для polling-бота и HTTPS callback. Для этого проекта используйте **VPS**.
