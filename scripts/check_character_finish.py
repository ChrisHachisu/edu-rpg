#!/usr/bin/env python3
"""Does this field character have the heroine's FINISH? Measured, not eyeballed.

Why this exists
---------------
The first Port Sapphire NPC batch was drawn to `design/ART-DIRECTION.md`'s canonical STYLE
BLOCK verbatim -- including "bold near-black outline around the full silhouette" -- and the
owner rejected it on sight: "the npc sprites don't actually match how the hero looks like. the
crispness looks different."

The block is right, for the asset family it was written about: the 128px battle monsters. The
Act 1 heroine is a different family and has **no keyline at all**. Her silhouette is the form's
own colour going a shade darker where it turns from the light, softly anti-aliased into the
background. Anything drawn with a contour ring around it reads as a different game, at any size.

That difference is obvious once measured and easy to miss by eye at 64px, which is exactly what
happened. So it gets a number and a gate:

  edge step   mean luminance of the outermost opaque pixel ring, minus mean body luminance.
              The heroine measures about -17. The rejected batch measured -61 to -95.
  soft edge   partially-transparent pixels per 100 opaque. The heroine measures about 13.
              A hard 1px cut measures under 1 and is wrong.

Both are compared against the heroine herself rather than against constants, so the gate follows
the anchor if the anchor is ever re-authored.

Usage:
    check_character_finish.py <sheet.png> [...] [--cols 3] [--rows 4] [--tol 25]
    check_character_finish.py design/act1-towns/npc/*.png
Exit status is non-zero if any sheet fails, so this can gate a batch.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERO = os.path.join(ROOT, "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png")
N = 64

# one keying path, shared with the runtime compositor -- see as_rgba() for why
_spec = importlib.util.spec_from_file_location(
    "_ptn", os.path.join(os.path.dirname(os.path.abspath(__file__)), "place_town_npcs.py"))
_ptn = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ptn)
_key_cell = _ptn.key_cell


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def as_rgba(cell: Image.Image) -> np.ndarray:
    """Accept either a real RGBA cell (the heroine) or an RGB cell on the magenta key field
    (everything the generator returns), so both go through identical measurement.

    The key path is IMPORTED from `place_town_npcs.py` rather than reimplemented here, and that
    matters: this gate has to judge the sprite as it will actually ship. Measuring the raw sheet
    instead reports a hard silhouette that no shipped frame ever has, because the runtime keyer
    despills and feathers the edge on the way in. A gate that measures something other than the
    artifact is a gate that fails correct work -- which is exactly what happened when these two
    keyed independently.
    """
    if cell.mode == "RGBA" and np.asarray(cell)[..., 3].min() < 250:
        return np.asarray(cell).astype(np.float32)
    return np.asarray(_key_cell(cell)).astype(np.float32)


def finish(a: np.ndarray) -> tuple[float, float]:
    op = a[..., 3] > 128
    if op.sum() < 50:
        return float("nan"), float("nan")
    p = np.pad(op, 1, constant_values=False)
    interior = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:] & op
    ring = op & ~interior
    L = lum(a)
    step = float(L[ring].mean() - L[op].mean())
    soft = 100.0 * float(((a[..., 3] > 20) & (a[..., 3] < 200)).sum()) / float(op.sum())
    return step, soft


def sheet_cells(path: str, cols: int, rows: int):
    im = Image.open(path)
    w, h = im.size
    if (w, h) != (cols * N, rows * N):
        raise SystemExit(f"{path} is {w}x{h}, expected {cols*N}x{rows*N}")
    for r in range(rows):
        for c in range(cols):
            yield im.crop((c * N, r * N, (c + 1) * N, (r + 1) * N))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("sheets", nargs="+")
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--rows", type=int, default=4)
    ap.add_argument("--tol", type=float, default=15.0,
                    help="how far the edge step may drift from the heroine's, in luminance. "
                         "15, not 25: the rejected batch ran -49 to -87 against her -25, so a "
                         "25 tolerance passed two sheets that are plainly outlined by eye.")
    ap.add_argument("--soft-frac", type=float, default=0.40,
                    help="minimum soft-edge count as a fraction of the heroine's. This is the "
                         "sharper of the two tests and the one that never gave a false pass: "
                         "she carries ~14 partially-transparent edge px per 100 opaque, a "
                         "hard-cut generated sheet carries 0.2 -- a 50x separation, where the "
                         "edge-step figures merely overlap at the margin.")
    args = ap.parse_args()

    hero = Image.open(HERO).convert("RGBA")
    hs, hsoft = [], []
    for row in range(8):                      # her 8 authored directions, idle column only
        st, sf = finish(as_rgba(hero.crop((0, row * N, N, (row + 1) * N))))
        if st == st:
            hs.append(st)
            hsoft.append(sf)
    h_step, h_soft = float(np.mean(hs)), float(np.mean(hsoft))
    print(f"ANCHOR  {os.path.basename(HERO)}")
    print(f"  edge step {h_step:+6.1f}   soft-edge px per 100 opaque {h_soft:5.1f}")
    soft_min = h_soft * args.soft_frac
    print(f"  gate: edge step within {args.tol:.0f} of the anchor's, "
          f"AND soft-edge >= {soft_min:.1f}\n")

    bad = 0
    for path in args.sheets:
        steps, softs = [], []
        for cell in sheet_cells(path, args.cols, args.rows):
            st, sf = finish(as_rgba(cell))
            if st == st:
                steps.append(st)
                softs.append(sf)
        step, soft = float(np.mean(steps)), float(np.mean(softs))
        drift = abs(step - h_step)
        ok_step, ok_soft = drift <= args.tol, soft >= soft_min
        ok = ok_step and ok_soft
        bad += 0 if ok else 1
        why = []
        if not ok_step:
            why.append("keyline too dark")
        if not ok_soft:
            why.append("edge hard-cut, not anti-aliased")
        note = "" if ok else "  <- " + "; ".join(why)
        print(f"  [{'PASS' if ok else 'FAIL'}] {os.path.basename(path):<34} "
              f"edge step {step:+6.1f} (drift {drift:5.1f})  soft-edge {soft:5.1f}{note}")

    if bad:
        print(f"\n{bad} sheet(s) FAILED the finish gate. See design/ART-DIRECTION.md, "
              f"field-character amendment 2026-08-01.")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
