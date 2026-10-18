#!/usr/bin/env python3
"""Moves bot-submitted photos from the private staging checkout into the gallery.

Usage: gallery_intake.py INBOX [REPO]. INBOX is a checkout of the staging repo holding
incoming/gallery/<album>/; originals never enter this (public) repo.

Each photo needs a sidecar <file>.json (docs/bot-content-contracts.md). A photo without its
sidecar, or a sidecar without its photo, is left for a later run. Every complete pair is
re-encoded (long edge 1600 px, JPEG, no metadata at all), written to src/assets/gallery/<album>/,
appended to content/gallery.json and deleted from INBOX. Any bad pair aborts the run before
anything is written. Prints one line per photo for the commit message.
"""
import io, json, re, sys
from pathlib import Path
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:  # HEIC then fails with a clear error below
    pass

if len(sys.argv) < 2:
    sys.exit(__doc__)
INBOX = Path(sys.argv[1]).resolve()
R = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path(__file__).resolve().parents[1]
INC, OUT, GJ = INBOX / "incoming/gallery", R / "src/assets/gallery", R / "content/gallery.json"
LANGS = ("he", "ru", "en")
PHOTO = {".jpg", ".jpeg", ".png", ".heic", ".heif"}
EDGE, BUDGET = 1600, 500 * 1024  # the gallery size; budget matches test/gallery.test.mjs
ID = re.compile(r"^[a-z][a-z0-9-]*$")


def fail(msg):
    sys.exit(f"gallery intake: {msg}")


def text(o, at):
    for l in LANGS:
        if not isinstance(o, dict) or not isinstance(o.get(l), str) or not o[l].strip():
            fail(f"{at}.{l} is missing")


def encode(src):
    """JPEG bytes and the year the photo was taken (from EXIF, if any)."""
    try:
        im = Image.open(src)
        exif = im.getexif()
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception as e:
        fail(f"{src.relative_to(INBOX)}: cannot read the image ({e})")
    taken = str(exif.get_ifd(0x8769).get(0x9003) or exif.get(0x0132) or "")
    im.thumbnail((EDGE, EDGE), Image.LANCZOS)
    # a fresh image carries no EXIF/XMP/ICC/comment from the source, GPS included
    clean = Image.new("RGB", im.size)
    clean.paste(im)
    for q in (82, 76, 70, 64):
        buf = io.BytesIO()
        clean.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() <= BUDGET:
            return buf.getvalue(), (int(taken[:4]) if re.match(r"(19[5-9]\d|20\d\d)", taken) else None)
    fail(f"{src.relative_to(INBOX)}: still over {BUDGET // 1024} KB at quality 64")


def slug(stem, taken):
    s = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-") or "photo"
    name, i = s, 2
    while name in taken:
        name, i = f"{s}-{i}", i + 1
    taken.add(name)
    return name


def main():
    if not INC.is_dir():
        return
    gallery = json.loads(GJ.read_text())
    albums = {a["id"]: a for a in gallery}
    jobs = []
    for d in sorted(p for p in INC.iterdir() if p.is_dir()):
        names = {p.stem for p in (OUT / d.name).glob("*.jpg")}
        for src in sorted(p for p in d.iterdir() if p.is_file() and p.suffix.lower() != ".json" and p.name != ".gitkeep"):
            at = str(src.relative_to(INBOX))
            side = src.with_name(src.name + ".json")
            if not side.exists():
                print(f"skip {at}: sidecar {side.name} not there yet", file=sys.stderr)
                continue
            if src.suffix.lower() not in PHOTO:
                fail(f"{at}: only {', '.join(sorted(PHOTO))} are accepted")
            try:
                meta = json.loads(side.read_text())
            except ValueError as e:
                fail(f"{side.relative_to(INBOX)}: not valid JSON ({e})")
            if meta.get("album") != d.name:
                fail(f"{side.relative_to(INBOX)}: album is {meta.get('album')!r} but the photo is in incoming/gallery/{d.name}/")
            text(meta.get("alt"), f"{side.name}: alt")
            if "caption" in meta:
                text(meta["caption"], f"{side.name}: caption")
            for k in ("author", "approved_by"):
                if not str(meta.get(k, "")).strip():
                    fail(f"{side.name}: {k} is missing")
            if d.name not in albums:
                if not ID.match(d.name):
                    fail(f"album id {d.name!r} must be lowercase letters, digits and dashes")
                if "album_title" not in meta:
                    fail(f"{side.name}: album {d.name!r} does not exist; add album_title {{he, ru, en}} to create it")
                text(meta["album_title"], f"{side.name}: album_title")
                albums[d.name] = {"id": d.name, "title": {l: meta["album_title"][l] for l in LANGS}, "photos": []}
                gallery.append(albums[d.name])
            data, year = encode(src)
            entry = {"file": f"{d.name}/{slug(src.stem, names)}.jpg", "alt": {l: meta["alt"][l] for l in LANGS}}
            if "caption" in meta:
                entry["caption"] = {l: meta["caption"][l] for l in LANGS}
            if year:
                entry["year"] = year
            entry["source"] = src.stem
            jobs.append((src, side, entry, data, meta))
    for src, side, entry, data, meta in jobs:
        out = OUT / entry["file"]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        albums[entry["file"].split("/")[0]]["photos"].append(entry)
        src.unlink()
        side.unlink()
        print(f"{entry['file']} ({len(data) // 1024} KB) from {src.name}, by {meta['author']}, approved by {meta['approved_by']}")
    if jobs:
        GJ.write_text(json.dumps(gallery, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main()
