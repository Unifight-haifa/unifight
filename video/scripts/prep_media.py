"""Builds the generated textures and video clips in public/.

Usage: python3 scripts/prep_media.py <assets/source dir> <ne_110m_land.geojson>
Needs ffmpeg, numpy, Pillow.
"""
import json
import os
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC, LAND = sys.argv[1], sys.argv[2]
PUB = os.path.join(os.path.dirname(__file__), '..', 'public')
D = os.path.join(SRC, 'drive-003/UNIFIGHT/ג׳ודו/')

# Keep in sync with MAP in src/ilana.jsx.
LON0, LON1, LAT0, LAT1, PPD = -80, 180, -40, 75, 20


def dot_map():
    w, h = (LON1 - LON0) * PPD, (LAT1 - LAT0) * PPD
    mask = Image.new('L', (w, h))
    dr = ImageDraw.Draw(mask)
    xy = lambda lon, lat: ((lon - LON0) * PPD, (LAT1 - lat) * PPD)
    for f in json.load(open(LAND))['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            dr.polygon([xy(*p) for p in poly[0]], fill=255)
    m = np.array(mask) > 0
    out = Image.new('RGBA', (w, h))
    od = ImageDraw.Draw(out)
    step, r = 10, 2.6
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            if m[y, x]:
                od.ellipse((x - r, y - r, x + r, y + r), fill=(212, 168, 75, 255))
    out.save(os.path.join(PUB, 'map.png'), optimize=True)
    print('map', w, h)


def tatami():
    # Woven-straw strip with a dark cloth edge (heri), tiled vertically in the wipe.
    rng = np.random.default_rng(3)
    w, h = 640, 1080
    base = np.zeros((h, w, 3), np.float32) + np.array([186, 170, 112])
    rows = (np.sin(np.arange(h) * np.pi / 3.0) * 0.5 + 0.5)[:, None, None]
    base *= 0.86 + 0.14 * rows
    base *= 0.93 + 0.07 * rng.random((h, w, 1))
    img = Image.fromarray(base.clip(0, 255).astype('uint8'))
    d = ImageDraw.Draw(img)
    for x in (0, w - 44):
        d.rectangle((x, 0, x + 44, h), fill=(22, 30, 46))
        d.line((x + 6, 0, x + 6, h), fill=(212, 168, 75), width=2)
        d.line((x + 38, 0, x + 38, h), fill=(212, 168, 75), width=2)
    img.save(os.path.join(PUB, 'tatami.jpg'), quality=88)


def ink():
    # Grey levels = order in which pixels get inked; thresholded in an SVG filter at render time.
    rng = np.random.default_rng(11)
    w, h = 960, 540
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot((xx - w * 0.42) / w, (yy - h * 0.55) / w)
    noise = np.zeros((h, w))
    for s, a in ((8, 0.5), (24, 0.3), (80, 0.2)):
        n = Image.fromarray((rng.random((h // s + 2, w // s + 2)) * 255).astype('uint8'))
        noise += a * np.array(n.resize((w + 2 * s, h + 2 * s), Image.BICUBIC))[s:s + h, s:s + w] / 255
    v = r / r.max() * 0.78 + noise * 0.22
    v = (v - v.min()) / (v.max() - v.min())
    Image.fromarray((v * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.2)).save(
        os.path.join(PUB, 'ink.png'), optimize=True)


def clips():
    os.makedirs(os.path.join(PUB, 'clips'), exist_ok=True)
    common = ['-an', '-map_metadata', '-1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', '30']
    # Natanel with the COACH badge, Erfurt, 14 May 2023.
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '0', '-t', '4', '-i',
                    D + '2022-2023/גרמניה🇩🇪/וודיאו של הקרבות/מאיה/20230514_144144.mp4', *common,
                    os.path.join(PUB, 'clips/natanel-coach.mp4')], check=True)
    # Club randori, Sukkot camp 2023; heavy blur so no back patch is readable.
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '17', '-t', '9', '-i',
                    D + '2023-2024/מחנה אימונים סוכות/IMG_0727.MOV',
                    '-vf', 'scale=960:-2,boxblur=10:2,eq=saturation=0.75:contrast=1.08:gamma=0.9', *common,
                    os.path.join(PUB, 'clips/club-randori.mp4')], check=True)


if __name__ == '__main__':
    dot_map()
    tatami()
    ink()
    clips()
