#!/usr/bin/env python3
"""Pilot 3 review JPGs: the pilot3 renders plus the runtime and decal layers, drawn with the Codex
mechanic and prop sheets (mech-tiles-a/b, magenta-keyed 3x3 grids):
  tower   sky beyond the outer wall; mech-a[0,2] window set into the outer wall's lit face;
          mech-a[0,0] wind-gust tile on every wind-barrier (19) cell
  mine    mech-b[2,1] timber set, standing across each narrow N-S shaft and fitted to the
          RENDERED width. E-W shafts get none, since a frame side-on from this camera is only
          a post
  forest  the true exit lit faintly at the east edge (runtime marker tile 2)

  python3 pilot3_preview.py [floor,floor]
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import common
from common import SCRATCH
from previews import font
from pilot2_preview import sky_layer, _run, forest, labels, CAPTION

P3 = os.path.join(SCRATCH, "pilot3")
ART = os.path.join(P3, "art")
SHEETS = os.path.normpath(os.path.join(SCRATCH, "..", "codex-dungeons", "out"))
DEST = "/mnt/project-files/edu-rpg/acts-preview/dungeons/pilot3"
PX = 48


def sprite(sheet, row, col):
    """One cell of a magenta-keyed 3x3 sheet, keyed out and cropped to its content."""
    im = Image.open(os.path.join(SHEETS, f"{sheet}.png")).convert("RGB")
    s = im.width // 3
    a = np.asarray(im.crop((col * s, row * s, (col + 1) * s, (row + 1) * s))).astype(np.int16)
    key = (a[..., 0] > 200) & (a[..., 2] > 200) & (a[..., 1] < 90)
    soft = (a[..., 0] > 150) & (a[..., 2] > 150) & (a[..., 1] < 110) & ~key      # magenta fringe
    alpha = np.where(key, 0, np.where(soft, 90, 255)).astype(np.uint8)
    rgb = a.copy()
    rgb[soft] = np.stack([a[soft][:, 1]] * 3, -1)                                 # de-tint the fringe
    out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), alpha]), "RGBA")
    al = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3))                  # trim the 1 px halo
    out.putalpha(al)
    return out.crop(out.getbbox())


def tower(img, o, walk):
    a = np.asarray(img, np.float32).copy()
    H, W = a.shape[:2]
    t = o["tower"]
    cx = cy = t["centre"] * PX + PX / 2
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot(xx - cx, yy - cy)
    edge = (t["outerRadius"] + 0.5) * PX
    m = np.clip((r - edge) / 6.0, 0, 1)[..., None]
    shadow = np.clip(1 - (r - edge) / 70.0, 0, 1)[..., None] * (m > 0)
    rim = np.clip(1 - np.abs(r - edge) / 5.0, 0, 1)[..., None] * (yy[..., None] < cy)  # lit parapet edge
    sky = sky_layer(H, W) * (1 - 0.35 * shadow)
    a = a * (1 - m) + sky * m
    a = a * (1 + 0.25 * rim)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")
    win = sprite("mech-tiles-a", 0, 2)
    win = win.crop((int(win.width * 0.26), 0, int(win.width * 0.76), int(win.height * 0.88)))  # arch + sill only
    for x, y in o["decals"].get("skyWindow", []):
        col = x * PX + PX // 2
        yb = y * PX
        while yb < min(H - 1, y * PX + 3 * PX) and not walk[yb, col]:
            yb += 1                                                   # the rendered floor edge
        w = int(PX * 0.62); h = int(win.height * w / win.width)
        s = win.resize((w, h), Image.LANCZOS)
        top = yb - h + 4
        if top > 0:
            out.alpha_composite(s, (col - w // 2, top))
    g = np.array(o["tiles"])
    gust = sprite("mech-tiles-a", 0, 0)
    # only the gust streaks of the tile, so the barrier lies over the tower's own floor
    ga = np.asarray(gust, np.float32)
    lum = ga[..., :3].mean(-1)
    sat = ga[..., :3].max(-1) - ga[..., :3].min(-1)
    al = np.clip((lum - 150) / 55, 0, 1) * np.clip(1 - (sat - 40) / 40, 0, 1) * (ga[..., 3] / 255)
    gust = Image.fromarray(np.dstack([ga[..., :3], al * 255]).astype(np.uint8), "RGBA")
    for y, x in np.argwhere(g == 19):
        s = gust.resize((int(PX * 1.5), int(gust.height * PX * 1.5 / gust.width)), Image.LANCZOS)
        out.alpha_composite(s, (x * PX + PX // 2 - s.width // 2, y * PX + PX // 2 - s.height // 2))
    return out.convert("RGB")


def timber(img, o, walk):
    out = img.convert("RGBA")
    frame = sprite("mech-tiles-b", 2, 1)
    n = 0
    for t in o["decals"].get("timber", []):
        if t["axis"] != "v":
            continue
        row = t["y"] * PX + PX // 2
        r = _run(walk, row, t["x0"] * PX, (t["x1"] + 1) * PX, "x")
        if not r or r[1] - r[0] > 3.2 * PX:
            continue
        a_, b_ = r
        w = int((b_ - a_) + PX * 0.55)                               # posts sit into the rock
        h = int(PX * 1.75)                                            # taller than the hero (1.17 cells)
        s = frame.resize((w, h), Image.LANCZOS)
        foot = t["y"] * PX + PX
        out.alpha_composite(s, ((a_ + b_) // 2 - w // 2, foot - h))
        n += 1
    print(f"  {n} timber sets")
    return out.convert("RGB")


def one(fid):
    o = json.load(open(os.path.join(P3, f"{fid}.json")))
    img = Image.open(os.path.join(ART, f"{fid}-props.png")).convert("RGB")
    walk = np.asarray(Image.open(os.path.join(ART, f"{fid}-walk.png")).convert("L")) > 127
    did = o["dungeonId"]
    if did == "stormNest":
        img = tower(img, o, walk)
    elif did == "ironMine":
        img = timber(img, o, walk)
    elif did == "hauntedForest":
        img = forest(img, o, walk)
        # the way in is a gap between trees (mech-b[1,2]), laid over Act 1's cave-mouth arch
        ax, ay = next((a["x"], a["y"]) for a in o["assets"] if a["kind"] == "mouth")
        arch = sprite("mech-tiles-b", 1, 2)
        aa = np.asarray(arch, np.float32).copy()
        hh, ww = aa.shape[:2]
        fx = np.clip(np.minimum(np.arange(ww), ww - 1 - np.arange(ww)) / (ww * 0.16), 0, 1)
        fy = np.clip(np.arange(hh) / (hh * 0.22), 0, 1)
        aa[..., 3] *= np.minimum(fx[None, :], fy[:, None]) ** 0.8          # feather into the trees
        arch = Image.fromarray(aa.astype(np.uint8), "RGBA")
        w = int(PX * 3.4); h = int(arch.height * w / arch.width)
        im = img.convert("RGBA")
        im.alpha_composite(arch.resize((w, h), Image.LANCZOS), (ax * PX + PX // 2 - w // 2, min(im.height - h, ay * PX + PX - h + 10)))
        img = im.convert("RGB")
    img = labels(img, o)
    if did == "stormNest" and o["floor"] == 1:
        ax, ay = next((a["x"], a["y"]) for a in o["assets"] if a["kind"] == "mouth")
        ImageDraw.Draw(img).text((ax * PX - 30, ay * PX + PX + 4), "TOWER DOOR (in)", fill=(255, 245, 210), font=font(15))
    cap = {
        "ironMine": "Iron Mine F1: organic mine (Act 1 generator, mine spec), Act 1 renderer, Codex mat-iron-mine; timber sets from mech-tiles-b",
        "hauntedForest": "Haunted Forest F1: organic forest maze, Act 1 renderer, Codex mat-forest-maze; 3 east exits, one true (correctExitY)",
        "stormNest": "Storm Nest F{f}: BUILT stone tower (straight dressed walls, ring corridor, rooms, round outer wall), Act 1 lighting, Codex mat-tower-storm",
    }[did].format(f=o["floor"])
    if did == "stormNest" and o["floor"] >= 2:
        cap += "; WIND gate (19, mech-tiles wind) + windbreaker key chest"
    cap += f". {o['width']}x{o['height']} cells. Validator: {'; '.join(o['validation'])}"
    out = Image.new("RGB", (img.width, img.height + 36), (16, 16, 20))
    out.paste(img, (0, 36))
    ImageDraw.Draw(out).text((10, 9), cap, font=font(16), fill=(236, 236, 236))
    os.makedirs(DEST, exist_ok=True)
    p = os.path.join(DEST, f"{fid}-pilot3.jpg")
    for q in (90, 85, 80, 72):
        out.save(p, quality=q, optimize=True)
        if os.path.getsize(p) < 2.9e6:
            break
    print("wrote", p, round(os.path.getsize(p) / 1e6, 2), "MB")


if __name__ == "__main__":
    fids = sys.argv[1].split(",") if len(sys.argv) > 1 else ["ironMine-f1", "hauntedForest-f1", "stormNest-f1", "stormNest-f2"]
    for fid in fids:
        if os.path.exists(os.path.join(ART, f"{fid}-props.png")):
            one(fid)
        else:
            print("not rendered yet:", fid)
