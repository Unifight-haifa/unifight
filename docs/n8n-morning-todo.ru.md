# n8n: что сделать утром

Всё собрано в n8n Cloud (https://c0rwin.app.n8n.cloud), папка **Unifight news**. Ни один workflow не включён, ничего никуда не отправлялось.

| workflow | ссылка |
|---|---|
| news-publish | https://c0rwin.app.n8n.cloud/workflow/lCObmj9hNku4t4NJ |
| news-error | https://c0rwin.app.n8n.cloud/workflow/9A0wt0DNhgRTMjK7 |
| news-telegram-intake | https://c0rwin.app.n8n.cloud/workflow/LJhdv8KdlG9ihWd9 |
| news-form-intake | https://c0rwin.app.n8n.cloud/workflow/0OVtxi0XMsEDtKmU |
| news-unpublish | https://c0rwin.app.n8n.cloud/workflow/w713GDyb46KZA5Zj |

Таблицы (Data tables): `publishers`, `tg_collect`, `news_drafts`, `audit_log`.

## Сначала: чужие credentials в узлах

n8n при создании сам подставил в узлы уже существующие credentials: **«Telegram account»** во все узлы Telegram и **«Anthropic»** в `Translate`. Убрать их через API нельзя. Это не те ключи: «Telegram account» — другой бот. Во всех узлах из списка ниже выберите новые credentials.

Поэтому же узел **Telegram Trigger** в `news-telegram-intake` выключен (Deactivate). Если нажать в нём «Test» с чужим ботом, он перехватит вебхук того бота. Включите узел только после того, как выберете в нём «Unifight News Bot».

## 1. Credentials

Credentials → Create. Названия лучше взять ровно такие, так их проще узнать в узлах.

**Telegram API → «Unifight News Bot»** (токен от @BotFather, см. чек-лист §2). Сначала вставьте токен **тестового** бота, после проверки замените токен в этом же credential на рабочий.
- news-telegram-intake: Telegram Trigger, Reply Denied, Reply New, Reply Content, Reply Not Ready, Download Photo, Reply Done, Reply Cancelled, Reply Not Admin, Reply Help
- news-publish: Send Preview, Ask Telegram, Notify Telegram, Notify Admin
- news-unpublish: Confirm Telegram, Notify Telegram, Notify Admin
- news-error: Alert Admin

**GitHub API → «GitHub unifight contents»** (fine-grained PAT, только репозиторий `unifight`, Contents: Read and write; чек-лист §3). В узлах HTTP Request тип «GitHub API» уже выбран, осталось выбрать сам credential.
- news-publish: Check Author, List News, Get Ref, Get Head Commit, Create Blob, Create Tree, Create Commit, Update Ref
- news-unpublish: List News, List Folder, Get Ref, Get Head Commit, Create Tree, Create Commit, Update Ref
- `Get News Json` credential не нужен (публичный news.json).

**Facebook Graph API → «Facebook Page Unifight»** (Page access token, чек-лист §4).
- news-publish: FB Post, IG Container, IG Publish
- news-unpublish: Delete FB Post

**Anthropic → «Anthropic club key»** (ключ клуба с platform.claude.com, чек-лист §5).
- news-publish: Translate

**SMTP → «Club SMTP»** (почта клуба, для Gmail пароль приложения, чек-лист §6).
- news-publish: Ask Email, Notify Email
- news-unpublish: Notify Email
- В этих трёх узлах в поле From Email замените `REPLACE_news@club-domain` на адрес клуба.

## 2. Остальные заглушки

- `REPLACE_ADMIN_CHAT_ID` → ваш Telegram id в узлах: Alert Admin (news-error), Notify Admin (news-publish и news-unpublish). Id проще всего узнать у самого бота: напишите ему что угодно до того, как добавите себя в таблицу, он ответит «Ваш Telegram ID: …».
- news-publish → узел `Config`: `fb_page_id` и `ig_user_id` (чек-лист §4).

## 3. Таблица publishers

В ней уже 18 тренеров из `content/coaches/` (на одного больше, чем в чек-листе: добавилась `daria-drozhina`). У всех `active = false`, у `ilana-kratysh` роль `admin`. Data tables → publishers, для каждого, кто будет публиковать:

- `telegram_id` — число из ответа бота, вписать как текст;
- `email` — адрес его аккаунта в n8n, **строчными буквами** (только для формы);
- `role` — `publisher` или `admin` (admin может снимать новости);
- `active` — включить;
- `lang`, `posts_day`, `posts_count` не трогать.

Бот пускает только строки с `coach_id` из `content/coaches` (другого автора сборка не примет). Для теста впишите свой `telegram_id` в строку `ilana-kratysh` (она admin) и включите `active`; после теста верните её id.

## 4. Порядок включения

**Сначала тестовый бот, коммит в тестовую ветку:**

1. На GitHub создайте ветку `n8n-test` от `main`. В news-publish → `Config` поставьте `branch: 'n8n-test'`. Коммит уйдёт в эту ветку, сайт не пересоберётся, Facebook и Instagram не тронутся: через 12 минут сработает ветка «не появилась на сайте».
2. В credential «Unifight News Bot» — токен тестового бота. Включите узел Telegram Trigger в news-telegram-intake.
3. Откройте news-telegram-intake → **Execute workflow** (режим теста) и напишите тестовому боту: `/new`, текст (первая строка — заголовок), одно-два фото, `/done`. Вкладка Executions покажет каждый шаг.
4. Должен прийти предпросмотр на трёх языках. Первый раз нажмите «Исправить» с какой-нибудь правкой, второй раз «Опубликовать». Проверьте коммит в ветке `n8n-test` (файлы в `src/content/news/…`) и сообщение о таймауте.
5. Если Start Publish ругается, что у news-publish нет опубликованной версии, опубликуйте news-publish (у него нет внешнего триггера, сам он не запустится).

**Потом в работу:**

6. В `Config` верните `branch: 'main'`. Ветку `n8n-test` удалите.
7. Publish в таком порядке: **news-error → news-publish → news-unpublish → news-form-intake → news-telegram-intake** (последним, потому что он регистрирует вебхук бота).
8. После публикации news-error в настройках каждого из четырёх остальных workflow: Settings → Error workflow → **news-error**. До публикации n8n не даёт его выбрать.
9. Замените токен в «Unifight News Bot» на рабочий бот, опубликуйте news-telegram-intake ещё раз (чтобы вебхук встал на рабочий бот).
10. Первую настоящую новость отправьте сами и проверьте сайт, Facebook и Instagram. Снять её: `/unpublish <slug>` в боте.

## Что проверить на первом запуске (не проверено без ключей)

- Есть ли на Cloud GraphicsMagick для узла `Resize` (Edit Image). Если нет — первая новость с фото упадёт, придёт сообщение от news-error.
- Форма ответа предпросмотра: в выводе узлов `Ask Telegram` / `Ask Email` поля должны называться `Решение` и `Правки` (их читает `Decision`).
- Форма для авторов: email пользователя должен быть в `user.email` вывода `News Form`; файлы — в ключах `cover`, `photos…`.
- Доходят ли фото (binary) из intake в news-publish.
- Формат ответа узла `Translate` (код ждёт текст в `content[0].text`).
- Facebook: первый пост и `id` в ответе; Instagram принимает картинку `cover` из news.json.
