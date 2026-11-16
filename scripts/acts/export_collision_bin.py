#!/usr/bin/env python3
"""Pack an act's collision.png / walkbehind.png into the QOKF8COL bitset Act 1 ships as
public/act1-hifi/forest-collision.bin, so the runtime never decodes a 4864x5696 PNG on the phone.

    python3 scripts/acts/export_collision_bin.py 2 3 4 5      # reads/writes $ACTS_OUT/actN/runtime/

Format (identical to Act 1; parsed by dq-tiles.js a1aForestDecode, and by acts-runtime.js):
  0  'QOKF8COL'      8 bytes magic
  8  u16 version=1   10 u16 headerBytes=64
  12 u32 width px    16 u32 height px    20 u32 pixelsPerCell (32)
  24 32 bytes        sha256 of the SOURCE png file
  56 8 bytes         zero
  64 ...             ceil(w*h/8) bytes, row-major, bit i = byte i>>3, bit (i&7) (little-within-byte); 1 = blocked
Outputs collision.bin (feet-only blocking) and walkbehind.bin (the trimmed tops: draw-over, never blocks),
and describes both in a sidecar collision.json (the runtime manifest.json is export_runtime.py's).
export_runtime.py wipes runtime/ on every export, so re-run this after it.
Separate from export_runtime.py (owned by the overworld renderer) so either can change alone.
"""
import hashlib, json, os, struct, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import acts_common as A  # noqa: E402


def pack(png, out, ppc):
    raw = open(png, 'rb').read()
    bits = (np.asarray(Image.open(png).convert('L')) > 0)
    h, w = bits.shape
    payload = np.packbits(bits.reshape(-1), bitorder='little').tobytes()
    head = b'QOKF8COL' + struct.pack('<HHIII', 1, 64, w, h, ppc) + hashlib.sha256(raw).digest() + b'\0' * 8
    assert len(head) == 64 and len(payload) == (w * h + 7) // 8
    data = head + payload
    open(out, 'wb').write(data)
    return {'artifact': os.path.basename(out), 'format': 'qok-forest-bitset-v1', 'version': 1,
            'dimensionsPx32': [w, h], 'pixelsPerCell': ppc, 'sha256': hashlib.sha256(data).hexdigest(),
            'sourceSha256': hashlib.sha256(raw).hexdigest(), 'blockedPx': int(bits.sum())}


def export(act):
    rt = f'{A.SCRATCH}/act{act}/runtime'
    m = json.load(open(rt + '/manifest.json'))
    ppc = m['collision']['pixelsPerCell']
    side = {'act': act, 'origin': m['origin'], 'bin': pack(f"{rt}/{m['collision']['file']}", rt + '/collision.bin', ppc)}
    if os.path.exists(rt + '/walkbehind.png'):
        side['walkBehindBin'] = pack(rt + '/walkbehind.png', rt + '/walkbehind.bin', ppc)
    json.dump(side, open(rt + '/collision.json', 'w'), indent=1)
    c = side['bin']
    print(f"act {act}: collision.bin {c['dimensionsPx32']} {os.path.getsize(rt + '/collision.bin')} B, blocked {c['blockedPx']} px")


if __name__ == '__main__':
    for a in sys.argv[1:] or ['2', '3', '4', '5']:
        export(int(a))
