# Updating the landing page

Text, coaches, schedule and venues live in `content/`:

- `content/site.json`: shared page copy in he/ru/en (hero, kids, achievements, history, contacts…); owner only
- `content/coaches/<id>.json`: one file per coach. `group` is `main` | `lead` | `club` | `young`, `order` sorts the page
- `content/coaches/_section.json`: the coaches section's title, intro, team photo and roster group titles
- `content/schedule/<id>.json`: a coach's groups (day 0 = Sunday; grades `[from, to]`, `to: null` = "and up", `0` = kindergarten). Only `natanel-zhurovel.json` is on the page so far
- `content/venues.json`: training venues and addresses, shared by all schedules
- `content/videos.json`: the /video/ page. One entry per YouTube upload: `id` (11 chars from the youtu.be link), `kind` `video` | `short`, `date` (YYYY-MM-DD), `playlist` `promo` | `coaches` | `competitions` | `camps` | `training` | `events`, `title` and `description` in he/ru/en, optional `duration` in seconds, and `thumb`, a JPEG in `public/videos/` (1280 px wide at most, under 200 KB). The build checks every field
- `content/gallery.json`: the /gallery/ page. One entry per album: `id`, `title` in he/ru/en, optional `description`, and `photos`. Each photo has `file` (`<album>/<name>.jpg` under `src/assets/gallery/`), `alt` in he/ru/en, optional `caption` in he/ru/en, `year` and `featured` (the first featured photo 1200 px or wider is the share image). Never name a minor in alt or caption, and blur name patches on judogi backs. Re-encode with Pillow (`Image.open(p).convert('RGB').save(out, quality=82)`), which also drops EXIF; `exiftool -all=` breaks Astro's image probe on these files

Videos on the landing play in the same click-to-load YouTube player as the /video/ page, so every id used there must also be listed in `content/videos.json` (its title is the player's title):

- Coach video: add `"youtube": "<id>"` to the coach's file in `content/coaches/`. The card then gets a "Video profile" button.
- Club film: `film.video` in `content/site.json` is the full film behind "Watch the film". The silent loop next to it is `public/videos/club-teaser.{webm,mp4,jpg}`, cut from the 16:9 master with `sh scripts/landing/teaser.sh <master.mp4>` (needs ffmpeg with SVT-AV1). Pick new shots by editing the list at the top of the script; keep each file under 1.5 MB and the loop short (it is ~13 s, about 1 MB).

Images go in `public/` (strip GPS first: `exiftool -all= photo.jpg`). `npm test` fails on any file over 1.5 MB under `public/` or `src/assets/`, and on any JPEG/PNG there that still has GPS.

After editing:

```sh
npm run gen     # needs python3 + Pillow; rewrites src/generated/* and src/styles/landing.css
npm run build && npm test
```

Commit the regenerated files together with the content change. Never hand-edit `src/generated/`.

Share previews (`public/og/<lang>.jpg`) use the club name and hero headline. Re-render them after changing either: `python3 scripts/landing/og.py` (needs Pillow with libraqm, and downloads Rubik on the first run).

Kanji are drawn as SVG, not set in a font. Every kanji word needs its meaning in `content/kanji.json` (the build fails otherwise); after adding one run `python3 scripts/landing/kanji.py` (needs fontTools, and downloads Shippori Mincho B1 and Yuji Boku on the first run) and commit `src/generated/kanji-*`. Text fonts are self-hosted through Astro (`fonts` in `astro.config.mjs`); colours and base type for every page are in `src/styles/tokens.css`.
