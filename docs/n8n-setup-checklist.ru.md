# Что завести для автоматической публикации новостей

Порядок важен: каждый шаг даёт ключ или id для следующих. Ключи и токены храните только в credentials n8n, не в чатах и не в документах. Подробности устройства — в [n8n-news-design.md](n8n-news-design.md).

Отмечайте галочками.

## 1. n8n Cloud

- [ ] Зарегистрироваться на https://n8n.io (пробный период без карты [1]). Имя инстанса — например `unifight`.
- [ ] Выбрать тариф **Starter**, 20 € в месяц при оплате за год (2 500 исполнений в месяц, 5 одновременных). Нам хватает с большим запасом [1].
- [ ] Включить себе двухфакторную защиту: Settings → Personal → Two-factor authentication [2].
- [ ] Data tables: создать четыре таблицы со столбцами из §2 проекта: `publishers`, `tg_collect`, `news_drafts`, `audit_log` [3].

## 2. Telegram-бот

- [ ] В Telegram открыть **@BotFather**, отправить `/newbot` [4].
  - Имя: `Unifight Haifa — новости`
  - Username: например `unifight_haifa_news_bot` (должен кончаться на `bot` [4], потом не меняется)
- [ ] Скопировать токен. Он даёт полный контроль над ботом: «Keep your token secure and store it safely» [4]. Если токен утёк, `/token` в BotFather выдаёт новый.
- [ ] `/setjoingroups` → **Disable**: бот работает только в личке.
- [ ] `/setprivacy` → **Enable** (по умолчанию так и есть [4]): даже если бота добавят в группу, обычных сообщений он не увидит.
- [ ] `/setdescription`: «Бот для тренеров Unifight: публикация новостей на сайте».
- [ ] В n8n: Credentials → New → **Telegram API**, вставить токен в Access Token [5]. Назвать `Unifight News Bot`.
- [ ] Для тестов лучше сразу завести второго бота (`unifight_haifa_news_test_bot`): у бота один вебхук, тест в редакторе перехватывает рабочего [6].

## 3. Токен GitHub

Нужен владелец организации `Unifight-haifa`.

- [ ] GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token [7].
  - Token name: `n8n news`
  - Resource owner: **Unifight-haifa**
  - Expiration: **1 год** (GitHub допускает от 1 до 366 дней или без срока [7]; бессрочный не берём). Поставить напоминание за неделю до срока
  - Repository access: **Only select repositories** → `unifight`
  - Repository permissions → **Contents: Read and write**. Больше ничего не включать, кроме **Metadata: Read-only**, если GitHub предложит его отдельно (в документации это не описано, проверить в форме).
- [ ] Если в организации включено одобрение токенов, одобрить запрос: до этого токен читает только публичное [7].
- [ ] В n8n: Credentials → **GitHub API** → Access Token. Назвать `GitHub unifight contents`.

## 4. Facebook-страница и Instagram

Нужен человек с полным доступом к странице клуба в Facebook.

- [ ] Instagram клуба перевести в **профессиональный** аккаунт (Business) и связать со страницей Facebook (Instagram → Настройки → Тип аккаунта; затем Meta Business Suite → Настройки → Instagram) [8].
- [ ] https://developers.facebook.com → My Apps → **Create App**, тип Business. Имя `Unifight News`. Разработчиком/админом приложения добавить только себя. Тогда App Review не нужен (Standard Access) [9].
- [ ] Добавить продукты **Facebook Login for Business** и **Instagram** (API с Facebook Login).
- [ ] В Graph API Explorer выбрать приложение и выдать User token с правами: `pages_show_list` (нужно для списка страниц; в документации публикации не упомянуто, проверить), `pages_read_engagement`, `pages_read_user_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `instagram_basic`, `instagram_content_publish` [10][8]. Если страница в Business Manager, добавить `ads_management`, `ads_read` [8].
- [ ] Обменять его на долгоживущий: `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=<app id>&client_secret=<app secret>&fb_exchange_token=<token>` [11].
- [ ] С долгоживущим User token запросить `GET /me/accounts` и взять `access_token` страницы клуба. У этого Page token нет срока действия [11].
- [ ] Записать: **Page ID** (там же, в `/me/accounts`) и **Instagram user id**: `GET /<page-id>?fields=instagram_business_account`.
- [ ] Если Facebook требует для страницы Page Publishing Authorization, пройти её, иначе Instagram не опубликует [8].
- [ ] В n8n: Credentials → **Facebook Graph API** → Access Token = Page token. Назвать `Facebook Page Unifight`.

## 5. Ключ для переводов

- [ ] https://platform.claude.com → создать организацию клуба, пополнить баланс на $10 (хватит надолго, см. §14 проекта) и задать месячный лимит расходов, например $10.
- [ ] API Keys → Create Key `n8n-unifight`.
- [ ] В n8n: Credentials → **Anthropic** → API Key. Назвать `Anthropic club key`.

## 6. Почта для формы

Предпросмотр для авторов без Telegram приходит на почту.

- [ ] Ящик клуба для отправки, например `news@…` или Gmail клуба.
- [ ] Для Gmail: включить двухэтапную проверку и создать **пароль приложения**. SMTP: `smtp.gmail.com`, порт 465, SSL.
- [ ] В n8n: Credentials → **SMTP** [12]. Назвать `Club SMTP`. В узлах `Notify Email` и `Ask Email` заменить `REPLACE_news@club-domain` на этот адрес.

## 7. Импорт workflow

- [ ] В n8n: Workflow menu → **Import from File** [13] по очереди: `news-error.json`, `news-publish.json`, `news-unpublish.json`, `news-telegram-intake.json`, `news-form-intake.json` (из папки `n8n/` репозитория).
- [ ] В каждом узле с credentials выбрать созданный credential (в JSON только названия-заглушки).
- [ ] В узлах Data Table выбрать нужную таблицу.
- [ ] В `Start Publish` / `Start Unpublish` выбрать workflow `news-publish` / `news-unpublish`.
- [ ] В узле `Config` (news-publish) вписать `fb_page_id`, `ig_user_id`. В `Notify Admin` и `Alert Admin` вписать Telegram id админа вместо `REPLACE_ADMIN_CHAT_ID`.
- [ ] В настройках каждого workflow: **Error workflow → news-error** [14].
- [ ] Включить (Active) `news-telegram-intake`, `news-form-intake`, `news-unpublish`.
- [ ] Пройти список «Что проверить при первом запуске» (§15 проекта), первую новость отправить себе тестовой.

## 8. Telegram id авторов

Проще всего через самого бота:

1. Автор находит бота по username, нажимает **Start** и пишет что угодно.
2. Бот отвечает: «Нет доступа… Ваш Telegram ID: 123456789». Это число автор пересылает админу.
3. Админ вписывает его в `publishers.telegram_id`, ставит `active = true`. Со следующего сообщения бот принимает новости.

## 9. Авторы без Telegram

1. Settings → Users → **Invite**: email автора, роль **Member**.
2. Автор принимает приглашение, задаёт свой пароль и включает 2FA.
3. Админ вписывает **тот же email в нижнем регистре** в `publishers.email`.
4. Автору отправить ссылку на форму (Production URL узла `News Form`).

## 10. Список авторов

Заполнить и перенести в таблицу `publishers`. `coach_id` — имя файла в `content/coaches/` без `.json`; другой id сборка не примет. Ниже все тренеры с сайта на 2026-10-18; оставьте только тех, кто будет публиковать.

| coach_id | имя | telegram_id | email (n8n) | роль | язык |
|---|---|---|---|---|---|
| | (владелец; его coach_id, если он тренер) | | | admin | |
| alex-kagan | Алекс Каган | | | publisher | |
| alexander-kratysh | Александр Кратыш | | | publisher | |
| anton-kruglyak | Антон Кругляк | | | publisher | |
| denis-spartak | Денис Спартак | | | publisher | |
| gal-kloda | Галь Клода | | | publisher | |
| igor-bitulyaev | Игорь Битуляев | | | publisher | |
| ilana-kratysh | Илана Кратыш | | | publisher | |
| irina-legkaya | Ирина Лёгкая | | | publisher | |
| maxim-gushin | Максим Гушин | | | publisher | |
| michael-goren | Михаэль Горэн | | | publisher | |
| michael-volovik | Майкл Воловик | | | publisher | |
| natanel-zhurovel | Натанель Журовель | | | publisher | |
| ori-keshet-halevi | Ори Кешет-Галеви | | | publisher | |
| pavel-arshansky | Павел Аршанский | | | publisher | |
| sergey-potomaka | Сергей Потомака | | | publisher | |
| tommy-artem-arshansky | Томи Аршански | | | publisher | |
| vadim-gushin | Вадим Гушин | | | publisher | |

Нужен хотя бы один admin с Telegram: ему приходят сообщения о сбоях.

## 11. Сроки, которые надо помнить

- GitHub-токен: истекает через год. Выпустить новый и заменить в credential.
- Page token Facebook бессрочный, но может стать недействительным «under certain conditions» [11]. Если Facebook начнёт отвечать ошибкой токена, повторить последние шаги раздела 4.

---

[1] https://n8n.io/pricing/ · [2] https://docs.n8n.io/user-management/two-factor-auth/ · [3] https://docs.n8n.io/data/data-tables/ · [4] https://core.telegram.org/bots/features · [5] https://docs.n8n.io/integrations/builtin/credentials/telegram/ · [6] https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/common-issues/ · [7] https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens · [8] https://developers.facebook.com/docs/instagram-platform/content-publishing · [9] https://developers.facebook.com/docs/graph-api/overview/access-levels · [10] https://developers.facebook.com/docs/pages-api/posts · [11] https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived · [12] https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/ · [13] https://docs.n8n.io/workflows/export-import/ · [14] https://docs.n8n.io/flow-logic/error-handling/
