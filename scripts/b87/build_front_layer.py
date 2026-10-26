#!/usr/bin/env python3
"""Build 87 walk-behind overlay. The cloud trim cleared the top 24 collision px of every rock/tree run
with open ground to its north, so the hero can stand behind those tops. Those exact pixels must draw
OVER her. chunks/front/<id>.png = forest-layer RGBA restricted to (trimmed bits, dilated 1 px) & alpha>0.
Trimmed = build-86 collision (ede633e) minus the cloud's trimmed collision (gh/build87-wip 442c0f6)."""
import hashlib, io, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = Path(__file__).resolve().parents[2]; H = ROOT / 'public/act1-hifi'
W, Hh = 4736, 5824
def bits(ref):
    b = subprocess.run(['git', 'show', ref + ':public/act1-hifi/forest-collision.bin'], cwd=ROOT, capture_output=True, check=True).stdout
    return np.unpackbits(np.frombuffer(b[64:], np.uint8), bitorder='little')[:W * Hh].reshape(Hh, W).astype(bool)
trim = bits('ede633e') & ~bits('442c0f6')
trim = ndimage.binary_dilation(trim, np.ones((3, 3)))
m = json.load(open(H / 'manifest.json')); (H / 'chunks/front').mkdir(exist_ok=True); n = 0
for c in m['chunks']:
    c.pop('front', None); c.pop('frontSha256', None)
    if not c.get('forest'): continue
    y0, x0 = c['y'] * 2, c['x'] * 2
    t = trim[y0:y0 + 512, x0:x0 + 512]
    if not t.any(): continue
    f = np.asarray(Image.open(H / c['forest']).convert('RGBA')).copy()
    keep = np.zeros(f.shape[:2], bool); keep[:t.shape[0], :t.shape[1]] = t
    keep &= f[..., 3] > 0
    if not keep.any(): continue
    f[~keep] = 0
    p = f"chunks/front/{c['id']}.png"; Image.fromarray(f).save(H / p, optimize=True)
    c['front'] = p; c['frontSha256'] = hashlib.sha256((H / p).read_bytes()).hexdigest(); n += 1
open(H / 'manifest.json', 'w').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('front chunks', n, 'trimmed px', int(trim.sum()))
