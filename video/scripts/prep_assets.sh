#!/bin/sh
# Rebuilds everything in public/ except fonts. Needs python3 + Pillow + numpy, ffmpeg, curl.
# Usage: scripts/prep_assets.sh <assets/source dir>
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

python3 -I scripts/prep_photos.py "$1"
curl -sfL -o "$tmp/land.geojson" https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
python3 -I scripts/prep_media.py "$1" "$tmp/land.geojson"

python3 -I - <<'EOF'
import numpy as np
from PIL import Image
Image.open('../public/brand/logo.png').save('public/logo.png', optimize=True)
rng = np.random.default_rng(7)
n = rng.normal(128, 40, (512, 512)).clip(0, 255).astype('uint8')
Image.fromarray(n, 'L').save('public/grain.png', optimize=True)
EOF

# Kevin MacLeod tracks, CC BY 4.0 (credit lines in README). Offsets sit on each track's beat grid.
mkdir -p public/audio
base=https://incompetech.com/music/royalty-free/mp3-royaltyfree
curl -sfL -o "$tmp/emperor.mp3" "$base/Mountain%20Emperor.mp3"
curl -sfL -o "$tmp/finding.mp3" "$base/Finding%20Movement.mp3"
norm=loudnorm=I=-14:TP=-1.5:LRA=11
# Ilana: 16 bars from the top, then the last section and the real ending (both cut on a bar line).
ffmpeg -v error -y -i "$tmp/emperor.mp3" -filter_complex \
    "[0]atrim=0.743:32.743,asetpts=N/SR/TB[a];[0]atrim=184.743:195.5,asetpts=N/SR/TB[b];[a][b]acrossfade=d=0.04,$norm" \
    -map_metadata -1 -ar 48000 -c:a aac -b:a 192k public/audio/ilana.m4a
# Natanel: from the quiet koto line through the string build; 3 s fade under the end card.
ffmpeg -v error -y -ss 20.052 -t 47 -i "$tmp/finding.mp3" -af "afade=t=out:st=44:d=3,$norm" \
    -map_metadata -1 -ar 48000 -c:a aac -b:a 192k public/audio/natanel.m4a
