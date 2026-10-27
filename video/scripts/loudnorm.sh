#!/bin/sh
# Usage: scripts/loudnorm.sh <raw.mp4> <out.mp4>
# Two-pass loudnorm to -14 LUFS, applied linearly so the music's dynamics survive. Video is copied.
set -eu
raw=$1 out=$2
m=$(ffmpeg -hide_banner -i "$raw" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { printf '%s' "$m" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -v error -y -i "$raw" -c:v copy \
    -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" \
    -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$out"
