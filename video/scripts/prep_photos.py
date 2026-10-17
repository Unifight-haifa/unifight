"""Re-encode the coach photos used by the videos from the owner's originals.

Usage: python3 scripts/prep_photos.py <originals dir>
Output goes to public/photos/. Pillow re-encode drops EXIF/GPS/XMP/ICC.
"""
import os
import sys
from PIL import Image, ImageFilter, ImageOps

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'photos')

# name: (path, crop box or None, [boxes to blur], longest side)
# Blur boxes hide opponents' names printed on judogi backs and scoreboards.
PHOTOS = {
    'ilana-bout': ('אילנה /Concordia 2013 Ilana 54.JPG', None, [], 2400),
    'ilana-win': ('סשה/ilana-kratysh.jpg', None, [], 1200),
    'ilana-beach-flag': ('תמונות של מאמנים/IMG-3291.JPG', None, [], 2436),
    'ilana-bw': ('לפלייר/צילומי סטודיו 2.jpg', None, [], 2400),
    'ilana-baku': ('לפלייר/DSC_1279_1600x1065.JPG', None, [], 1600),
    'ilana-gold-2016': ('לפלייר/IMG_1393.PNG', None, [], 1125),
    'ilana-coach': ('אילנה /RON_4544.jpg', None, [], 2400),
    'natanel-throw': ('האלופים רמה בינלאומית/WhatsApp Image 2022-08-28 at 12.34.10.jpeg',
                      None, [(1005, 400, 1085, 560)], 1600),
    'natanel-grip': ('האלופים רמה בינלאומית/WhatsApp Image 2022-08-28 at 12.34.13.jpeg',
                     None, [(420, 290, 700, 440)], 2048),
    'natanel-u23': ('תמונות ישנות/74413304_2459378414111907_8596392500531298304_n.jpg',
                    (560, 200, 980, 1360), [], 1160),
    'natanel-sarajevo': ('האלופים רמה בינלאומית/WhatsApp Image 2022-08-28 at 12.34.11 (1).jpeg',
                         None, [], 2048),
    'natanel-riga': ('סשה/WhatsApp Image 2022-08-28 at 12.34.12 (1).jpeg',
                     (150, 300, 650, 1276), [], 976),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (path, crop, blurs, longest) in PHOTOS.items():
        src = path if os.path.isabs(path) else os.path.join(SRC, path)
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
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
