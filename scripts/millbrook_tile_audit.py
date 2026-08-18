#!/usr/bin/env python3
"""Prove each baked Millbrook tile is a drawing of MILLBROOK'S OWN PLAN, and not another town's.

THE HAZARD IS STRUCTURAL, NOT HYPOTHETICAL
    `rebake_town_tiles.py` recovers the generator's output with `newest_since(t0)`, which walks
    ~/.codex/generated_images -- a directory shared by every codex session on the machine -- and
    returns the newest PNG anywhere under it. That is sound when one bake is running. Act 1's three
    towns were built by three agents AT THE SAME TIME, and greenhollow's bake writes into the same
    directory: observed during this build, two `codex exec` pairs alive at once (pids 21560/21561
    and 22930/22931) with fresh images landing in both sessions' folders minutes apart. If a
    neighbour's tile finishes while ours is still generating, `newest_since` hands OUR pipeline
    THEIR image, and every downstream step -- stitch, gate, ship -- accepts it silently. The finish
    gate cannot catch it either: a well-drawn tile of the wrong village passes DENSITY, PALETTE and
    FINISH exactly as well as the right one.

WHAT SEPARATES THEM
    Each tile was primed from `primer-{i}{j}.png`, a colour-coded plan of that quarter of THIS
    town: pale paving where the player walks, mid green inside the palisade, dark green outside,
    blue water, a brown ring for the wall. A faithful redraw keeps that large-scale luminance
    layout even though it repaints every pixel -- pale stays pale and woodland stays dark. A
    drawing of a DIFFERENT town has its lanes and buildings somewhere else entirely, so the
    correlation collapses. This measures that, per tile, at a scale (64x64) coarse enough to ignore
    the craft the generator is supposed to be adding and fine enough to see the layout.

    The absolute number matters less than the SPREAD: four tiles of the same town, drawn from the
    same plan by the same model, land in the same band. One tile far below the others is the tell.

USAGE
    python3 scripts/millbrook_tile_audit.py            # audits raw-{ij}.png against primer-{ij}.png
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-towns/millbrook")
S = 64                      # comparison scale: layout, not craft
FLOOR = 0.35                # a redraw of the same plan clears this comfortably; another town does not


def lum(p: str) -> np.ndarray:
    a = np.asarray(Image.open(p).convert("RGB").resize((S, S), Image.LANCZOS)).astype(float)
    return a @ np.array([0.2126, 0.7152, 0.0722])


def main() -> int:
    rows, bad = [], []
    for i in range(2):
        for j in range(2):
            raw = os.path.join(DIR, f"raw-{i}{j}.png")
            pri = os.path.join(DIR, f"primer-{i}{j}.png")
            if not os.path.exists(raw):
                print(f"  tile {i}{j}  MISSING {os.path.relpath(raw, ROOT)}")
                bad.append(f"{i}{j} missing")
                continue
            a, b = lum(raw).ravel(), lum(pri).ravel()
            r = float(np.corrcoef(a, b)[0, 1])
            rows.append((f"{i}{j}", r))
            print(f"  tile {i}{j}  layout correlation vs its own primer  {r:+.3f}")
            if r < FLOOR:
                bad.append(f"{i}{j} r={r:+.3f}")

    if len(rows) == 4:
        vals = [r for _, r in rows]
        print(f"\n  spread {min(vals):+.3f} .. {max(vals):+.3f}   (range {max(vals)-min(vals):.3f})")
        # An outlier is the signature of a swapped tile even when every value clears the floor.
        med = float(np.median(vals))
        for name, r in rows:
            if med - r > 0.25:
                bad.append(f"{name} is {med - r:.3f} below the median of the other tiles")

    if bad:
        print("\nTILE AUDIT FAIL")
        for b in bad:
            print(f"  - {b}  -> this tile does not look like a drawing of Millbrook's own plan. "
                  f"Most likely newest_since() picked up a CONCURRENT bake's image. Re-run "
                  f"`python3 scripts/rebake_town_tiles.py --town millbrook --only {b[:2]}` with no "
                  f"other codex generation running, and re-audit before stitching.")
        return 1
    print("\nTILE AUDIT PASS: every tile matches its own primer's layout")
    return 0


if __name__ == "__main__":
    sys.exit(main())
