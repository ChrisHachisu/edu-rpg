#!/usr/bin/env python3
"""What colour IS each NPC? A measuring instrument, not a gate.

WHY A MEDIAN HUE IS THE WRONG INSTRUMENT, MEASURED 2026-08-24
-------------------------------------------------------------
Owner, on TestFlight build 57: *"the shopkeeper and healer needs to look more unique and use
brighter and captivating colors."* Sizing that up needs a number, and the obvious one -- the median
hue of the saturated pixels -- says the wrong thing about a chibi sprite. Hair, skin, boots,
baskets and leather pouches carry most of the pixel area at 20-40 degrees, so the median sits in the
warm family no matter what the character is wearing. The redrawn shopkeeper reads as unmistakably
teal at a glance and still measures a median hue of 37.

What actually separates a cast is how much of each character is in a hue family NOBODY ELSE uses.
By that measure the two redraws are decisive, and the diagnosis of the old cast is too:

    shopkeeper   30.5% teal (165-200 deg)   every other NPC <= 1.1%
    healer       23.7% green (90-180 deg)   every other NPC <= 0.5%

Before the redraw, fifteen of the seventeen sheets were 50-100% warm with nothing else above 1%.

`--baseline` prints the same table for the sheets as they were at a git ref, so a claim that a
redraw made a character distinct can be checked rather than asserted.
"""
from __future__ import annotations
import argparse, colorsys, glob, os, subprocess, sys, io
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NPC_DIR = "public/act1-hifi/town/npc"
FAMILIES = (("warm", 0, 60), ("green", 90, 180), ("teal", 165, 200), ("violet", 200, 280))


def measure(img: Image.Image) -> dict:
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb = a[..., :3][a[..., 3] > 200] / 255.0
    if not len(rgb):
        return {}
    hsv = np.array([colorsys.rgb_to_hsv(*c) for c in rgb[::3]])
    sat, hue, val = hsv[:, 1], hsv[:, 0] * 360, hsv[:, 2]
    lit = (sat > 0.15) & (val > 0.20)
    lum = float((0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2]).mean() * 255)
    out = {"lum": lum, "sat": float(sat.mean())}
    for name, lo, hi in FAMILIES:
        out[name] = float((lit & (hue >= lo) & (hue < hi)).sum()) / len(sat) * 100
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", help="git ref to compare the same sheets against")
    a = ap.parse_args()
    paths = sorted(glob.glob(os.path.join(ROOT, NPC_DIR, "*.png")))
    head = f"  {'sheet':<38} {'lum':>5} {'sat':>5} " + " ".join(f"{n:>7}" for n, _, _ in FAMILIES)
    print(head)
    for p in paths:
        m = measure(Image.open(p))
        row = (f"  {os.path.basename(p):<38} {m['lum']:5.1f} {m['sat']:5.2f} "
               + " ".join(f"{m[n]:6.1f}%" for n, _, _ in FAMILIES))
        if a.baseline:
            rel = os.path.relpath(p, ROOT)
            try:
                blob = subprocess.check_output(["git", "-C", ROOT, "show", f"{a.baseline}:{rel}"])
                b = measure(Image.open(io.BytesIO(blob)))
                row += f"   was lum {b['lum']:5.1f} sat {b['sat']:4.2f}"
            except subprocess.CalledProcessError:
                row += "   (absent at baseline)"
        print(row)
    return 0


if __name__ == "__main__":
    sys.exit(main())
