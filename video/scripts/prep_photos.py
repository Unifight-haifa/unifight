"""Re-encode the photos used by the videos from the owner's originals.

Usage: python3 scripts/prep_photos.py <assets/source dir>
Output goes to public/photos/. Pillow re-encode drops EXIF/GPS/XMP/ICC.
HEIC is decoded with macOS `sips` first (no pillow-heif here).
"""
import os
import subprocess
import sys
import tempfile
from PIL import Image, ImageFilter, ImageOps

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'photos')
J = 'judo-photos-2026-10-18/'
D = 'drive-003/UNIFIGHT/ג׳ודו/'

# name: (path, crop box or None, [boxes to blur], longest side)
# Blur boxes hide other athletes' names on judogi backs.
PHOTOS = {
    # Ilana
    'ilana-bout': (J + 'אילנה /Concordia 2013 Ilana 54.JPG', None, [], 1920),
    'ilana-bout-3': (J + 'אילנה /Concordia 2013 Ilana 3.JPG', None, [], 1920),
    'ilana-bout-4': (J + 'אילנה /Concordia 2013 Ilana 4.JPG', None, [], 1920),
    'ilana-bout-5': (J + 'אילנה /Concordia 2013 Ilana 5.JPG', None, [], 1920),
    'ilana-bout-44': (J + 'אילנה /Concordia 2013 Ilana 44.JPG', None, [], 1920),
    'ilana-bout-57': (J + 'אילנה /Concordia 2013 Ilana 57.JPG', None, [], 1920),
    'ilana-beach-flag': (J + 'תמונות של מאמנים/IMG-3291.JPG', None, [], 2436),
    'ilana-bw': (J + 'לפלייר/צילומי סטודיו 2.jpg', None, [], 2400),
    'ilana-baku': (J + 'לפלייר/DSC_1279_1600x1065.JPG', None, [], 1600),
    'ilana-gold-2016': (J + 'לפלייר/IMG_1393.PNG', None, [], 1125),
    'ilana-coach': (J + 'אילנה /RON_4544.jpg', None, [], 2400),
    'ilana-judo': (J + 'אילנה /RON_4589.jpg', (0, 300, 3337, 4900), [], 2000),
    'press-2014': (J + 'כתבות אילנה/11.jpg', None, [], 2048),
    'press-first': (J + 'כתבות אילנה/2.jpg', None, [], 960),
    'press-rio': (J + 'כתבות/Screenshot_20261016_102723_Chrome.jpg', (0, 0, 1079, 1560), [], 1560),
    'press-sumo': (J + 'כתבות/Screenshot_20261016_102024_Chrome.jpg', (0, 0, 1080, 880), [], 1080),
    'press-sumo-photo': (J + 'כתבות/Screenshot_20261016_102024_Chrome.jpg', (60, 1505, 1045, 1990), [], 985),
    # Natanel
    'natanel-grip': (J + 'האלופים רמה בינלאומית/WhatsApp Image 2022-08-28 at 12.34.13.jpeg',
                     None, [(420, 290, 700, 440)], 2048),
    'natanel-u23': (J + 'תמונות ישנות/74413304_2459378414111907_8596392500531298304_n.jpg',
                    (560, 200, 980, 1360), [], 1160),
    'natanel-sarajevo': (J + 'האלופים רמה בינלאומית/WhatsApp Image 2022-08-28 at 12.34.11 (1).jpeg',
                         None, [], 2048),
    'natanel-riga': (J + 'סשה/WhatsApp Image 2022-08-28 at 12.34.12 (1).jpeg',
                     (150, 300, 650, 1276), [], 976),
    'natanel-erfurt': (D + '2022-2023/גרמניה🇩🇪/תמונות מאימונים והתחרות🥋/IMG_5477.HEIC',
                       (3440, 1180, 4032, 3024), [], 1844),
}


def load(path):
    if path.lower().endswith('.heic'):
        tmp = tempfile.mktemp(suffix='.jpg')
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '95', path, '--out', tmp],
                       check=True, capture_output=True)
        path = tmp
    return ImageOps.exif_transpose(Image.open(path)).convert('RGB')


def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[2:])
    for name, (path, crop, blurs, longest) in PHOTOS.items():
        if only and name not in only:
            continue
        im = load(os.path.join(SRC, path))
        for box in blurs:
            patch = im.crop(box).filter(ImageFilter.GaussianBlur(14))
            im.paste(patch, box[:2])
        if crop:
            im = im.crop(crop)
        im.thumbnail((longest, longest), Image.LANCZOS)
        dst = os.path.join(OUT, name + '.jpg')
        im.save(dst, 'JPEG', quality=86, optimize=True, progressive=True)
        print(f'{name}: {im.size[0]}x{im.size[1]} {os.path.getsize(dst) // 1024} KB')


if __name__ == '__main__':
    main()
