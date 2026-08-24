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
  key bleed   how far the SEMI-TRANSPARENT pixels lean toward the magenta key, as
              (R+B)/2 - G. Added 2026-08-24, and it is the third measurement because the first
              two both passed a sheet that was visibly wrong.

The first two are compared against the heroine herself rather than against constants, so the gate
follows the anchor if the anchor is ever re-authored.

WHY THE THIRD ONE EXISTS. Keying feathers the edge, and a feathered pixel keeps the RGB it had --
a blend of the sprite and the magenta field it was drawn on. Fully transparent pixels are invisible,
so nobody notices; a pixel at 42% alpha carrying (206,35,160) paints a pink rim over the grass.

On 2026-08-24 two NPC sheets shipped that way, and the reason is worth keeping: BOTH authors
measured, both reported "no cast", and both were measuring the outermost OPAQUE ring -- which
excludes the halo by construction, because the halo lives in the semi-transparent pixels. Their
briefs told them to do exactly that. It was caught by looking at a contact sheet, not by any number.
Measured: the two new sheets ran +147 and +144 magenta-ward, against -14 to +9 for every sheet that
had been through defringe_sprite.py. The bake now defringes unconditionally
(`bake_npc_sheets.py`), so this gate should never fire again -- which is the point of having it.

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


def key_bleed(sheet_path: str) -> float:
    """Mean (R+B)/2 - G over the SEMI-transparent pixels of a baked RGBA sheet.

    Pure magenta scores +255 and any neutral edge scores about 0. Measured on a raw RGB-on-magenta
    authored sheet this is meaningless -- there is no alpha yet -- so it returns nan for one of
    those and the caller skips it."""
    a = np.asarray(Image.open(sheet_path).convert("RGBA")).astype(np.float32)
    alpha = a[..., 3]
    semi = (alpha > 0) & (alpha < 250)
    if not semi.any() or (alpha >= 250).all():
        return float("nan")
    m = a[..., :3][semi].mean(0)
    return float((m[0] + m[2]) / 2 - m[1])


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
                    help="how far BELOW the heroine's edge step a sheet may sit. ONE-SIDED, and "
                         "that is the whole point -- see the note in main().")
    ap.add_argument("--max-key-bleed", type=float, default=25.0,
                    help="how far the semi-transparent edge may lean toward the magenta key, as "
                         "(R+B)/2 - G. Defringed sheets measure -14 to +9; two undefringed ones "
                         "measured +147 and +144. 25 is clear of every honest sheet and nowhere "
                         "near a real halo.")
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
    print(f"  gate: edge step >= {h_step - args.tol:+.1f} (no drawn dark keyline), "
          f"soft-edge >= {soft_min:.1f}, key bleed <= {args.max_key_bleed:.0f}\n")

    bad = 0
    for path in args.sheets:
        steps, softs = [], []
        for cell in sheet_cells(path, args.cols, args.rows):
            st, sf = finish(as_rgba(cell))
            if st == st:
                steps.append(st)
                softs.append(sf)
        step, soft = float(np.mean(steps)), float(np.mean(softs))
        bleed = key_bleed(path)
        drift = abs(step - h_step)
        # ONE-SIDED, RECALIBRATED 2026-08-24. This was `abs(step - h_step) <= tol`, and a two-sided
        # band around the heroine's -27 is the wrong shape for the defect it exists to catch. The
        # failure is a DRAWN DARK KEYLINE -- the rejected 2026-08-01 batch measured -49 to -87 --
        # so only the dark side is a defect. An edge BRIGHTER than the body is rim light, which is
        # what a well-drawn chibi sprite does.
        #
        # Measured on the whole cast the day the owner named his favourites: with the two-sided
        # band, 13 of 17 sheets failed, INCLUDING all three Port Sapphire NPCs he singled out as
        # the quality bar ("the npcs in port sapphire look much better, so try to match to their
        # style") at drifts of 24.5, 29.2 and 31.3. A gate that fails the best work in the repo
        # gets ignored, and this one was: it is not in ship-gate.sh and 10 sheets had been failing
        # it since they shipped. The floor now sits at the anchor minus tol (-42), which admits
        # every honestly drawn sheet in the cast and still rejects the outlined batch outright.
        ok_step, ok_soft = step >= h_step - args.tol, soft >= soft_min
        ok_bleed = not (bleed == bleed) or bleed <= args.max_key_bleed
        ok = ok_step and ok_soft and ok_bleed
        bad += 0 if ok else 1
        why = []
        if not ok_step:
            why.append(f"drawn dark keyline (edge {step:+.1f}, floor {h_step - args.tol:+.1f})")
        if not ok_soft:
            why.append("edge hard-cut, not anti-aliased")
        if not ok_bleed:
            why.append("magenta halo -- run defringe_sprite.py, or re-bake")
        note = "" if ok else "  <- " + "; ".join(why)
        print(f"  [{'PASS' if ok else 'FAIL'}] {os.path.basename(path):<34} "
              f"edge step {step:+6.1f} (drift {drift:5.1f})  soft-edge {soft:5.1f}  "
              f"key bleed {'   n/a' if bleed != bleed else f'{bleed:+6.1f}'}{note}")

    if bad:
        print(f"\n{bad} sheet(s) FAILED the finish gate. See design/ART-DIRECTION.md, "
              f"field-character amendment 2026-08-01.")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
