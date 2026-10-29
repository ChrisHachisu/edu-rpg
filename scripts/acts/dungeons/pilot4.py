#!/usr/bin/env python3
"""PILOT 4: Storm Nest windows rebuilt as part of the masonry. The pilot3 layouts are kept as
they are (owner: the layouts are fine; the pasted window tiles looked stuck on).

Each window is an EMBRASURE: a splayed radial slot cut right through the outer wall's thickness.
It is about 1.2 cells wide at the room face and 0.85 at the outer face (a slight splay), and the sky shows through
its mouth. The renderer draws the slot as geometry (pilot3_render.embrasure_field, picture only),
so its cheeks get the same face band, outline and AO as every other wall edge, and they sit in
the wall-top perspective because they are cut into the same field. The preview adds the sky in
the mouth and a pool of daylight on the floor inside.

Placement: up to 8 embrasures, at least 34 degrees apart. Never within 26 degrees of the F1 door.
Only where the room floor in front is clear for 2 cells (no interior wall butting into the window).

  python3 pilot4.py                                # write <scratch>/pilot4/stormNest-f{1,2}.json
  PILOT_DIR=pilot4 python3 pilot3_render.py stormNest-f1 --fast   (and f2, one process each)
  PILOT_DIR=pilot4 python3 pilot3_preview.py stormNest-f1,stormNest-f2
"""
import json, math, os
import numpy as np
import common
from common import SCRATCH

P3 = os.path.join(SCRATCH, "pilot3")
P4 = os.path.join(SCRATCH, "pilot4")


def embrasures(o, n_max=8, gap=34.0):
    g = np.array(o["tiles"])
    t = o["tower"]
    c, rin = t["centre"], t["innerRadius"]
    door = None
    if o["floor"] == 1:
        m = next(a for a in o["assets"] if a["kind"] == "mouth")
        door = math.degrees(math.atan2(m["y"] - c, m["x"] - c)) % 360

    def clear(a):
        tr = math.radians(a)
        ux, uy, vx, vy = math.cos(tr), math.sin(tr), -math.sin(tr), math.cos(tr)
        for rr in np.arange(rin - 2.6, rin - 0.4, 0.3):
            for s in (-0.9, 0.0, 0.9):
                x = int(round(c + rr * ux + s * vx)); y = int(round(c + rr * uy + s * vy))
                if g[y, x] != 0:
                    return False
        return True

    cands = [a for a in np.arange(0, 360, 3.0) if clear(a)
             and (door is None or min(abs(a - door), 360 - abs(a - door)) > 26)]
    # greedy, spread: start from the candidate nearest north (the face the camera sees best)
    picked = []
    for a in sorted(cands, key=lambda a: min(abs(a - 270), 360 - abs(a - 270))):
        if all(min(abs(a - b), 360 - abs(a - b)) >= gap for b in picked):
            picked.append(float(a))
        if len(picked) >= n_max:
            break
    return [{"angle": a, "inner": 0.58, "outer": 0.42} for a in sorted(picked)]


def main():
    os.makedirs(P4, exist_ok=True)
    for f in (1, 2):
        o = json.load(open(os.path.join(P3, f"stormNest-f{f}.json")))
        o["decals"].pop("skyWindow", None)
        o["decals"]["embrasures"] = embrasures(o)
        o["source"] = "pilot3.py layout; pilot4.py embrasures"
        json.dump(o, open(os.path.join(P4, f"stormNest-f{f}.json"), "w"))
        print(f"stormNest-f{f}: {len(o['decals']['embrasures'])} embrasures at",
              [round(e["angle"]) for e in o["decals"]["embrasures"]])


if __name__ == "__main__":
    main()
