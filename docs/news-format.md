# News post format

News is published by the n8n workflow committing files to `main`; nobody edits posts by hand. One post is one folder:

```
src/content/news/
  2026-10-17-new-website/
    index.he.md
    index.ru.md
    index.en.md
    cover.jpg          # any jpg/png/webp, referenced from frontmatter
    photo-2.jpg        # optional, used from the body as ![alt](photo-2.jpg)
```

- Folder name: `YYYY-MM-DD-slug`, slug is `a-z0-9` and dashes, unique across all posts. The URL is `/<lang>/news/<slug>/`.
- All three language files and the cover are required. If any is missing the build fails and nothing is deployed.

Frontmatter (same keys in every language):

```yaml
---
title: Our new website is live      # required
summary: One or two sentences.      # required, max 160 chars, used as og:description
date: 2026-10-17                    # required, ISO date
author: ilana-kratysh               # required, a file name in content/coaches/ without .json
cover: cover.jpg                    # required, file in the same folder
cover_alt: What the photo shows     # optional
video: LVJtDS4MCVM                  # optional; a YouTube id from content/videos.json, shown under the cover
tags: [tournament]                  # optional
draft: false                        # optional; true keeps the post out of the build
---
Markdown body.
```

`date`, `author` and `cover` are read from `index.he.md` for the listing and the feed; keep them identical across languages.

## Confirming a post is live

After the Pages deploy, `<base>/news.json` lists every published post, newest first:

```json
[{ "slug": "new-website", "date": "2026-10-17", "author": "ilana-kratysh",
   "url": { "he": "https://…/he/news/new-website/", "ru": "…", "en": "…" },
   "title": { "he": "…", "ru": "…", "en": "…" },
   "summary": { "he": "…", "ru": "…", "en": "…" },
   "cover": "https://…/_astro/cover.….jpeg" }]
```

Poll it until the slug appears, then share the `url`. The `cover` URL is the same JPEG the page uses as `og:image`. Per-language RSS lives at `/<lang>/rss.xml` (the older `/<lang>/news/rss.xml` serves the same feed), and `<base>/feed.json` is a JSON Feed 1.1 with one item per post and language: the 1200×630 cover, the author coach id and the WhatsApp share text in `_unifight`.

Drafts are never built. In `npm run dev` they show only with `SHOW_DRAFTS=1`.

## Ready-to-paste social text

Post pages only carry the share row (WhatsApp, Facebook, Telegram, copy link; the system share sheet on phones). The owner rejected the public "Copy for Instagram / YouTube / WhatsApp" block on 2026-10-29, so the ready-to-paste text is only in `feed.json` (`_unifight.share_text`, the WhatsApp variant). It is the title, the body as plain text and the hashtags; WhatsApp and YouTube get the post URL, Instagram gets a "link in bio" line and is trimmed to 2200 characters. Hashtags and that line are in `content/social.json`, the builder is `src/lib/social.mjs`.

## Schedule changes and gallery photos from the bot

Those contracts, and the `schedule-changes.json` / `gallery.json` endpoints to poll, are in [bot-content-contracts.md](bot-content-contracts.md). The latest posts (and active schedule changes) also run in the news rail on every page: a side strip on wide screens, a "News" pill on phones (`src/components/NewsRail.astro`).
