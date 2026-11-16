#!/usr/bin/env python3
"""Bake the overworld minimap for the Acts 2-5 world: public/acts-hifi/overworld-relief.png.

    python3 scripts/acts/bake_acts_minimap.py        # after scripts/build_acts_hifi_manifest.py

public/ui-map/overworld-relief.png (scripts/bake_overworld_minimap.py) is the bundle's OLD
geography outside Act 1. This bakes the same "Relief" picture, with the same functions, palette
and 6 px per cell, from the world the game now collides with:
  Act 1's rectangle   copied pixel for pixel from the shipped relief (never re-derived)
  Acts 2-5            the owner's class raster as painted (scripts/acts/acts_common.world()):
                      forest / mountain / water / sea block; open ground is drawn as ice in
                      Act 2, desert in Acts 3-4 and ground in Act 5
  nobody's cells      sea
The pins are the index's doors plus Act 1's own pins from the shipped table. Both are handed to
ui-overhaul.js by acts-runtime.js (window.__QOK_MINIMAP__.set); with that runtime switched off
nothing calls it and the shipped relief and table stay in use.
"""
import json, os, re, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(ROOT, 'scripts'))
os.environ.setdefault('ACTS_VARIANT', 'C')
import acts_common as A          # noqa: E402
import world_lib as W            # noqa: E402
import bake_overworld_minimap as BM  # noqa: E402

OLD = os.path.join(ROOT, 'public/ui-map/overworld-relief.png')
OUT = os.path.join(ROOT, 'public/acts-hifi/overworld-relief.png')
OUT_MARKS = os.path.join(ROOT, 'public/acts-hifi/minimap.json')
OPEN_CLASS = {2: 'ice', 3: 'desert', 4: 'desert', 5: 'ground'}


def main():
    S = BM.BAKE_PX
    cls, act_of, _land = A.world()
    idx_of = BM.CLASSES.index
    truth = np.full((W.GH, W.GW), idx_of('water'), np.int64)
    for n, name in OPEN_CLASS.items():
        truth[(act_of == n) & (cls == A.OPEN)] = idx_of(name)
    truth[(act_of >= 2) & (cls == A.FOREST)] = idx_of('forest')
    truth[(act_of >= 2) & (cls == A.MOUNT)] = idx_of('rock')
    rows, _ = W.act1_js()
    x0, y0, x1, y1 = W.A1
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            truth[y0 + j, x0 + i] = idx_of(BM.CLASS_OF_TILE[int(ch, 36)])
    fields, lab, iters = BM.build_fields(truth, S)
    BM.assert_centres(lab, truth, S)
    idx, palette = BM.colourise(lab, truth, S)
    rgb = np.array(palette, np.uint8)[idx]
    old = np.asarray(Image.open(OLD).convert('RGB'))
    assert old.shape == rgb.shape, (old.shape, rgb.shape)
    rgb[y0 * S:(y1 + 1) * S, x0 * S:(x1 + 1) * S] = old[y0 * S:(y1 + 1) * S, x0 * S:(x1 + 1) * S]
    out = Image.fromarray(rgb, 'RGB').quantize(colors=64, method=Image.MEDIANCUT, dither=Image.NONE)
    back = np.asarray(out.convert('RGB'))
    a1_exact = bool((back[y0 * S:(y1 + 1) * S, x0 * S:(x1 + 1) * S] == old[y0 * S:(y1 + 1) * S, x0 * S:(x1 + 1) * S]).all())
    assert a1_exact, 'Act 1 pixels changed in quantisation'
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.save(OUT, optimize=True)

    # Pins: Act 1's from the shipped table (inside its rectangle), the rest from the index's doors.
    src = open(os.path.join(ROOT, 'public/ui-overhaul.js'), encoding='utf-8').read()
    shipped = json.loads(re.search(r'var MM_MARKS = (\[.*?\]);\n', src).group(1))
    marks = [m for m in shipped if x0 <= m[1] <= x1 and y0 <= m[2] <= y1]
    index = json.load(open(os.path.join(ROOT, 'public/acts-hifi/manifest.json')))
    for L in index['landmarks']:
        kind = BM.MARK_TILES.get(L['tile'], 'dungeon')
        if L['tile'] == 16: kind = 'dungeon'
        marks.append([BM.MM_KINDS.index(kind), L['at'][0], L['at'][1]])
    marks.sort(key=lambda m: (m[2], m[1]))
    json.dump({'src': 'acts-hifi/overworld-relief.png', 'kinds': list(BM.MM_KINDS), 'marks': marks},
              open(OUT_MARKS, 'w'), separators=(',', ':'))
    print(f'wrote {OUT} {rgb.shape[1]}x{rgb.shape[0]} {os.path.getsize(OUT):,} B; {len(marks)} pins; Act 1 pixel-exact: {a1_exact}')


if __name__ == '__main__':
    main()
