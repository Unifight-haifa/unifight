# Coach profile videos

Short promo profiles of the club's coaches, built with [Remotion](https://www.remotion.dev).
This folder has its own `package.json`; the site doesn't depend on it.

## Render

```sh
cd video
npm ci
scripts/render.sh <coach> <format> <out.mp4>
```

- `coach`: `ilana` or `natanel`
- `format`: `16x9` (1920×1080, YouTube) or `9x16` (1080×1920, Shorts/Reels)

Every caption shows Hebrew, Russian and English together, so there's one render per coach and format.
Ilana's map cards are laid out for 16x9 only.

Example: `scripts/render.sh natanel 9x16 out/natanel-9x16.mp4`.
Output is H.264 high, yuv420p, bt709, 30 fps, AAC 192k. Extra flags go straight to `remotion render`.

`npm run studio` opens the Remotion editor; pick `CoachProfile` and set the props there.
To check a render, `scripts/stills.sh <video.mp4> <prefix>` drops a frame every 3 s into `checks/`.

## Two concepts, not one template

- `src/ilana.jsx`, "the fighter across disciplines": rapid stop-motion bout open, slab-type title,
  then a journey across a dotted world map (Haifa, Baku, Mongolia, Rio, Krotoszyn, Israel) with a
  rolling year counter, punch-in photo and press cards, hard cuts on a 130 BPM brass-and-drums track.
- `src/natanel.jsx`, "raised in the club": letterboxed, quiet slit-reveal open, his judogi back
  patch as the title, back-number year patches for the U23 titles, ink and tatami wipes; the
  letterbox opens when the story reaches his coaching; quiet open in the track's dip, the name lands
  when the 141 BPM chase theme comes back in.

Shared: brand fonts, grain, end card (`src/common.jsx`); all on-screen text is in `src/text.js`.

## Content rules

- Names and roles come from `content/coaches/*.json`; credentials in `src/text.js` restate facts from
  those files or from article quotes in `.planning/research/PHOTOS-2026-10-18.md`.
- A coach's video talks only about that coach. Other athletes' names on judogi backs are blurred
  in prep; the club randori clip is blurred so no back patch is readable.
- Camera photos and footage only, except Natanel's closing shot: the site's studio portrait, a
  stylised photo the owner approved. Mark uploads of his video as altered/synthetic content.

## Assets

`public/` is committed. To rebuild it from the owner's originals (`assets/source/` in the main checkout):

```sh
scripts/prep_assets.sh /path/to/assets/source
```

It re-encodes photos with Pillow (no EXIF/GPS; HEIC through `sips`), trims the two clips with
ffmpeg, draws the dot map, tatami strip and ink map, copies the logo and cuts both music tracks.

- Music, CC BY 4.0, credit in each video description:
  - Ilana: Heroic Age Kevin MacLeod (incompetech.com)
    Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/
  - Natanel: Mistake the Getaway Kevin MacLeod (incompetech.com)
    Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/
- Map: Natural Earth 1:110m land, public domain.
- Fonts (SIL OFL, from google/fonts): Oswald, Rubik, Secular One, Yuji Boku (subset to the kanji used).
- Remotion is free for non-profit organisations under its licence (the club is an amuta).

## Club promo

`Promo` (`src/Promo.jsx`, copy and shot lists in `src/promoData.js`) is the channel trailer:
about 71 s in 16:9 and a 40 s 9:16 cutdown, captioned in Hebrew, Russian and English at once.

```sh
python3 -I scripts/prep_promo.py ../assets/source    # clips, photos, music, SFX into public/promo/ (gitignored)
scripts/render_promo.sh 16x9 out/promo-16x9.mp4  # also writes out/promo-16x9-720p.mp4
```

The render is normalised to -14 LUFS. Only camera material is used; the WhatsApp fight copies
are shown framed and small rather than blown up.

- Music, CC BY 4.0, credit in the video description:
  Eighties Action Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/
  Cuts follow its 132 BPM grid; the throw lands on the slam after the break (beat 272).
- SFX, all CC0 from OpenGameArt: "Wind, hit, time morph" (qubodup), "75 CC0 breaking / falling / hit sfx"
  (rubberduck), "Heartbeat sounds" (bart), "Breathing Tired" (mikeask).
