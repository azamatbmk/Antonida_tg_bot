#!/usr/bin/env bash
# Первичная установка на Beget VPS (Ubuntu). Запускать на сервере из каталога проекта.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/antoinida-bot}"

echo "==> Node $(node -v 2>/dev/null || echo 'не найден')"
if ! command -v node >/dev/null 2>&1; then
  echo "Установите Node 20+: https://nodejs.org или через nvm"
  exit 1
fi

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "Создайте .env из .env.example перед запуском"
  exit 1
fi

if grep -q 'ENABLE_MOCK_PAY=1' .env; then
  echo "ВНИМАНИЕ: в .env включён ENABLE_MOCK_PAY — на проде выключите (0 или удалите строку)"
fi

npm ci
npx prisma generate
npx prisma db push
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup | tail -n 1 || true

echo "==> Готово. Проверка: pm2 status && curl -s http://127.0.0.1:3000/"
