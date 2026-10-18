#!/bin/sh
# Cuts the landing's silent film loop from the promo master: public/videos/club-teaser.{webm,mp4,jpg}.
# Usage: sh scripts/landing/teaser.sh ~/Desktop/unifight-promo/unifight-promo-16x9.mp4
set -eu
SRC=$1
OUT=$(dirname "$0")/../../public/videos/club-teaser
# start, length, crop: 1 keeps the top above the burned-in captions, 0 trims the corner kanji mark
SHOTS='7.4 1.6 1
11.0 1.6 1
14.7 1.6 1
16.5 1.6 1
18.3 1.6 1
32.8 1.6 1
34.7 2.7 0
41.0 0.8 0'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
i=0
echo "$SHOTS" | while read -r ss len crop; do
    vf="crop=iw*0.86:ih*0.86:0:ih*0.14,scale=960:540"
    [ "$crop" = 1 ] && vf="crop=iw*0.68:ih*0.68:(iw-ow)/2:0,scale=960:540"
    ffmpeg -nostdin -v error -y -ss "$ss" -t "$len" -i "$SRC" -an -vf "$vf,fps=30,format=yuv420p" -c:v libx264 -crf 12 "$TMP/$i.mp4"
    echo "file '$TMP/$i.mp4'" >>"$TMP/list"
    i=$((i + 1))
done
ffmpeg -v error -y -f concat -safe 0 -i "$TMP/list" -c copy "$TMP/all.mp4"
ffmpeg -v error -y -i "$TMP/all.mp4" -c:v libsvtav1 -crf 48 -preset 4 -g 60 "$OUT.webm" 2>/dev/null
ffmpeg -v error -y -i "$TMP/all.mp4" -c:v libx264 -profile:v high -crf 31 -preset slow -g 60 -movflags +faststart "$OUT.mp4"
# the poster is the medal shot, the first frame people see before the loop starts
ffmpeg -v error -y -ss 35.5 -i "$SRC" -frames:v 1 -vf crop=iw*0.86:ih*0.86:0:ih*0.14,scale=960:540 -q:v 5 "$OUT.jpg"
ls -l "$OUT".*
