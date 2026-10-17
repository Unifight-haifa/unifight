# Публикация новостей через n8n

Проект автоматизации: тренер пишет новость на одном языке (в Telegram или через веб-форму), n8n переводит её на два других языка, показывает автору, после подтверждения кладёт в репозиторий сайта, ждёт сборку и публикует в Facebook и Instagram. Для родительских групп WhatsApp автор получает готовые ссылки.

Состояние: проект и черновики workflow. Аккаунты не созданы, ничего не опубликовано. Что нужно завести владельцу — в [n8n-setup-checklist.ru.md](n8n-setup-checklist.ru.md).

Файлы workflow лежат в `n8n/`:

| Файл | Что делает | Узлов |
|---|---|---|
| `news-telegram-intake.json` | бот: приём текста и фото, команды | 29 |
| `news-form-intake.json` | веб-форма для тех, у кого нет Telegram | 8 |
| `news-publish.json` | общий под-workflow: перевод → предпросмотр → коммит → ожидание сборки → FB/IG/WhatsApp | 48 |
| `news-unpublish.json` | снятие новости админом | 29 |
| `news-error.json` | уведомление админа о любом сбое | 3 |

`news-error.json` в задании не было. Это три узла, без них сбой молча остаётся в логе исполнений.

Ссылки на документацию в квадратных скобках, список в конце. Где поведение узла не подтверждено документацией, в JSON у узла есть поле `_note`.

---

## 1. Схема

```mermaid
flowchart TD
  TG[Telegram Trigger] --> FP1[Find Publisher<br/>по telegram_id]
  FORM[News Form<br/>n8n User Auth] --> FP2[Find Publisher<br/>по email]
  FP1 -->|нет в списке| DENY1[Reply Denied + Log Denied]
  FP2 -->|нет в списке| DENY2[Denied Page + Log Denied]
  FP1 --> CMD{Route}
  CMD -->|/new, текст, фото| COLLECT[(tg_collect)]
  CMD -->|/done| DL[Download Photo] --> PUB
  CMD -->|/unpublish| UNP
  FP2 --> PREP[Prepare Items] --> PUB

  subgraph PUB [news-publish]
    IMG[Read Orientation → Resize → Pack Images<br/>≤1600 px, JPEG, без EXIF/GPS] --> RATE[Check Author → Rate Check<br/>тренер есть в content/coaches, лимит]
    RATE --> TR[Translate]
    TR --> PARSE[Parse Translation<br/>проверка чисел и «нивхерет»]
    PARSE --> ASK{Предпросмотр<br/>Telegram или почта}
    ASK -->|Исправить| TR
    ASK -->|Отменить / нет ответа 48 ч| CANCEL[Cancelled]
    ASK -->|Опубликовать| GIT[List News: slug свободен → Git Data API<br/>один коммит]
    GIT --> WAIT[Wait Deploy ↔ Get News Json<br/>до 12 мин]
    WAIT -->|не появилась| TO[Deploy Timeout]
    WAIT -->|на сайте| SOC[FB Post → IG Container → IG Publish]
    SOC --> SUM[Summarize: ссылки + wa.me]
  end

  subgraph UNP [news-unpublish]
    CONF[Confirm] --> DEL[удалить папку одним коммитом] --> FBD[Delete FB Post]
  end

  CANCEL & TO & SUM & FBD --> TAIL[Audit · Update Draft · Notify]
```

Почему так:

- Перевод, предпросмотр и публикация собраны в один под-workflow, оба канала его вызывают. Логика одна, различается только канал предпросмотра.
- Ожидание решения автора сделано встроенным «Send and Wait for Response». Узел Telegram и узел Send Email умеют отправить сообщение и ждать ответа через форму [N6][N7]. Своих webhook и таблиц состояния для кнопок не нужно.
- Исполнения под-workflow не тратят квоту тарифа: «When a workflow calls another workflow with the Execute Sub-workflow node, only the parent (top-level) execution counts.» [N8]

---

## 2. Хранилище: Data Tables n8n

Выбор: **Data Tables** (встроенные таблицы n8n), а не Google Sheet.

- Встроены в n8n: «Data tables integrate data storage within your n8n environment.» [N9] Не нужен ни Google-аккаунт, ни отдельный credential, нет внешнего сервиса, который может отвалиться.
- Узел Data Table умеет Get / Insert / Update / Upsert / Delete и проверки «If Row Exists» [N10]. Этого хватает.
- Лимит: «the total storage used by all data tables in an instance is limited to 200 MiB» [N9]. Наши таблицы — килобайты.
- Минус: таблицу нельзя отдать на редактирование человеку без доступа к n8n. Список авторов ведёт владелец (админ) в интерфейсе n8n. Если захочется, чтобы список правил кто-то без n8n, можно перейти на Google Sheet, заменив пять узлов Find Publisher / Find Admin.

Таблицы (все столбцы строковые, кроме отмеченных):

**`publishers`** — список допущенных

| столбец | пример | смысл |
|---|---|---|
| `coach_id` | `ilana-kratysh` | имя файла в `content/coaches/` без `.json` (поле `author` в новости) |
| `name` | Илана Кратыш | для сообщений |
| `telegram_id` | `123456789` | числовой id Telegram, строкой; пусто, если нет Telegram |
| `email` | `ilana@example.com` | **в нижнем регистре**; адрес её аккаунта n8n (для формы) |
| `role` | `publisher` / `admin` | admin может снимать новости |
| `active` | boolean | выключить автора, не удаляя строку |
| `lang` | `ru` | язык по умолчанию (запасной, обычно язык определяется по тексту) |
| `posts_day`, `posts_count` (number) | `2026-10-17`, `1` | счётчик для лимита в день, заполняет n8n |

**`tg_collect`** — открытый черновик в Telegram: `telegram_id`, `text`, `photo_ids` (JSON-массив file_id), `src_lang`, `started_at`.

**`news_drafts`** — судьба каждой новости: `draft_id`, `folder`, `author_id`, `channel`, `status` (`preview`, `cancelled`, `committed`, `deploy_timeout`, `live`, `live_partial`, `unpublished`), `title_en`, `commit_sha`, `fb_post_id`, `ig_media_id`, `error`, `updated_at`. По `fb_post_id` команда снятия удаляет пост.

**`audit_log`** — журнал: `ts`, `actor_id`, `channel`, `action` (`denied`, `rate_limited`, `cancel`, `commit`, `deploy_wait`, `distribute`, `unpublish`), `target`, `result`, `detail`, `execution_id`.

---

## 3. Авторизация

### 3.1 Telegram

1. Бот принимает только личные сообщения: `Is Allowed` проверяет `message.chat.type === 'private'`. В BotFather добавление в группы выключается (`/setjoingroups`) [T2].
2. `Find Publisher` ищет `message.from.id` в `publishers.telegram_id`; нужно `active = true`. Telegram id — целое число, для него «a 64-bit integer or double-precision float type are safe» [T1]; храним строкой, чтобы не терять точность.
3. Незнакомому пользователю бот отвечает «Нет доступа. Ваш Telegram ID: …» и пишет строку в `audit_log`. Этим же ответом удобно собирать id авторов (см. чек-лист).
4. Снятие новости (`/unpublish`) проверяет `role = admin`.

В Telegram Trigger есть своя опция «Restrict to User IDs» [N11]. Её не используем, иначе список пришлось бы вести в двух местах. Таблица — единственный источник.

Ограничение платформы: «Telegram only allows you to register a single webhook per app» [N12]. Поэтому у бота ровно один активный Telegram Trigger. Если нажать «Test» в редакторе, пока workflow активен, тестовый вебхук перехватит бота. Для отладки лучше завести второго бота.

### 3.2 Веб-форма: личные аккаунты n8n (n8n User Auth)

**Решение:** у n8n Form Trigger режим аутентификации **n8n User Auth**. Документация:

> «Only users logged in to this n8n instance can view or submit the form.»
> «Unauthenticated visitors loading the form are redirected to the n8n sign-in page.»
> «Unauthenticated form submissions receive a 401 response.»
> «By default, n8n adds the submitting user's ID, email, first name, and last name to the output data.» [N1]

Как это работает:

1. Каждому автору без Telegram владелец отправляет из n8n приглашение. Автор получает личный аккаунт с ролью **Member**, у каждого свой пароль. На всех тарифах Cloud пользователей без ограничений: «All plans include unlimited users & workflows.» [N13]
2. Форма открывается по ссылке. Если человек не вошёл в n8n, его отправит на страницу входа.
3. После отправки `Find Publisher` берёт email вошедшего пользователя из вывода формы и ищет его в `publishers`. `Is Allowed` пропускает, только если email входа не пустой и совпадает с email найденной строки, а `active = true`. Иначе — страница «Нет прав» и строка в журнале. Так пустой email не совпадёт со строкой автора, у которого почты нет (только Telegram). Своего аккаунта в n8n мало: нужна ещё запись в таблице.
4. Каждому стоит включить двухфакторную защиту (Settings → Personal; приложение-аутентификатор) [N14].

Почему не одноразовый код по почте. Схема «форма → email → код → страница проверки кода» требует своей таблицы кодов, сроков жизни, защиты от перебора и отдельной страницы. Это самодельная система входа, ошибки в ней мы заметим последними. n8n User Auth — встроенный вход n8n с паролем и 2FA, и проверка лежит на n8n, а не на нашем коде. Basic Auth не подходит: один общий логин [N1].

Минусы, о которых надо знать:

- Member может создавать свои workflow на нашем инстансе. В описании ролей у него «manage their own workflows», но нет доступа к чужим credentials и workflow [N15]. Ключей клуба он не увидит, но теоретически может тратить исполнения тарифа. Для пары тренеров риск приемлемый. В журнале исполнений видно, кто что запускал.
- Опция «Require Workflow Execute Permission» [N1] не нужна: она требует давать каждому права на сам workflow, а проверки по таблице достаточно.
- Название поля с email пользователя в выводе формы документация не приводит. В JSON стоит `$json.user?.email`, после первой тестовой отправки путь надо проверить (`_note` у узла).

### 3.3 Решение автора по предпросмотру

Ссылка «Ответить» из сообщения Telegram или письма ведёт на страницу ответа n8n для этого конкретного ожидающего исполнения. Ссылку получает только автор: в личном чате с ботом или на свою почту. Без ответа 48 часов срабатывает «Limit Wait Time» [N6][N7], и черновик отменяется.

---

## 4. Ввод новости

### Telegram

```
/new            → открыть черновик (можно /new ru, если язык не определится)
<текст>         → первая строка — заголовок, дальше — новость; можно несколькими сообщениями
<фото>          → 1–6 фото, первое станет обложкой; фото «файлом» тоже принимается
/done           → проверить и отправить на перевод
/cancel         → удалить черновик
/unpublish <адрес или slug>  → снять новость (только admin)
```

Видео бот пока не берёт и отвечает, что его надо загрузить на YouTube вручную (см. §13). Бот может скачать файл не больше 20 MB [T1], так что ролики всё равно пришлось бы передавать иначе.

Язык исходника определяется по алфавиту: иврит → `he`, кириллица → `ru`, иначе `en`.

### Форма

Поля: язык текста, заголовок, текст, обложка (JPEG/PNG, обязательно), ещё до 5 фото, «что на обложке», теги через запятую. После отправки — страница «Новость принята, предпросмотр придёт на почту».

---

## 5. Перевод

Узел **Anthropic → Message a Model** [N16] с ключом клуба. Модель `claude-sonnet-5-5`: $2 за миллион входных токенов и $10 за миллион выходных [L1][L2]. Она лучше дешёвой Haiku держит иврит и имена, а цена новости всё равно копеечная (§14). Если нужен OpenAI, меняется один узел `Translate`, разбор ответа не зависит от поставщика.

Системный промпт (в узле `Translate`, на английском: так модель надёжнее следует правилам):

```text
You translate news posts for Unifight Haifa, a judo club in Haifa, Israel. Languages: Hebrew (he), Russian (ru), English (en). The input JSON gives source_lang, title, body (Markdown) and optional cover_hint, corrections and previous.

Rules:
1. Translate faithfully. Do not add, drop, soften or embellish facts. Tone: a club announcement for parents and athletes.
2. Copy exactly, character for character where the script allows: people's names (transliterate consistently; in the source language keep the author's spelling), places, club names, dates, times, all numbers, scores, ages, places taken (1st, 2nd...), belt grades and weight categories such as -60 kg or +100 kg. Never convert units, round or reformat numbers.
3. Mandatory glossary: נבחרת המועדון = «сборная клуба (нивхерет)» = "selected team (nivheret)". At this club the word נבחרת on its own means this club squad. Never translate it as "national team", «сборная Израиля» or «национальная сборная». Only נבחרת ישראל (explicitly Israel) is the national team.
4. Keep the Markdown structure of the source: paragraphs, lists, bold. No headings unless the source has them.
5. For every language return: title (max 90 characters), summary (one sentence, max 160 characters, no emoji), body (Markdown), cover_alt (one short phrase describing the cover photo from context; never name children).
6. In the source language keep title and body exactly as given, unless corrections ask to change them.
7. slug: 2 to 6 lowercase English words joined by hyphens, only a-z, 0-9 and hyphens.
8. If corrections are present, start from previous, apply exactly the author's corrections and change nothing else.

Reply with one JSON object and nothing else:
{"slug": "...", "he": {"title": "", "summary": "", "body": "", "cover_alt": ""}, "ru": {...}, "en": {...}}
```

Глоссарий взят из сайта (`content/site.json`, строки расписания и `nivheret_note`).

Промпт не единственная защита. `Parse Translation` перепроверяет ответ кодом:

- в каждом языке должны быть title / summary / body, иначе ошибка и уведомление админу;
- summary длиннее 160 символов обрезается по слову;
- заголовок и текст на языке автора подставляются из оригинала, модель их не трогает (кроме правок по просьбе автора);
- **числа**: все числа исходника (`3`, `-60`, `12.10`, `1:0`) должны встретиться в каждом переводе, иначе в предпросмотре будет «RU: нет чисел …»;
- **нивхерет**: если в исходнике есть נבחרת без «Израиль», переводы обязаны содержать «нивхерет» / "nivheret"; «national team», «сборная Израиля», «национальная сборная» дают предупреждение «Нивхерет переведена как национальная сборная — исправьте».

Имена кодом не проверить. Это остаётся на автора, и сообщение с кнопкой прямо просит проверить текст.

Предпросмотр: в Telegram три сообщения (по языку на сообщение, в одно 4096 символов [N6] не влезут) и четвёртое — с кнопкой «Ответить». На почту приходит одно письмо, иврит в нём справа налево. Форма ответа: «Опубликовать / Исправить / Отменить» и поле «Правки». «Исправить» отправляет правки и прошлую версию обратно в перевод, затем снова предпросмотр; максимум 3 круга.

---

## 6. Фото

Цепочка в `news-publish`:

1. **Read Orientation** (Code) читает EXIF-ориентацию телефона (6 → 90°, 3 → 180°, 8 → 270°).
2. **Resize** (Edit Image, Multi Step): поворот на этот угол, затем Resize «Only if Larger» до 1600×1600 по большей стороне («Resize the image only if it's larger than the width and height you entered» [N17]), вывод в JPEG [N17]. Instagram принимает только JPEG: «JPEG is the only image format supported.» [M1]
3. **Pack Images** (Code) вырезает из JPEG сегменты APP1 (EXIF и XMP, в них GPS), APP13 (IPTC), комментарии и прочие служебные APP. Остаются только JFIF и цветовой профиль. Затем код ещё раз проходит по файлу и падает, если метаданные остались. Порядок важен: сначала поворот, потом удаление EXIF, иначе фото с телефона лягут боком.

Проверено локально: JPEG с Orientation=6, GPS, XMP, IPTC и комментарием после кода из `news-publish.json` получил поворот 90°, ни одного из этих полей (`exiftool`) и нормально открывается.

Почему Code, а не библиотека: на n8n Cloud «you can't import external npm modules», доступны только `crypto` и `moment` [N18]. Удаление EXIF у Edit Image не описано [N17], поэтому на него не полагаемся.

Риски:

- Edit Image требует GraphicsMagick. В Docker-образе n8n он есть [N17], про Cloud документация молчит. Проверить первой тестовой новостью.
- На Starter 320 MiB памяти [N19]. Фото из Telegram уже сжаты, а вот оригинал 48 Мп из формы может не влезть. Тогда помогут переход на Pro (640 MiB) или просьба присылать фото поменьше. Лимит — 6 фото на новость.
- HEIC с iPhone в форме не принимается (`.jpg,.jpeg,.png`). Обычно iPhone сам отдаёт JPEG, когда сайт просит JPEG, но это стоит проверить на телефоне тренера.

---

## 7. Коммит в GitHub

Одна новость — **один коммит** через Git Data API, HTTP Request с credential GitHub:

```
GET   /repos/Unifight-haifa/unifight/contents/src/content/news   (список папок: занят ли slug → суффикс -2)
GET   /git/ref/heads/main                       → sha последнего коммита
GET   /git/commits/<sha>                        → sha его дерева
POST  /git/blobs   {content: base64, encoding: "base64"}   (на каждое фото)
POST  /git/trees   {base_tree, tree: [3× index.*.md с content, фото с sha блобов]}
POST  /git/commits {message, tree, parents: [sha]}
PATCH /git/refs/heads/main {sha, force: false}
```

Параметры по документации: `encoding` «"utf-8" and "base64" are supported» [G1]; у дерева `base_tree`, `path`, `mode`, `type`, `sha`, `content` [G2]; у ref `force` — «Indicates whether to force the update or to make sure the update is a fast-forward update» [G3]. `force: false` значит, что при одновременном пуше владельца наш PATCH упадёт, а не затрёт его коммит; сработает workflow ошибок, и автор просто отправит новость ещё раз.

Узел GitHub в n8n умеет только «Create, Delete, Edit, Get, List» по одному файлу [N20]. Это 5–9 коммитов на новость и столько же сборок сайта, поэтому используем Git Data API.

Папка и файлы — по [news-format.md](news-format.md). Адрес новости `/<lang>/news/<slug>/`, где slug — имя папки без даты, поэтому slug должен быть уникален среди всех новостей. `List News` читает список папок и, если slug занят, добавляет `-2`, `-3`… Если `author` не совпадает с файлом в `content/coaches/`, сборка падает, поэтому `Check Author` (`GET contents/content/coaches/<id>.json`) отказывает ещё до перевода, а админ получает сообщение.

```
src/content/news/2026-10-17-tournament-results/
  index.he.md  index.ru.md  index.en.md
  cover.jpg    photo-2.jpg  …
```

```yaml
---
title: "…"
summary: "…"            # ≤160
date: 2026-10-17         # дата по Иерусалиму, без кавычек
author: "ilana-kratysh"
cover: "cover.jpg"
cover_alt: "…"
tags: ["judo","haifa"]
draft: false
---
```

В title, summary, body и cover_alt всех языков (и в тегах) `<` и `>` заменяются на `&lt;` и `&gt;`: сначала в `Parse Translation`, ещё раз в `Final Files`. Markdown пропускает HTML на страницу как есть, а сборка отклоняет любой тег в новости (`src/lib/news-check.mjs`), так что один неэкранированный `<` остановил бы все деплои. Если в тексте был `<`, в Facebook и Instagram он придёт как `&lt;`. Это редкость, оставлено как есть.

Значения пишутся через `JSON.stringify`, это валидный YAML: кавычки, двоеточия и иврит экранировать не нужно. Дополнительные фото добавляются в конец текста как `![<заголовок>](photo-2.jpg)`.

**Токен:** fine-grained PAT, владелец ресурса — организация `Unifight-haifa`, «Only select repositories» → `unifight`, Repository permissions → **Contents: Read and write**. Для всех вызовов выше этого достаточно: blobs / trees / commits / refs и contents записаны в разделе «Contents» [G4]. Добавляет ли GitHub Metadata: read-only сам, в документации не сказано; проверить в форме создания. Срок — год, с напоминанием (§11 чек-листа). Если в организации включено одобрение токенов, до одобрения токен «will only be able to read public resources» [G5].

Сообщение коммита: `News: <английский заголовок>` + `Posted by <coach_id> via telegram|email`. Видно, кто опубликовал, хотя коммит идёт от владельца токена.

---

## 8. Ожидание сборки

Пуш в `main` запускает `.github/workflows/deploy.yml` (сборка, тесты, проверка ссылок, деплой), обычно 1–2 минуты. Дальше в `news-publish` цикл:

```
Wait Deploy (45 с) → Get News Json (?t=<время>, чтобы не попасть в кэш) → Check Live
  live    → соцсети
  retry   → снова Wait Deploy
  timeout → после 16 проверок (~12 мин): автору и админу «не появилась на сайте, Facebook и Instagram не тронуты», статус deploy_timeout
```

Пауза меньше 65 с не выгружает исполнение в базу: «the process continues to run» [N21]. Это нормально, проверок немного.

`news.json` — массив `{slug, date, author, url:{he,ru,en}, title, summary, cover}` ([news-format.md](news-format.md)). `Check Live` ищет элемент с `slug` новости. Адреса для соцсетей и WhatsApp берутся из `url`, картинка для Instagram — из `cover`.

---

## 9. Facebook и Instagram

Один credential `Facebook Graph API` с **Page access token**. Он подходит и для страницы, и для Instagram через Facebook Login [M1]. Долгоживущий токен страницы «do not have an expiration date and only expire or are invalidated under certain conditions» [M2]. App Review не нужен, если приложением пользуются только люди с ролью в нём (Standard Access) [M3].

**Facebook** — `FB Post`, узел Facebook Graph API [N22]: `POST /<page-id>/feed` с `message` и `link` [M4]. Ссылка на новость даёт карточку с OG-картинкой сайта (NEWS-03). Текст — заголовок, summary и ссылка на каждом языке из `social_langs` (по умолчанию иврит и русский). Ответ `{"id": "page_post_id"}` [M4] сохраняется в `news_drafts.fb_post_id`.

**Instagram** — нужна публичная картинка: «the media must be hosted on a publicly accessible server at the time of the attempt» [M1].

1. `IG Container`: `POST /<ig-user-id>/media` с `image_url`, `caption`, `alt_text` [M5].
2. `Wait IG` 30 с.
3. `IG Publish`: `POST /<ig-user-id>/media_publish` с `creation_id` [M1].

Картинка — `cover` из `news.json`: абсолютный адрес того же JPEG, что сайт отдаёт как `og:image`. У текущей новости это `image/jpeg` 1200×663 (1,81:1, проверено 2026-10-18). Это внутри допустимых IG «4:5 to 1.91:1», формат JPEG, до 8 MB [M5]. Исходное фото из папки брать нельзя: портрет с телефона 3:4 вне диапазона, и Instagram его отклонит. Если сайт когда-нибудь начнёт отдавать `og:image` в другом соотношении, его надо держать в этом диапазоне. Подпись — до 2200 символов и 30 хэштегов [M5], код обрезает до 2200. Ссылки в подписи Instagram некликабельны, но адрес всё равно ставим.

Оба шага `onError: continue`. Ошибка Instagram не мешает Facebook и наоборот. Итог («Facebook: опубликовано / Instagram: не получилось: …») уходит автору, при проблеме — копия админу, статус `live_partial`.

**WhatsApp**: в группы постить автоматически нельзя (Groups API работает только с группами, созданными через API, до 8 участников [W1]). Автор получает три ссылки `https://wa.me/?text=<заголовок + адрес>` — по одной на язык. По такой ссылке WhatsApp показывает список контактов и групп для отправки [W2]. Summary в ссылку не кладём: превью из OG покажет его само, а с ним три ссылки на кириллице не помещаются в одно сообщение Telegram.

---

## 10. Сбои, уведомления, журнал

- **Ожидаемые сбои** обрабатываются внутри workflow и попадают в общий хвост `Audit → Update Draft → Notify`: лимит, отмена, «не появилась на сайте», частичная публикация в соцсети, «новость не найдена» при снятии. `Notify` отправляет автору в его канал (Telegram или почта), а при `notify_admin` — копию в чат админа.
- **Неожиданные сбои** (GitHub 401/422, перевод вернул не JSON, нет GraphicsMagick и т. п.) ловит `news-error`. Во всех четырёх workflow в настройках указывается Error workflow [N23], и админ получает в Telegram workflow, шаг, текст ошибки и ссылку на исполнение. Запуски error workflow квоту не тратят [N8].
- Повторы: `Translate` до 3 попыток с паузой 5 с, `Create Blob` до 3 попыток.
- **Журнал** `audit_log`: каждая отказанная попытка, лимит, отмена, коммит, итог публикации, снятие — с `execution_id`, по нему открывается исполнение в n8n. История на Starter хранится 7 дней [N13]; журнал в таблице живёт дольше, а `news_drafts` хранит статус каждой новости.

---

## 11. Лимиты

| что | лимит | у нас |
|---|---|---|
| новостей на автора в день | `max_posts_per_day: 5` в `Config` | `Rate Check` по `publishers.posts_day/posts_count` |
| правок на новость | `max_revisions: 3` | дальше отмена |
| фото на новость | 6 | бот и форма не примут больше |
| Instagram | «100 API-published posts within a 24-hour moving period» [M1] | недостижимо |
| Telegram | «avoid sending more than one message per second» в одном чате [T3] | предпросмотр — 4 сообщения подряд, в рамках |
| Telegram, загрузка файла ботом | 20 MB [T1] | фото меньше; видео не берём |
| n8n Starter | 2 500 исполнений в месяц, 5 одновременных [N13] | ~6–10 исполнений на новость из Telegram (каждое сообщение боту — исполнение), 1 из формы; под-workflow не считаются [N8] |
| GitHub Pages | сборка ~1–2 мин | `deploy_checks: 16` × 45 с |

Не выяснено, занимает ли исполнение, которое ждёт ответа автора, один из 5 одновременных слотов Starter. При нескольких висящих предпросмотрах это может стать узким местом (открытый вопрос).

---

## 12. Снятие новости (admin)

Два входа, дальше общий путь `Normalize`:

- в Telegram: `/unpublish tournament-results` (slug, папка или полный адрес новости), затем подтверждение кнопками «Удалить / Отмена» (Approval, две кнопки [N6]);
- форма «Снять новость» (n8n User Auth, только `role = admin`, обязательная галочка подтверждения).

Шаги: `List News` + `Resolve` находят папку по slug, имени папки или адресу → `GET contents` папки → дерево, где у каждого файла `sha: null` («If the value is null then the file will be deleted» [G2]) → коммит `News: unpublish <папка>` → `PATCH ref`. Сайт обновится сам. Затем, если в `news_drafts` есть `fb_post_id`: `DELETE /<page_post_id>`, успех — `{"success": true}` [M4].

Instagram: удаление через API в документации публикации не описано [M1], поэтому пост в Instagram админ удаляет руками. Бот напомнит и пришлёт id. WhatsApp-сообщения отозвать нельзя.

---

## 13. YouTube (следующий этап, отдельный workflow)

Пока не сделано, и бот честно отвечает «загрузите вручную». Когда понадобится, будет отдельный `news-youtube`: форма с файлом видео (n8n User Auth) → узел YouTube «Upload a video» [N24] → ссылка в новость. Что надо учесть заранее (из исследования, §2.3 CMS-AND-DISTRIBUTION):

- OAuth-экран Google нужно перевести в production. В режиме Testing токены живут 7 дней [N25].
- 100 загрузок в день на проект.
- Первую загрузку делать `unlisted`, чтобы проверить, не блокирует ли Google неаудированный проект на private.
- Аудиторию «для детей» ставить в YouTube Studio.

---

## 14. Стоимость

| статья | оценка |
|---|---|
| n8n Cloud **Starter** | 20 € в месяц при оплате за год: 2 500 исполнений, 5 одновременных, история 7 дней [N13]. Pro (50 €/мес) нужен, только если не хватит памяти на фото (§6) или понадобятся роли admin в n8n |
| Перевод (Sonnet 5.5, $2 / $10 за миллион токенов [L1]) | промпт ~0,8 тыс. токенов + текст ~1–2 тыс. на входе, ~3–4 тыс. на выходе (три языка) ≈ **$0,04–0,06 за круг**. С двумя правками ≈ $0,15. Модель может думать перед ответом, это добавит выходных токенов, закладываем ×2: **до $0,3 за новость, $2–6 в месяц при 20 новостях** |
| Meta, Telegram, GitHub | бесплатно |
| Почта (SMTP) | бесплатно с почтой клуба (Gmail — пароль приложения) |

---

## 15. Что проверить при первом запуске

Все поля `_note` в JSON. Главное:

1. Импорт: типы и версии узлов (Data Table, Anthropic, Form Trigger 2.2) могут отличаться от текущих в Cloud. После импорта заново выбрать таблицы, credentials и под-workflow в узлах `Start Publish` / `Start Unpublish`.
2. Путь email пользователя в выводе формы (`$json.user.email`?) и ключи файлов (`cover`, `photos_0`…).
3. Поля формы ответа в Send and Wait (`Решение`, `Правки`) — по выводу первого ответа.
4. Передаются ли бинарные данные в под-workflow при `waitForSubWorkflow: false`.
5. `$('Parse Translation').last()` в цикле правок указывает на последний прогон.
6. Есть ли GraphicsMagick на Cloud (узел Resize).
7. Facebook Graph API: структура `queryParameters` и наличие v25.0 в списке версий (последняя у Meta — v26.0 [M6]).
8. Instagram принимает `cover` из `news.json` (первый реальный пост).

---

## Источники

Проверено 2026-10-17.

**n8n**
- [N1] n8n Form Trigger (Authentication, n8n User Auth, Require Workflow Execute Permission, Include User in Output). https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger/
- [N2] n8n Form node (Form Ending, JSON fields, «You must start the workflow with the n8n Form Trigger node»). https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.form/
- [N6] Telegram node, Message operations (Send and Wait for Response, Approval, Custom Form, Limit Wait Time, 4096 chars). https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/message-operations/
- [N7] Send Email node (Send and Wait for Response, Custom Form, SMTP credential). https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/
- [N8] Understand executions (quota: production only; sub-workflow parent only; error workflows don't count). https://docs.n8n.io/build/understand-workflows/understand-executions
- [N9] Data tables (200 MiB). https://docs.n8n.io/data/data-tables/
- [N10] Data Table node (row operations). https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable/
- [N11] Telegram Trigger (Events, Restrict to User IDs, Download Images/Files). https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/
- [N12] Telegram Trigger common issues (single webhook). https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/common-issues/
- [N13] n8n pricing (Starter 20 €/mo annual, 2.5K executions, 5 concurrent, 7-day logs, unlimited users). https://n8n.io/pricing/
- [N14] Two-factor authentication. https://docs.n8n.io/user-management/two-factor-auth/
- [N15] Understand instance roles (Owner/Admin/Member). https://docs.n8n.io/administer/manage-users-and-access/understand-instance-roles
- [N16] Anthropic node (Message a Model). https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-langchain.anthropic/
- [N17] Edit Image node (Multi Step, Resize «Only if Larger», formats, GraphicsMagick). https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.editimage/
- [N18] Code node (no external npm modules on Cloud; crypto, moment). https://docs.n8n.io/code/code-node/ ; getBinaryDataBuffer: https://docs.n8n.io/code/cookbook/code-node/get-binary-data-buffer/
- [N19] Cloud data management (Starter 320 MiB RAM). https://docs.n8n.io/manage-cloud/cloud-data-management/
- [N20] GitHub node (File: Create, Delete, Edit, Get, List). https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.github/
- [N21] Wait node (<65 s stays in memory). https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/
- [N22] Facebook Graph API node. https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.facebookgraphapi/
- [N23] Error handling (Error Trigger, Error workflow setting). https://docs.n8n.io/flow-logic/error-handling/
- [N24] YouTube node. https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.youtube/
- [N25] Google OAuth2 single service (7-day tokens in testing). https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/
- Execute Sub-workflow Trigger (Accept all data). https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger/
- Export / import (credential names and IDs in JSON). https://docs.n8n.io/workflows/export-import/

**Telegram**
- [T1] Bot API (File: 20 MB download; User id). https://core.telegram.org/bots/api
- [T2] Bot features (BotFather /newbot, /setprivacy, /setjoingroups, /token). https://core.telegram.org/bots/features
- [T3] Bots FAQ (1 msg/s per chat, 30 msg/s overall). https://core.telegram.org/bots/faq

**GitHub**
- [G1] Git blobs. https://docs.github.com/en/rest/git/blobs
- [G2] Git trees. https://docs.github.com/en/rest/git/trees
- [G3] Git refs; commits: https://docs.github.com/en/rest/git/refs , https://docs.github.com/en/rest/git/commits
- [G4] Permissions required for fine-grained PATs (Contents). https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
- [G5] Managing personal access tokens. https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

**Meta**
- [M1] Instagram Content Publishing. https://developers.facebook.com/docs/instagram-platform/content-publishing
- [M2] Long-lived access tokens. https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
- [M3] Access levels (Standard Access for app-role users). https://developers.facebook.com/docs/graph-api/overview/access-levels
- [M4] Pages API, Posts (feed, delete, permissions). https://developers.facebook.com/docs/pages-api/posts
- [M5] IG User Media reference (image_url, caption 2200/30, alt_text, JPEG, 8 MB, 4:5–1.91:1). https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- [M6] Graph API changelog (v26.0, July 29 2026). https://developers.facebook.com/docs/graph-api/changelog

**WhatsApp**
- [W1] Groups API. https://developers.facebook.com/docs/whatsapp/cloud-api/groups
- [W2] Click to chat. https://faq.whatsapp.com/5913398998672934

**Модели**
- [L1] Pricing. https://platform.claude.com/docs/en/about-claude/pricing
- [L2] Models overview (`claude-sonnet-5-5`). https://platform.claude.com/docs/en/about-claude/models/overview
