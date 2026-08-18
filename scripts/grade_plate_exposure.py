#!/usr/bin/env python3
"""Match a plate's mean luminance to a target, by gamma, without touching its edge statistics.

The rebaked town came back at luminance 80.0 against the settled town's 90.1 -- a generation-side
exposure drift, not a design choice. A LINEAR gain is the wrong instrument here: it clips the
highlights, and the highlights on this plate are the pale paving the walkable threshold keys on, so
a gain would quietly change how much of the town reads as street. Gamma lifts the midtones, leaves
0 and 255 fixed, and moves the neighbouring-pixel step distribution very little -- which matters
because that distribution is the whole finish gate, and a grade that "fixed" the exposure by
flattening the art would be the posterize mistake wearing a different hat.
"""
from __future__ import annotations
import argparse
import numpy as np
from PIL import Image


def lum(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def steps(l):
    return np.concatenate([np.abs(np.diff(l, axis=1)).ravel(), np.abs(np.diff(l, axis=0)).ravel()])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--target", type=float, default=90.1)
    a = ap.parse_args()
    im = Image.open(a.src).convert("RGB")
    x = np.asarray(im).astype(np.float64) / 255.0

    lo, hi = 0.25, 1.0
    for _ in range(40):                       # bisect gamma to the target mean luminance
        g = (lo + hi) / 2
        m = lum(np.clip(x ** g, 0, 1) * 255).mean()
        if m < a.target:
            hi = g
        else:
            lo = g
    out = np.clip(x ** g, 0, 1) * 255
    b, aft = steps(lum(np.asarray(im).astype(float))), steps(lum(out))
    print(f"  gamma {g:.4f}   luminance {lum(np.asarray(im).astype(float)).mean():.1f} -> {lum(out).mean():.1f}")
    print(f"  mean |step| {b.mean():.2f} -> {aft.mean():.2f}   "
          f"hard {100*(b>=24).mean():.1f}% -> {100*(aft>=24).mean():.1f}%   "
          f"soft {100*((b>=4)&(b<20)).mean():.1f}% -> {100*((aft>=4)&(aft<20)).mean():.1f}%")
    Image.fromarray(out.astype(np.uint8)).save(a.dst)
    print("  ->", a.dst)


if __name__ == "__main__":
    main()
