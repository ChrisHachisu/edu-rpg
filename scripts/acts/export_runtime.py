#!/usr/bin/env python3
"""Runtime export (flattened format, lead's lag-study target, not locked yet).

Reads the layered render of an act (render_act.py output: SCRATCH/actN/chunks/{base,water-r2,foam,forest,front,crest})
and writes SCRATCH/actN/runtime/:
  chunks/ground/cK-rJ.webp  OPAQUE lossless: base -> water -> foam -> forest (trees + cliffs) [-> north, none in Acts 2-5],
                            blended the game's way for straight-alpha bitmaps: out = src.rgb + dst*(1-a)
                            (RGB under alpha 0 is zeroed first, so only partial-alpha pixels differ from a plain 'over')
  chunks/front/cK-rJ.png    walk-behind pixels above the hero (RGBA), only for chunks that have some
  chunks/crest/cK-rJ-{0,1,2}.png  half-res premultiplied glints, pre-masked by (1 - forest alpha); only non-empty
  collision.png, walkbehind.png, landmarks/  copied unchanged (data);  manifest.json
No water/foam/forest/canopy files; no all-transparent layer is ever written.
  python3 scripts/acts/export_runtime.py 2 3 4 5
"""
import os, sys, json, shutil, hashlib
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import acts_common as A

def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()

def rgba(p, size):
    im = Image.open(p).convert('RGBA')
    if im.size != size: im = im.resize(size, Image.NEAREST)
    a = np.asarray(im).astype(np.float32) / 255
    a[..., :3] *= (a[..., 3:4] > 0)
    return a

def over_game(dst, src):  # ONE, ONE_MINUS_SRC_ALPHA on straight-alpha sources
    return np.clip(src[..., :3] + dst * (1 - src[..., 3:4]), 0, 1)

def export(act):
    S = f'{A.SCRATCH}/act{act}'; O = S + '/runtime'
    m = json.load(open(S + '/manifest.json'))
    if os.path.exists(O): shutil.rmtree(O)
    for d in ('chunks/ground', 'chunks/front', 'chunks/crest'): os.makedirs(f'{O}/{d}')
    out_chunks = []; nb = {'ground': 0, 'front': 0, 'crest': 0}
    for c in m['chunks']:
        cid = c['id']; base = Image.open(f"{S}/{c['base']}").convert('RGB'); size = base.size
        g = np.asarray(base).astype(np.float32) / 255
        for k in ('water', 'foam', 'forest'):
            if c.get(k): g = over_game(g, rgba(f'{S}/{c[k]}', size))
        e = {k: c[k] for k in ('id', 'x', 'y', 'width', 'height')}
        p = f'{O}/chunks/ground/{cid}.webp'
        Image.fromarray((g * 255).round().astype(np.uint8), 'RGB').save(p, 'WEBP', lossless=True, quality=100, method=4)
        e['ground'] = f'chunks/ground/{cid}.webp'; e['groundSha256'] = sha(p); nb['ground'] += 1
        if c.get('front'):
            f = np.asarray(Image.open(f"{S}/{c['front']}").convert('RGBA')).copy()
            if f[..., 3].any():
                f[f[..., 3] == 0] = 0
                p = f'{O}/chunks/front/{cid}.png'; Image.fromarray(f).save(p, optimize=True)
                e['front'] = f'chunks/front/{cid}.png'; e['frontSha256'] = sha(p); nb['front'] += 1
        if c.get('crest0'):
            fa = Image.open(f"{S}/{c['forest']}").convert('RGBA').getchannel('A') if c.get('forest') else None
            frames = []
            for i in range(3):
                cr = np.asarray(Image.open(f"{S}/{c['crest%d' % i]}").convert('RGBA')).astype(np.float32)
                if fa is not None:
                    fm = np.asarray(fa.resize((cr.shape[1], cr.shape[0]), Image.BOX)).astype(np.float32)[..., None] / 255
                    cr = cr * (1 - fm)          # premultiplied: scale all four channels
                frames.append(cr.round().astype(np.uint8))
            if any(f[..., 3].any() for f in frames):
                for i, f in enumerate(frames):
                    p = f'{O}/chunks/crest/{cid}-{i}.png'; Image.fromarray(f, 'RGBA').save(p, optimize=True)
                    e['crest%d' % i] = f'chunks/crest/{cid}-{i}.png'; e['crest%dSha256' % i] = sha(p)
                nb['crest'] += 1
        out_chunks.append(e)
    for f in ('collision.png', 'walkbehind.png'): shutil.copy(f'{S}/{f}', f'{O}/{f}')
    shutil.copytree(f'{S}/landmarks', f'{O}/landmarks')
    man = {k: v for k, v in m.items() if k != 'chunks'}
    man.update(format='flattened-ground-v0', layers=['ground', 'front', 'crest0', 'crest1', 'crest2'],
               blend='ground = base, water, foam, forest baked with out = src.rgb + dst*(1-a); crest premultiplied, masked by 1-forest alpha',
               chunks=out_chunks)
    json.dump(man, open(f'{O}/manifest.json', 'w'), indent=1)
    mb = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(O) for f in fs) / 1e6
    print(f'act {act}: ground {nb["ground"]}, front {nb["front"]}, crest chunks {nb["crest"]}, {mb:.1f} MB -> {O}')

if __name__ == '__main__':
    for a in [int(x) for x in sys.argv[1:]] or [2, 3, 4, 5]: export(a)
