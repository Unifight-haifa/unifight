#!/bin/sh
# Usage: scripts/render.sh <coach> <lang> <format> <out.mp4> [extra remotion flags]
#   coach: ilana | natanel   lang: ru | he | en   format: 16x9 | 9x16
set -eu
cd "$(dirname "$0")/.."
coach=$1 lang=$2 format=$3 out=$4
shift 4
props="{\"coach\":\"$coach\",\"lang\":\"$lang\",\"format\":\"$format\"}"
npx remotion render src/index.jsx CoachProfile "$out" --props="$props" \
    --codec=h264 --pixel-format=yuv420p --image-format=png --color-space=bt709 \
    --crf=18 --x264-preset=slow --audio-bitrate=192k "$@"
