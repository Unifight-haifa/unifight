# Updating the landing page

Text, coaches, schedule and venues live in `content/`:

- `content/content.json`: all page copy in he/ru/en, coaches, achievements, history, contacts
- `content/schedule-natanel.json`: Natanel's 2026/27 groups (day 0 = Sunday; grades `[from, to]`, `to: null` = "and up", `0` = kindergarten)

Images go in `public/` (strip GPS first: `exiftool -all= photo.jpg`).

After editing:

```sh
npm run gen     # needs python3 + Pillow; rewrites src/generated/* and src/styles/landing.css
npm run build && npm test
```

Commit the regenerated files together with the content change. Never hand-edit `src/generated/`.
