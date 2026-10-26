# Bot content contracts

What the n8n workflows commit (schedule changes to `main` here, photos to a private staging repo), and the JSON they poll afterwards to confirm it is live. News posts are in [news-format.md](news-format.md). `<base>` below is `https://unifight-haifa.com/`.

## Schedule changes

One-off changes to a regular schedule: a cancelled or moved class, an extra class, or a note. The site shows them only while they matter and goes back to the normal schedule by itself.

One file per change, `content/schedule-changes/<id>.json`:

```json
{
  "id": "2026-11-03-natanel-cancel",
  "schedule": "natanel-zhurovel",
  "type": "cancel",
  "from": "2026-11-03",
  "to": "2026-11-03",
  "session": { "day": 2, "start": "17:30" },
  "new": { "date": "2026-11-05", "start": "17:30", "end": "18:30", "venue": "ironi-alef" },
  "note": { "he": "…", "ru": "…", "en": "…" },
  "author": "natanel-zhurovel",
  "created": "2026-10-30T09:12:00+02:00"
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | `a-z0-9` and dashes, equal to the file name without `.json` |
| `schedule` | yes | a file name in `content/schedule/` without `.json` |
| `type` | yes | `cancel`, `move`, `extra` or `note` |
| `from`, `to` | yes | `YYYY-MM-DD`, inclusive, Israel dates; `to` ≥ `from` |
| `session` | `cancel`, `move`; optional for `extra` | the regular class: `day` (0 = Sunday … 5 = Friday) and `start` (`HH:MM`) as in the schedule file. `group` is optional and only needed if two classes share a day and start time; it matches the class `kind` (`regular`, `nivheret`, …) or its `audience` (`girls`, `boys`). For `extra` it only lends its grades to the new card |
| `new` | `move`, `extra` | `date` (not a Saturday), `start`, `end`, `venue` (a key of `content/venues.json`). For `move`, missing `start`/`end`/`venue` default to the original class |
| `note` | yes | he/ru/en text shown next to the change |
| `author` | yes | publisher id |
| `created` | yes | ISO timestamp |

`cancel` and `move` need at least one date in `from`…`to` that falls on `session.day`. Any problem (unknown schedule, venue or class, `to` before `from`, a missing language) fails the build with the file name and the reason, and nothing deploys.

What visitors see:

- The landing schedule gets a "Schedule changes" box above the days. A cancelled class is struck through with a red badge and the note; a moved class is struck through with "Moved → date time" and appears highlighted on its new weekday; an extra class appears highlighted on its weekday. Moved and extra cards follow the grade and venue filters.
- The news rail (side strip on desktop, "News" pill on mobile) lists the change, highlighted, linking to `<lang>/#chg-<id>`.
- Window: from `from` to `to` inclusive; `cancel` and `move` show 3 days earlier as an announcement. Each element carries `data-from` (start of that window) and `data-to`; a small script hides or shows them by the current Israel date, so the page reverts even without a rebuild. The build drops changes whose `to` has passed, and `deploy.yml` rebuilds daily at 22:15 UTC so the HTML follows. Old files can stay in the folder or be deleted; either is fine.

Confirming: `<base>schedule-changes.json` lists every change whose `to` has not passed, as committed plus `show_from`, a one-line `summary` (Hebrew wraps times in U+2066/U+2069 isolates so they keep their order) and the `url` per language. Poll until your `id` appears.

```json
[{ "id": "2026-11-03-natanel-cancel", "type": "cancel", "from": "2026-11-03", "to": "2026-11-03", "show_from": "2026-10-31",
   "summary": { "he": "…", "ru": "Отменено: вт, 3 нояб., 17:30 · Ирони Алеф", "en": "Cancelled: Tue 3 Nov, 17:30 · Ironi Alef" },
   "url": { "he": "https://…/he/#chg-2026-11-03-natanel-cancel", "ru": "…", "en": "…" }, "…": "the rest of the file" }]
```

To withdraw a change, delete its file (or set `to` to yesterday).

## Gallery photos

Original photos never go into this repository: it is public, and its history keeps everything ever committed, EXIF and GPS included. The bot commits them to a **private staging repo** instead (default `Unifight-haifa/media-inbox`, overridable with the repo variable `MEDIA_INBOX_REPO`):

```
incoming/gallery/<album-id>/<file>          e.g. incoming/gallery/training/IMG_2041.HEIC
incoming/gallery/<album-id>/<file>.json     e.g. incoming/gallery/training/IMG_2041.HEIC.json
```

`<file>` is a JPEG, PNG or HEIC, up to ~20 MB. The sidecar:

```json
{
  "album": "training",
  "alt": { "he": "…", "ru": "…", "en": "…" },
  "caption": { "he": "…", "ru": "…", "en": "…" },
  "album_title": { "he": "…", "ru": "…", "en": "…" },
  "author": "natanel-zhurovel",
  "approved_by": "ilana-kratysh"
}
```

- `album` must equal the folder name. `alt`, `author`, `approved_by` are required; `caption` is optional.
- `album_title` is only needed for a new album (the id comes from the folder name: `a-z0-9` and dashes, starting with a letter). An unknown album without it fails the run.
- A photo without its sidecar (or the reverse) is skipped and waits for the next run, so commit the photo first and the sidecar last.
- Never name a minor in `alt` or `caption`.

Then start the intake on this repo (a token with contents write on it, as for news):

```
POST https://api.github.com/repos/Unifight-haifa/unifight/dispatches
{ "event_type": "gallery-intake", "client_payload": { "path": "incoming/gallery/training/IMG_2041.HEIC" } }
```

`path` is informational; each run processes every complete pair waiting in staging. The workflow can also be started by hand (Actions → Gallery intake → Run workflow).

`.github/workflows/gallery-intake.yml` checks out the staging repo with the `MEDIA_INBOX_TOKEN` secret (fine-grained, contents read/write on the staging repo only) and runs `scripts/gallery_intake.py`, which:

- rotates the photo upright, scales it to 1600 px on the long edge and re-encodes a progressive JPEG under 500 KB (the site-wide limit is 1.5 MB) as a fresh image, so the published copy has no EXIF, GPS, XMP, ICC or camera/author tags;
- writes `src/assets/gallery/<album>/<slug>.jpg` and appends the photo to `content/gallery.json` with `"source": "<original file name without extension>"` and the EXIF year if there was one;
- fails the whole run before writing anything if any sidecar is bad.

The workflow then checks `gallery.json` the way the build does, commits only the cleaned JPEG and `gallery.json` here as `github-actions[bot]` (signed off, author and approver in the message), deletes the originals from staging in a second commit there, and starts the Pages deploy. Deleting from staging removes the files from its working tree only: the originals stay in the private repo's history until that history is rewritten or the repo is recreated.

Confirming: `<base>gallery.json` lists every gallery photo:

```json
[{ "album": "training", "file": "training/img-2041.jpg", "source": "IMG_2041" }]
```

Poll until an entry's `source` equals your file's name without extension. Photos added by hand have `"source": null`.
