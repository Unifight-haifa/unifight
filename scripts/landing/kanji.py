#!/usr/bin/env python3
"""Draws every kanji in content/kanji.json as an SVG path into src/generated/kanji-glyphs.json,
plus kanji-box.woff2: the fonts' line metrics with no glyphs, so a .kj box keeps its old height.

Run by hand after adding a word to content/kanji.json; needs fontTools. The site then ships
the outlines, not the fonts.
"""
import json, urllib.request
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.pens.transformPen import TransformPen

R = Path(__file__).resolve().parents[2]
OUT = R / "src/generated/kanji-glyphs.json"
CACHE = Path.home() / ".cache/unifight"
FONTS = {"mincho": "shipporiminchob1/ShipporiMinchoB1-ExtraBold.ttf", "brush": "yujiboku/YujiBoku-Regular.ttf"}
EM = 1000


class RelPen(BasePen):
    """Relative, integer, separator-free path data with smooth (t) curves: the site ships these inline."""
    def __init__(self, glyphs):
        super().__init__(glyphs)
        self.d, self.at, self.ctrl = [], (0, 0), None

    def _cmd(self, c, *pts):
        pts = [(round(x), round(y)) for x, y in pts]
        nums = "".join(f"{'' if v < 0 else ' '}{v}" for x, y in pts for v in (x - self.at[0], y - self.at[1]))
        self.d.append(c + nums.lstrip())
        self.at = pts[-1]

    def _moveTo(self, p):
        self._cmd("m", p); self.ctrl, self.start = None, self.at

    def _lineTo(self, p):
        self._cmd("l", p); self.ctrl = None

    def _qCurveToOne(self, c, p):
        c = (round(c[0]), round(c[1]))
        # TrueType's implied on-curve points sit midway between controls, so the next control is the reflection
        refl = self.ctrl and (2 * self.at[0] - self.ctrl[0], 2 * self.at[1] - self.ctrl[1])
        if refl and max(abs(refl[0] - c[0]), abs(refl[1] - c[1])) <= 1:
            c = refl  # what the browser will use, so later reflections don't drift
            self._cmd("t", p)
        else:
            self._cmd("q", c, p)
        self.ctrl = c

    def _curveToOne(self, c1, c2, p):
        self._cmd("c", c1, c2, p); self.ctrl = None

    def _closePath(self):
        # z returns to the subpath start, which the next relative m counts from
        self.d.append("z"); self.ctrl, self.at = None, self.start


words = json.loads((R / "content/kanji.json").read_text())
out = {}
for style, path in FONTS.items():
    file = CACHE / Path(path).name
    if not file.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve("https://github.com/google/fonts/raw/main/ofl/" + path, file)
    font = TTFont(file, recalcTimestamp=False)  # a stable kanji-box.woff2 between runs
    cmap, glyphs = font.getBestCmap(), font.getGlyphSet()
    s = EM / font["head"].unitsPerEm
    hh = font["hhea"]
    # night.css .kg (.436em) and the one shared box font assume these line metrics
    assert (hh.ascent, hh.descent, hh.lineGap, font["head"].unitsPerEm) == (1160, -288, 0, 1000), style
    # place the em box where a line-height:1 line of this font would put it, so swapping text for SVG keeps the layout
    top = round((hh.ascent + hh.descent + font["head"].unitsPerEm) / 2 * s)
    paths = {}
    for ch in sorted({c for w in words[style] for c in w}):
        pen = RelPen(glyphs)
        glyphs[cmap[ord(ch)]].draw(TransformPen(pen, (s, 0, 0, -s, 0, 0)))
        paths[ch] = "".join(pen.d)
    out[style] = {"viewBox": f"0 {-top} {EM} {EM}", "glyphs": paths}
sub = subset.Subsetter(subset.Options(flavor="woff2", layout_features=[], notdef_outline=True))
sub.populate(unicodes=[0x20])  # browsers reject a font with no cmap or an empty glyf
sub.subset(font)
font.flavor = "woff2"
font.save(OUT.with_name("kanji-box.woff2"))
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
print(OUT, {k: (v["viewBox"], len(v["glyphs"])) for k, v in out.items()})
