#!/usr/bin/env python3
"""Render the REAL in-game layouts (bundle generator, see bundle_layouts.py) instead of authored ones.

* Trunk-and-spur dungeons go through the shipped Act 1 splat renderer, cropped to content plus
  CROP_MARGIN (3) cells of rock. The crop offset is recorded so a runtime blit can place it on the
  100x100 map, which is new dq-tiles wiring.
* Mazes (forest-maze, maze-hunter) have 1-cell walls, which that renderer deletes (min wall mass
  6 cells). They go through `render_maze()`, a per-cell autotiler: wall top + south face + cast
  shadow per cell. It uses the same materials, grade and 48 px cell.
* Mechanic tiles (wind 19, ice 25 / stopper 28, lava 5, quicksand 26/27, portal 29, tripwire 30,
  hidden door 17) change state or are drawn by the engine at runtime. They are NOT baked. The
  preview marks them with a labelled translucent overlay so their placement can be reviewed, and
  writes the clean plate separately as <floor>-props.png.

Every render is checked cell by cell against the game's collision: the renderer's own walkable
mask vs bundle tiles (1 = wall). Disagreements are printed and stored in the sidecar.

    bundle_render.py stormNest-f1,hauntedForest-f1 [--fast]
"""
import argparse, json, os, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import common
from common import SCRATCH, MATROOT
import render_floors as RF            # installs _h32 + TARGET/WATER for the themes
R = RF.R
from specs import BY_ID
from themes import T

OUT = os.environ.get("BUNDLE_ART_OUT", os.path.join(SCRATCH, "bundle-art"))
BG = os.path.join(SCRATCH, "bundle-gen")
PX = 48
MARGIN = 3
MECH = {19: ("wind", (190, 230, 255)), 25: ("ice/wind lane", (120, 200, 255)), 28: ("ice stop", (255, 255, 255)),
        5: ("lava", (255, 90, 20)), 26: ("quicksand", (150, 90, 30)), 27: ("sinking sand", (220, 170, 90)),
        29: ("portal", (200, 80, 255)), 30: ("tripwire", (255, 60, 60)), 31: ("tripwire", (255, 60, 60)),
        17: ("hidden door", (255, 0, 200)), 2: ("exit (tile 2; the true exit in the forest)", (120, 255, 140)), 24: ("torch", (255, 170, 60))}
MAZE_MECH = {"forest-maze", "maze-hunter"}
# Per-cell renderer style. "tower" adds sky window slits on wall faces, which is the one structural
# cue of a tower that art can add without changing the layout.
CELL_STYLE = {"hauntedForest": "forest", "stormNest": "tower", "stormreachSpire": "tower",
              "desertTomb": "masonry", "demonCastle": "masonry", "demonBarracks": "masonry",
              "volcanicForge": "masonry", "scorchedRuins": "masonry", "sunkenTempleDungeon": "masonry"}


def load(fid):
    did, f = fid.rsplit("-f", 1)
    res = json.load(open(os.path.join(BG, f"{fid}.json")))
    return did, int(f), res, np.array(res["map"])


def to_floor(did, f, m, crop=True):
    """Bundle tile grid -> the renderer's {rows, assets} floor, cropped to content + margin."""
    h, w = m.shape
    if crop:
        ys, xs = np.nonzero(m != 1)
        y0, x0 = max(0, ys.min() - MARGIN), max(0, xs.min() - MARGIN)
        y1, x1 = min(h, ys.max() + MARGIN + 1), min(w, xs.max() + MARGIN + 1)
    else:
        y0, x0, y1, x1 = 0, 0, h, w
    sub = m[y0:y1, x0:x1]
    # pad with rock where the crop hit the canvas edge, so the 3-cell frame always exists
    pt, pl = MARGIN - (ys.min() - y0) if crop else 0, MARGIN - (xs.min() - x0) if crop else 0
    pb = MARGIN - (y1 - 1 - ys.max()) if crop else 0
    pr = MARGIN - (x1 - 1 - xs.max()) if crop else 0
    sub = np.pad(sub, ((max(0, pt), max(0, pb)), (max(0, pl), max(0, pr))), constant_values=1)
    oy, ox = y0 - max(0, pt), x0 - max(0, pl)
    rows, assets = [], []
    kinds = {9: "stairsDown", 4: "chest", 7: "boss", 14: "save", 18: "sign"}
    for y in range(sub.shape[0]):
        r = ""
        for x in range(sub.shape[1]):
            v = int(sub[y, x])
            r += "#" if v in (1, 17) else "."
            k = kinds.get(v)
            if v == 6:
                k = "mouth" if f == 1 else "stairsUp"
            if k:
                assets.append({"kind": k, "x": x, "y": y})
        rows.append(r)
    return {"rows": rows, "assets": assets, "width": sub.shape[1], "height": sub.shape[0],
            "offset": [int(ox), int(oy)], "sub": sub}


def collision_check(rows, mask_img):
    """Per cell: does the renderer's walkable mask agree with the game (wall vs not)?"""
    a = np.asarray(mask_img.convert("L")) > 127
    bad = []
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            cell = a[y * PX + 12:(y + 1) * PX - 12, x * PX + 12:(x + 1) * PX - 12]
            open_frac = cell.mean()
            if c == "#" and open_frac > 0.5:
                bad.append((x, y, "art-open/game-wall"))
            elif c != "#" and open_frac < 0.5:
                bad.append((x, y, "art-wall/game-open"))
    return bad


# ── maze autotiler ─────────────────────────────────────────────────────────────────────────────
def _blur(a, r):
    return np.asarray(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(r)), np.float32) / 255


def render_maze(did, fl, style=None):
    """Per-cell walls for 1-cell mazes. Same materials + grade + 48 px cells as the splat renderer,
    textures sampled on the same 57/32 master lattice so the grain matches.

    forest-maze: each wall cell is a cluster of tree crowns (a height field of overlapping discs,
    lit from the upper left) over a dark trunk/root band on its south side -- a hedge of trees,
    not a rock wall. maze-hunter: carved-block walls with a tall south face.
    PLACEHOLDER LOOK until the Codex maze sheets (codex-gen/dungeons/briefs/maze-*.md) land."""
    style = style or CELL_STYLE.get(did, "cave")
    forest = style == "forest"
    mats = R.load_materials(os.path.join(MATROOT, did))
    tgt = T[did]["target"]
    fm = R.grade(mats["floor"], tgt["floor"])
    if forest:
        wsrc = np.asarray(Image.open(os.path.join(common.ACT1_MATS, "whisperingWoodsCave", "mat-accent.png")).convert("RGB"), np.float32)
        wm = R.grade(R.op_desat(wsrc, 0.35) if hasattr(R, "op_desat") else wsrc, (30, 46, 36))   # haunted: cold, dark green
        bark = R.grade(mats["wall"], (34, 26, 22))
    else:
        wm = R.grade(R.temper(mats["wall"]), tuple(int(v * 1.25) for v in tgt["wall"]))
        bark = R.grade(mats["wall"], tgt["wall"])
    rows = fl["rows"]; H, W = len(rows), len(rows[0])
    wall = np.array([[c == "#" for c in r] for r in rows])
    yy, xx = np.mgrid[0:H * PX, 0:W * PX]
    k = 57 / 32
    sy, sx = (yy * k).astype(np.int64), (xx * k).astype(np.int64)
    ftex = fm[sy % fm.shape[0], sx % fm.shape[1]]
    wtex = wm[(sy + 211) % wm.shape[0], (sx + 97) % wm.shape[1]]
    btex = bark[(sy + 57) % bark.shape[0], (sx + 301) % bark.shape[1]]
    cellw = np.kron(wall, np.ones((PX, PX), bool))
    rng = np.random.default_rng(abs(hash(did)) % 2**32 if False else 7)
    if forest:
        # height field: 3-4 crowns per wall cell, spilling a little over the cell edge
        hf = np.zeros((H * PX, W * PX), np.float32)
        for y in range(H):
            for x in range(W):
                if not wall[y, x]:
                    continue
                for _ in range(4):
                    cx = (x + rng.uniform(0.2, 0.8)) * PX; cy = (y + rng.uniform(0.15, 0.7)) * PX
                    r = PX * rng.uniform(0.38, 0.55)
                    y0, y1 = int(max(0, cy - r)), int(min(H * PX, cy + r))
                    x0, x1 = int(max(0, cx - r)), int(min(W * PX, cx + r))
                    gy, gx = np.mgrid[y0:y1, x0:x1]
                    dd = 1 - ((gx - cx) ** 2 + (gy - cy) ** 2) / r ** 2
                    hf[y0:y1, x0:x1] = np.maximum(hf[y0:y1, x0:x1], np.sqrt(np.clip(dd, 0, 1)))
        hf = np.minimum(hf, np.maximum(_blur(cellw.astype(np.float32), 6) * 1.6, 0))   # stay near the wall cells
        crown = np.clip(hf * 3, 0, 1)
        gy, gx = np.gradient(_blur(hf, 1.5))
        lit = np.clip(0.75 - (gx + gy) * 9.0, 0.35, 1.35)                   # light from upper left
        # trunk band: the south ~35% of a wall cell that has open floor below it
        south = np.zeros_like(crown)
        for y in range(H):
            for x in range(W):
                if wall[y, x] and (y == H - 1 or not wall[y + 1, x]):
                    south[int((y + 0.62) * PX):(y + 1) * PX, x * PX + 6:(x + 1) * PX - 6] = 1
        south = _blur(south, 2) * (1 - crown * 0.0)
        a = np.clip(np.maximum(crown, south), 0, 1)
        wt = wtex * lit[..., None]
        wt = wt * crown[..., None] + btex * (1 - crown[..., None])
        floor_img = ftex.astype(np.float32) * 0.80          # under the canopy: dimmer than a cave floor
    else:
        a = _blur(cellw.astype(np.float32), 1.2)
        face_h = int(PX * 0.42)
        below = np.zeros_like(a); below[face_h:] = a[:-face_h]
        face = np.clip(a - below, 0, 1)
        wt = wtex * (1.15 - 0.55 * face[..., None]) + 0 * btex
        if style in ("tower", "masonry"):
            # dressed blocks: kill the rock cracks (low-pass the material), keep fine grain only,
            # give each block its own tone, then cut the mortar joints
            lo = np.stack([_blur_rgb(wtex[..., c], 14) for c in range(3)], -1)
            grain = (wtex - np.stack([_blur_rgb(wtex[..., c], 1.5) for c in range(3)], -1)) * 0.45
            tone = _block_tone(H * PX, W * PX, face)
            wt = (lo * tone[..., None] + grain) * (1.15 - 0.55 * face[..., None])
            wt = wt * _coursing(H * PX, W * PX, face)[..., None]
        floor_img = ftex.astype(np.float32)
        if style in ("tower", "masonry"):
            # flagstone floor: same material, cut into 48x32 slabs with soft joints
            yy2, xx2 = np.mgrid[0:H * PX, 0:W * PX]
            rr = yy2 // 32
            j = ((yy2 % 32) < 2) | (((xx2 + (rr % 2) * 24) % 48) < 2)
            flo = np.stack([_blur_rgb(floor_img[..., c], 10) for c in range(3)], -1)
            floor_img = flo * 1.05 + (floor_img - np.stack([_blur_rgb(floor_img[..., c], 1.5) for c in range(3)], -1)) * 0.5
            floor_img = floor_img * (1 - 0.35 * _blur(j.astype(np.float32), 0.7))[..., None]
    floor_img = _static_mech_ground(did, fl, floor_img, H, W)
    shadow = np.zeros_like(a); d = int(PX * 0.28); shadow[d:] = a[:-d]
    shadow = _blur(np.clip(shadow - a, 0, 1), 5)
    near = _blur(a, 16)
    img = floor_img * (1 - 0.40 * near[..., None]) * (1 - 0.55 * shadow[..., None])
    img = img * (1 - a[..., None]) + np.clip(wt, 0, 255) * a[..., None]
    # rock far from any floor falls away to dark, so thick wall reads as depth, not as a texture field
    if not forest:
        reach = _blur(1 - cellw.astype(np.float32), PX * 0.9)
        img *= (0.35 + 0.65 * np.clip(reach * 3.0, 0, 1))[..., None]
    if style == "tower":
        img = _windows(img, wall, H, W)
    master = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")
    from make_dungeon_assets import sprite_at
    for it in fl["assets"]:
        sp = sprite_at(it["kind"], int(PX * R.PROP_CELLS.get(it["kind"], 1.0)))
        if sp is not None:
            master.alpha_composite(sp.convert("RGBA"), (int(it["x"] * PX + PX / 2 - sp.width / 2),
                                                         int(it["y"] * PX + PX / 2 - sp.height / 2)))
    walk = Image.fromarray(((1 - cellw) * 255).astype(np.uint8)).convert("1")
    return master.convert("RGB"), walk


ICE_DUNGEONS = {"frozenLake", "frostfallCavern"}


def _static_mech_ground(did, fl, img, H, W):
    """Bake the ground of mechanic tiles whose position never changes, so the floor itself announces
    the rule: slide ice (25) is glassy blue with streaks, stopper blocks (28) are raised ice lumps,
    quicksand (26 core / 27 ring) is a darker sand swirl. Lava (5, phase-timed), wind gusts, portals
    and tripwires stay runtime layers and are only marked in the mech preview."""
    sub = np.asarray(fl["sub"])
    if sub.shape != (H, W):
        return img
    up = lambda m: _blur_rgb(np.kron(m, np.ones((PX, PX))).astype(np.float32), 3)
    yy, xx = np.mgrid[0:H * PX, 0:W * PX]
    if did in ICE_DUNGEONS:
        ice = up(sub == 25)
        if ice.max() > 0:
            streak = 0.5 + 0.5 * np.sin((xx * 0.9 + yy * 0.35) / 9.0) ** 8
            col = np.array([150, 205, 240], np.float32) * (0.85 + 0.35 * streak)[..., None]
            img = img * (1 - 0.8 * ice[..., None]) + col * 0.8 * ice[..., None]
        blk = up(sub == 28)
        if blk.max() > 0:
            img = img * (1 - blk[..., None]) + np.array([228, 242, 252], np.float32) * blk[..., None]
    qs = up(sub == 26) + 0.6 * up(sub == 27)
    if qs.max() > 0:
        sw = 0.75 + 0.25 * np.sin(np.hypot(xx % 96 - 48, yy % 96 - 48) / 5.0)
        col = np.array([150, 112, 64], np.float32) * sw[..., None]
        q = np.clip(qs, 0, 1)[..., None]
        img = img * (1 - 0.85 * q) + col * 0.85 * q
    return img


def _blur_rgb(ch, r):
    from scipy.ndimage import gaussian_filter
    return gaussian_filter(ch.astype(np.float32), r)


def _block_tone(h, w, face):
    """One tone per masonry block (0.82..1.12), hashed from its course/column index."""
    yy, xx = np.mgrid[0:h, 0:w]
    out = np.zeros((h, w), np.float32)
    for ch, bw, wgt in ((16, 32, 1 - face), (24, 40, face)):
        row = yy // ch
        col = (xx + (row % 2) * (bw // 2)) // bw
        hsh = ((row * 73856093) ^ (col * 19349663)) & 1023
        out += (0.82 + 0.30 * hsh / 1023.0) * wgt
    return out


def _coursing(h, w, face):
    """Running-bond block coursing (mortar multiply mask): 16 px courses / 32 px blocks on the wall
    top, taller 24 px courses on the south face, so walls read as built masonry, not raw rock."""
    yy, xx = np.mgrid[0:h, 0:w]
    m = np.ones((h, w), np.float32)
    for ch, bw, wgt in ((16, 32, 1 - face), (24, 40, face)):
        row = yy // ch
        joint_h = (yy % ch) < 2
        joint_v = ((xx + (row % 2) * (bw // 2)) % bw) < 2
        hi = (yy % ch) == 2                                   # lit top edge of each course
        mm = np.where(joint_h | joint_v, 0.55, np.where(hi, 1.12, 1.0))
        m = m * (1 - wgt) + mm * wgt
    return _blur(np.clip(m / 1.12, 0, 1), 0.6) * 1.12


def _windows(img, wall, H, W):
    """Arrow-slit windows to open sky on every 3rd south-facing wall cell (a wall cell with floor
    directly below): a tall narrow opening, sky gradient + a cloud wisp, stone reveal around it."""
    out = img.copy()
    n = 0
    for y in range(1, H):
        for x in range(W):
            if wall[y - 1, x] and not wall[y, x]:
                n += 1
                if n % 3:
                    continue
                cx, top = x * PX + PX // 2, (y - 1) * PX + int(PX * 0.12)
                w2, hgt = 8, int(PX * 0.66)
                out[top - 2:top + hgt + 2, cx - w2 - 3:cx + w2 + 3] *= 0.45            # dark reveal
                for k in range(hgt):
                    t = k / hgt
                    col = np.array([150 + 60 * t, 196 + 40 * t, 240], np.float32)    # sky, lighter low
                    out[top + k, cx - w2:cx + w2] = col
                out[top + hgt // 2 - 1:top + hgt // 2 + 2, cx - w2:cx + w2 - 1] = (245, 248, 255)  # cloud wisp
                out[top:top + 3, cx - w2:cx + w2] = (110, 140, 190)                  # arch shade
    return out


def mech_overlay(img, sub):
    """Translucent, labelled marks for runtime mechanic tiles: PREVIEW ONLY, never shipped."""
    im = img.convert("RGBA"); ov = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    seen = {}
    for y in range(sub.shape[0]):
        for x in range(sub.shape[1]):
            v = int(sub[y, x])
            if v in MECH:
                name, col = MECH[v]
                d.rectangle((x * PX + 3, y * PX + 3, (x + 1) * PX - 4, (y + 1) * PX - 4),
                            fill=col + (70,), outline=col + (230,), width=2)
                seen[name] = col
    im.alpha_composite(ov)
    if seen:
        d = ImageDraw.Draw(im)
        bx, by = 8, 8
        d.rectangle((bx - 4, by - 4, bx + 230, by + 18 * len(seen) + 22), fill=(0, 0, 0, 180))
        d.text((bx, by), "runtime mechanic tiles (not baked):", fill=(255, 255, 255))
        for i, (n, c) in enumerate(seen.items()):
            d.rectangle((bx, by + 20 + i * 18, bx + 12, by + 32 + i * 18), fill=c)
            d.text((bx + 18, by + 20 + i * 18), n, fill=(255, 255, 255))
    return im.convert("RGB")


def render_one(fid, cells=False):
    t0 = time.time()
    did, f, res, m = load(fid)
    spec = BY_ID[did]
    fl = to_floor(did, f, m)
    os.makedirs(OUT, exist_ok=True)
    theme = T[did]["theme"]
    if spec.get("mechanic") in MAZE_MECH or cells:
        img, walk = render_maze(did, fl)
        method = f"cell-autotile ({CELL_STYLE.get(did, 'cave')})"
    else:
        mats = R.load_materials(os.path.join(MATROOT, did))
        walk = R.walkable_mask(fl["rows"], fl["assets"])
        img = R.render(fl["rows"], mats, theme, 1, fl["assets"], True, None, ())
        method = "splat (render_dungeon_material_map.render)"
    bad = collision_check(fl["rows"], walk)
    img.save(os.path.join(OUT, f"{fid}-props.png"))
    walk.save(os.path.join(OUT, f"{fid}-walk.png"))
    mech_overlay(img, fl["sub"]).save(os.path.join(OUT, f"{fid}-mech-preview.png"))
    json.dump({"floor": fid, "source": "bundle Ap() via scripts/acts/dungeons/bundle_layouts.py",
               "method": method, "offsetCells": fl["offset"], "width": fl["width"], "height": fl["height"],
               "rows": fl["rows"], "assets": fl["assets"],
               "collisionMismatchCells": len(bad), "mismatches": bad[:200],
               "fastBlur": R.blur is RF._fast_blur},
              open(os.path.join(OUT, f"{fid}.json"), "w"), indent=1)
    print(f"{fid}: {method}, {fl['width']}x{fl['height']} cells at offset {fl['offset']}, "
          f"collision mismatches {len(bad)}, {time.time() - t0:.0f}s", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("floors")
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--cells", action="store_true", help="per-cell renderer for any dungeon (seconds, low memory)")
    a = ap.parse_args()
    if a.fast:
        R.blur = RF._fast_blur
    for fid in a.floors.split(","):
        render_one(fid, a.cells)


if __name__ == "__main__":
    main()
