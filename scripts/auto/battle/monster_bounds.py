#!/usr/bin/env python3
"""Painted bounds of every HD monster sprite (battle finding B7, day 4).

The battle screen used to size an enemy from its canvas, so on-screen size followed the padding in
the art file. This measures each sprite's alpha box once, offline, so the game never has to read
pixels at run time.

    python3 scripts/auto/battle/monster_bounds.py            # print the table for ui-overhaul.js
    python3 scripts/auto/battle/monster_bounds.py --check    # exit 1 if MON_BOX in ui-overhaul.js is stale

Each row is [canvasW, canvasH, left, top, right, bottom] in source pixels (right/bottom exclusive),
alpha > 24 counts as painted. Paste the printed block over MON_BOX in public/ui-overhaul.js when a
sprite in public/assets/monsters-hd/ changes.
"""
import glob, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = os.path.join(ROOT, 'public/assets/monsters-hd')
JS = os.path.join(ROOT, 'public/ui-overhaul.js')
ALPHA = 24


def measure():
    rows = {}
    for f in sorted(glob.glob(os.path.join(SRC, 'monster-*.webp'))):
        im = Image.open(f).convert('RGBA')
        a = im.getchannel('A').point(lambda v: 255 if v > ALPHA else 0)
        box = a.getbbox() or (0, 0, im.width, im.height)
        rows[os.path.basename(f)[len('monster-'):-len('.webp')]] = [im.width, im.height, box[0], box[1], box[2], box[3]]
    return rows


def table(rows):
    out, line = [], '   '
    for k, v in rows.items():
        cell = ' %s:[%s],' % (k, ','.join(str(n) for n in v))
        if len(line) + len(cell) > 150:
            out.append(line); line = '   '
        line += cell
    out.append(line.rstrip(','))
    return '  var MON_BOX = {\n' + '\n'.join(out) + '\n  };'


if __name__ == '__main__':
    rows = measure()
    text = table(rows)
    if '--check' in sys.argv:
        src = open(JS, encoding='utf8').read()
        m = re.search(r'  var MON_BOX = \{\n.*?\n  \};', src, re.S)
        ok = bool(m) and m.group(0) == text
        print('[%s] MON_BOX in public/ui-overhaul.js matches the %d sprites in public/assets/monsters-hd' % ('PASS' if ok else 'FAIL', len(rows)))
        sys.exit(0 if ok else 1)
    print(text)
