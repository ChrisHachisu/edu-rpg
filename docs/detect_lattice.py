#!/usr/bin/env python3
"""Detect the native pixel lattice of an image, and optionally assert one.

Never assume a block size. Sweep it. The block size that reaches ~100% uniformity IS the art's
native lattice; if none does, the art is native 1px.

    python3 docs/detect_lattice.py shot.png                     # report
    python3 docs/detect_lattice.py shot.png --crop 480 380 600 500
    python3 docs/detect_lattice.py shot.png --expect 2          # exit 1 unless 2px lattice

Context: edu-rpg's hero is 24 art-units/tile upscaled x2 (2px blocks). The DQ world layer was
16 units/tile upscaled x3 (3px blocks) -- see dist/dq-tiles.js:23. They must agree.
"""
import argparse
import sys

from PIL import Image

THRESHOLD = 97.0     # uniformity% at which we call a lattice "the" lattice


def uniformity(im, b):
    """Max % of bxb blocks that are a single flat color, over all b^2 phase offsets."""
    if b == 1:
        return 100.0
    px = im.load()
    w, h = im.size
    best = -1.0
    for phx in range(b):
        for phy in range(b):
            total = uni = 0
            for by in range(phy, h - b + 1, b):
                for bx in range(phx, w - b + 1, b):
                    total += 1
                    a = px[bx, by]
                    if all(px[bx + dx, by + dy] == a
                           for dx in range(b) for dy in range(b)):
                        uni += 1
            if total:
                best = max(best, 100.0 * uni / total)
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--crop", nargs=4, type=int, metavar=("X0", "Y0", "X1", "Y1"))
    ap.add_argument("--expect", type=int, help="assert this block size (exit 1 otherwise)")
    ap.add_argument("--max-block", type=int, default=4)
    a = ap.parse_args()

    im = Image.open(a.image).convert("RGBA")
    if a.crop:
        im = im.crop(tuple(a.crop))

    scores = {b: uniformity(im, b) for b in range(2, a.max_block + 1)}
    print(f"{a.image}  {im.size[0]}x{im.size[1]}" + (f"  crop={tuple(a.crop)}" if a.crop else ""))
    for b, s in scores.items():
        star = "  <-- native lattice" if s >= THRESHOLD else ""
        print(f"  {b}x{b} blocks: {s:5.1f}%{star}")

    hits = [b for b, s in scores.items() if s >= THRESHOLD]
    # A 4px lattice also reads as 2px; report the smallest true block.
    native = min(hits) if hits else 1
    print(f"\nnative lattice = {native}px block" + ("  (no lattice -> native 1px art)" if native == 1 else ""))
    print(f"implied art units per 48px tile = {48 // native if native else 48}")

    if a.expect:
        ok = native == a.expect
        print(f"\nexpected {a.expect}px -> {'PASS' if ok else 'FAIL'}")
        return 0 if ok else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
