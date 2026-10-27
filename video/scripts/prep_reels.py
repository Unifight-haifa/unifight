"""Builds public/reel/ (clips + music) for the three club reels: sumo, sukkot, camps.

Usage: python3 -I scripts/prep_reels.py <archive Videos dir> [yolo pose weights]
Needs ffmpeg and curl; the Sukkot clips also need ultralytics + a YOLOv8 pose model
(default yolov8m-pose.pt, fetched by ultralytics). Output is gitignored.
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_promo import HLG, LOOK  # noqa: E402

SRC = sys.argv[1].rstrip('/') + '/'
WEIGHTS = sys.argv[2] if len(sys.argv) > 2 else 'yolov8m-pose.pt'
OUT = 'public/reel/'
PHONE = 'eq=contrast=1.06:saturation=1.05'

GEO = '2024-02-20 Сборы в Грузии (מחנה אימונים גיאורגיה 2-24)/'
DE = '2023-05-11 Германия — сборы и турнир (גרמניה)/'
KIN = '2022-08-19 Выезд на Кинерет (כנרת)/'
SUK = '2023-10-01 Сборы на Суккот (מחנה אימונים סוכות)/'

# name: (file, start s, length s or None, front end, keep live sound, blur back patches)
CLIPS = {
    'sumo': ('_Темы/Сумо, тренировки (סומו - תמונות מאימונים)/2023-06-08_1908_IMG_9340.MOV', 0, None, PHONE, True, False),
    'suk-wide': (SUK + '2023-10-04_1146_IMG_0711.MOV', 0, None, HLG, True, True),
    'suk-randori': (SUK + '2023-10-04_1217_IMG_0727.MOV', 0, None, HLG, True, True),
    'g-snow': (GEO + 'Снег, поездка в Гудаури (תמונת בשלג-טיול לגודאורי)/2024-02-25_0815_20240225_101550.mp4', 0, None, PHONE, False, False),
    'g-city': (GEO + 'Прогулки по городу и еда (טיולים בעיר ואוכל)/VID_33790424_012354_765.mp4', 0, None, PHONE, False, False),
    'g-run': (GEO + 'Тренировки (אימונים)/2024-02-24_1053_IMG_2380.MOV', 0, None, HLG, False, False),
    'g-rope': (GEO + 'Тренировки (אימונים)/2024-02-21_1222_IMG_2259.MOV', 0, None, HLG, False, False),
    'g-rope2': (GEO + 'Тренировки (אימונים)/2024-02-21_1222_IMG_2260.MOV', 0, None, HLG, False, False),
    'd-slide': (DE + 'Аквапарк (פארק מים)/2023-05-15_1504_IMG_8993.MOV', 0, None, HLG, False, False),
    'd-zip': (DE + 'Верёвочный парк (פארק חבלים)/2023-05-16_1253_IMG_9017.MOV', 0, 14, HLG, False, False),
    'k-flip': (KIN + '2022-08-19_2014_IMG_5937.MOV', 0, None, PHONE, False, False),
    'k-carry': (KIN + '2022-08-19_2014_IMG_5936.MOV', 0, None, PHONE, False, False),
    't-north': ('2023-01-28 Чемпионат Севера (אליפויות צפון המהלך השנה)/2023-01-28_0945_F930CF0B-6291-48A2-B683-D2AC715491F2.mp4', 0, None, PHONE, False, False),
    't-huddle': ('2023-03-25 Международный турнир в Ришон-ле-Ционе (בינלאומית רשלצ)/2023-03-25_0900_IMG_8187.MOV', 0, None, HLG, False, False),
    't-cheer': ('2023-03-25 Международный турнир в Ришон-ле-Ционе (בינלאומית רשלצ)/2023-03-25_0900_IMG_8188.MOV', 0, 2.6, HLG, False, False),
    't-medal': (DE + 'Видео боёв (וודיאו של הקרבות)/מאיה/2023-05-14_1541_20230514_144144.mp4', 0, None, PHONE, False, False),
}

INC = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/'
# Kevin MacLeod (incompetech.com), CC BY 4.0; credits go in each video description
MUSIC = {'volatile-reaction': 'Volatile%20Reaction', 'hitman': 'Hitman', 'five-armies': 'Five%20Armies'}


def run(*a):
    subprocess.run(a, check=True)


def blur_backs(src, dst):
    """Blur judogi back patches (they carry athletes' names): a light block with lettering ringed by a
    blue jacket, or a blue band ringed by a white one, searched in the upper body of each large person."""
    import cv2
    import numpy as np
    from ultralytics import YOLO

    HOLD, GROW = 8, 1.3  # boxes held either side to cover detector drop-outs
    model = YOLO(WEIGHTS)
    k9, k25 = (cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (n, n)) for n in (9, 25))

    def find(inner, outer, lo, hi):
        n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(inner, cv2.MORPH_CLOSE, k9))
        for i in range(1, n):
            if not lo <= st[i, cv2.CC_STAT_AREA] <= hi:
                continue
            comp = (lab == i).astype(np.uint8)
            ring = cv2.dilate(comp, k25) - comp
            if outer[ring > 0].mean() >= 0.4 and 0.04 <= 1 - inner[comp > 0].mean() <= 0.6:
                cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                yield cv2.minAreaRect(max(cnts, key=cv2.contourArea))

    cap = cv2.VideoCapture(src)
    W, H = int(cap.get(3)), int(cap.get(4))
    boxes = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        h, s, v = cv2.split(cv2.cvtColor(fr, cv2.COLOR_BGR2HSV))
        white = ((s < 75) & (v > 140)).astype(np.uint8)
        blue = ((h > 95) & (h < 135) & (s > 80) & (v > 35)).astype(np.uint8)
        bx = []
        for x0, y0, x1, y1 in model.predict(fr, imgsz=1280, conf=0.25, verbose=False)[0].boxes.xyxy.cpu().numpy().astype(int):
            ph = y1 - y0
            if ph < 330:  # background people: lettering too small to read
                continue
            sl = (slice(y0, y0 + int(ph * 0.62)), slice(x0, x1))
            for inner, outer in ((white, blue), (blue, white)):
                for (cx, cy), (w, hh), a in find(inner[sl], outer[sl], max(900, (0.09 * ph) ** 2), (0.5 * ph) ** 2):
                    bx.append(((cx + x0, cy + y0), (w * GROW + 20, hh * GROW + 20), a))
        boxes.append(bx)
    cap.release()

    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '30',
                            '-i', '-', '-c:v', 'libx264', '-crf', '10', '-preset', 'fast', '-pix_fmt', 'yuv420p', dst],
                           stdin=subprocess.PIPE)
    cap = cv2.VideoCapture(src)
    for i in range(len(boxes)):
        fr = cap.read()[1]
        held = [b for j in range(max(0, i - HOLD), min(len(boxes), i + HOLD + 1)) for b in boxes[j]]
        if held:
            mask = np.zeros((H, W), np.float32)
            cv2.fillPoly(mask, [np.int32(cv2.boxPoints(b)) for b in held], 1)
            mask = cv2.GaussianBlur(mask, (0, 0), 10)[..., None]
            # pixelate, then blur: no stroke of a letter survives
            small = cv2.resize(fr, (W // 24, H // 24), interpolation=cv2.INTER_AREA)
            soft = cv2.GaussianBlur(cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), 8)
            fr = (fr * (1 - mask) + soft * mask).astype(np.uint8)
        enc.stdin.write(fr.tobytes())
    enc.stdin.close()
    if enc.wait():
        sys.exit('ffmpeg failed on ' + dst)


def clip(name, path, ss, dur, front, sound, blur):
    cut = ['-ss', str(ss)] + (['-t', str(dur)] if dur else [])
    # ffmpeg applies the rotation tag itself, so portrait phone clips come out upright
    fit = 'scale=w=1920:h=1920:force_original_aspect_ratio=decrease:flags=lanczos'
    enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-g', '15', '-pix_fmt', 'yuv420p',
           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart']
    audio = ['-c:a', 'aac', '-b:a', '160k'] if sound else ['-an']
    out = f'{OUT}{name}.mp4'
    if not blur:
        run('ffmpeg', '-v', 'error', '-y', *cut, '-i', SRC + path, '-vf', f'fps=30,{fit},{front},{LOOK}', *audio, *enc, out)
        return
    # blur on the tone-mapped picture, then grade and put the live sound back
    tm, bl = out + '.tm.mp4', out + '.bl.mp4'
    run('ffmpeg', '-v', 'error', '-y', *cut, '-i', SRC + path, '-an', '-vf', f'fps=30,{fit},{front}',
        '-c:v', 'libx264', '-crf', '10', '-preset', 'fast', '-pix_fmt', 'yuv420p', tm)
    blur_backs(tm, bl)
    run('ffmpeg', '-v', 'error', '-y', '-i', bl, *cut, '-i', SRC + path, '-map', '0:v', '-map', '1:a', '-shortest',
        '-vf', LOOK, *audio, *enc, out)
    os.remove(tm)
    os.remove(bl)


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
    os.makedirs(OUT, exist_ok=True)
    only = set(os.environ.get('ONLY', '').split()) - {''}
    for name, spec in CLIPS.items():
        if not only or name in only:
            clip(name, *spec)
    for name, title in MUSIC.items():
        if not os.path.exists(f'{OUT}{name}.mp3'):
            run('curl', '-sfL', '-o', f'{OUT}{name}.mp3', INC + title + '.mp3')
    print('ok')
