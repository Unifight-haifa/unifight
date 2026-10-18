# Updating the landing page

Text, coaches, schedule and venues live in `content/`:

- `content/site.json`: shared page copy in he/ru/en (hero, kids, achievements, history, contacts…); owner only
- `content/coaches/<id>.json`: one file per coach. `group` is `main` | `lead` | `club` | `young`, `order` sorts the page
- `content/coaches/_section.json`: the coaches section's title, intro, team photo and roster group titles
- `content/schedule/<id>.json`: a coach's groups (day 0 = Sunday; grades `[from, to]`, `to: null` = "and up", `0` = kindergarten). Only `natanel-zhurovel.json` is on the page so far
- `content/venues.json`: training venues and addresses, shared by all schedules
- `content/videos.json`: the /video/ page. One entry per YouTube upload: `id` (11 chars from the youtu.be link), `kind` `video` | `short`, `date` (YYYY-MM-DD), `playlist` `promo` | `competitions` | `camps` | `training` | `events`, `title` and `description` in he/ru/en, optional `duration` in seconds, and `thumb`, a JPEG in `public/videos/` (1280 px wide at most, under 200 KB). The build checks every field
- `content/gallery.json`: the /gallery/ page. One entry per album: `id`, `title` in he/ru/en, optional `description`, and `photos`. Each photo has `file` (`<album>/<name>.jpg` under `src/assets/gallery/`), `alt` in he/ru/en, optional `caption` in he/ru/en, `year` and `featured` (the first featured photo 1200 px or wider is the share image). Never name a minor in alt or caption, and blur name patches on judogi backs. Re-encode with Pillow (`Image.open(p).convert('RGB').save(out, quality=82)`), which also drops EXIF; `exiftool -all=` breaks Astro's image probe on these files

Images go in `public/` (strip GPS first: `exiftool -all= photo.jpg`). `npm test` fails on any file over 1.5 MB under `public/` or `src/assets/`, and on any JPEG/PNG there that still has GPS.

After editing:

```sh
npm run gen     # needs python3 + Pillow; rewrites src/generated/* and src/styles/landing.css
npm run build && npm test
```

Commit the regenerated files together with the content change. Never hand-edit `src/generated/`.

Share previews (`public/og/<lang>.jpg`) use the club name and hero headline. Re-render them after changing either: `python3 scripts/landing/og.py` (needs Pillow with libraqm, and downloads Rubik on the first run).
