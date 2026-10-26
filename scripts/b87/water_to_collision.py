#!/usr/bin/env python3
"""Build 87: ground that the new shoreline turned into sea (e.g. the grass ribbon under the NW cliffs)
must not be walkable. Adds forest-collision.bin bits wherever the new water-r2 chunk is opaque water
(alpha>=128) but the build-86 water (git ede633e) was not. Map-cell water collision is unchanged."""
import io, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]; H = ROOT / 'public/act1-hifi'
m = json.load(open(H / 'manifest.json')); col = m['collision']; W, Hh = col['dimensionsPx32']
raw = bytearray((H / col['artifact']).read_bytes()); assert raw[:8] == b'QOKF8COL'
bits = np.unpackbits(np.frombuffer(bytes(raw[64:]), np.uint8), bitorder='little')[:W * Hh].reshape(Hh, W)
added = 0
# Never water-block a landmark's door, exit or approach cell or its 1-cell ring (Port Sapphire's
# harbour exit sits on the new shoreline).
keep = np.zeros_like(bits, dtype=bool)
for x, y in [(a['x'], a['y']) for a in m['liveValidApproaches']] + [(l['x'], l['y']) for l in m['liveLandmarkExits']] \
          + [(l['door']['x'], l['door']['y']) for l in m['liveLandmarkExits']]:
    px, py = (x - 16 - 1) * 32, (y - 218 - 1) * 32
    keep[max(0, py):py + 96, max(0, px):px + 96] = True
for c in m['chunks']:
    new = np.asarray(Image.open(H / c['water']).convert('RGBA'))[..., 3] >= 128
    old_b = subprocess.run(['git', 'show', 'ede633e:public/act1-hifi/' + c['water']], cwd=ROOT, capture_output=True).stdout
    old = np.asarray(Image.open(io.BytesIO(old_b)).convert('RGBA'))[..., 3] >= 128 if old_b else np.zeros_like(new)
    gain = new & ~old
    gain &= ~keep[c['y']*2:c['y']*2+512, c['x']*2:c['x']*2+512][:gain.shape[0], :gain.shape[1]]
    if not gain.any(): continue
    y0, x0 = c['y'] * 2, c['x'] * 2
    reg = bits[y0:y0 + 512, x0:x0 + 512]; g = gain[:reg.shape[0], :reg.shape[1]]
    added += int((g & (reg == 0)).sum()); reg[g] = 1
raw[64:] = np.packbits(bits.ravel(), bitorder='little').tobytes()
if '--write' in sys.argv: (H / col['artifact']).write_bytes(bytes(raw))
print('water-gain collision px added', added)
