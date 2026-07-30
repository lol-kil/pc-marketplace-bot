# Маркетплейс комплектующих — Telegram Mini App

Полностью без своего сервера: витрина — статика на GitHub Pages, "бэкенд" —
GitHub Actions по расписанию (раз в ~5 минут), хранилище корзины/лайков —
встроенный Telegram CloudStorage.

**Важная оговорка:** так как нет постоянно работающего сервера, все
действия, которые должны что-то *изменить* (заказ, добавление товара админом),
обрабатываются с задержкой до ~5 минут — именно раз в столько запускается
Actions. Просмотр каталога — мгновенный, он не зависит от бота.

## 1. Создать бота

1. В Telegram напиши [@BotFather](https://t.me/BotFather) → `/newbot`, получи токен.
2. `/mybots` → выбери бота → **Bot Settings → Menu Button** → укажи ссылку на
   твой GitHub Pages (появится после шага 3) — так кнопка меню будет сразу
   открывать каталог.

## 2. Создать репозиторий

1. Залей это содержимое в свой GitHub-репозиторий (например `pc-marketplace-bot`).
2. В `webapp/app.js` поправь `CONFIG.GH_OWNER` и `CONFIG.GH_REPO` на свои.
3. **Settings → Pages** → Source: `main` / `/webapp` (или через Actions,
   если понадобится сборка) → сохрани, получишь ссылку вида
   `https://<username>.github.io/<repo>/`.

## 3. Секреты репозитория

**Settings → Secrets and variables → Actions → New repository secret**:

| Имя | Значение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен от BotFather |
| `GH_PAT` | fine-grained personal access token **только на этот репозиторий**, права: Contents → Read and write |
| `ADMIN_CHAT_ID` | твой личный Telegram chat_id (куда будут падать заказы) |
| `MINI_APP_URL` | ссылка на GitHub Pages из шага 2.3 |

> Как получить `GH_PAT`: GitHub → Settings → Developer settings →
> Personal access tokens → Fine-grained tokens → New token → Repository
> access: Only this repository → Permissions: Contents: Read and write.

> Как узнать свой `chat_id`: напиши что угодно [@userinfobot](https://t.me/userinfobot).

## 4. Добавить себя в админы

Отредактируй `config/admins.json`, впиши свой числовой Telegram ID вместо
примера, закоммить.

## 5. Включить обработчик

Actions запускаются автоматически по `cron` каждые 5 минут после первого
пуша. Можно также запустить вручную: **Actions → Poll Telegram updates → Run workflow**.

## Как всё устроено

- `catalog/categories.json` — каталог (категории → товары). Читается Mini App
  напрямую по `raw.githubusercontent.com`, без бота.
- `config/admins.json` — список ID админов.
- `webapp/` — сама Mini App (HTML/CSS/JS), раздаётся GitHub Pages.
- `bot/poll.js` — раз в 5 минут спрашивает у Telegram новые события
  (`getUpdates`) и обрабатывает: заказы шлёт админу, изменения каталога
  коммитит в репозиторий.
- Корзина и избранное — `Telegram.WebApp.CloudStorage`, синхронизируются у
  юзера между устройствами, не требуют бота вообще.

## Что дальше (когда появится сервер)

Когда будет куда деплоить постоянный процесс — заменить `poll.js` (cron)
на вебхук (`setWebhook` + express/telegraf), убрать задержку в 5 минут.
Остальная архитектура (каталог в репозитории, CloudStorage, sendData) не
поменяется.
