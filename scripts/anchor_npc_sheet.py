#!/usr/bin/env python3
"""Put a character sheet's feet on the runtime's foot baseline, which is row 58 of every 64 cell.

THE CONTRACT IS IN THE DRAW CALL, not in a document. `public/act1-hifi/town.html`'s drawActor()
places a sprite with `-HERO_H * 58 / 64`, i.e. it assumes the figure's soles sit on row 58 of the
64 px cell and that the cell coordinate IS the feet. Every actor -- hero and NPC alike -- goes
through that one function, so a sheet whose feet sit anywhere else is drawn at the wrong height.

Measured 2026-08-22 on a fresh NPC batch: feet landed on rows 56 to 63 across the sheets. The
figure is drawn 36 world px tall, so 5 px of a 64 px cell is about 14% of her height -- enough to
sink a character to the shins or float them clear of their own shadow. The shipped sheets sit on
row 59, one pixel out, which is why nobody had noticed the rule was never enforced.

The fix is a whole-sheet vertical shift, not a per-frame one: the grid must stay a clean 3x4 of 64,
and only column 0 / row 0 is ever drawn anyway, so that frame decides the offset for the sheet.
Pixels shifted off one end are discarded and the vacated rows are transparent; a shift that would
clip opaque pixels off the top is refused rather than silently cropping a head.
"""
from __future__ import annotations
import argparse, os, sys
import numpy as np
from PIL import Image

BASELINE = 58   # drawActor(): -HERO_H * 58 / 64
CELL = 64


def foot_row(a: np.ndarray, col=0, row=0) -> int | None:
    cell = a[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL, 3] > 16
    ys = np.nonzero(cell.any(1))[0]
    return int(ys.max()) if len(ys) else None


def top_row(a: np.ndarray, col=0, row=0) -> int | None:
    cell = a[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL, 3] > 16
    ys = np.nonzero(cell.any(1))[0]
    return int(ys.min()) if len(ys) else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    for p in a.paths:
        im = Image.open(p).convert("RGBA")
        arr = np.asarray(im).copy()
        f = foot_row(arr)
        if f is None:
            print(f"  {os.path.basename(p):40s} EMPTY frame 0,0 -- skipped")
            continue
        dy = BASELINE - f
        if dy == 0:
            print(f"  {os.path.basename(p):40s} feet already on {BASELINE}")
            continue
        t = top_row(arr)
        if dy < 0 and t is not None and t + dy < 0:
            print(f"  {os.path.basename(p):40s} REFUSED: shifting {dy} would clip the head "
                  f"(top row {t})")
            continue
        out = np.zeros_like(arr)
        if dy > 0:
            out[dy:, :, :] = arr[:-dy, :, :]
        else:
            out[:dy, :, :] = arr[-dy:, :, :]
        print(f"  {os.path.basename(p):40s} feet {f} -> {BASELINE}  (shift {dy:+d})")
        if a.write:
            Image.fromarray(out, "RGBA").save(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
