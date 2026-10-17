#!/usr/bin/env python3
"""Renders the 1200x630 share images public/og/<lang>.jpg from content/site.json.

Run by hand after changing the club name or hero headline; needs Pillow with libraqm (Hebrew shaping).
"""
import json, re, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, features

R = Path(__file__).resolve().parents[2]
PUB = R / "public"
C = json.loads((R / "content/site.json").read_text())
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/rubik/Rubik%5Bwght%5D.ttf"
FONT = Path.home() / ".cache/unifight/Rubik.ttf"
BG = "img-night/train-sukkot-randori.jpg"
W, H, PAD = 1200, 630, 72
INK, GOLD, RED, PAPER = (10, 9, 8), (212, 168, 75), (194, 35, 46), (243, 234, 216)
MAX_BYTES = 600_000  # WhatsApp drops previews above this

assert features.check("raqm"), "Pillow needs libraqm to shape Hebrew"
if not FONT.exists():
    FONT.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(FONT_URL, FONT)


def font(size, weight):
    f = ImageFont.truetype(str(FONT), size)
    f.set_variation_by_axes([weight])
    return f


def wrap(draw, text, f, width, kw):
    lines = [""]
    for w in text.split():
        cand = f"{lines[-1]} {w}".strip()
        if lines[-1] and draw.textlength(cand, font=f, **kw) > width:
            lines.append(w)
        else:
            lines[-1] = cand
    return lines


def cover(im):
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def render(lang):
    rtl = lang == "he"
    kw = {"direction": "rtl", "language": "he"} if rtl else {"language": lang}
    im = cover(Image.open(PUB / BG).convert("RGB"))
    # darker toward the text's side so it stays readable over any part of the photo
    shade = Image.new("L", (W, H))
    for x in range(W):
        a = 248 - int(78 * x / W)
        shade.paste(a, (W - 1 - x if rtl else x, 0, (W - x if rtl else x + 1), H))
    im = Image.composite(Image.new("RGB", (W, H), INK), im, shade)
    d = ImageDraw.Draw(im)
    start = W - PAD if rtl else PAD
    anchor = "r" if rtl else "l"
    d.rectangle((W - 12, 0, W, H) if rtl else (0, 0, 12, H), fill=RED)

    logo = Image.open(PUB / "brand/logo.png").convert("RGBA")
    logo.thumbnail((112, 112), Image.LANCZOS)  # downscale only: the source is 256px
    lx = start - logo.width if rtl else start
    im.paste(logo, (lx, PAD), logo)
    nx = lx - 28 if rtl else lx + logo.width + 28
    d.text((nx, PAD + logo.height // 2), C["club"]["name"][lang], font=font(46, 600), fill=GOLD, anchor=anchor + "m", **kw)

    hf = font(76, 700)
    # one sentence per line reads better than a greedy wrap
    lines = [ln for s in re.split(r"(?<=\.)\s+", C["hero"]["headline"][lang]) for ln in wrap(d, s, hf, W - 2 * PAD - 40, kw)]
    y = H - PAD - 92 * len(lines)
    d.rectangle((start - 120, y - 36, start, y - 30) if rtl else (start, y - 36, start + 120, y - 30), fill=GOLD)
    for ln in lines:
        d.text((start, y), ln, font=hf, fill=PAPER, anchor=anchor + "t", **kw)
        y += 92

    out = PUB / f"og/{lang}.jpg"
    out.parent.mkdir(exist_ok=True)
    im.save(out, quality=85, optimize=True, progressive=True)
    assert out.stat().st_size < MAX_BYTES, out
    print(out.relative_to(R), out.stat().st_size, "bytes")


for lang in ("he", "ru", "en"):
    render(lang)
