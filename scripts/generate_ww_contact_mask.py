#!/usr/bin/env python3
"""Generate/check the cached Whispering Woods sole-contact mask from pinned art alpha."""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_DEFAULT = ROOT / 'public/dq-tiles.js'
PNG_DEFAULT = ROOT / 'public/act1-hifi/landmarks/whispering-woods.png'
PIN = 'a06eea6ab98c7c630119db1488dfea912a40bc69150ac16e387b4e696aa5f047'
W = H = 144

def polygon(source, name):
    match = re.search(r'var ' + re.escape(name) + r'=(\[[^;]+\]);', source)
    if not match:
        raise SystemExit(f'missing {name} polygon')
    return json.loads(match.group(1))

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
        raise SystemExit(f'pinned cave PNG mismatch: {sha}')
    im = Image.open(png).convert('RGBA')
    if im.size != (W, H):
        raise SystemExit(f'expected {W}x{H} cave art, got {im.size}')
    rock, channel = polygon(source, 'A1M_WW_ROCK'), polygon(source, 'A1M_WW_CHANNEL')
    alpha = im.getchannel('A')
    bits = bytearray(W*H)
    authored = visible = 0
    for y in range(H):
        for x in range(W):
            if inside(x+.5, y+.5, rock) and not inside(x+.5, y+.5, channel):
                authored += 1
                if alpha.getpixel((x,y)) >= 128:
                    bits[y*W+x] = 1
                    visible += 1
    packed = bytearray((len(bits)+7)//8)
    for i, bit in enumerate(bits):
        if bit:
            packed[i>>3] |= 1 << (i&7)
    return base64.b64encode(packed).decode('ascii'), authored, visible

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=Path, default=SRC_DEFAULT)
    ap.add_argument('--png', type=Path, default=PNG_DEFAULT)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    source = args.source.read_text()
    encoded, authored, visible = build(source, args.png)
    match = re.search(r"var A1M_WW_MASK_B64='([A-Za-z0-9+/=]+)';", source)
    if args.check:
        if not match or match.group(1) != encoded:
            raise SystemExit('embedded mask differs from polygon ∩ pinned PNG alpha>=128')
        solid = sum(base64.b64decode(encoded)[i>>3] >> (i&7) & 1 for i in range(W*H))
        if solid != visible:
            raise SystemExit('solid mask count differs from visible authored material')
        print(json.dumps({'status':'PASS','artSha256':PIN,'authoredSolidPixels':authored,
                          'visibleSolidPixels':visible,'outsideAlphaSolidPixels':0,
                          'packedMaskBytes':len(base64.b64decode(encoded))},sort_keys=True))
    else:
        print(f"var A1M_WW_MASK_B64='{encoded}';")
        print(json.dumps({'authoredSolidPixels':authored,'visibleSolidPixels':visible,
                          'outsideAlphaSolidPixels':authored-visible},sort_keys=True))

if __name__ == '__main__':
    main()
