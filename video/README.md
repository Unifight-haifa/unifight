# Coach profile videos

Short promo profiles of the club's coaches, built with [Remotion](https://www.remotion.dev).
This folder has its own `package.json`; the site doesn't depend on it.

## Render

```sh
cd video
npm ci
scripts/render.sh <coach> <lang> <format> <out.mp4>
```

- `coach`: `ilana` or `natanel` (see `src/data.js`)
- `lang`: `ru`, `he` (RTL) or `en`
- `format`: `16x9` (1920×1080, YouTube) or `9x16` (1080×1920, Shorts/Reels)

Example: `scripts/render.sh natanel ru 9x16 out/natanel-ru-9x16.mp4`.
Output is H.264 high, yuv420p, 30 fps, AAC 192k. Extra flags go straight to `remotion render`.

`npm run studio` opens the Remotion editor; pick `CoachProfile` and set the props there.

To check a render, `scripts/stills.sh <video.mp4> <prefix>` drops a frame every 3 s into `checks/`.

## Content

- Names and roles come from `content/coaches/*.json`. The on-screen credentials in `src/data.js`
  restate facts from the same files; keep them in sync when a bio changes.
- A coach's video talks only about that coach. Opponents' names on judogi backs are blurred in prep.
- Adding a coach: add photos to `scripts/prep_photos.py`, then an entry in `COACHES` with
  3 cold-open frames, a hero shot, 3–4 beats and a "today" block. Length follows the beat count.

## Assets

`public/` is committed. To rebuild it from the owner's originals:

```sh
scripts/prep_assets.sh ../assets/source/judo-photos-2026-10-18
```

It re-encodes photos with Pillow (no EXIF/GPS), copies the logo, makes the grain tile and
cuts the music. Only camera photos are used. The studio portraits in `public/coaches/` are
not: their C2PA data marks them as generated, so they stay out of the videos.

- Music: "Generic trailer music" by Emma_MA, CC0 (public domain),
  https://opengameart.org/content/generic-trailer-music. Cuts follow its 76 BPM grid (`BEAT` in `src/data.js`).
- Fonts (SIL OFL, from google/fonts): Oswald, Rubik, Secular One, Yuji Boku (subset to the kanji used).
  Licences are next to the files in `public/fonts/`.
- Remotion is free for non-profit organisations under its licence (the club is an amuta).
