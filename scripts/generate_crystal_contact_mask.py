#!/usr/bin/env python3
"""Build/check the cached Crystal Cave sole-contact mask from pinned opaque pixels."""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_DEFAULT = ROOT / 'public/dq-tiles.js'
PNG_DEFAULT = ROOT / 'public/act1-hifi/landmarks/crystal-cave.png'
PIN = '45fb2c0b7cf1ad2e63ee9a28bbf0ad66e3d4d9ca9258beaf7a68566e04692b55'
W = H = 144

# This channel follows the visible arch and its stone landing to the existing
# landmark anchor. The material mask is always intersected with source alpha.
CHANNEL = [
    [53, 75], [52, 65], [57, 55], [64, 49], [72, 48], [78, 54],
    [81, 64], [82, 73], [86, 83], [91, 92], [93, 103], [94, 114],
    [96, 125], [96, 134], [55, 134], [54, 125], [55, 115], [56, 105],
    [54, 95], [52, 85],
]

def inside(x, y, points):
    hit = False
    j = len(points) - 1
    for i, a in enumerate(points):
        b = points[j]
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            hit = not hit
        j = i
    return hit

def build(source, png):
    raw = png.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if sha != PIN:
        raise SystemExit(f'pinned Crystal Cave PNG mismatch: {sha}')
    im = Image.open(png).convert('RGBA')
    if im.size != (W, H):
        raise SystemExit(f'expected {W}x{H} Crystal Cave art, got {im.size}')
    alpha = im.getchannel('A')
    bits = bytearray(W*H)
    opaque = solid = 0
    for y in range(H):
        for x in range(W):
            is_solid = alpha.getpixel((x, y)) >= 128 and not inside(x+.5, y+.5, CHANNEL)
            if alpha.getpixel((x, y)) >= 128:
                opaque += 1
            if is_solid:
                bits[y*W+x] = 1
                solid += 1
    packed = bytearray((len(bits)+7)//8)
    for i, bit in enumerate(bits):
        if bit:
            packed[i>>3] |= 1 << (i&7)
    outside = sum(1 for i, bit in enumerate(bits) if bit and alpha.getpixel((i % W, i // W)) < 128)
    return base64.b64encode(packed).decode('ascii'), opaque, solid, outside

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=Path, default=SRC_DEFAULT)
    ap.add_argument('--png', type=Path, default=PNG_DEFAULT)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--summary', type=Path)
    args = ap.parse_args()
    source = args.source.read_text()
    encoded, opaque, solid, outside = build(source, args.png)
    match = re.search(r"var A1M_CRYSTAL_MASK_B64='([A-Za-z0-9+/=]+)';", source)
    if args.check:
        if not match or match.group(1) != encoded:
            raise SystemExit('embedded Crystal mask differs from doorway channel ∩ pinned PNG alpha>=128')
    else:
        print(f"var A1M_CRYSTAL_MASK_B64='{encoded}';")
    result = {'schema':'crystal-contact-mask-raster-v1', 'dqTilesSha256':hashlib.sha256(source.encode()).hexdigest(),
              'pinnedArtSha256':PIN, 'opaquePixels':opaque, 'solidPixels':solid,
              'outsideAlphaPixels':outside, 'alphaThreshold':128, 'packedMaskBytes':2592,
              'packedMaskSha256':hashlib.sha256(base64.b64decode(encoded)).hexdigest(),
              'channelPolygon':CHANNEL}
    if args.summary:
        args.summary.write_text(json.dumps(result, indent=2, sort_keys=True)+'\n')
    print(json.dumps(result,sort_keys=True))

if __name__ == '__main__':
    main()
