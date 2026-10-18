#!/bin/sh
# Usage: scripts/render_promo.sh <lang> <format> <out.mp4>   (lang: ru|he|en, format: 16x9|9x16)
# Writes <out.mp4> at -14 LUFS and a 720p preview next to it (<out>-720p.mp4).
set -eu
cd "$(dirname "$0")/.."
lang=$1 format=$2 out=$3
raw="${out%.mp4}.raw.mp4"
npx remotion render src/index.jsx Promo "$raw" --props="{\"lang\":\"$lang\",\"format\":\"$format\"}" \
    --codec=h264 --pixel-format=yuv420p --image-format=jpeg --jpeg-quality=95 --color-space=bt709 \
    --crf=20 --x264-preset=slow --audio-bitrate=192k --log=error

# Two-pass loudnorm: measure, then apply linearly so the music's dynamics survive.
m=$(ffmpeg -hide_banner -i "$raw" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { printf '%s' "$m" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$raw" -c:v copy \
    -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
    -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$out"
rm "$raw"

ffmpeg -v error -y -i "$out" -vf "scale=720:720:force_original_aspect_ratio=increase:flags=lanczos" \
    -c:v libx264 -preset slow -crf 24 -maxrate 2200k -bufsize 4400k -pix_fmt yuv420p \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 -c:a aac -b:a 128k -movflags +faststart "${out%.mp4}-720p.mp4"
