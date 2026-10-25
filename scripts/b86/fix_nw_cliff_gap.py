#!/usr/bin/env python3
"""Build 86: rejoin the north-west cliff mass and the north band (owner report on build 85).

The forward profile's cliff placement left a 1-2 cell slot at cells x~69.25-71.5, y~220-238 where the
pre-forward art (246dfd1) had one continuous rock band, plus three needle spires standing in it.
This erases the needles and fills the slot with the left mass's own edge pillars, stepped upward so
the band's bottom rises diagonally toward the north band. Fill pixels go UNDER existing art.
Collision (forest-collision.bin, alpha>=16 bitset) gains the filled pixels and loses the erased needles.

usage: fix_nw_cliff_gap.py [--preview out.png]   (writes public/act1-hifi chunks + bin + manifest)
"""
import argparse, hashlib, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
HIFI = ROOT / 'public/act1-hifi'
PPC = 32
OX, OY = 16, 218                                   # plate origin cell
px = lambda cx: int(round((cx - OX) * PPC))
py = lambda cy: int(round((cy - OY) * PPC))

def load(m):
    W = max(c['x'] + c['width'] for c in m['chunks']) * 2; H = max(c['y'] + c['height'] for c in m['chunks']) * 2
    img = np.zeros((H, W, 4), np.uint8)
    for c in m['chunks']:
        if c.get('forest'):
            img[c['y']*2:c['y']*2+512, c['x']*2:c['x']*2+512] = np.asarray(Image.open(HIFI / c['forest']).convert('RGBA'))
    return img

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--preview'); ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    m = json.load(open(HIFI / 'manifest.json'))
    img = load(m); before = img.copy()
    A = img[..., 3]; RGB = img[..., :3].astype(int)

    # --- 1. needles: rock that vanishes under a 40-px-wide horizontal opening, inside the slot window.
    win = (slice(py(219), py(238.5)), slice(px(68.6), px(72.2)))
    solid = A >= 128; green = RGB[..., 1] > RGB[..., 0] + 10
    rock = ndimage.binary_closing(solid & ~green, np.ones((3, 3))) & solid
    keep = ndimage.binary_opening(rock, np.ones((1, 40)))
    keep = ndimage.binary_dilation(keep, np.ones((1, 9)))
    needle = np.zeros_like(solid); needle[win] = (rock & ~keep)[win]
    needle = ndimage.binary_dilation(needle, np.ones((3, 3))) & (A > 0)
    needle[win] &= ~keep[win]
    img[needle] = 0

    # --- 2. fill: three stepped copies of the left mass's last 2.25 cells of pillars.
    src_x0, src_x1 = px(67.0), px(69.25)            # 72 px of the left mass's own edge pillars
    w = src_x1 - src_x0
    y0, y1 = py(226.0), py(238.6)
    src = before[y0:y1, src_x0:src_x1].copy()
    src[needle[y0:y1, src_x0:src_x1]] = 0
    dst = img.copy()
    for k, lift in enumerate((0, 1.6, 3.2)):         # cells the pillar bottoms rise per block
        bx0 = src_x1 + k * (w // 3) - (w // 3)       # overlap one block width so pillars stay whole
        lift_px = int(round(lift * PPC))
        tx0, ty0 = bx0, y0 - lift_px
        region = dst[ty0:ty0 + src.shape[0], tx0:tx0 + w]
        under = region[..., 3] < 128                 # only where nothing opaque is there already
        put = under & (src[:region.shape[0], :region.shape[1], 3] >= 128)
        # never paint beyond the north band's right side / left mass's left side
        region[put] = src[:region.shape[0], :region.shape[1]][put]
    img = dst
    added = (img[..., 3] >= 16) & (before[..., 3] < 16)
    removed = (img[..., 3] < 16) & (before[..., 3] >= 16)
    print(f'needle px erased {int(needle.sum())}; collision +{int(added.sum())} -{int(removed.sum())}')

    if a.preview:
        cx0, cy0, cx1, cy1 = px(60), py(218), px(80), py(244)
        def comp(I):
            t = Image.fromarray(I[cy0:cy1, cx0:cx1]); bg = Image.new('RGBA', t.size, (80, 140, 60, 255)); bg.alpha_composite(t); return bg
        o = Image.new('RGB', ((cx1 - cx0) * 2 + 10, cy1 - cy0), 'white')
        o.paste(comp(before), (0, 0)); o.paste(comp(img), (cx1 - cx0 + 10, 0)); o.resize((o.width // 2, o.height // 2)).save(a.preview)
    if not a.write: return

    changed = []
    for c in m['chunks']:
        if not c.get('forest'): continue
        sl = (slice(c['y']*2, c['y']*2+512), slice(c['x']*2, c['x']*2+512))
        if np.array_equal(img[sl], before[sl]): continue
        p = HIFI / c['forest']; Image.fromarray(img[sl], 'RGBA').save(p, optimize=True)
        c['forestSha256'] = hashlib.sha256(p.read_bytes()).hexdigest(); changed.append(c['id'])
    col = m['collision']; binp = HIFI / col['artifact']; raw = bytearray(binp.read_bytes())
    Wc, Hc = col['dimensionsPx32']; assert raw[:8] == b'QOKF8COL'
    bits = np.unpackbits(np.frombuffer(bytes(raw[64:]), np.uint8), bitorder='little')[:Wc * Hc].reshape(Hc, Wc)
    hh, ww = min(Hc, img.shape[0]), min(Wc, img.shape[1])
    bits[:hh, :ww][added[:hh, :ww]] = 1; bits[:hh, :ww][removed[:hh, :ww]] = 0
    raw[64:] = np.packbits(bits.ravel(), bitorder='little').tobytes()
    binp.write_bytes(bytes(raw)); col['sha256'] = hashlib.sha256(bytes(raw)).hexdigest()
    open(HIFI / "manifest.json", "w").write(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    print('chunks', changed, 'collision', col['sha256'][:16])

if __name__ == '__main__':
    main()
