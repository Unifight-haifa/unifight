#!/bin/sh
# Usage: scripts/render_promo.sh <format> <out.mp4>   (format: 16x9|9x16)
# Writes <out.mp4> at -14 LUFS and a 720p preview next to it (<out>-720p.mp4).
set -eu
cd "$(dirname "$0")/.."
format=$1 out=$2
raw="${out%.mp4}.raw.mp4"
npx remotion render src/index.jsx Promo "$raw" --props="{\"format\":\"$format\"}" \
    --codec=h264 --pixel-format=yuv420p --image-format=jpeg --jpeg-quality=95 --color-space=bt709 \
    --crf=20 --x264-preset=slow --audio-bitrate=192k --log=error

scripts/loudnorm.sh "$raw" "$out"
rm "$raw"

ffmpeg -v error -y -i "$out" -vf "scale=720:720:force_original_aspect_ratio=increase:flags=lanczos" \
    -c:v libx264 -preset slow -crf 24 -maxrate 2200k -bufsize 4400k -pix_fmt yuv420p \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a aac -b:a 128k -movflags +faststart "${out%.mp4}-720p.mp4"
