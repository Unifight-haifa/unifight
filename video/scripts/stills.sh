#!/bin/sh
# Grabs a frame every 3 s (plus the last one) from a render into checks/.
# Usage: scripts/stills.sh <video.mp4> <prefix>
set -eu
cd "$(dirname "$0")/.."
mkdir -p checks
ffmpeg -v error -y -i "$1" -vf "fps=1/3" -q:v 3 "checks/$2-%02d.jpg"
ffmpeg -v error -y -sseof -0.9 -i "$1" -frames:v 1 -q:v 3 "checks/$2-end.jpg"
