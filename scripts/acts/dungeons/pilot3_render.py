#!/usr/bin/env python3
"""PILOT 3 renders: the pilot floors on the REAL Codex materials (material_pack.py import ->
design/materials/<dungeon>/), with the shipped Act 1 renderer. Two changes come from outside the
renderer: its source is untouched, and each change swaps one of its module functions for this
process only.

  no puddles       R.fbm returns 0 for the standing-water mask (seed 41, scale px*5) only. The
                   `accent` quadrants of these sheets (mine planks, forest undergrowth, wet tower
                   flags) are not water, and a tower is not flooded.
  BUILT field      for `built` floors (Storm Nest), R.floor_field is swapped for built_field().
                   It uses the same lattice, prune, prop pockets, neck/speck/shadow passes, Field
                   and 0.5 threshold (so walkable_mask() still derives collision from the art). It
                   drops only the organic boundary warp: a light blur (px*0.09) gives straight
                   dressed faces with slightly rounded arrises, and a fine low-amplitude wear term
                   chips them. The round outer wall is analytic: the inner face is a true circle
                   at `innerRadius`, not a cell staircase.
                   Lighting, AO, the face band, cast shadow, the base band and the outline are the
                   renderer's own, unchanged.

  python3 pilot3_render.py ironMine-f1,hauntedForest-f1 [--fast]
Reads <scratch>/pilot3/<floor>.json and writes <scratch>/pilot3/art/<floor>-props.png and -walk.png.
"""
import json, os, resource, sys, time
import numpy as np
import common
from common import SCRATCH, MATROOT
import render_floors
import render_dungeon_material_map as R
import pilot2_render                     # noqa: F401  installs the TARGET/WATER entries for the themes

P3 = os.path.join(SCRATCH, "pilot3")
ART = os.path.join(P3, "art")

_fbm = R.fbm


def _fbm_dry(wx, wy, scale, seed, octaves=3):
    if seed == 41:                       # render(): pooln = fbm(xx, yy, px*5.0, 41), the water mask
        return np.zeros_like(wx, dtype=np.float32)
    return _fbm(wx, wy, scale, seed, octaves)


TOWER = None                             # {"centre", "innerRadius"} while rendering a built floor


def built_field(rows, scale=1, assets=None):
    rows, pruned = R.prune_thin_walls(rows)
    if pruned:
        print(f"  pruned {len(pruned)} wall cell(s)")
    px_world = max(1, R.PX // scale)
    ch, cw = len(rows), len(rows[0])
    Ww, Hw = cw * px_world, ch * px_world
    W = int(round(Ww * R.LATTICE_SCALE)); H = int(round(Hw * R.LATTICE_SCALE))
    px = W / cw
    solid = np.array([[1.0 if c == "#" else 0.0 for c in r] for r in rows], np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx = np.minimum((xx / px).astype(np.int64), cw - 1)
    cy = np.minimum((yy / px).astype(np.int64), ch - 1)
    up = 1.0 - solid[cy, cx]
    if TOWER:
        # The ring of cells the outer wall stands on is decided by the analytic circle, not by
        # the cells. Floor cells beyond innerRadius (the F1 doorway) stay cut through.
        c, rin = TOWER["centre"], TOWER["innerRadius"]
        rc = np.hypot(np.arange(cw)[None, :] - c, np.arange(ch)[:, None] - c)
        ring = rc >= rin                                                  # cells the circle owns
        # interior walls keep every cell inside the circle; a wall that meets the outer wall is
        # carried one cell on into the ring so it reaches the curved face with no sliver gap
        cell_up = 1.0 - solid
        inner_cells = np.where(ring, 1.0, cell_up)
        for y, x in np.argwhere(ring):
            dx_, dy_ = x - c, y - c
            ix = x - int(np.sign(dx_)) if abs(dx_) >= abs(dy_) else x
            iy = y - int(np.sign(dy_)) if abs(dy_) >= abs(dx_) else y
            if not ring[iy, ix] and solid[iy, ix] and solid[y, x]:
                inner_cells[y, x] = 0.0
        door_cells = np.where(ring, cell_up, 0.0)                         # floor cut through the ring
        inner_up = inner_cells[cy, cx]
        door_up = door_cells[cy, cx]
        r = np.hypot(xx / px - (c + 0.5), yy / px - (c + 0.5))
        circ = np.clip((rin + 0.5 - r) * px / (px * 0.10 * 2.5) + 0.5, 0, 1)
        f = np.minimum(R.blur(inner_up, px * 0.09), circ)
        f = np.maximum(f, R.blur(door_up, px * 0.09))
        del r, circ, inner_up, door_up
    else:
        f = R.blur(up, px * 0.09)
    del cx, cy, up
    # wear: a fine, low-amplitude chip on the arrises, gated to the boundary like the Act 1 warp
    wear = (_fbm(xx, yy, px * 0.45, 11) - 0.5) * 2.0
    gate = np.clip(4.0 * f * (1.0 - f), 0.0, 1.0)
    fw = np.clip(f + wear * 0.16 * gate, 0.0, 1.0)
    fw = R.drop_rock_islands(fw, px)
    prot = np.zeros((H, W), np.float32)
    for it in assets or []:
        if it["kind"] == "mouth" or it.get("onWall"):
            continue
        rr = px * min(1.22 * R.PROP_CELLS.get(it["kind"], 1.0), 1.9)
        d = np.sqrt((xx - (it["x"] + 0.5) * px) ** 2 + ((yy - (it["y"] + 0.38) * px) / 1.18) ** 2)
        t = np.clip(1.0 - d / rr, 0.0, 1.0)
        prot = np.maximum(prot, t * t * (3.0 - 2.0 * t))
    # a built room keeps square corners: the pocket only lifts what is ALREADY near floor, so it
    # never bites a round crater into a straight wall (it still frees a chest standing in a corner)
    fw = np.maximum(fw, np.minimum(prot, np.clip(f * 2.2, 0, 1)))
    fw = R.trim_wall_necks(fw, px, wear * 0.0)
    fw, sealed = R.seal_floor_specks(fw, px, prot if assets else None)
    fw = R.thicken_shadow_walls(fw, px, sealed, wear * 0.0)
    if assets:
        fw = np.maximum(fw, np.minimum(prot, np.clip(f * 2.2, 0, 1)))
    return R.Field(fw=fw, prot=prot, xx=xx, yy=yy, px=px, W=W, H=H, Ww=Ww, Hw=Hw, cw=cw, ch=ch)


_organic = R.floor_field


def render_one(fid):
    global TOWER
    o = json.load(open(os.path.join(P3, f"{fid}.json")))
    did = o["dungeonId"]
    mdir = os.path.join(MATROOT, did)
    assert json.load(open(os.path.join(mdir, "source.json")))["source"] == "codex", f"{did}: not imported"
    assets = [dict(a, kind=o.get("spriteFor", {}).get(a["kind"], a["kind"])) for a in o["assets"]]
    assets = [a for a in assets if a["kind"] in R.PROP_CELLS]          # runtime-layer kinds stay out
    if o.get("built"):
        TOWER = o.get("tower")
        # a lit stone building, not a blue-black cave: floor down, walls up (less cave contrast)
        R.TARGET[o["theme"]] = {"floor": (100, 100, 104), "wall": (34, 38, 50)}
        R.floor_field = built_field
    else:
        TOWER = None
        R.floor_field = _organic
    R.fbm = _fbm_dry
    os.makedirs(ART, exist_ok=True)
    t0 = time.time()
    R.walkable_mask(o["rows"], assets).save(os.path.join(ART, f"{fid}-walk.png"), optimize=True)
    mats = R.load_materials(mdir)
    if o.get("built"):
        # the Codex flags are busy at full contrast and fight the walls for attention: calm the
        # floor so the masonry masses read as the solid thing in the room
        fm = mats["floor"].astype(np.float32)
        mats["floor"] = (fm.mean((0, 1)) + 0.55 * (fm - fm.mean((0, 1)))).astype(mats["floor"].dtype)
    img = R.render(o["rows"], mats, o["theme"], 1, assets, True, None, ())
    img.save(os.path.join(ART, f"{fid}-props.png"))
    mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"{fid} {o['width']}x{o['height']} -> {img.size} in {time.time() - t0:.0f}s, peak {mb:.0f} MB", flush=True)


if __name__ == "__main__":
    if "--fast" in sys.argv:
        R.blur = render_floors._fast_blur
    for fid in sys.argv[1].split(","):
        render_one(fid)
