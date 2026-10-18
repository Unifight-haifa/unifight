#!/bin/sh
# Usage: scripts/render.sh <coach> <format> <out.mp4> [extra remotion flags]
#   coach: ilana | natanel   format: 16x9 | 9x16
set -eu
cd "$(dirname "$0")/.."
coach=$1 format=$2 out=$3
shift 3
props="{\"coach\":\"$coach\",\"format\":\"$format\"}"
npx remotion render src/index.jsx CoachProfile "$out" --props="$props" \
    --codec=h264 --pixel-format=yuv420p --image-format=png --color-space=bt709 \
    --crf=18 --x264-preset=slow --audio-bitrate=192k "$@"
