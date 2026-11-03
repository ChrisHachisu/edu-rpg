#!/usr/bin/env python3
"""Per-floor RUNTIME FIELDS for the shader route (docs/plans/2026-10-28-app-size-budget.md §4).

For every Acts 2-5 floor, on the REAL in-game layout (bundle Ap(), bundle-gen/<floor>.json):

  runtime/fields/<floor>-field.png   8-bit L, 12 px per cell (1/4 of the 48 px world): the floor
                                     weight the material renderer thresholds at 0.5 (255 = floor)
  runtime/fields/<floor>-walk.png    1-bit, same grid: feet collision = field >= 0.5
  runtime/fields/<floor>.json        offsetCells (blit position on the unchanged 100x100 mapData),
                                     size, assets (live sprites), static mechanic ground cells,
                                     method, collision check

Trunk dungeons: render_dungeon_material_map.floor_field(rows, scale=4, assets) -- the same function
the baked Act 1 art and its walk masks come from, sampled at 1/4 res. Its prune step deletes walls
thinner than the face band, so any cell where the field disagrees with the game's wall grid is
CLAMPED back to the game (the engine's mapData stays the authority; the count is recorded).
Mazes (1-cell walls): the cell grid, softened by 2 px, since floor_field would delete every wall.

  python3 fields.py [floor,floor | --all]
"""
import json, os, sys, time
import numpy as np
from PIL import Image, ImageFilter
import common
from common import RUNTIME
from specs import SPECS, BY_ID
import render_dungeon_material_map as R
from bundle_render import load, to_floor, MAZE_MECH

S = 12                                  # px per cell in the field (48 / 4)
OUT = os.path.join(RUNTIME, "fields")
STATIC_MECH = {25: "slideIce", 28: "iceStop", 26: "quicksand", 27: "sinkingSand", 30: "tripwire",
               29: "portal", 24: "torch", 17: "hiddenDoor", 2: "exit"}


def field_for(did, fl):
    rows = fl["rows"]
    H, W = len(rows), len(rows[0])
    game_open = np.array([[c != "#" for c in r] for r in rows], np.float32)
    if BY_ID[did].get("mechanic") in MAZE_MECH:
        f = np.kron(game_open, np.ones((S, S), np.float32))
        f = np.asarray(Image.fromarray((f * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)),
                       np.float32) / 255
        method = "cell grid, 2 px soften (maze: floor_field would prune 1-cell walls)"
    else:
        fld = R.floor_field(rows, 4, fl["assets"])
        f = np.asarray(Image.fromarray(fld.fw, "F").resize((W * S, H * S), Image.Resampling.BOX), np.float32)
        method = "render_dungeon_material_map.floor_field(scale=4)"
    f = np.array(f, np.float32)
    # clamp to the game's wall grid: a cell is open iff the game says so (majority of its inner px)
    clamped = 0
    for y in range(H):
        for x in range(W):
            blk = f[y * S:(y + 1) * S, x * S:(x + 1) * S]
            inner = blk[3:-3, 3:-3].mean() >= 0.5
            if inner != bool(game_open[y, x]):
                clamped += 1
                blk[:] = np.clip(blk, 0.75, 1) if game_open[y, x] else np.clip(blk, 0, 0.25)
    return f, method, clamped


def do(fid):
    t0 = time.time()
    did, fnum, res, m = load(fid)
    fl = to_floor(did, fnum, m)
    f, method, clamped = field_for(did, fl)
    os.makedirs(OUT, exist_ok=True)
    fp = os.path.join(OUT, f"{fid}-field.png")
    Image.fromarray(np.clip(f * 255 + 0.5, 0, 255).astype(np.uint8), "L").save(fp, optimize=True)
    wp = os.path.join(OUT, f"{fid}-walk.png")
    Image.fromarray(((f >= 0.5) * 255).astype(np.uint8)).convert("1").save(wp, optimize=True)
    sub = fl["sub"]
    mech = {}
    for v, name in STATIC_MECH.items():
        ys, xs = np.nonzero(sub == v)
        if len(ys):
            mech[name] = [[int(x), int(y)] for y, x in zip(ys, xs)]
    meta = {"floor": fid, "dungeon": did, "act": BY_ID[did]["act"], "cellPx": S, "worldCellPx": 48,
            "offsetCells": fl["offset"], "width": fl["width"], "height": fl["height"],
            "assets": fl["assets"], "mechanicCells": mech, "method": method,
            "cellsClampedToGame": clamped,
            "bytes": {"field": os.path.getsize(fp), "walk": os.path.getsize(wp)},
            "layoutSource": "bundle Ap() (extract_bundle_generator.py), loadMap's arguments"}
    json.dump(meta, open(os.path.join(OUT, f"{fid}.json"), "w"))
    print(f"{fid:26} {fl['width']}x{fl['height']} cells  field {meta['bytes']['field'] / 1e3:5.1f} KB  "
          f"walk {meta['bytes']['walk'] / 1e3:4.1f} KB  clamped {clamped:3}  {time.time() - t0:4.1f}s", flush=True)
    return meta


TOWER = {"stormNest", "stormreachSpire"}


def add_decals():
    """Theme decals the shader draws as sprites (they are not material): sky window slits on every
    3rd south-facing wall cell of the tower dungeons, the same rule as bundle_render._windows()."""
    for s in SPECS:
        if s["id"] not in TOWER:
            continue
        for i in range(1, s["floors"] + 1):
            fid = f"{s['id']}-f{i}"
            mp = os.path.join(OUT, f"{fid}.json")
            meta = json.load(open(mp))
            did, fnum, res, m = load(fid)
            rows = to_floor(did, fnum, m)["rows"]
            win, n = [], 0
            for y in range(1, len(rows)):
                for x in range(len(rows[0])):
                    if rows[y - 1][x] == "#" and rows[y][x] != "#":
                        n += 1
                        if n % 3 == 0:
                            win.append([x, y - 1])
            meta["decals"] = {"skyWindow": win}
            json.dump(meta, open(mp, "w"))
            print(fid, len(win), "sky windows")


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "--all"
    if arg == "--decals":
        return add_decals()
    fids = ([f"{s['id']}-f{i}" for s in SPECS for i in range(1, s["floors"] + 1)]
            if arg == "--all" else arg.split(","))
    tot = 0
    for fid in fids:
        if arg == "--all" and os.path.exists(os.path.join(OUT, f"{fid}.json")):
            meta = json.load(open(os.path.join(OUT, f"{fid}.json")))
        else:
            meta = do(fid)
        tot += sum(meta["bytes"].values())
    print(f"{len(fids)} floors, {tot / 1e6:.2f} MB of fields + walk masks")


if __name__ == "__main__":
    main()
