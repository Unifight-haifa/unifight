"""Builds public/reel/ (clips + music) for the three club reels: sumo, sukkot, camps.

Usage: python3 -I scripts/prep_reels.py <archive dir (holds Videos/ and Photos/)>
Needs ffmpeg, curl and Pillow. Output is gitignored.
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_promo import HLG, LOOK  # noqa: E402

ARCH = sys.argv[1].rstrip('/') + '/'
SRC = ARCH + 'Videos/'
OUT = 'public/reel/'
PHONE = 'eq=contrast=1.06:saturation=1.05'

GEO = '2024-02-20 Сборы в Грузии (מחנה אימונים גיאורגיה 2-24)/'
DE = '2023-05-11 Германия — сборы и турнир (גרמניה)/'
KIN = '2022-08-19 Выезд на Кинерет (כנרת)/'
SUK = '2023-10-01 Сборы на Суккот (מחנה אימונים סוכות)/'

# name: (file, start s, length s or None, front end, keep live sound)
CLIPS = {
    'sumo': ('_Темы/Сумо, тренировки (סומו - תמונות מאימונים)/2023-06-08_1908_IMG_9340.MOV', 0, None, PHONE, True),
    'suk-wide': (SUK + '2023-10-04_1146_IMG_0711.MOV', 0, None, HLG, True),
    # the one window of the randori clip with no name patch in it; the rest stays out of the cut
    'suk-rf': (SUK + '2023-10-04_1217_IMG_0727.MOV', 5.5, 2.1, 'crop=1066:600:640:240,' + HLG, True),
    'g-snow': (GEO + 'Снег, поездка в Гудаури (תמונת בשלג-טיול לגודאורי)/2024-02-25_0815_20240225_101550.mp4', 0, None, PHONE, False),
    'g-city': (GEO + 'Прогулки по городу и еда (טיולים בעיר ואוכל)/VID_33790424_012354_765.mp4', 0, None, PHONE, False),
    'g-run': (GEO + 'Тренировки (אימונים)/2024-02-24_1053_IMG_2380.MOV', 0, None, HLG, False),
    'g-rope': (GEO + 'Тренировки (אימונים)/2024-02-21_1222_IMG_2259.MOV', 0, None, HLG, False),
    'g-rope2': (GEO + 'Тренировки (אימונים)/2024-02-21_1222_IMG_2260.MOV', 0, None, HLG, False),
    'd-slide': (DE + 'Аквапарк (פארק מים)/2023-05-15_1504_IMG_8993.MOV', 0, None, HLG, False),
    'd-zip': (DE + 'Верёвочный парк (פארק חבלים)/2023-05-16_1253_IMG_9017.MOV', 0, 14, HLG, False),
    'k-flip': (KIN + '2022-08-19_2014_IMG_5937.MOV', 0, None, PHONE, False),
    'k-carry': (KIN + '2022-08-19_2014_IMG_5936.MOV', 0, None, PHONE, False),
    't-north': ('2023-01-28 Чемпионат Севера (אליפויות צפון המהלך השנה)/2023-01-28_0945_F930CF0B-6291-48A2-B683-D2AC715491F2.mp4', 0, None, PHONE, False),
    't-huddle': ('2023-03-25 Международный турнир в Ришон-ле-Ционе (בינלאומית רשלצ)/2023-03-25_0900_IMG_8187.MOV', 0, None, HLG, False),
    't-cheer': ('2023-03-25 Международный турнир в Ришон-ле-Ционе (בינלאומית רשלצ)/2023-03-25_0900_IMG_8188.MOV', 0, 2.6, HLG, False),
    't-medal': (DE + 'Видео боёв (וודיאו של הקרבות)/מאיה/2023-05-14_1541_20230514_144144.mp4', 0, None, PHONE, False),
}

SUK_PH = ARCH + 'Photos/2023-10-01 Сборы на Суккот (מחנה אימונים סוכות)/'
# Photos with no readable name on any judogi; box = (x, y, w) in the 2400 px-wide upright image, 16:9.
PHOTOS = {
    'sp-kids': (SUK_PH + '2023-10-04_1132_IMG_0694.HEIC', (600, 700, 1800)),
    'sp-throw': (SUK_PH + '2023-10-04_1144_IMG_0707.HEIC', None),
    'sp-ground': (SUK_PH + '2023-10-01_1152_IMG_0646.HEIC', (0, 1050, 1800)),
    'sp-mat': (SUK_PH + '2023-10-04_1144_IMG_0709.HEIC', None),
    'sp-young': (SUK_PH + '2023-10-05_1821_IMG_0772.HEIC', None),
    'sp-team': (SUK_PH + '2023-10-04_1314_IMG_0743.HEIC', None),
    'sp-all': (SUK_PH + '7b35b362-4ba7-4f19-868a-0afc4a5c8896.jpg', None),
}

INC = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/'
# Kevin MacLeod (incompetech.com), CC BY 4.0; credits go in each video description
MUSIC = {'volatile-reaction': 'Volatile%20Reaction', 'hitman': 'Hitman', 'five-armies': 'Five%20Armies'}


def run(*a):
    subprocess.run(a, check=True)


def clip(name, path, ss, dur, front, sound):
    cut = ['-ss', str(ss)] + (['-t', str(dur)] if dur else [])
    # ffmpeg applies the rotation tag itself, so portrait phone clips come out upright
    fit = 'scale=w=1920:h=1920:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos'
    enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-g', '15', '-pix_fmt', 'yuv420p',
           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart']
    audio = ['-c:a', 'aac', '-b:a', '160k'] if sound else ['-an']
    run('ffmpeg', '-v', 'error', '-y', *cut, '-i', SRC + path, '-vf', f'fps=30,{front},{fit},{LOOK}', *audio, *enc, f'{OUT}{name}.mp4')


def photo(name, path, box):
    """Still -> 6 s 1080p clip; the reel adds the motion."""
    with tempfile.TemporaryDirectory() as tmp:
        jpg = os.path.join(tmp, 'p.jpg')
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-Z', '2400', path, '--out', jpg], check=True, stdout=subprocess.DEVNULL)
        im = ImageOps.exif_transpose(Image.open(jpg)).convert('RGB')
        x, y, w = box or (0, (im.height - im.width * 9 // 16) // 2, im.width)
        im.crop((x, y, x + w, y + w * 9 // 16)).resize((1920, 1080), Image.LANCZOS).save(jpg, quality=95)
        run('ffmpeg', '-v', 'error', '-y', '-loop', '1', '-t', '6', '-i', jpg, '-vf', f'fps=30,{LOOK}',
            '-c:v', 'libx264', '-crf', '15', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709',
            '-colorspace', 'bt709', f'{OUT}{name}.mp4')


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
    os.makedirs(OUT, exist_ok=True)
    only = set(os.environ.get('ONLY', '').split()) - {''}
    for name, spec in CLIPS.items():
        if not only or name in only:
            clip(name, *spec)
    for name, (path, box) in PHOTOS.items():
        if not only or name in only:
            photo(name, path, box)
    for name, title in MUSIC.items():
        if not os.path.exists(f'{OUT}{name}.mp3'):
            run('curl', '-sfL', '-o', f'{OUT}{name}.mp3', INC + title + '.mp3')
    print('ok')
