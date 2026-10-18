"""Builds public/promo/ (clips, photos, music, sound effects) for the club promo.

Usage: python3 -I scripts/prep_promo.py <assets/source dir>
Needs ffmpeg, Pillow, curl. Output is gitignored; rerun after a fresh clone.
"""
import os
import subprocess
import sys
import tempfile
import zipfile

from PIL import Image, ImageOps

SRC = sys.argv[1].rstrip('/') + '/'
VID = SRC + 'drive-003/UNIFIGHT/'
PHOTOS = SRC + 'judo-photos-2026-10-18/'
NIGHT = '../public/img-night/'
OUT = 'public/promo/'

ERFURT = VID + 'ג׳ודו/2022-2023/גרמניה🇩🇪/וודיאו של הקרבות/'
SHOOT = VID + 'ווידיאו שרון/סירטון ג׳ודו/'
FILES = {
    'V01': SHOOT + 'C0415.MP4',
    'V02': SHOOT + 'C0418.MP4',
    'V03': SHOOT + 'C0443.MP4',
    'V05': ERFURT + 'ויקה/וויקה III.mp4',
    'V06': ERFURT + 'מאיה/20230514_144144.mp4',
    'V08': ERFURT + 'דניס/65070d67-98cb-42b8-9f83-113a198f1d98.mp4',
    'V09': ERFURT + 'מתן/65b5ba31-3630-4893-acb4-fdb0299e8c5a.mp4',
    'V10': ERFURT + 'דניס/6aef7f1c-3566-4161-b6a1-50aa4b49a101.mp4',
    'V18': VID + 'ג׳ודו/2023-2024/מחנה אימונים גיאורגיה 2-24/אימונים/IMG_2380.MOV',
    'V19': VID + 'ג׳ודו/2023-2024/מחנה אימונים סוכות/IMG_0727.MOV',
}

# One warm, contrasty look; each source gets a front end that brings it to the same place.
LOOK = "curves=r='0/0 0.5/0.52 1/1':g='0/0 0.5/0.5 1/0.98':b='0/0.02 0.5/0.47 1/0.94'"
FLAT = 'eq=contrast=1.3:brightness=-0.035:saturation=1.3:gamma=0.94'  # Sony 10-bit flat profile
HLG = 'colorspace=all=bt709:iall=bt2020:itrc=bt2020-10:fast=1,eq=contrast=1.08:saturation=1.08:gamma=0.94'
PHONE = 'eq=contrast=1.08:saturation=1.0'
# WhatsApp copies: denoise before upscaling so the blocks don't get sharpened.
WA = 'hqdn3d=4:3:6:6,scale=iw*2:ih*2:flags=lanczos,cas=0.35,eq=contrast=1.2:saturation=0.82:brightness=-0.02'

# name: (video, start s, length s, front end). 100 fps shoots are conformed to 30 fps.
CLIPS = {
    'open': ('V01', 0.0, 1.7, FLAT),
    'cart': ('V01', 1.3, 1.9, FLAT),
    'roll': ('V01', 10.2, 2.0, FLAT),
    'fall': ('V02', 1.8, 3.4, FLAT),
    'line': ('V03', 0.6, 1.8, FLAT),
    'low': ('V03', 2.6, 2.2, FLAT),
    'medal': ('V06', 2.0, 5.5, PHONE),
    'sprint': ('V18', 0.0, 7.7, HLG),
    'randA': ('V19', 3.5, 5.5, HLG),
    'randB': ('V19', 10.5, 2.4, HLG),
    'randC': ('V19', 18.5, 5.0, HLG),
    'randD': ('V19', 24.5, 5.5, HLG),
    'throw': ('V09', 3.0, 4.5, WA),
    'ground': ('V10', 6.0, 6.0, WA),
    'grips': ('V08', 5.5, 3.5, WA),
    # stream capture: the picture sits inside a black frame
    'down': ('V05', 130.0, 11.0, 'crop=640:360:0:60,' + WA),
}

PHOTO_SET = {
    'toddler': PHOTOS + 'מקצועי מאשה/MAR_2005.jpg',
    'dummy': PHOTOS + 'אילנה /IMG_5159.JPG',
    'winner': PHOTOS + 'סשה/ilana-kratysh.jpg',
    'groundwork': PHOTOS + 'תמונות ישנות/67226925_2291599507556466_868758093117259776_n.jpg',
    'podium-cadet': PHOTOS + 'סשה/IMG-20220522-WA0000.jpg',
    'podium-riga': PHOTOS + 'סשה/WhatsApp Image 2022-08-28 at 12.34.12 (1).jpeg',
    'podium-israel': PHOTOS + 'תמונות ישנות/180668663_3881296895253378_1929060378854949507_n.jpg',
    'flag-jump-kids': PHOTOS + 'תמונות ג_ודו מקצועי/MAR_1398.jpg',
    'coaches-lineup': PHOTOS + 'מקצועי מאשה/MAR_2179.jpg',
    'coaches-pair': PHOTOS + 'מקצועי מאשה/MAR_2216.jpg',
    'club-banner': PHOTOS + 'מקצועי מאשה/MAR_2047.jpg',
    'beach-team': PHOTOS + 'תמונות לעירוני א/016.jpg',
    'beach-throw': PHOTOS + 'לפלייר/IMG_0018.JPG',
    'beach-grips': PHOTOS + 'לפלייר/IMG_0021.JPG',
    'beach-workout': PHOTOS + 'תמונות לעירוני א/015.jpg',
    'beach-jump': PHOTOS + 'תמונות של מאמנים/IMG-3291.JPG',
    'team-hug': PHOTOS + 'האלופים רמה בינלאומית/WhatsApp Image 2022-08-28 at 12.34.06.jpeg',
    'rope-climb': NIGHT + 'rope-climb.jpg',
}

OGA = 'https://opengameart.org/sites/default/files/'
# "Hero Suite A" by some-weirdo, CC0: https://opengameart.org/content/hero-suite-a
MUSIC = OGA + 'dime_no_loop.ogg'
# All CC0 on OpenGameArt: name -> (url, file inside the zip or None)
SFX = {
    'whoosh': (OGA + 'qubodup-timehitwind.zip', 'qubodup-megaswosh1.wav'),  # /content/wind-hit-time-morph
    'slomo': (OGA + 'qubodup-timehitwind.zip', 'qubodup-slomo1.wav'),
    'hit': (OGA + 'sfx_breaking_and_falling.zip', 'bfh1_hit_02.ogg'),  # /content/75-cc0-breaking-falling-hit-sfx
    'heart': (OGA + 'heartbeat_slow_reverb.wav', None),  # /content/heartbeat-sounds
    'breath': (OGA + 'breathing%20tired.wav', None),  # /content/breathing-tired
}


def run(*a):
    subprocess.run(a, check=True)


def clip(name, v, ss, dur, front):
    slow = v in ('V01', 'V02', 'V03')
    pre = ['setpts=PTS*100/30', 'fps=30', 'scale=2560:-2:flags=lanczos'] if slow else ['fps=30']
    run('ffmpeg', '-v', 'error', '-y', '-ss', str(ss), '-t', str(dur), '-i', FILES[v], '-an',
        '-vf', ','.join(pre + [front, LOOK]), '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-g', '10',
        '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-movflags', '+faststart', f'{OUT}clips/{name}.mp4')


def photo(name, path):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    im.thumbnail((2400, 2400), Image.LANCZOS)
    im.save(f'{OUT}photos/{name}.jpg', quality=90, optimize=True)  # re-encode drops EXIF/GPS


def sfx(name, url, member, tmp):
    src = os.path.join(tmp, os.path.basename(url))
    if not os.path.exists(src):
        run('curl', '-sfL', '-o', src, url)
    if member:
        with zipfile.ZipFile(src) as z:
            inner = next(n for n in z.namelist() if n.endswith('/' + member) or n == member)
            src = os.path.join(tmp, member)
            with open(src, 'wb') as f:
                f.write(z.read(inner))
    # levels vary wildly between packs; bring each to the same loudness
    run('ffmpeg', '-v', 'error', '-y', '-i', src, '-af', 'loudnorm=I=-16:TP=-1', '-ar', '48000', '-ac', '2', f'{OUT}sfx/{name}.wav')


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
    for d in ('clips', 'photos', 'sfx'):
        os.makedirs(OUT + d, exist_ok=True)
    for name, spec in CLIPS.items():
        clip(name, *spec)
    for name, path in PHOTO_SET.items():
        photo(name, path)
    with tempfile.TemporaryDirectory() as tmp:
        for name, (url, member) in SFX.items():
            sfx(name, url, member, tmp)
    if not os.path.exists(OUT + 'hero-suite-a.ogg'):
        run('curl', '-sfL', '-o', OUT + 'hero-suite-a.ogg', MUSIC)
    print('ok')
