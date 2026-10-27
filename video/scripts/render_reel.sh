#!/bin/sh
# Usage: scripts/render_reel.sh <sumo|sukkot|camps> <out.mp4>   (needs public/reel and public/promo/sfx)
set -eu
cd "$(dirname "$0")/.."
reel=$1 out=$2
raw="${out%.mp4}.raw.mp4"
npx remotion render src/index.jsx Reel "$raw" --props="{\"reel\":\"$reel\"}" \
    --codec=h264 --pixel-format=yuv420p --image-format=jpeg --jpeg-quality=95 --color-space=bt709 \
    --crf=18 --x264-preset=slow --audio-bitrate=192k --log=error
scripts/loudnorm.sh "$raw" "$out"
rm "$raw"
