#!/bin/bash
# Varias capturas: tools/shots.sh prefijo "query1" "query2" ...
SHOT=/tmp/claude-0/-home-claude/ccddaae7-1a3e-50c7-aafc-c7e29b812582/scratchpad
pre=$1; shift; i=0
for q in "$@"; do node /home/claude/mary/tools/shot.mjs "$q" $SHOT/${pre}_$i.png ${W:-700} ${H:-700} & i=$((i+1)); done; wait
python3 - "$SHOT" "$pre" "$i" <<'PY'
import sys
from PIL import Image
d,pre,n=sys.argv[1],sys.argv[2],int(sys.argv[3])
ims=[Image.open(f"{d}/{pre}_{k}.png") for k in range(n)]
w=sum(im.width for im in ims); h=max(im.height for im in ims)
s=Image.new('RGB',(w,h)); x=0
for im in ims: s.paste(im,(x,0)); x+=im.width
s.save(f"{d}/{pre}.png")
PY
