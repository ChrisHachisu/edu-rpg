#!/usr/bin/env python3
"""Review PNGs for Acts 2-5: per-act overview, native close-ups, Act1/2 seam, whole continent.
  python3 scripts/acts/previews.py [acts...]      (needs render_act.py outputs in SCRATCH/actN/full.png)"""
import os, sys, json
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import acts_common as A
Image.MAX_IMAGE_PIXELS = None
P = 32
# native 1024x768 close-ups: (label, centre cell x, centre cell y)
CROPS = {
    2: [('coast', 300, 345), ('mountain-water', 228, 384), ('forest-edge', 268, 300), ('town-ironkeep', 209, 320),
        ('frozen-lake', 266, 358)],
    3: [('coast-oasis', 275, 160), ('mountain-water', 300, 200), ('canyon', 225, 150), ('town-ruins-camp', 196, 189)],
    4: [('coast', 300, 70), ('mountain-water', 175, 12), ('town-cinderwatch', 257, 42), ('caldera', 220, 50)],
    5: [('demon-castle-moat', 85, 31), ('dead-forest-edge', 40, 120), ('mountain-water', 20, 30), ('town-havens-edge', 76, 86)],
}

def full(act):
    return Image.open(f'{A.SCRATCH}/act{act}/full.png').convert('RGB')

def act_previews(act):
    d = A.owner(); bx0, by0, bx1, by1 = d['acts'][str(act)]['bounds']
    im = full(act); s = 1600 / im.height
    im.resize((round(im.width * s), 1600), Image.LANCZOS).save(f'{A.PREVIEW}/act{act}-overview.png', optimize=True)
    for lab, cx, cy in CROPS.get(act, []):
        x = (cx - bx0) * P; y = (cy - by0) * P
        x = int(np.clip(x - 512, 0, im.width - 1024)); y = int(np.clip(y - 384, 0, im.height - 768))
        im.crop((x, y, x + 1024, y + 768)).save(f'{A.PREVIEW}/act{act}-{lab}.png', optimize=True)

def act1_full():
    p = A.SCRATCH + '/act1_full.png'
    if os.path.exists(p): return Image.open(p).convert('RGBA')
    R = A.ROOT + '/public/act1-hifi/chunks/'
    out = Image.new('RGBA', (160 * 32, 182 * 32), (0, 0, 0, 0))
    for c in range(10):
        for r in range(12):
            for k, e in (('base', 'webp'), ('water-r2', 'png'), ('foam', 'png'), ('forest', 'png')):
                q = f'{R}{k}/c{c}-r{r}.{e}'
                if os.path.exists(q): out.alpha_composite(Image.open(q).convert('RGBA'), (c * 512, r * 512))
    out.save(p); return out

def act2_forest_cols(x, y, w, h):
    """Act 2 forest layer (trees + cliffs) region in act-local px, from the layered chunks."""
    c0, r0 = max(0, x) // 512, max(0, y) // 512; c1, r1 = (x + w - 1) // 512, (y + h - 1) // 512
    big = Image.new('RGBA', ((c1 - c0 + 1) * 512, (r1 - r0 + 1) * 512), (0, 0, 0, 0))
    D = f'{A.SCRATCH}/act2/chunks/forest/'
    for c in range(c0, c1 + 1):
        for r in range(r0, r1 + 1):
            q = f'{D}c{c}-r{r}.png'
            if os.path.exists(q): big.paste(Image.open(q).convert('RGBA'), ((c - c0) * 512, (r - r0) * 512))
    return big.crop((x - c0 * 512, y - r0 * 512, x - c0 * 512 + w, y - r0 * 512 + h))

def seam():
    """Native crop across the Act 1 (shipped) / Act 2 seam at x=161..164."""
    a1 = act1_full(); a2 = full(2)
    for lab, cy in (('seam-a1a2-north', 236), ('seam-a1a2-mid', 300), ('seam-a1a2-south', 385)):
        X0 = 148 * P; Y0 = cy * P - 384
        can = Image.new('RGBA', (1024, 768))
        can.paste(a2.crop(((148 - 161) * P + 0, Y0 - 222 * P, (148 - 161) * P + 1024, Y0 - 222 * P + 768)), (0, 0))
        # Act 1 shipped art (x < 164) drawn as is, then Act 2's raised layer (whole objects) on top in the overlap
        w = 164 * P - X0
        can.paste(a1.crop((X0 - 16 * P, Y0 - 218 * P, X0 - 16 * P + w, Y0 - 218 * P + 768)), (0, 0))
        fo = act2_forest_cols(0, Y0 - 222 * P, 1024 - (161 * P - X0), 768)
        can.alpha_composite(fo, (161 * P - X0, 0))
        can.convert('RGB').save(f'{A.PREVIEW}/{lab}.png', optimize=True)

def continent(scale=4):
    """Whole continent at `scale` px per cell (default 4 -> 1280x1600)."""
    f = P // scale
    wt = Image.open(A.ROOT + '/public/act1-hifi/materials/act1-water-r2.png').convert('RGB')
    sea = np.array(wt.resize((wt.width // 3 // f, wt.height // 3 // f), Image.LANCZOS))
    th, tw = sea.shape[:2]
    can = np.zeros((A.GH * scale, A.GW * scale, 3), np.float32)
    can[:] = sea[np.arange(can.shape[0]) % th][:, np.arange(can.shape[1]) % tw]
    d = A.owner()
    for act in (5, 3, 4, 2):
        p = f'{A.SCRATCH}/act{act}/full.png'
        if not os.path.exists(p): continue
        bx0, by0, bx1, by1 = json.load(open(f'{A.SCRATCH}/act{act}/manifest.json'))['bounds']
        im = np.asarray(Image.open(p).convert('RGB').resize(((bx1 - bx0 + 1) * scale, (by1 - by0 + 1) * scale), Image.LANCZOS))
        can[by0 * scale:(by1 + 1) * scale, bx0 * scale:(bx1 + 1) * scale] = im
    a1 = act1_full(); a1s = np.asarray(a1.resize((a1.width // f, a1.height // f), Image.LANCZOS)).astype(np.float32)
    al = a1s[..., 3] / 255.0
    y0, x0 = 218 * scale, 16 * scale; h, w = a1s.shape[:2]; h = min(h, can.shape[0] - y0)
    can[y0:y0 + h, x0:x0 + w] = can[y0:y0 + h, x0:x0 + w] * (1 - al[:h, :, None]) + a1s[:h, :, :3] * al[:h, :, None]
    # Act 2 whole objects standing in the x 161-164 overlap draw over Act 1's edge
    if os.path.exists(f'{A.SCRATCH}/act2/chunks/forest'):
        fo = act2_forest_cols(0, 0, 8 * P, 178 * P)
        fo = np.asarray(fo.resize((8 * scale, 178 * scale), Image.LANCZOS)).astype(np.float32)
        a = fo[..., 3:4] / 255; ys, xs = 222 * scale, 161 * scale
        can[ys:ys + fo.shape[0], xs:xs + fo.shape[1]] = can[ys:ys + fo.shape[0], xs:xs + fo.shape[1]] * (1 - a) + fo[..., :3] * a
    # Act 5's art covers Act 1's top rows 218-221 (x 80-161) and draws over Act 1 there
    p5 = f'{A.SCRATCH}/act5/full.png'
    if os.path.exists(p5):
        m5 = json.load(open(f'{A.SCRATCH}/act5/manifest.json')); b = m5['bounds']
        if b[3] >= 218:
            a5 = Image.open(p5).convert('RGB')
            strip = a5.crop(((80 - b[0]) * P, (218 - b[1]) * P, (161 - b[0]) * P, (b[3] + 1 - b[1]) * P))
            strip = np.asarray(strip.resize((81 * scale, (b[3] + 1 - 218) * scale), Image.LANCZOS))
            can[218 * scale:(b[3] + 1) * scale, 80 * scale:161 * scale] = strip
    # Act 1 north overhang (300 px above y=218, chunks c4..c6)
    for c in (4, 5, 6):
        q = A.ROOT + f'/public/act1-hifi/chunks/north/c{c}-r0.png'
        if not os.path.exists(q): continue
        n = Image.open(q).convert('RGBA'); n = np.asarray(n.resize((n.width // f, n.height // f), Image.LANCZOS)).astype(np.float32)
        nh, nw = n.shape[:2]; yy = y0 - nh; xx = x0 + c * 512 // f
        a = n[..., 3:4] / 255; can[yy:y0, xx:xx + nw] = can[yy:y0, xx:xx + nw] * (1 - a) + n[..., :3] * a
    Image.fromarray(np.clip(can, 0, 255).astype(np.uint8)).save(f'{A.PREVIEW}/continent-overview.png', optimize=True)

def act34_variant(v):
    """Act 3/4 overlap candidate: stitched Act 4 (y 3-87) + Act 3 (y 88-221) renders, landmarks ringed."""
    from PIL import ImageDraw
    D = f'{os.path.dirname(A.SCRATCH)}/variant{v}'; d = A.owner()
    a4 = Image.open(f'{D}/act4/full.png').convert('RGB'); a3 = Image.open(f'{D}/act3/full.png').convert('RGB')
    can = Image.new('RGB', (152 * P, (221 - 3 + 1) * P))
    can.paste(a4, (0, 0)); can.paste(a3, (0, (88 - 3) * P))
    s = 1400 / can.height; sm = can.resize((round(can.width * s), 1400), Image.LANCZOS); dr = ImageDraw.Draw(sm)
    for k in ('3', '4'):
        for name, (x, y) in d['acts'][k]['landmarks'].items():
            if 88 <= y <= 128 or 'Magma' in name or 'Desert' in name:
                px, py = (x - 163 + .5) * P * s, (y - 3 + .5) * P * s
                dr.ellipse((px - 14, py - 14, px + 14, py + 14), outline=(255, 40, 200), width=3)
                dr.text((px + 16, py - 8), name, fill=(255, 255, 255))
    sm.save(f'{A.PREVIEW}/act34-option-{v}.png', optimize=True)

if __name__ == '__main__':
    if 'act34' in sys.argv:
        for v in ('A', 'B'): act34_variant(v)
        sys.exit()
    os.makedirs(A.PREVIEW, exist_ok=True)
    acts = [int(a) for a in sys.argv[1:] if a.isdigit()] or [2, 3, 4, 5]
    for a in acts:
        if os.path.exists(f'{A.SCRATCH}/act{a}/full.png'): act_previews(a); print('act', a)
    if os.path.exists(f'{A.SCRATCH}/act2/full.png'): seam()
    continent(); print('continent')
