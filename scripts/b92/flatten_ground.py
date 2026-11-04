#!/usr/bin/env python3
"""Build 92: flatten the Act 1 overworld chunks the way towns are built.

Every chunk used to stream base + water + foam + forest as four separate full-size layers, all of
them drawn below the hero, and 55 water / 73 foam / 39 forest files were fully transparent. This
bakes them, in depth order, into ONE opaque lossless WebP that replaces chunks/base/<id>.webp, so a
chunk costs one texture and one screen of fill instead of four.

  base (1.1) -> water (1.2) -> foam (1.25) -> forest (9.5, below the hero at 10)

Compositing is straight-alpha source-over, which is what the phone shows: water-r2 keeps grass RGB
under alpha 0 and the device does not add it (headless Chromium does, which turns grass yellow).

Crest frames (1.21) sat between water and forest, so they now draw above the baked forest. Each
frame is multiplied by (1 - forest alpha) so no glint shows on a tree crown. They are premultiplied,
so all four channels are scaled.

Front (10.5, above the hero) and north are untouched. water-r2/ and foam/ are deleted and their
manifest keys dropped. forest/ stays: a1aForestManifestSpec requires a forest entry per chunk, and
the forest underpaint/collision path still validates against it, but the runtime no longer loads it.

Run once on public/act1-hifi. Refuses to run on an already flattened manifest.
"""
import hashlib, json, sys
from pathlib import Path

import numpy as np
from PIL import Image

H = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'public/act1-hifi')
sha = lambda p: hashlib.sha256((H / p).read_bytes()).hexdigest()
m = json.load(open(H / 'manifest.json'))
if m.get('groundBaked'):
    sys.exit('manifest is already flattened (groundBaked present)')


def rgba(rel, size):
    im = Image.open(H / rel).convert('RGBA')
    if im.size != size:
        im = im.resize(size, Image.NEAREST)
    return np.asarray(im).astype(np.float32) / 255


def over(dst, src):
    a = src[..., 3:4]
    return src[..., :3] * a + dst * (1 - a)


before = after = 0
for c in m['chunks']:
    base = Image.open(H / c['base']).convert('RGB')
    size = base.size
    out = np.asarray(base).astype(np.float32) / 255
    for k in ('water', 'foam', 'forest'):
        if c.get(k):
            before += (H / c[k]).stat().st_size
            out = over(out, rgba(c[k], size))
    before += (H / c['base']).stat().st_size
    Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), 'RGB').save(
        H / c['base'], 'WEBP', lossless=True, quality=100, method=6)
    after += (H / c['base']).stat().st_size
    c['baseSha256'] = sha(c['base'])

    fa = Image.open(H / c['forest']).convert('RGBA').getchannel('A')
    for i in range(3):
        k = f'crest{i}'
        if not c.get(k):
            continue
        cr = Image.open(H / c[k]).convert('RGBA')
        keep = 1 - np.asarray(fa.resize(cr.size, Image.BOX)).astype(np.float32)[..., None] / 255
        Image.fromarray((np.asarray(cr).astype(np.float32) * keep).round().astype(np.uint8), 'RGBA').save(H / c[k])
        c[k + 'Sha256'] = sha(c[k])

    for k in ('water', 'foam'):
        if c.get(k):
            (H / c[k]).unlink()
            c.pop(k)
            c.pop(k + 'Sha256', None)

m['groundBaked'] = {
    'schema': 'act1-flat-ground-v1',
    'baked': ['base', 'water', 'foam', 'forest'],
    'note': 'chunks/base holds base+water+foam+forest composited; forest/ is kept for manifest '
            'validation only and is not streamed. Crest frames are masked by forest alpha.',
}
open(H / 'manifest.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('baked %d chunks: %.1f MB of base/water/foam/forest -> %.1f MB ground' % (len(m['chunks']), before / 1e6, after / 1e6))
