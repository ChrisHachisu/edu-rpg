#!/usr/bin/env python3
"""Install an Acts 2-5 overworld export into public/act{N}-hifi/ (the folders acts-runtime.js streams).

    python3 scripts/acts/install_runtime.py <export root> [2 3 4 5]

<export root>/actN/runtime/ is the output of scripts/acts/export_runtime.py followed by
scripts/acts/export_collision_bin.py (format flattened-ground-v0), or the stand-in written by
scripts/acts/placeholder_runtime.py. Copied: chunks/, the landmark sprites of landmarks that are
not `carved`, collision.bin and a manifest.json without the sprite masks (they are already in the
pack). Written new: underpaint.webp, a 4 px-per-cell picture of the whole act that shows under a
chunk that has not landed yet. NOT copied: collision.png / walkbehind.* (the game reads the .bin
and the `front` chunks) and full.png / overview.png.

Run scripts/build_acts_hifi_manifest.py afterwards: it writes each act's plate.json and the index.
"""
import json, os, shutil, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UNDER_PPC = 4


def install(src_root, act):
    src = os.path.join(src_root, f'act{act}', 'runtime')
    dst = os.path.join(ROOT, 'public', f'act{act}-hifi')
    m = json.load(open(os.path.join(src, 'manifest.json')))
    assert m['act'] == act and m.get('format') == 'flattened-ground-v0', (act, m.get('format'))
    for need in ('collision.bin', 'collision.json'):
        assert os.path.isfile(os.path.join(src, need)), f'{src}/{need} missing: run scripts/acts/export_collision_bin.py'
    side = json.load(open(os.path.join(src, 'collision.json')))
    if os.path.isdir(dst): shutil.rmtree(dst)
    os.makedirs(dst)
    shutil.copytree(os.path.join(src, 'chunks'), os.path.join(dst, 'chunks'))
    shutil.copy(os.path.join(src, 'collision.bin'), os.path.join(dst, 'collision.bin'))
    x0, y0, x1, y1 = m['bounds']
    w, h = x1 - x0 + 1, y1 - y0 + 1
    under = Image.new('RGB', (w * UNDER_PPC, h * UNDER_PPC), (20, 52, 96))
    for c in m['chunks']:
        im = Image.open(os.path.join(src, c['ground'])).convert('RGB')
        cw, ch = c['width'] // 16, c['height'] // 16                    # chunk size in cells (16 manifest px per cell)
        im = im.resize((cw * UNDER_PPC, ch * UNDER_PPC), Image.BOX)
        under.paste(im, (c['x'] // 16 * UNDER_PPC, c['y'] // 16 * UNDER_PPC))
    under.save(os.path.join(dst, 'underpaint.webp'), 'WEBP', quality=80, method=4)
    marks = []
    for L in m.get('landmarks', []):
        L = {k: v for k, v in L.items() if k != 'maskB64'}
        if not L.get('carved'):
            sp = os.path.join(src, 'landmarks', L['slug'] + '.png')
            if os.path.isfile(sp):
                os.makedirs(os.path.join(dst, 'landmarks'), exist_ok=True)
                shutil.copy(sp, os.path.join(dst, 'landmarks', L['slug'] + '.png'))
            else:
                L['carved'] = True                                       # no sprite file: nothing to draw
        marks.append(L)
    out = {k: v for k, v in m.items() if k not in ('landmarks', 'collision')}
    out['collision'] = {'file': 'collision.bin', 'format': 'QOKF8COL', 'pixelsPerCell': 32,
                        'width': side.get('width', w * 32), 'height': side.get('height', h * 32)}
    out['underpaint'] = {'file': 'underpaint.webp', 'pixelsPerCell': UNDER_PPC}
    out['landmarks'] = marks
    json.dump(out, open(os.path.join(dst, 'manifest.json'), 'w'), separators=(',', ':'))
    mb = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(dst) for f in fs) / 1e6
    print(f'act {act}: {len(m["chunks"])} chunks, {len(marks)} landmarks, {mb:.1f} MB -> {dst}'
          + (' (PLACEHOLDER)' if m.get('placeholder') else ''))


if __name__ == '__main__':
    root = sys.argv[1]
    for a in [int(v) for v in sys.argv[2:]] or [2, 3, 4, 5]:
        install(root, a)
