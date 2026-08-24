#!/usr/bin/env python3
"""Catch a 3x4 NPC sheet whose FACING ROWS are wrong, which no other gate can see.

Why this exists
---------------
`measure_npc_style.py` scores local contrast and `check_character_finish.py` scores the edge and
the key bleed. Both are blind to whether the twelve cells actually show the four facings the
runtime indexes them by. On 2026-08-24 `greenhollow-villager1` passed BOTH of those gates at
32.76 / 44.2 and PASS while its row 2 -- the RIGHT facing -- had been drawn as a view from
behind, with the character's basket missing. In game that NPC turns its back when it walks right.
A human looked at a contact sheet and reported "distinct L/R poses"; the rows are small and the
duplication is easy to miss by eye, so the check is mechanical here instead.

Rows are 0 down, 1 left, 2 right, 3 up.

The three failures it detects
-----------------------------
  right-row-is-a-back-view : row 2 resembles row 3 far more than row 1 does. Healthy sheets in
                             this cast sit within ~20% (elder 60.5 vs 62.0, sailor 55.1 vs 51.1);
                             the broken villager1 read 32.1 against 62.8.
  right-row-is-mirrored    : row 2 is row 1 flipped. The brief forbids mirroring -- lighting is a
                             single top-left source, so a flip lights the figure from the wrong
                             side.
  left-and-right-identical : the two profiles are the same drawing.

Usage:
    check_npc_pose_rows.py SHEET.png [SHEET.png ...]
Exit 1 if any sheet fails.
"""
from __future__ import annotations

import sys

import numpy as np
from PIL import Image

N = 64
BACK_VIEW_RATIO = 0.55   # row2~row3 below this share of row1~row3 means row 2 is a back view
MIRROR_DIFF = 12.0       # mean abs diff below this means row 2 is row 1 flipped
PROFILE_DIFF = 12.0      # left and right must differ by at least this


def _rows(path: str) -> list[np.ndarray]:
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    if a.shape[0] != 4 * N or a.shape[1] != 3 * N:
        raise SystemExit(f"{path}: expected 192x256, got {a.shape[1]}x{a.shape[0]}")
    return [a[r * N:(r + 1) * N] for r in range(4)]


def _diff(x: np.ndarray, y: np.ndarray) -> float:
    m = (x[..., 3] > 32) | (y[..., 3] > 32)
    return float(np.abs(x[..., :3] - y[..., :3])[m].mean()) if m.any() else 0.0


def main(argv: list[str]) -> int:
    if not argv:
        raise SystemExit(__doc__)
    print(f"  {'sheet':38} {'L~R':>6} {'R~UP':>6} {'L~UP':>6} {'mirror':>7}")
    bad = 0
    for path in argv:
        r = _rows(path)
        lr, rup, lup = _diff(r[1], r[2]), _diff(r[2], r[3]), _diff(r[1], r[3])
        mirror = _diff(r[1], r[2][:, ::-1])
        why = []
        if lup > 0 and rup < lup * BACK_VIEW_RATIO:
            why.append("right row is a BACK VIEW")
        if mirror < MIRROR_DIFF:
            why.append("right row is MIRRORED from left")
        if lr < PROFILE_DIFF:
            why.append("left and right rows IDENTICAL")
        tag = "[PASS]" if not why else "[FAIL]"
        if why:
            bad += 1
        name = path.rsplit("/", 1)[-1]
        print(f"{tag} {name:38} {lr:6.1f} {rup:6.1f} {lup:6.1f} {mirror:7.1f}"
              + ("  " + "; ".join(why) if why else ""))
    if bad:
        print(f"\nNPC POSE ROWS FAIL: {bad} sheet(s) do not carry four distinct facings")
        return 1
    print(f"\nNPC POSE ROWS PASS: {len(argv)} sheet(s) carry four distinct facings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
