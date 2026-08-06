#!/usr/bin/env python3
"""Is every baked dungeon floor still WALKABLE, at the hero's real clearance?

Owner, 2026-08-06, on the wall-thickening pass: "if this causes occlusions we will need to redraw
the dungeons so they make sense visually and are playable."

Thickening a wall northward takes floor away. That is safe for the picture and provably safe for
connectivity of the raw mask -- `thicken_shadow_walls` checks both -- but neither of those is the
question a PLAYER asks. The mask being connected means a zero-radius point could get through. The
heroine is not a point: `a1mFree` in dq-tiles.js tests her GROUND CONTACT POINT and demands
A1M_FOOT + A1M_LEAN of clearance from rock, so a corridor can be open on the mask and impassable
to her. This checks the region she can actually stand in.

    passable = { floor pixels at least (A1M_FOOT + A1M_LEAN) px from rock }

and then asserts, per floor:

  * passable is ONE connected region -- no pocket of the dungeon is walled off from the rest;
  * every authored asset (stairs, boss, save, chests, the mouth) is reachable from it;
  * the narrowest corridor is reported, so a floor that is merely tight shows up as a number
    rather than as a bug report three weeks later.

WHY IT READS THE CONSTANTS OUT OF dq-tiles.js. The clearance is tunable and has already moved once
(A1M_FOOT 16 -> 12 + a 4 px northward lean). A checker with its own copy of a number it does not
own passes happily while the thing it checks rots.

    check_dungeon_playable.py            # exit 1 if any floor is unplayable
"""
from __future__ import annotations

import json
import os
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "public/act1-dungeon-art")
SRC = os.path.join(ROOT, "design/act1-dungeon-interiors")
DQ = os.path.join(ROOT, "public/dq-tiles.js")
PX = 48

# Mirrors A1D_MAPS in dq-tiles.js -- the dungeons whose art the runtime actually blits.
SHIPPED = {"coastalReef": 3, "mistyGrotto": 3, "sunkenCellar": 3, "whisperingWoodsCave": 3}


def clearance() -> int:
    src = open(DQ, encoding="utf-8").read()
    out = 0
    for name in ("A1M_FOOT", "A1M_LEAN"):
        m = re.search(rf"var\s+{name}\s*=\s*(\d+)", src)
        if not m:
            raise SystemExit(f"{name} not found in public/dq-tiles.js -- renamed?")
        out += int(m.group(1))
    return out


def main() -> int:
    need = clearance()
    print(f"hero clearance from rock: {need} px (A1M_FOOT + A1M_LEAN, read from dq-tiles.js)\n")
    print(f"{'floor':<24} {'passable':>9} {'regions':>8} {'narrowest':>10}  assets")
    bad = 0
    for dungeon in sorted(SHIPPED):
        for n in range(1, SHIPPED[dungeon] + 1):
            key = f"{dungeon}-f{n}"
            mask = os.path.join(ART, f"{key}-walk.png")
            if not os.path.isfile(mask):
                print(f"{key:<24} MISSING {mask}")
                bad += 1
                continue
            floor = np.array(Image.open(mask).convert("L")) > 127
            # Distance from every floor pixel to the nearest rock. Her sole must sit `need` clear.
            dist = ndimage.distance_transform_edt(floor)
            passable = dist >= need
            lab, regions = ndimage.label(passable)
            if regions:
                sizes = np.bincount(lab.ravel())
                sizes[0] = 0
                main_region = int(sizes.argmax())
            else:
                main_region = 0

            # A corridor's half-width is the local distance-to-rock along its centre, so the
            # narrowest corridor is twice the smallest ridge maximum. Reported, not asserted --
            # tight is a judgement call, disconnected is not.
            narrowest = 2 * float(dist[passable].min()) if passable.any() else 0.0

            layout = json.load(open(os.path.join(SRC, f"{key}.json"), encoding="utf-8"))
            unreachable = []
            for asset in layout.get("assets") or []:
                if asset.get("onWall"):
                    continue                            # plaques are meant to be in the rock
                cy, cx = asset["y"] * PX + PX // 2, asset["x"] * PX + PX // 2
                if not (0 <= cy < lab.shape[0] and 0 <= cx < lab.shape[1]):
                    unreachable.append(asset["kind"])
                    continue
                # Reachable if the main passable region comes within a cell of the asset.
                y0, y1 = max(0, cy - PX), min(lab.shape[0], cy + PX)
                x0, x1 = max(0, cx - PX), min(lab.shape[1], cx + PX)
                if not (lab[y0:y1, x0:x1] == main_region).any():
                    unreachable.append(asset["kind"])

            ok = regions == 1 and not unreachable
            bad += 0 if ok else 1
            note = "ok" if ok else ("UNREACHABLE: " + ", ".join(unreachable) if unreachable
                                    else f"{regions} DISCONNECTED REGIONS")
            print(f"{key:<24} {passable.sum() / (PX * PX):9.0f} {regions:8d} "
                  f"{narrowest:9.0f}px  {note}")

    print()
    if bad:
        print(f"FAIL: {bad} floor(s) are not playable at {need} px clearance.")
        return 1
    print(f"PASS: every shipped floor is one connected walkable region at {need} px clearance, "
          f"with every asset reachable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
