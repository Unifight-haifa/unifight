# n8n: что сделать утром

Всё собрано в n8n Cloud (https://c0rwin.app.n8n.cloud), папка **Unifight news**. Ни один workflow не включён, ничего никуда не отправлялось.

| workflow | ссылка |
|---|---|
| news-publish | https://c0rwin.app.n8n.cloud/workflow/lCObmj9hNku4t4NJ |
| news-error | https://c0rwin.app.n8n.cloud/workflow/9A0wt0DNhgRTMjK7 |
| news-telegram-intake | https://c0rwin.app.n8n.cloud/workflow/LJhdv8KdlG9ihWd9 |
| news-form-intake | https://c0rwin.app.n8n.cloud/workflow/0OVtxi0XMsEDtKmU |
| news-unpublish | https://c0rwin.app.n8n.cloud/workflow/w713GDyb46KZA5Zj |
| media-intake | https://c0rwin.app.n8n.cloud/workflow/uoovvya1JSTn5KhR |
| media-review | https://c0rwin.app.n8n.cloud/workflow/R1UiY24QUcDDBALl |
| schedule-change | https://c0rwin.app.n8n.cloud/workflow/kzFeKCq5mpOnRaMg |
| bot-translate | https://c0rwin.app.n8n.cloud/workflow/wNJftLMoaebNjtKI |
| bot-git-commit | https://c0rwin.app.n8n.cloud/workflow/WioJt6Ls1FOcaET1 |
| bot-notify | https://c0rwin.app.n8n.cloud/workflow/BQo47li1zzs8lrGY |

Как это устроено — [n8n-news-design.md](n8n-news-design.md), §16–18.

Таблицы (Data tables): `publishers`, `tg_collect`, `news_drafts`, `audit_log`, `media` (новая, для фото и видео из бота).

## Сначала: чужие credentials в узлах

n8n при создании сам подставил в узлы уже существующие credentials: **«Telegram account»** во все узлы Telegram, **«Anthropic»** в `Translate` (и в `bot-translate`), **«Google Drive account»** в узлы Google Drive (`media-intake`, `media-review`) — это может быть ваш личный Drive, а не клубный. Убрать их через API нельзя. Это не те ключи: «Telegram account» — другой бот. Во всех узлах из списка ниже выберите новые credentials.

Поэтому же узел **Telegram Trigger** в `news-telegram-intake` выключен (Deactivate). Если нажать в нём «Test» с чужим ботом, он перехватит вебхук того бота. Включите узел только после того, как выберете в нём «Unifight News Bot».

## 1. Credentials

Credentials → Create. Названия лучше взять ровно такие, так их проще узнать в узлах.

**Telegram API → «Unifight News Bot»** (токен от @BotFather, см. чек-лист §2). Сначала вставьте токен **тестового** бота, после проверки замените токен в этом же credential на рабочий.
- news-telegram-intake: Telegram Trigger, Reply Denied, Reply New, Reply Content, Reply Not Ready, Download Photo, Reply Done, Reply Cancelled, Reply Not Admin, Reply Help
- news-publish: Send Preview, Ask Telegram, Notify Telegram, Notify Admin
- news-unpublish: Confirm Telegram, Notify Telegram, Notify Admin
- news-error: Alert Admin
- news-publish: TG Channel Post
- bot-notify: Notify User, Notify Admin
- media-intake: Download From Telegram
- media-review: Preview Photo, Preview Video, Review Card, Site Form, Site Preview, YouTube Form, YT Preview, Consent
- schedule-change: Form A, Form B, Preview, Ask Announce

**GitHub API → «GitHub unifight contents»** (fine-grained PAT, только репозиторий `unifight`, Contents: Read and write; чек-лист §3). В узлах HTTP Request тип «GitHub API» уже выбран, осталось выбрать сам credential.
- news-publish: Check Author, List News, Get Ref, Get Head Commit, Create Blob, Create Tree, Create Commit, Update Ref
- news-unpublish: List News, List Folder, Get Ref, Get Head Commit, Create Tree, Create Commit, Update Ref
- bot-git-commit: Get Ref, Get Head Commit, Create Blob, Create Tree, Create Commit, Update Ref, Send Dispatch (`Get Live Page` без credential)
- Тот же токен должен иметь доступ ещё к одному репозиторию — см. «Приватный репозиторий для фото» ниже.
- `Get News Json` credential не нужен (публичный news.json).

**Facebook Graph API → «Facebook Page Unifight»** (Page access token, чек-лист §4).
- news-publish: FB Post, IG Container, IG Publish
- news-unpublish: Delete FB Post

**Anthropic → «Anthropic club key»** (ключ клуба с platform.claude.com, чек-лист §5).
- news-publish: Translate
- bot-translate: Translate

**Google Drive OAuth2 API → «Google Drive club»** — вход под **клубным** Google-аккаунтом, тем, в чьём Drive лежит папка «Unifight media».
- media-intake: Find Month Folder, Create Month Folder, Upload To Drive, Get Drive File (HTTP Request, тип «Google Drive OAuth2 API» уже выбран)
- media-review: Download Photo, Download Video

**YouTube OAuth2 API → «YouTube Unifight channel»** — вход под аккаунтом, который управляет brand-каналом UCE1h8sk2IJF6h9eqF9p0LGQ; при входе Google спросит, какой канал, выберите канал клуба. Как завести OAuth-клиент — [youtube-api-access.ru.md](youtube-api-access.ru.md); экран согласия переведите в Production, иначе токен живёт 7 дней.
- media-review: YouTube Upload, Set Translations (HTTP Request), Add To Playlist

**SMTP → «Club SMTP»** (почта клуба, для Gmail пароль приложения, чек-лист §6).
- news-publish: Ask Email, Notify Email
- news-unpublish: Notify Email
- В этих трёх узлах в поле From Email замените `REPLACE_news@club-domain` на адрес клуба.

## 1а. Новое для бота: папка, репозиторий, канал

**Папка в Google Drive.** В клубном Drive создайте папку **Unifight media**. Откройте её, id — это хвост адреса `https://drive.google.com/drive/folders/<id>`. В `media-intake` → узел `Classify` замените оба `REPLACE_DRIVE_FOLDER_ID` на этот id. Дайте доступ «Редактор» тем тренерам, кто будет загружать большие видео сам (больше 20 МБ бот не скачивает и присылает ссылку на эту папку). Папки месяцев бот создаёт сам.

**Приватный репозиторий для фото.** В организации Unifight-haifa создайте **приватный** репозиторий **media-inbox** (пустой, с README). Оригиналы фото попадают только туда; сайт берёт уменьшенную копию без метаданных. Затем:
- в fine-grained токене «GitHub unifight contents» (чек-лист §3) → Repository access → добавьте `media-inbox` к `unifight`; Contents: **Read and write** на обоих. Этого хватает и для коммита, и для `repository_dispatch` в `unifight`;
- для Action сайта нужен отдельный токен с Contents read/write **только** на `media-inbox`: в `unifight` → Settings → Secrets and variables → Actions → секрет `MEDIA_INBOX_TOKEN` ([bot-content-contracts.md](bot-content-contracts.md)).

**Telegram-канал клуба** (если нужен): добавьте бота «Unifight News Bot» в канал администратором с правом публиковать. В news-publish → `Config` впишите `tg_channel_id: '@имя_канала'` (или числовой id `-100…`). Пусто — канал пропускается.

**Плейлисты YouTube.** В YouTube Studio откройте каждый плейлист, id — это `list=PL…` в адресе. Впишите их в media-review → `Config` → `playlists` вместо `REPLACE_PLAYLIST_ID` (названия: Соревнования, Сборы, Промо-съёмки клуба). Пока там заглушка, видео загружается без плейлиста.

**Куда приходят карточки.** media-review → `Config` → `review_chat_id`: пусто — в личку первому утверждающему из таблицы. Если утверждающих несколько: создайте группу в Telegram с ними, на время разрешите боту вход в группы (`/setjoingroups` → Enable), добавьте бота, верните Disable, впишите id группы (`-100…`). Кнопки в группе нажимают только утверждающие.

## 2. Остальные заглушки

- `REPLACE_ADMIN_CHAT_ID` → ваш Telegram id в узлах: Alert Admin (news-error), Notify Admin (news-publish, news-unpublish и bot-notify). Id проще всего узнать у самого бота: напишите ему что угодно до того, как добавите себя в таблицу, он ответит «Ваш Telegram ID: …».
- news-publish → узел `Config`: `fb_page_id` и `ig_user_id` (чек-лист §4).

## 3. Таблица publishers

В ней уже 18 тренеров из `content/coaches/` (на одного больше, чем в чек-листе: добавилась `daria-drozhina`). У всех `active = false`, у `ilana-kratysh` роль `admin`. Data tables → publishers, для каждого, кто будет публиковать:

- `telegram_id` — число из ответа бота, вписать как текст;
- `email` — адрес его аккаунта в n8n, **строчными буквами** (только для формы);
- `role` — `publisher`, `approver` или `admin`. `approver` решает судьбу фото и видео (на сайт, на YouTube, отклонить); `admin` может то же и ещё снимать новости и менять любое расписание. Своё расписание (`content/schedule/<coach_id>.json`) тренер меняет с любой ролью;
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
7. Publish в таком порядке: **news-error → bot-notify → bot-translate → bot-git-commit → news-publish → news-unpublish → media-review → media-intake → schedule-change → news-form-intake → news-telegram-intake** (последним, потому что он регистрирует вебхук бота). Под-workflow сами не запускаются, публикация нужна, чтобы их можно было вызвать из рабочего бота.
8. После публикации news-error в настройках каждого остального workflow: Settings → Error workflow → **news-error**. До публикации n8n не даёт его выбрать.
9. Замените токен в «Unifight News Bot» на рабочий бот, опубликуйте news-telegram-intake ещё раз (чтобы вебхук встал на рабочий бот).
10. Первую настоящую новость отправьте сами и проверьте сайт, Facebook и Instagram. Снять её: `/unpublish <slug>` в боте.

## Проверка бота: фото, видео, расписание

Всё ещё на тестовом боте. Ветку `n8n-test` бот для расписания и галереи не использует, поэтому изменение расписания для проверки ставьте на дату через неделю и потом удалите файл (или поставьте `to` вчерашним числом).

1. В `publishers` себе `role = admin`, `active = true`.
2. Пришлите боту фото **без** `/new`. Ответ «Фото сохранено в папке клуба», файл в Drive `Unifight media/<месяц>/`, строка в `media`, вам приходит карточка с кнопками.
3. «📷 На сайт» → форма (альбом, описание) → предпросмотр на трёх языках → «✓». Коммит появится в `media-inbox`, Action на сайте уменьшит фото, бот напишет, когда фото в галерее.
4. Короткое видео → «▶ На YouTube», доступ «по ссылке», дети в кадре «Да». Видео должно появиться на канале unlisted, ссылка придёт в чат. Проверьте переводы названия в Studio.
5. Видео больше 20 МБ → бот пришлёт ссылку на папку; загрузите туда, пришлите ссылку на файл → карточка.
6. `/schedule` → отмена своей тренировки через неделю. Проверьте сайт (блок изменений над расписанием), затем удалите файл в `content/schedule-changes/`.

## Что проверить на первом запуске (не проверено без ключей)

- Есть ли на Cloud GraphicsMagick для узла `Resize` (Edit Image). Если нет — первая новость с фото упадёт, придёт сообщение от news-error.
- Форма ответа предпросмотра: в выводе узлов `Ask Telegram` / `Ask Email` поля должны называться `Решение` и `Правки` (их читает `Decision`).
- Форма для авторов: email пользователя должен быть в `user.email` вывода `News Form`; файлы — в ключах `cover`, `photos…`.
- Доходят ли фото (binary) из intake в news-publish.
- Формат ответа узла `Translate` (код ждёт текст в `content[0].text`).
- Facebook: первый пост и `id` в ответе; Instagram принимает картинку `cover` из news.json.
- Кнопки в чате (Approve Within Chat) в карточках бота: нажатие должно дойти до n8n при включённом Telegram Trigger. Если вместо кнопок приходят ссылки — бот не видит публичный вебхук, переопубликуйте news-telegram-intake.
- Кто нажал кнопку: `Decision` в media-review ищет id в `data.user.id`; если в выводе `Review Card` поле называется иначе, поправьте одну строку (иначе решение запишется без автора и утвердивший не получит формы).
- Названия полей формы в выводе `Site Form` / `YouTube Form` / `Form A` / `Form B` должны совпадать с подписями (`Альбом`, `Что на фото`, `Название`…).
- Большое видео из Drive в YouTube: на Starter 320 MiB памяти, ролики больше ~150–200 МБ загружайте в Studio руками.
