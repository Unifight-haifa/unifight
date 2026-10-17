#!/bin/sh
# Rebuilds everything in public/ except fonts. Needs python3 + Pillow + numpy, ffmpeg, curl.
# Usage: scripts/prep_assets.sh <owner originals dir>
set -eu
cd "$(dirname "$0")/.."
python3 -I scripts/prep_photos.py "$1"

python3 -I - <<'EOF'
import numpy as np
from PIL import Image
Image.open('../public/brand/logo.png').save('public/logo.png', optimize=True)
rng = np.random.default_rng(7)
n = rng.normal(128, 40, (512, 512)).clip(0, 255).astype('uint8')
Image.fromarray(n, 'L').save('public/grain.png', optimize=True)
EOF

# CC0 track; the cut starts 3 beats (76 BPM) before the drop at 82.09 s.
# The master peaks above 0 dBFS, so normalise to the YouTube target here.
mkdir -p public/audio
tmp=$(mktemp -d)
curl -sfL -o "$tmp/t.mp3" "https://opengameart.org/sites/default/files/Generic%20Trailer%20Music_0.mp3"
ffmpeg -v error -y -ss 79.72 -t 50 -i "$tmp/t.mp3" -map_metadata -1 -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 -c:a aac -b:a 192k public/audio/trailer.m4a
rm -rf "$tmp"
