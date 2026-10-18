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
curl -sfL -o "$tmp/heroic.mp3" "$base/Heroic%20Age.mp3"
curl -sfL -o "$tmp/getaway.mp3" "$base/Mistake%20the%20Getaway.mp3"
norm=loudnorm=I=-14:TP=-1.5:LRA=11
# Ilana: 130.01 BPM; two build bars before the full-band entrance, through the track's own ending.
ffmpeg -v error -y -i "$tmp/heroic.mp3" -af "atrim=48.920:92.4,asetpts=N/SR/TB,$norm" \
    -map_metadata -1 -ar 48000 -c:a aac -b:a 192k public/audio/ilana.m4a
# Natanel: 141 BPM; last 4 bars of the dip, the return, one repeat of a 16-beat phrase, the real ending.
ffmpeg -v error -y -i "$tmp/getaway.mp3" -filter_complex \
    "[0]atrim=82.535:101.278,asetpts=N/SR/TB[a];[0]atrim=94.450:121,asetpts=N/SR/TB,afade=t=out:st=25.9:d=0.65[b];[a][b]acrossfade=d=0.02,$norm" \
    -map_metadata -1 -ar 48000 -c:a aac -b:a 192k public/audio/natanel.m4a
