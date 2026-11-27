#!/usr/bin/env python3
"""Census finish: PNG captures -> JPEG (quality 82) + index.json, copied to the project folder.
   python3 scripts/auto/census/finish.py [outdir=/home/user/work/census/out] [dest=/mnt/project-files/edu-rpg/autoloop/census/]"""
import sys, os, json, shutil
from PIL import Image
src = sys.argv[1] if len(sys.argv) > 1 else '/home/user/work/census/out'
dst = sys.argv[2] if len(sys.argv) > 2 else '/mnt/project-files/edu-rpg/autoloop/census/'
jdir = os.path.join(src, 'jpg'); os.makedirs(jdir, exist_ok=True); os.makedirs(dst, exist_ok=True)
rows = {}
with open(os.path.join(src, 'index.jsonl')) as f:
    for line in f:
        line = line.strip()
        if not line: continue
        r = json.loads(line); rows[r['file']] = r          # a re-capture replaces the older row
out = []
for name, r in sorted(rows.items()):
    png = os.path.join(src, name[:-4] + '.png')
    if not os.path.exists(png): continue
    jpg = os.path.join(jdir, name)
    if not os.path.exists(jpg) or os.path.getmtime(jpg) < os.path.getmtime(png):
        Image.open(png).convert('RGB').save(jpg, quality=82, optimize=True)
    shutil.copyfile(jpg, os.path.join(dst, name))
    out.append(r)
idx = {'generated': __import__('datetime').datetime.now().isoformat(timespec='seconds'), 'viewport': '390x844 CSS px, deviceScaleFactor 2 (780x1688 files)',
       'count': len(out), 'images': out}
with open(os.path.join(dst, 'index.json'), 'w') as f: json.dump(idx, f, indent=1, ensure_ascii=False)
print('images', len(out))
