#!/usr/bin/env python3
"""How HARD are the value steps inside this character? The measurable half of "match that style".

Owner, 2026-08-24: *"all the other npcs need fixing. however, the npcs in port sapphire look much
better, so try to match to their style."* Asked what "style" meant, the palettes turned out to be a
red herring -- the Port Sapphire trio and the sheets he rejected use the same hues and the same
proportions. What separates them is LOCAL CONTRAST: how hard the value steps are between adjacent
forms. A sheet whose sleeve, body and belt all sit within a few luminance of each other reads as a
smudge at 64px however carefully it was drawn.

    step    mean absolute luminance step between adjacent opaque pixels
    hard%   share of those steps at 24 or more

Measured across the cast the day he named his favourites:

    portSapphire-sailor      28.2 / 40.1   <- the three he singled out
    portSapphire-drake       25.9 / 35.5
    portSapphire-wisewoman   22.6 / 35.1
    millbrook-shopkeeper     22.4 / 32.8   <- "the shopkeeper looks good"
    greenhollow-villager1    17.9 / 23.9   <- rejected
    greenhollow-elder        17.8 / 24.6   <- rejected
    millbrook-miller         16.5 / 21.3   <- rejected, softest in the cast

So the acceptance floor for a redraw is the reference trio's own floor: **step >= 22.5 and
hard% >= 33**. This is the same instrument `check_town_finish.py` uses on town plates, applied to
characters; the town pass found exactly the same thing there (accepted plate 22.17 mean step and
29.7% hard, against 11-12 for every rejected candidate).

It is a MEASURING INSTRUMENT, not a gate: a number in band does not make a sprite good, and the
owner's eye is the verdict. It exists so "match that style" can be checked before he has to.
"""
from __future__ import annotations
import argparse, glob, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEP_MIN, HARD_MIN = 22.5, 33.0


def style(path: str):
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    op = a[..., 3] > 200
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    dx, mx = np.abs(np.diff(lum, axis=1)), op[:, 1:] & op[:, :-1]
    dy, my = np.abs(np.diff(lum, axis=0)), op[1:, :] & op[:-1, :]
    steps = np.concatenate([dx[mx], dy[my]])
    if not len(steps):
        return float("nan"), float("nan")
    return float(steps.mean()), float((steps >= 24).mean() * 100)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sheets", nargs="*",
                    help="default: every baked sheet in public/act1-hifi/town/npc")
    ap.add_argument("--gate", action="store_true",
                    help="exit non-zero if any named sheet is under the floor")
    a = ap.parse_args()
    paths = a.sheets or sorted(glob.glob(os.path.join(ROOT, "public/act1-hifi/town/npc/*.png")))
    print(f"  {'sheet':<40}{'step':>7}{'hard%':>8}   floor {STEP_MIN} / {HARD_MIN}")
    bad = 0
    for p in paths:
        st, hd = style(p)
        ok = st >= STEP_MIN and hd >= HARD_MIN
        bad += 0 if ok else 1
        print(f"  {os.path.basename(p):<40}{st:7.2f}{hd:8.1f}   {'ok' if ok else 'SOFT'}")
    if a.gate and bad:
        print(f"\n{bad} sheet(s) below the Port Sapphire contrast floor")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
