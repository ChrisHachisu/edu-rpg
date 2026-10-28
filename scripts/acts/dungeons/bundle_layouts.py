#!/usr/bin/env python3
"""Run the SHIPPED generator (extracted by extract_bundle_generator.py) for every Acts 2-5 floor,
with the exact arguments WorldMapScene.loadMap passes:
  Ap(100, 100, id.charCodeAt(0)*251, floor, floors, conns>1 && floors===1,
     conns>1 && floors>1 && floor===floors, castle, mechanic, id)
then apply loadMap's own post-steps that change tiles (forest-maze: Ts->0 and the correct-exit
marker). Writes <scratch>/bundle-gen/<id>-fN.json (map + every side channel the generator returns)
and a tile-coloured overview per dungeon.

These ARE the gameplay layouts (collision = mapData) for any dungeon not in dq-tiles' A1D_MAPS.
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw
import common
from specs import SPECS
OUT = os.path.join(common.SCRATCH, "bundle-gen")
defs = json.load(open(os.path.join(OUT, "defs.json")))
SRC = open(os.path.join(common.ROOT, "runtime/baselines/v1.17.1-ipad-hud-walk/assets/index-BhoGQRaA.js"), encoding="utf-8").read()

# tile palette for the overview only
PAL = {0: (200, 190, 160), 1: (40, 36, 34), 2: (120, 200, 120), 3: (90, 70, 50), 4: (240, 200, 40),
       5: (240, 80, 20), 6: (60, 160, 255), 7: (255, 0, 0), 8: (180, 150, 40), 9: (0, 90, 255),
       10: (255, 120, 120), 14: (0, 255, 200), 18: (255, 255, 255)}


def gen(did, floor):
    d = defs[did]
    n = d["floors"]
    multi1 = d["conns"] > 1 and n == 1
    multiF = d["conns"] > 1 and n > 1 and floor == n
    js = os.path.join(OUT, "apgen.js")
    r = subprocess.run(["node", js, did, did[0], str(floor), str(n), "1" if d["castle"] else "0",
                        d["mechanic"] or "-", "1" if multiF else "0"],
                       capture_output=True, text=True, check=True)
    res = json.loads(r.stdout)
    return res


def overview(did, floors):
    S = 4
    ims = []
    for f, res in floors:
        m = np.array(res["map"])
        h, w = m.shape
        im = Image.new("RGB", (w * S, h * S + 14), (10, 10, 10))
        px = im.load()
        for y in range(h):
            for x in range(w):
                c = PAL.get(int(m[y, x]), (255, 0, 255))
                for dy in range(S):
                    for dx in range(S):
                        px[x * S + dx, 14 + y * S + dy] = c
        ImageDraw.Draw(im).text((2, 1), f"{did} F{f} {w}x{h}", fill=(255, 255, 255))
        ims.append(im)
    W = sum(i.width for i in ims) + 4 * len(ims)
    sheet = Image.new("RGB", (W, max(i.height for i in ims)), (0, 0, 0))
    x = 0
    for i in ims:
        sheet.paste(i, (x, 0)); x += i.width + 4
    sheet.save(os.path.join(OUT, f"{did}-bundle-overview.png"))


def main():
    only = sys.argv[1].split(",") if len(sys.argv) > 1 else [s["id"] for s in SPECS]
    for did in only:
        floors = []
        for f in range(1, defs[did]["floors"] + 1):
            res = gen(did, f)
            json.dump(res, open(os.path.join(OUT, f"{did}-f{f}.json"), "w"))
            vals = {}
            for row in res["map"]:
                for v in row:
                    vals[v] = vals.get(v, 0) + 1
            floors.append((f, res))
            extra = sorted(k for k in res if k != "map")
            print(f"{did}-f{f} {len(res['map'][0])}x{len(res['map'])} tiles {dict(sorted(vals.items()))} keys {extra}")
        overview(did, floors)


if __name__ == "__main__":
    main()
