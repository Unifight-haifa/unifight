# Updating the landing page

Text, coaches, schedule and venues live in `content/`:

- `content/site.json`: shared page copy in he/ru/en (hero, kids, achievements, history, contacts…); owner only
- `content/coaches/<id>.json`: one file per coach. `group` is `main` | `lead` | `club` | `young`, `order` sorts the page
- `content/coaches/_section.json`: the coaches section's title, intro, team photo and roster group titles
- `content/schedule/<id>.json`: a coach's groups (day 0 = Sunday; grades `[from, to]`, `to: null` = "and up", `0` = kindergarten). Only `natanel-zhurovel.json` is on the page so far
- `content/venues.json`: training venues and addresses, shared by all schedules

Images go in `public/` (strip GPS first: `exiftool -all= photo.jpg`).

After editing:

```sh
npm run gen     # needs python3 + Pillow; rewrites src/generated/* and src/styles/landing.css
npm run build && npm test
```

Commit the regenerated files together with the content change. Never hand-edit `src/generated/`.
