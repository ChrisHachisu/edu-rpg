#!/usr/bin/env python3
"""Paint one authored Acts 2-5 floor plan (qok-floorplan-v1) in the Act 1 dungeon style.

  render_plan.py emberMines-f1 [more floors...] [--crop x0,y0,x1,y1] [--out DIR] [--q 85]

The wall/floor picture is Act 1's: `render_dungeon_material_map.py` is imported and its own
functions build the organic boundary field (`floor_field`: blur + warp + neck/speck/shadow passes),
sample the materials (`sample_patched`, `grade`, `temper`) and seat props (`paste_props`). The
body of `paint()` follows that module's `render()` step for step (lighting, cel steps, face band,
cast shadow, rubble base, outline, grain). What is new, because Act 1 has none of it:

  * terrain beyond rock/floor, per `d2common.DUNGEONS[...]['hazards']`: lava pools, chasms, pillars.
    Each gets its own organic edge on the plan grid, and THE COLLISION MASK IS CUT FROM THE SAME
    FIELDS (one boundary, two consumers: the picture and `-walk.png`).
  * a mouth on any side of the map: the corridor runs off the picture's edge into daylight.
  * live props: chests, crystals and the boss are runtime sprites (they change state), so only
    their contact shadows are baked. Stairs never change and are baked with Act 1's own sprites.
  * an OVER layer: the part of a pillar that stands above its base cell, as a small atlas the
    runtime depth-sorts against the hero (she walks behind a pillar, never under the floor).

Outputs in <out>:  <floor>-material.webp  <floor>-walk.png  <floor>-over.webp (if any)  <floor>.art.json
"""
import argparse, json, os, resource, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
import d2common as C
import render_dungeon_material_map as R


def _h32(ix, iy, seed):
    """Bit-identical to R._h, ~2.5x faster (see scripts/acts/dungeons/render_floors.py in the
    prototype branch: array_equal on 9 M coords incl. negatives)."""
    u = np.uint32
    h = (ix.astype(u) * u(374761393) + iy.astype(u) * u(668265263)
         + u((int(seed) * 1442695041) & 0xFFFFFFFF)) & u(0x7FFFFFFF)
    h = ((h ^ (h >> u(13))) * u(1274126177)) & u(0x7FFFFFFF)
    return ((h ^ (h >> u(16))) & u(0xFFFFFF)).astype(np.float32) / float(0xFFFFFF)


def _fast_blur(a, sigma):
    """R.blur's separable kernel and edge padding in scipy's C loop (float diff <= 1.5e-6)."""
    if sigma <= 0:
        return a.astype(np.float32)
    r = int(np.ceil(3.0 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2).astype(np.float32)
    k /= k.sum()
    cur = ndimage.correlate1d(a.astype(np.float32), k, axis=1, mode="nearest")
    return ndimage.correlate1d(cur, k, axis=0, mode="nearest")


R._h = _h32
R.blur = _fast_blur

KIND = {"stairsPrev": "stairsUp", "stairsNext": "stairsDown"}
POCKET = {"chest", "save", "boss", "sign", "stairsUp", "stairsDown"}      # get a prop pocket in the field
SHADOW = {"chest": (0.34, 0.86), "save": (0.26, 0.90), "sign": (0.34, 0.86), "boss": (0.80, 0.98)}
CAP_MB = 1.6


def norm_assets(plan):
    out = []
    for a in plan["assets"]:
        k = KIND.get(a["kind"], a["kind"])
        out.append(dict(a, kind=k))
    return out


def wall_rows(plan):
    """Rock vs everything else, with every mouth's corridor carried on to the map edge."""
    rows = [["#" if c == "#" else "." for c in r] for r in plan["rows"]]
    for m in plan["assets"]:
        if m["kind"] != "mouth":
            continue
        cells, run, _ = C.mouth_cells(plan, m)
        for x, y in cells + run:
            rows[y][x] = "."
    return ["".join(r) for r in rows]


def organic(cells, cyi, cxi, xx, yy, px, seed, k=0.30, amp=0.40):
    up = cells.astype(np.float32)[cyi, cxi]
    f = R.blur(up, px * k)
    del up
    warp = (R.fbm(xx, yy, px * 2.2, seed) - 0.5) * 2.0
    gate = np.clip(4.0 * f * (1.0 - f), 0.0, 1.0)
    return np.clip(f + warp * amp * gate, 0.0, 1.0)


def hazard_cells(plan, chars, wrows):
    """Cells of this hazard, plus the rock cells touching them: the hazard then runs right up to
    the rock's own painted edge instead of leaving a sliver of floor between two warped lines."""
    H, W = plan["height"], plan["width"]
    hz = np.array([[c in chars for c in r] for r in plan["rows"]], bool)
    rock = np.array([[c == "#" for c in r] for r in wrows], bool)
    return hz | (rock & ndimage.binary_dilation(hz, np.ones((3, 3), bool)))


def paint(plan, mats, cfg):
    t0 = time.time()
    assets = norm_assets(plan)
    wrows = wall_rows(plan)
    f_assets = [a for a in assets if a["kind"] in POCKET]
    fld = R.floor_field(wrows, 1, f_assets)
    fw, prot, xx, yy = fld.fw, fld.prot, fld.xx, fld.yy
    px, W, H, Ww, Hw = fld.px, fld.W, fld.H, fld.Ww, fld.Hw
    cw, ch = fld.cw, fld.ch
    cxi = np.minimum((xx / px).astype(np.int32), cw - 1)
    cyi = np.minimum((yy / px).astype(np.int32), ch - 1)
    a = np.clip((fw - 0.5) * 34.0 + 0.5, 0.0, 1.0)

    tgt = cfg["target"]
    # The Codex floors are drawn at full contrast (every ember lit, every grain black or white).
    # Underfoot that is noise: a child has to read WHERE THE FLOOR IS first, so the floor is
    # calmed towards its own mean (pilot 3 did the same for the tower flags) and the walls,
    # lava and crystal keep the sheet's full contrast.
    fm = mats["floor"].astype(np.float32)
    sg = float(cfg.get("floor_soft", 0.0))
    if sg > 0:
        fm = np.dstack([ndimage.gaussian_filter(fm[..., c], sg, mode="wrap") for c in range(3)])
    fmean = fm.reshape(-1, 3).mean(axis=0)[None, None, :]
    fm = np.clip(fmean + float(cfg.get("floor_calm", 0.55)) * (fm - fmean), 0, 255)
    floor_m = R.grade(fm, tgt["floor"])
    del fm
    wall_m = R.grade(R.temper(mats["wall"]), tgt["wall"])
    ftex, fcrack = R.sample_patched(floor_m, xx, yy, px, 91, patch=5.0)
    wtex, wcrack = R.sample_patched(wall_m, xx, yy, px, 41, patch=4.0)
    img = ftex * a[..., None] + wtex * (1 - a[..., None])
    del ftex
    joint = fcrack * a + wcrack * (1.0 - a)
    del fcrack, wcrack
    img *= (1.0 - (0.04 + 0.56 * (1.0 - a)) * joint)[..., None]
    del joint

    depth = R.blur(np.clip(fw, 0, 1), px * 1.5)
    ao = np.clip(np.maximum(depth * 2.1, prot * 0.95), 0.0, 1.0)
    pool = 0.72 + 0.55 * np.clip(R.blur(np.clip(fw, 0, 1), px * 4.0), 0, 1)
    lamp = 0.88 + 0.24 * R.fbm(xx, yy, px * 22.0, 5)
    light = (0.42 + 0.58 * ao) * pool * lamp
    del ao, pool, lamp, depth
    steps = 5.0
    q = np.floor(light * steps) / steps
    light = q + (light - q) * 0.25
    img *= light[..., None]
    del q
    mean = img.reshape(-1, 3).mean(axis=0)
    img = np.clip(mean[None, None, :] + (img - mean[None, None, :]) * 1.22, 0, 255)

    face_h = max(2, int(px * R.FACE_H_CELLS))
    drop = max(2, int(px * 0.34))
    wall = 1.0 - a
    face = R.blur(np.clip(wall * R.shift(a, face_h), 0.0, 1.0), px * R.FACE_BLUR_CELLS)
    cast = R.blur(np.clip(a * R.shift(wall, -drop), 0.0, 1.0), px * 0.20)
    top = np.clip(wall - face, 0.0, 1.0)
    img *= (1.0 + 0.34 * top)[..., None]
    img *= (1.0 - 0.60 * face)[..., None]
    img *= (1.0 - 0.58 * cast)[..., None]
    del face, cast

    # rock tops near the walked space carry the sheet's accent (crystal growth): scenery, never floor
    ta = float(cfg.get("top_accent") or 0.0)
    if ta > 0:
        near = np.clip(R.blur(a, px * 1.3) * 3.0, 0.0, 1.0)
        acc = np.clip((R.fbm(xx, yy, px * 1.5, 131) - 0.58) / 0.07, 0.0, 1.0) * top * near * ta
        atex, _ = R.sample_patched(mats["accent"].astype(np.float32), xx, yy, px, 137, patch=3.0)
        img = img * (1 - acc[..., None]) + atex * (0.62 * light[..., None] + 0.30) * acc[..., None]
        del near, acc, atex

    inner = np.clip((0.555 - fw) / 0.015, 0.0, 1.0)
    outer = np.clip((fw - 0.50) / 0.02, 0.0, 1.0)
    band = inner * outer
    del inner, outer
    band *= np.clip(0.45 + 0.55 * R.fbm(xx, yy, px * 1.1, 23), 0, 1)
    rub = R.grade(mats["rubble"], tuple(int(v * 0.42) for v in tgt["floor"]))
    rtex, _ = R.sample_patched(rub, xx, yy, px, 63, patch=3.5)
    img = img * (1 - band[..., None]) + rtex * band[..., None]
    del band

    edge = np.clip(1.0 - np.clip(fw - 0.5, 0.0, None) / 0.075, 0.0, 1.0) * a \
        + np.clip(1.0 - np.clip(0.5 - fw, 0.0, None) / 0.030, 0.0, 1.0) * (1.0 - a) * 0.55
    edge *= np.clip(0.55 + 0.45 * R.fbm(xx, yy, px * 0.9, 31), 0, 1)
    img *= (1.0 - 0.42 * edge)[..., None]
    del edge

    spec = np.clip((R.fbm(xx, yy, px * 0.17, 67) - 0.64) * 3.4, 0.0, 1.0)
    spec *= np.clip((R.fbm(xx, yy, px * 1.9, 68) - 0.36) * 2.2, 0.0, 1.0)
    spec = spec * a * 0.60
    img = img * (1 - spec[..., None]) + rtex * spec[..., None]
    del spec

    # Rock nobody can reach or see into goes dark and quiet: it frames the cave (as in the pilot
    # the owner saw) and it is most of the picture's area, so it is also most of the file.
    deepk = np.clip((0.05 - R.blur(a, px * 2.0)) / 0.05, 0.0, 1.0) * 0.90
    flat = np.array(tgt["wall"], np.float32) * 0.30
    img = img * (1 - deepk[..., None]) + flat[None, None, :] * deepk[..., None]
    del deepk

    # ── terrain beyond rock and floor ─────────────────────────────────────────────────────────
    block = np.zeros((H, W), np.float32)             # painted blockers, for the walk mask
    kinds = {}
    for chr_, kind in cfg.get("hazards", {}).items():
        kinds.setdefault(kind, set()).add(chr_)
    present = set("".join(plan["rows"]))

    if "chasm" in kinds and (kinds["chasm"] & present):
        hz = organic(hazard_cells(plan, kinds["chasm"], wrows), cyi, cxi, xx, yy, px, 211)
        ca = np.clip((hz - 0.5) * 34.0 + 0.5, 0.0, 1.0) * a
        void = np.array(cfg.get("void", (8, 7, 10)), np.float32)
        cliff = int(px * 1.30)
        idx = np.arange(H, dtype=np.int32)[:, None]
        last = np.maximum.accumulate(np.where(ca < 0.5, idx, -1).astype(np.int32), axis=0)
        d = (idx - last).astype(np.float32)
        s = np.where(last >= 0, np.clip(1.0 - d / cliff, 0.0, 1.0), 0.0).astype(np.float32)
        del last, d
        strata = 0.80 + 0.40 * R.fbm(xx * 0.35, yy * 2.2, px * 0.9, 217)
        fog = (R.fbm(xx, yy, px * 3.0, 77) - 0.5) * 10.0
        cl = np.clip(wtex * (1.55 * strata * (0.30 + 0.70 * s))[..., None], 0, 255)
        k = (s ** 1.4)[..., None]
        chasm = void[None, None, :] + fog[..., None] + (cl - void[None, None, :]) * k
        img = img * (1 - ca[..., None]) + np.clip(chasm, 0, 255) * ca[..., None]
        del cl, chasm, strata, fog, k, s
        ring = np.clip(R.blur(ca, px * 0.10) * 2.2, 0.0, 1.0) * (1.0 - ca) * a      # the lit lip
        img *= (1.0 + 0.24 * ring)[..., None]
        ec = np.clip(1.0 - np.abs(hz - 0.5) / 0.035, 0.0, 1.0) * a
        img *= (1.0 - 0.50 * ec)[..., None]
        block = np.maximum(block, ca)
        del ring, ec, hz, ca

    if "lava" in kinds and (kinds["lava"] & present):
        hz = organic(hazard_cells(plan, kinds["lava"], wrows), cyi, cxi, xx, yy, px, 223, amp=0.38)
        la = np.clip((hz - 0.5) * 34.0 + 0.5, 0.0, 1.0) * a
        ltex, _ = R.sample_patched(mats["accent"].astype(np.float32), xx, yy, px, 73, patch=3.0)
        flow = 0.86 + 0.34 * R.fbm(xx, yy, px * 1.7, 75)
        lava = np.clip(ltex * (flow * 1.08)[..., None], 0, 255)
        lava += (np.clip((hz - 0.80) / 0.20, 0.0, 1.0))[..., None] * np.array([34.0, 26.0, 6.0], np.float32)
        crust = np.clip((0.64 - hz) / 0.11, 0.0, 1.0) * np.clip(0.35 + 0.9 * R.fbm(xx, yy, px * 0.5, 79), 0, 1)
        lava = lava * (1 - 0.80 * crust[..., None]) + rtex * 0.50 * (0.80 * crust[..., None])
        img = img * (1 - la[..., None]) + np.clip(lava, 0, 255) * la[..., None]
        del ltex, flow, lava, crust
        g = np.clip(R.blur(la, px * 0.85) * 1.7, 0.0, 1.0) * (1.0 - la)
        img += g[..., None] * np.array(cfg.get("glow", (255, 120, 36)), np.float32)[None, None, :] * 0.36
        block = np.maximum(block, la)
        del g, hz, la
    del rtex

    # ── mouths: the corridor leaves the picture into daylight ─────────────────────────────────
    for m in assets:
        if m["kind"] != "mouth":
            continue
        cells, run, (dx, dy) = C.mouth_cells(plan, m)
        z = np.zeros((ch, cw), bool)
        for x, y in cells + run:
            z[y, x] = True
        soft = R.blur(z.astype(np.float32)[cyi, cxi], px * 0.55)
        reach = 2.6 * px
        if dy > 0:   t = (yy - (H - reach)) / reach
        elif dy < 0: t = (reach - yy) / reach
        elif dx > 0: t = (xx - (W - reach)) / reach
        else:        t = (reach - xx) / reach
        L = np.clip(t, 0.0, 1.0) ** 1.3 * np.clip(soft * 1.6, 0.0, 1.0) * (0.25 + 0.75 * a)
        img = img * (1.0 + 0.7 * L[..., None]) + (L ** 1.5)[..., None] * np.array([235.0, 226.0, 198.0], np.float32) * 0.80
        del soft, t, L

    # ── pillars: standing columns, painted whole here; the part above the base cell is ALSO cut
    #    into the over layer so the runtime can draw it in front of a hero standing behind it ───
    over_a = None
    pillars = []
    if "pillar" in kinds:
        pc = [(x, y) for y, r in enumerate(plan["rows"]) for x, c in enumerate(r) if c in kinds["pillar"]]
        if pc:
            over_a = np.zeros((H, W), np.float32)
        for (cx_, cy_) in sorted(pc, key=lambda p: p[1]):
            bx, by = (cx_ + 0.5) * px, (cy_ + 0.60) * px
            rx, ry, hg = 0.46 * px, 0.27 * px, 1.55 * px
            x0, x1 = max(0, int(bx - rx * 1.9)), min(W, int(bx + rx * 1.9) + 1)
            y0, y1 = max(0, int(by - hg - ry - 6)), min(H, int(by + ry * 2.2) + 1)
            X, Y = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
            wob = (R.fbm(X, Y, px * 0.45, 301) - 0.5) * 0.20 * px
            u = (X + wob - bx) / rx
            ins = np.abs(u) <= 1.0
            cur = np.sqrt(np.clip(1.0 - u * u, 0.0, 1.0))
            body = ins & (Y >= by - hg - ry * cur) & (Y <= by + ry * cur)
            cap = ((u * u) + ((Y - (by - hg)) / ry) ** 2) <= 1.0
            sh = (((X - (bx + 0.22 * px)) / (rx * 1.35)) ** 2 + ((Y - (by + 0.10 * px)) / (ry * 1.25)) ** 2)
            shade = np.clip(1.15 - sh, 0.0, 1.0) * 0.62 * (~body)
            reg = img[y0:y1, x0:x1]
            reg *= (1.0 - shade)[..., None]
            tex = R.sample(wall_m, X * 1.0 + 137.0, Y * 1.0 + 59.0).astype(np.float32)
            l = np.clip(1.25 - 0.80 * (u * 0.5 + 0.5), 0.30, 1.4) * (0.72 + 0.28 * np.clip((by - Y) / hg, 0, 1))
            l = np.floor(l * 5.0) / 5.0 + 0.08
            l = np.where(cap, 1.75, l) * 1.9
            col = np.clip(tex * l[..., None] + np.where(cap, 16.0, 0.0)[..., None], 0, 255)
            er = ndimage.binary_erosion(body, iterations=max(2, int(px * 0.035)))
            col[body & ~er] *= 0.30
            reg[body] = col[body]
            img[y0:y1, x0:x1] = reg
            cut = int(cy_ * px)                                  # top of the base cell, master px
            ov = over_a[y0:y1, x0:x1]
            ov[body & (Y < cut)] = 1.0
            pillars.append({"x": cx_, "y": cy_, "box": [x0, y0, x1, min(y1, cut)], "by": by})

    master = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")
    # contact shadows of the live props
    for it in assets:
        if it["kind"] not in SHADOW:
            continue
        rw, yo = SHADOW[it["kind"]]
        sw, shh = int(px * rw * 2), max(3, int(px * rw * 0.62))
        bl = max(1.0, sw * 0.10); pad = int(np.ceil(bl * 3))
        shd = Image.new("RGBA", (sw + 2 * pad, shh + 2 * pad), (0, 0, 0, 0))
        ImageDraw.Draw(shd).ellipse([pad, pad, pad + sw - 1, pad + shh - 1], fill=(0, 0, 0, 120))
        shd = shd.filter(ImageFilter.GaussianBlur(bl))
        master.alpha_composite(shd, (max(0, int((it["x"] + 0.5) * px - sw / 2 - pad)),
                                     max(0, int((it["y"] + yo) * px - shh / 2 - pad))))
    # stairs are scenery that never changes: Act 1's own sprites, seated and cut by the rock top
    stairs = [s for s in assets if s["kind"] in ("stairsUp", "stairsDown")]
    if stairs:
        R.paste_props(master, stairs, px)
        alpha = np.clip(top, 0.0, 1.0)
        for s_ in stairs:
            xa, xb = int(s_["x"] * px), int((s_["x"] + 1) * px)
            ya, yb = int(s_["y"] * px), int((s_["y"] + 1) * px)
            alpha[max(0, ya):min(H, yb), max(0, xa):min(W, xb)] = 0.0
        occl = np.dstack([np.clip(img, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
        master.alpha_composite(Image.fromarray(occl, "RGBA"))
        del occl, alpha
    del img

    out = master.convert("RGB").resize((Ww, Hw), Image.Resampling.LANCZOS)

    # ── the walk mask: the same fields, area-reduced then thresholded (as R.walkable_mask) ─────
    def small(f):
        return np.asarray(Image.fromarray(f, "F").resize((Ww, Hw), Image.Resampling.BOX))
    walk = (small(fw) >= 0.5) & (small(block) < 0.5)
    yw, xw = np.mgrid[0:Hw, 0:Ww]
    for p in pillars:                                             # the base a hero cannot stand in
        bx, by = (p["x"] + 0.5) * C.CELL, (p["y"] + 0.60) * C.CELL
        walk &= ~((((xw - bx) / (0.44 * C.CELL)) ** 2 + ((yw - by) / (0.27 * C.CELL)) ** 2) <= 1.0)

    over = None
    entries = []
    if over_a is not None and pillars:
        oa = np.clip(small(over_a), 0, 1)
        rgba = np.dstack([np.asarray(out), (oa * 255).astype(np.uint8)])
        k = Ww / W
        boxes = []
        for p in pillars:
            x0, y0, x1, y1 = p["box"]
            b = [int(np.floor(x0 * k)), int(np.floor(y0 * k)), int(np.ceil(x1 * k)), int(np.ceil(y1 * k))]
            boxes.append(b)
        tw = sum(b[2] - b[0] for b in boxes); th = max(b[3] - b[1] for b in boxes)
        over = Image.new("RGBA", (tw, th), (0, 0, 0, 0)); sx = 0
        for p, b in zip(pillars, boxes):
            crop = Image.fromarray(rgba[b[1]:b[3], b[0]:b[2]], "RGBA")
            over.paste(crop, (sx, 0))
            entries.append({"x": b[0], "y": b[1], "w": b[2] - b[0], "h": b[3] - b[1], "sx": sx, "sy": 0,
                            "by": int(round((p["y"] + 0.60) * C.CELL)), "cell": [p["x"], p["y"]]})
            sx += b[2] - b[0]
    info = {"floor": f"{plan['dungeonId']}-f{plan['floor']}", "size": [Ww, Hw], "cells": [cw, ch],
            "over": entries, "seconds": round(time.time() - t0),
            "peakMB": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)}
    return out, Image.fromarray((walk * 255).astype(np.uint8)).convert("1"), over, info


def save_webp(im, path, q, cap_mb=CAP_MB):
    """q~85, stepping down only if a floor would break the per-floor cap."""
    while True:
        im.save(path, "WEBP", quality=q, method=6)
        mb = os.path.getsize(path) / 1e6
        if mb <= cap_mb or q <= 60:
            return q, mb
        q -= 5


def crop_plan(plan, box):
    x0, y0, x1, y1 = box
    p = dict(plan)
    p["rows"] = [r[x0:x1] for r in plan["rows"][y0:y1]]
    p["width"], p["height"] = x1 - x0, y1 - y0
    p["assets"] = [dict(a, x=a["x"] - x0, y=a["y"] - y0) for a in plan["assets"]
                   if x0 <= a["x"] < x1 and y0 <= a["y"] < y1 and a["kind"] != "mouth"]
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("floors", nargs="+")
    ap.add_argument("--crop")
    ap.add_argument("--out", default=C.ART)
    ap.add_argument("--q", type=int, default=85)
    ap.add_argument("--skip-existing", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for fid in a.floors:
        did = fid.rsplit("-f", 1)[0]
        cfg = C.DUNGEONS[did]
        dst = os.path.join(a.out, f"{fid}-material.webp")
        if a.skip_existing and os.path.exists(dst) and os.path.exists(os.path.join(a.out, f"{fid}.art.json")):
            continue
        plan = C.load_plan(fid)
        if a.crop:
            plan = crop_plan(plan, [int(v) for v in a.crop.split(",")])
        mats = R.load_materials(os.path.join(C.MATROOT, did))
        img, walk, over, info = paint(plan, mats, cfg)
        q, mb = save_webp(img, dst, a.q)
        walk.save(os.path.join(a.out, f"{fid}-walk.png"), optimize=True)
        info.update(quality=q, materialMB=round(mb, 3),
                    walkKB=round(os.path.getsize(os.path.join(a.out, f"{fid}-walk.png")) / 1e3, 1),
                    planSha=__import__("hashlib").sha256(open(C.plan_path(fid), "rb").read()).hexdigest()[:16],
                    crop=a.crop)
        op = os.path.join(a.out, f"{fid}-over.webp")
        if over is not None:
            over.save(op, "WEBP", lossless=True, method=6)
            info["overKB"] = round(os.path.getsize(op) / 1e3, 1)
        elif os.path.exists(op):
            os.remove(op)
        json.dump(info, open(os.path.join(a.out, f"{fid}.art.json"), "w"), indent=1)
        print(f"{fid} {plan['width']}x{plan['height']} -> {img.size} q{q} {mb:.2f} MB "
              f"in {info['seconds']}s, peak {info['peakMB']} MB", flush=True)


if __name__ == "__main__":
    main()
