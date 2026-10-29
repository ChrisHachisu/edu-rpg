#!/usr/bin/env python3
"""Render Acts 2-5 floors with the SHIPPED Act 1 renderer, unchanged.

`scripts/render_dungeon_material_map.py` is imported as a module and only its per-theme tables
(TARGET, WATER) are extended in memory with themes.py's values; `render()` and `walkable_mask()`
are called exactly as its own main() calls them (scale 1, props on). Act 1 reproduces
byte-identically through this path (verified on sunkenCellar-f1-props.png, max diff 0).

Outputs, per floor, into <scratch>/runtime/<act>-dungeon-art/ (named like public/act1-dungeon-art):
  <floor>-props.png   the floor picture with props baked (what dq-tiles.js blits)
  <floor>-walk.png    1-bit walkable mask (== render_dungeon_material_map.py --emit-mask)
plus a .prov/<file>.json sidecar with input hashes.

    render_floors.py --floors ironMine-f1,stormNest-f1   |   --all-f1   |   --all
"""
import argparse, hashlib, json, os, resource, sys, time
import common
from common import DESIGN, MATROOT, RUNTIME
import render_dungeon_material_map as R
from themes import T
from specs import SPECS, BY_ID



def _h32(ix, iy, seed):
    """BIT-IDENTICAL to R._h, ~2.5x faster: every step is masked to 31 bits, and the low 31 bits
    of a product are the same in wrapping uint32 as in int64. Verified array_equal on 9M random
    coords incl. negatives, 4 seeds. _h was 35% of render CPU in a cProfile of sunkenCellar-f1."""
    import numpy as np
    u = np.uint32
    h = (ix.astype(u) * u(374761393) + iy.astype(u) * u(668265263)
         + u((int(seed) * 1442695041) & 0xFFFFFFFF)) & u(0x7FFFFFFF)
    h = ((h ^ (h >> u(13))) * u(1274126177)) & u(0x7FFFFFFF)
    return ((h ^ (h >> u(16))) & u(0xFFFFFF)).astype(np.float32) / float(0xFFFFFF)


R._h = _h32


def _fast_blur(a, sigma):
    """Same separable kernel and 'edge' padding as R.blur, in scipy's C loop (~3x faster).
    NOT bit-identical: float32 sums differ by <=1.5e-6 (measured, sigma 2..170), i.e. far below
    one uint8 step. Opt-in via --fast; the floor-1 previews were rendered WITHOUT it."""
    import numpy as np
    from scipy import ndimage
    if sigma <= 0:
        return a.astype(np.float32)
    r = int(np.ceil(3.0 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2).astype(np.float32)
    k /= k.sum()
    cur = ndimage.correlate1d(a.astype(np.float32), k, axis=1, mode="nearest")
    return ndimage.correlate1d(cur, k, axis=0, mode="nearest")

for did, r in T.items():
    R.TARGET[r["theme"]] = r["target"]
    R.WATER[r["theme"]] = r["water"]


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def stamp(out, inputs, params):
    d = os.path.join(os.path.dirname(out), ".prov")
    os.makedirs(d, exist_ok=True)
    json.dump({"artefact": os.path.basename(out), "generator": "scripts/acts/dungeons/render_floors.py",
               "renderer": "scripts/render_dungeon_material_map.py",
               "rendererSha256": sha(R.__file__), "inputs": {p: sha(p) for p in inputs},
               "params": params, "sha256": sha(out),
               "writtenAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
              open(os.path.join(d, os.path.basename(out) + ".json"), "w"), indent=1)


def render_one(fid):
    did = fid.rsplit("-f", 1)[0]
    act = BY_ID[did]["act"]
    path = os.path.join(DESIGN, f"{fid}.json")
    fl = json.load(open(path))
    outdir = os.path.join(RUNTIME, f"act{act}-dungeon-art")
    os.makedirs(outdir, exist_ok=True)
    t0 = time.time()
    walk = os.path.join(outdir, f"{fid}-walk.png")
    R.walkable_mask(fl["rows"], fl.get("assets")).save(walk, optimize=True)
    stamp(walk, [path], {"kind": "walkable-mask"})
    stale_base = os.path.join(common.SCRATCH, "arch", "walk-base", f"{fid}-walk.png")
    if os.path.exists(stale_base):          # the arch bake must re-seed from THIS mask
        os.remove(stale_base)
    mdir = os.path.join(MATROOT, did)
    mats = R.load_materials(mdir)
    img = R.render(fl["rows"], mats, fl["theme"], 1, fl.get("assets"), True, None, ())
    out = os.path.join(outdir, f"{fid}-props.png")
    img.save(out)
    stamp(out, [path] + [os.path.join(mdir, f"mat-{q}.png") for q in ("accent", "floor", "rubble", "wall")],
          {"theme": fl["theme"], "scale": 1, "props": True, "fastBlur": R.blur is _fast_blur})
    mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"{fid} {fl['width']}x{fl['height']} -> {img.size} in {time.time()-t0:.0f}s, peak {mb:.0f} MB",
          flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--floors")
    ap.add_argument("--all-f1", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--skip-existing", action="store_true")
    ap.add_argument("--fast", action="store_true", help="scipy blur (not bit-identical, see _fast_blur)")
    a = ap.parse_args()
    if a.fast:
        R.blur = _fast_blur
    if a.floors:
        fids = a.floors.split(",")
    elif a.all_f1:
        fids = [f"{s['id']}-f1" for s in SPECS]
    else:
        fids = [f"{s['id']}-f{n}" for s in SPECS for n in range(1, s["floors"] + 1)]
    for fid in fids:
        did = fid.rsplit("-f", 1)[0]
        o = os.path.join(RUNTIME, f"act{BY_ID[did]['act']}-dungeon-art", f"{fid}-props.png")
        if a.skip_existing and os.path.exists(o):
            continue
        render_one(fid)


if __name__ == "__main__":
    main()
