#!/usr/bin/env python3
"""Mechanic tracks only: STUB floors, so a mechanic module can be played headless before the
painted art of its dungeon exists (and with floors that load in a blink).

  python3 scripts/acts/probe/mech/stub_floors.py <outdir> ironMine frozenLake:1,2 ...

Writes <outdir>/acts-dungeons/{manifest.json,<id>/...} (the same files export_runtime.py writes,
through export_runtime.py itself and its validation) and <outdir>/nav/<floor>.json. The floor
picture is the plan preview scaled to 48 px per cell and the walk mask is the plan's open cells
pulled in a few px (so walls are not cell-shaped). Nothing here is shipped: copy the folder over
a cloud dist's acts-dungeons/ and run the probe with ?d2smoke=1. Real art replaces it by a merge.
"""
import hashlib, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(HERE))))
sys.path.insert(0, os.path.join(ROOT, "scripts", "acts", "dungeons2"))
import d2common as C

OPEN = {"frozenLake": "~", "frostfallCavern": "~"}             # plan chars the dungeon's mask opens besides WALKABLE
ACT = {"ironMine": 2, "frozenLake": 2, "stormNest": 2, "shadowCave": 2, "hauntedForest": 2,
       "desertTomb": 3, "banditHideout": 3, "scorchedRuins": 3}


def stub(fid, art, extra):
    p = C.load_plan(fid)
    W, H = p["width"], p["height"]
    prev = Image.open(os.path.join(C.PLANS, fid + ".png")).convert("RGB").resize((W * 48, H * 48), Image.NEAREST)
    prev.save(os.path.join(art, fid + "-material.webp"), quality=55)
    op = np.array([[(c in C.WALKABLE or c in extra) for c in r] for r in p["rows"]], bool)
    for a in p["assets"]:
        if a["kind"] == "mouth":
            cells, run, _ = C.mouth_cells(p, a)
            for (x, y) in cells + run:
                op[y, x] = True
    big = np.kron(op, np.ones((48, 48), bool))
    big = ndimage.binary_erosion(big, ndimage.generate_binary_structure(2, 2), iterations=5, border_value=1)
    Image.fromarray((big * 255).astype(np.uint8)).convert("1").save(os.path.join(art, fid + "-walk.png"))
    sha = hashlib.sha256(open(C.plan_path(fid), "rb").read()).hexdigest()[:16]
    json.dump({"planSha": sha, "over": [], "stub": True}, open(os.path.join(art, fid + ".art.json"), "w"))


def main():
    out = os.path.abspath(sys.argv[1]); jobs = sys.argv[2:]
    C.WORK = out; C.ART = os.path.join(out, "art"); C.PUBLIC = os.path.join(out, "acts-dungeons")
    os.makedirs(C.ART, exist_ok=True); os.makedirs(C.PUBLIC, exist_ok=True)
    for k, v in (("south", (0, 1)), ("north", (0, -1)), ("west", (-1, 0)), ("east", (1, 0))):
        C.SIDE.setdefault(k, v)
    smoke = []
    for j in jobs:
        did, _, fl = j.partition(":")
        C.DUNGEONS.setdefault(did, dict(act=ACT.get(did, 2)))
        extra = OPEN.get(did, "")
        C.WALKABLE |= set(extra)
        fids = [f"{did}-f{n}" for n in fl.split(",")] if fl else C.floors_of(did)
        for fid in fids:
            stub(fid, C.ART, extra)
        smoke.append(did + ":" + ",".join(f.rsplit("-f", 1)[1] for f in fids))
    import export_runtime as E
    sys.argv = ["export_runtime.py"] + [x for s in smoke for x in ("--smoke", s)]
    try:
        E.main()
    except SystemExit as e:
        if e.code:
            print("export_runtime reported problems (stub floors: read them, they may be real plan/mask issues)")
    man_p = os.path.join(C.PUBLIC, "manifest.json")
    if os.path.exists(man_p):
        man = json.load(open(man_p))
        mods = sorted(f for f in os.listdir(os.path.join(ROOT, "public", "acts-dungeons", "modules")) if f.endswith(".js")) \
            if os.path.isdir(os.path.join(ROOT, "public", "acts-dungeons", "modules")) else []
        man["modules"] = ["acts-dungeons/modules/" + f for f in mods]
        for did in man["dungeons"]:
            for k, fl in man["floors"].items():
                if k.startswith(did + "-f") and OPEN.get(did):
                    fl["open"] = OPEN[did]
        json.dump(man, open(man_p, "w"), separators=(",", ":"))
        print("stub manifest:", man_p, "modules", man["modules"])


if __name__ == "__main__":
    main()
