#!/usr/bin/env python3
"""Measure how visible a stitched plate's joins are, as a RATIO against the plate's own grain.

A seam is not "a big pixel step" -- hand-drawn pixel art is made of big pixel steps. A seam is a
step across ONE particular line that is larger than the steps either side of it. So the number
reported is the mean absolute luminance step across the join column/row divided by the mean step
over the neighbouring columns/rows of the same plate. 1.0x means the join is indistinguishable
from ordinary drawing; the rebaked plate measured 2.0x at x=975 and y=975.

Also reports the mean-luminance DELTA across the join, which is the exposure half of the owner's
complaint ("the colors slightly do not match") and moves independently of the step ratio.
"""
from __future__ import annotations
import argparse
import numpy as np
from PIL import Image


def lum(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def seam(l, at, axis, ctx=40):
    """Step across the cut at `at`, over the mean step of `ctx` lines either side of it."""
    if axis == 1:
        l = l.T
    # `at` is the first index of the RIGHT/BOTTOM half; the cut is between at-1 and at.
    d = np.abs(np.diff(l, axis=1))                      # d[:, k] = |l[:,k+1] - l[:,k]|
    cut = d[:, at - 1].mean()
    lo = d[:, max(0, at - 1 - ctx):at - 1]
    hi = d[:, at:at + ctx]
    near = np.concatenate([lo, hi], axis=1).mean()
    dl = l[:, at:at + ctx].mean() - l[:, at - ctx:at].mean()
    return cut, near, cut / near, dl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plate")
    ap.add_argument("--at", type=int, default=975)
    ap.add_argument("--ctx", type=int, default=40)
    a = ap.parse_args()
    l = lum(np.asarray(Image.open(a.plate).convert("RGB")).astype(np.float64))
    d = np.concatenate([np.abs(np.diff(l, axis=1)).ravel(), np.abs(np.diff(l, axis=0)).ravel()])
    print(f"{a.plate}   plate mean |step| {d.mean():.2f}")
    worst = 0.0
    for axis, name in ((0, "x"), (1, "y")):
        cut, near, r, dl = seam(l, a.at, axis, a.ctx)
        # Two denominators, because they answer different questions and the second is the one the
        # brief quotes. Against the WHOLE PLATE's mean step it says "is this line harder than the
        # art in general"; against the LOCAL mean it says "is this line harder than the art it cuts
        # through", which is the fairer test where a join happens to fall along a quay or a roofline.
        rp = cut / d.mean()
        worst = max(worst, rp)
        print(f"  {name}={a.at:<5} cut |step| {cut:6.2f}   plate-mean RATIO {rp:.2f}x   "
              f"local {near:6.2f} -> local RATIO {r:.2f}x   luminance delta {dl:+.2f}")
    print(f"  worst seam ratio (plate-mean) {worst:.2f}x")


if __name__ == "__main__":
    raise SystemExit(main())
