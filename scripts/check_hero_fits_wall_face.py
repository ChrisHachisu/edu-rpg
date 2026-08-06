#!/usr/bin/env python3
"""Does the heroine fit inside the wall's shaded face? Owner requirement, made failable.

Owner, 2026-08-06: "the character's top part still sticks out of the shadow part a bit, which
makes it look unnatural so the character needs to fit within the shadow area."

That had been a judgement call twice, and both times it was judged wrong -- 0.46 left ~30 px of
her outside the shade and 0.70 left 3 px. It is not a matter of taste; it is three measurements
and a subtraction, so this asserts it instead.

    her crown, above her soles          measured HERE, off the real sheet, from the NORTH row
  - her stand-off from a north wall     A1M_FOOT + A1M_LEAN, read HERE out of dq-tiles.js
  = how far she reaches over the wall
  + the blur on the band's own top edge or her crown sits in the soft margin, not the shade
  <= the face band                      FACE_H_CELLS x 48

WHY IT READS THE NORTH ROW SPECIFICALLY. The obvious mistake, and the one actually made, is to
measure "the hero" and get 52 px from whichever row comes to hand. The row you are looking at
when she is against a north wall is NORTH -- her back -- and its piled hair makes it the tallest
of the eight at 55 px. Three pixels of the wrong row is the whole defect.

WHY IT READS THE CONSTANTS RATHER THAN RESTATING THEM. Every number here lives somewhere else and
is free to move: the sheet can be redrawn (it was, this same day), the clearance is tunable, the
face factor is a style lock. A checker that hard-codes them passes happily while the thing it
checks rots. Change any one of them and this fails, which is the point.

    check_hero_fits_wall_face.py            # exit 1 if she does not fit
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png")
DQ = os.path.join(ROOT, "public/dq-tiles.js")

# The g3 wheel starts at SOUTH in 45 deg steps: 0=S 1=SW 2=W 3=NW 4=N 5=NE 6=E 7=SE.
NORTH_ROW = 4
CELL = 64


def _renderer():
    spec = importlib.util.spec_from_file_location(
        "rdmm", os.path.join(ROOT, "scripts/render_dungeon_material_map.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def hero_crown_above_soles() -> int:
    """The tallest of the three NORTH poses, crown to sole, in sprite pixels."""
    sheet = np.array(Image.open(SHEET).convert("RGBA"))
    tallest = 0
    for pose in range(3):
        cell = sheet[NORTH_ROW * CELL:(NORTH_ROW + 1) * CELL, pose * CELL:(pose + 1) * CELL]
        rows = np.where((cell[:, :, 3] > 0).any(1))[0]
        if not len(rows):
            raise SystemExit(f"NORTH pose {pose} is empty -- the sheet is damaged")
        tallest = max(tallest, int(rows.max() - rows.min()))
    return tallest


def wall_standoff() -> int:
    """A1M_FOOT + A1M_LEAN, straight out of the runtime that enforces them."""
    src = open(DQ, encoding="utf-8").read()
    vals = {}
    for name in ("A1M_FOOT", "A1M_LEAN"):
        m = re.search(rf"var\s+{name}\s*=\s*(\d+)", src)
        if not m:
            raise SystemExit(f"{name} not found in public/dq-tiles.js -- has it been renamed?")
        vals[name] = int(m.group(1))
    return vals["A1M_FOOT"] + vals["A1M_LEAN"]


def main() -> int:
    r = _renderer()
    px = r.PX                                     # world pixels per cell (48)
    band = int(px * r.FACE_H_CELLS)
    blur = px * r.FACE_BLUR_CELLS

    crown = hero_crown_above_soles()
    standoff = wall_standoff()
    reach = crown - standoff
    need = reach + blur

    print(f"  hero crown above soles (NORTH row, tallest pose)   {crown:5.1f} px")
    print(f"  stand-off from a north wall (A1M_FOOT + A1M_LEAN)  {standoff:5.1f} px")
    print(f"  => she reaches over the wall                       {reach:5.1f} px")
    print(f"  + blur on the band's top edge                      {blur:5.1f} px")
    print(f"  = band required                                    {need:5.1f} px")
    print(f"  band actual (FACE_H_CELLS {r.FACE_H_CELLS} x {px})            {band:5.1f} px")

    if band < need:
        print(f"\nFAIL: {need - band:.1f} px of her sits outside the shaded face.")
        print(f"      Raise FACE_H_CELLS to at least {need / px:.3f} "
              f"(docs/DUNGEON-EDGE-STYLE-LOCK.md).")
        return 1

    # A band the wall cannot carry is the other failure. Below MIN_WALL_DEPTH_CELLS the renderer
    # prunes the mass entirely, so the shallowest wall that SURVIVES must still show a lit top.
    thinnest = r.MIN_WALL_DEPTH_CELLS * px
    top = thinnest - band
    print(f"\n  shallowest surviving wall ({r.MIN_WALL_DEPTH_CELLS} cells)"
          f"                {thinnest:5.1f} px")
    print(f"  its lit top after the band                         {top:5.1f} px")
    if top < px * 0.5:
        print(f"\nFAIL: the thinnest wall the renderer keeps has only {top:.1f} px of lit top, so "
              f"it reads as pure shadow.\n      Raise MIN_WALL_DEPTH_CELLS or lower FACE_H_CELLS.")
        return 1

    print(f"\nPASS: she clears by {band - need:.1f} px, and the thinnest kept wall "
          f"still shows {top:.0f} px of lit top.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
