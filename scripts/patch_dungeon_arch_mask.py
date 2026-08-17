#!/usr/bin/env python3
"""Subtract the baked CAVE-MOUTH ARCH from a dungeon floor's walk mask.

WHY
    Owner, build 38 and again on build 42: "darkfang grotto's entrance (inside of the dungeon) is
    unnatural (the player can walk on top of the arch above the entrance) ... It should walk through
    it (under it)." His build-42 screenshot shows her standing on the arch's stone shoulder.

    ROOT CAUSE, and it is a pipeline gap rather than a bad number. `<floor>-walk.png` is derived
    from the FLOOR FIELD, which knows only floor-vs-rock from the floor's `rows`. The cave mouth is
    drawn on the PROPS layer, which is not an input to that derivation at all. So the mask calls the
    whole cell open while `-props.png` paints solid masonry across it, and the collision and the
    picture disagree by exactly the arch.

    A FIRST READING OF THIS SAID "UNFIXABLE WITHOUT NEW ART" AND WAS WRONG. That analysis worked in
    CELLS: the mouth at (40,27) has rock on all four sides except (40,26), so blocking (40,26) would
    strand the exit. But the mask is a PIXEL field, not a cell grid. Measured on mistyGrotto-f1,
    blocking only the stone-dark pixels removes 35.9% of the open pixels in the mouth's
    neighbourhood and the bright opening REMAINS connected to the gravel floor -- there is a throat
    between the arch's shoulders wide enough to walk through. Which is what the art depicts.

WHAT IT DOES
    For each floor-1 asset of kind "mouth", takes the cell neighbourhood around it and clears every
    mask pixel whose props-layer luminance is below STONE_LUM. Then it VERIFIES, and refuses to
    write if the verification fails:
      * the bright opening is still reachable from the surrounding floor, and
      * the floor's overall open area has not fallen by more than MAX_LOSS.

    Scoped to the mouth's own neighbourhood on purpose. A global "dark pixels are rock" pass would
    eat legitimately dark floor elsewhere on a jagged-black-fang-rock map.

USAGE
    python3 scripts/patch_dungeon_arch_mask.py                 # all floor-1 mouths, in place
    python3 scripts/patch_dungeon_arch_mask.py --check         # verify only, exit 1 if a patch is due
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "public" / "act1-dungeon-art"
FLOORS = ROOT / "dist" / "act1-dungeon-floors.json"
TILE = 48

STONE_LUM = 62        # below this on the props layer is masonry/rock, not floor
OPENING_LUM = 150     # the lit mouth itself
PAD_CELLS = 3         # neighbourhood around the mouth cell
MAX_LOSS = 0.02       # refuse if more than 2% of the floor's open area disappears


def luminance(rgb: np.ndarray) -> np.ndarray:
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def patch_floor(key: str, mouth: dict, check: bool) -> tuple[bool, str]:
    props_p, walk_p = ART / f"{key}-props.png", ART / f"{key}-walk.png"
    if not props_p.exists() or not walk_p.exists():
        return True, f"{key}: no props/walk pair, skipped"

    lum = luminance(np.asarray(Image.open(props_p).convert("RGB")).astype(float))
    walk = np.asarray(Image.open(walk_p).convert("L")) > 127
    before_open = int(walk.sum())

    y0 = max(0, (mouth["y"] - PAD_CELLS) * TILE); y1 = min(walk.shape[0], (mouth["y"] + PAD_CELLS + 1) * TILE)
    x0 = max(0, (mouth["x"] - PAD_CELLS) * TILE); x1 = min(walk.shape[1], (mouth["x"] + PAD_CELLS + 1) * TILE)

    sub_w, sub_l = walk[y0:y1, x0:x1], lum[y0:y1, x0:x1]
    stone = sub_l < STONE_LUM
    if not (sub_w & stone).any():
        return True, f"{key}: arch already blocked, nothing to do"

    new_sub = sub_w & ~stone

    # VERIFY BEFORE WRITING. The mouth is an exit; stranding it is worse than the bug.
    lab, _ = ndimage.label(new_sub)
    opening = sub_l >= OPENING_LUM
    seeds = set(lab[new_sub].tolist()) & set(lab[:, :6][new_sub[:, :6]].tolist())
    open_ids = set(lab[new_sub & opening].tolist()) - {0}
    if not (seeds & open_ids):
        return False, f"{key}: REFUSED -- blocking the arch would strand the mouth"

    patched = walk.copy(); patched[y0:y1, x0:x1] = new_sub
    loss = 1 - patched.sum() / max(before_open, 1)
    if loss > MAX_LOSS:
        return False, f"{key}: REFUSED -- would remove {100*loss:.1f}% of the floor's open area"

    msg = (f"{key}: arch blocked, {int(sub_w.sum() - new_sub.sum())} px "
           f"({100*loss:.2f}% of the floor), mouth still reachable")
    if check:
        return False, msg + "  [--check: patch is DUE]"
    Image.fromarray((patched * 255).astype(np.uint8), mode="L").convert("1").save(walk_p)
    return True, msg + "  WRITTEN"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    floors = json.loads(FLOORS.read_text())["floors"]
    ok = True
    for key, fl in floors.items():
        if fl.get("floor") != 1:
            continue
        mouth = next((a for a in fl.get("assets", []) if a.get("kind") == "mouth"), None)
        if not mouth:
            continue
        good, msg = patch_floor(key, mouth, args.check)
        print(("  " if good else "  ") + msg)
        ok = ok and good
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
