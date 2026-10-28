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
from pilot2_preview import sky_layer, _run, forest

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
        w = int(PX * 0.85); h = int(win.height * w / win.width)
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
    cells = np.argwhere(g == 19)
    if len(cells):
        haze = Image.new("RGBA", out.size, (0, 0, 0, 0)); hd = ImageDraw.Draw(haze)
        for y, x in cells:
            hd.ellipse((x * PX - 30, y * PX - 24, x * PX + PX + 30, y * PX + PX + 24), fill=(190, 225, 255, 120))
        out.alpha_composite(haze.filter(ImageFilter.GaussianBlur(14)))
    for y, x in cells:
        s = gust.resize((int(PX * 1.9), int(gust.height * PX * 1.9 / gust.width)), Image.LANCZOS)
        sa = np.asarray(s, np.float32).copy(); sa[..., 3] = np.clip(sa[..., 3] * 1.8, 0, 255)
        s = Image.fromarray(sa.astype(np.uint8), "RGBA")
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


def labels(img, o):
    """pilot2's labels, stroked so they read on a light floor."""
    d = ImageDraw.Draw(img)
    f = font(16)
    kw = dict(font=f, stroke_width=3, stroke_fill=(10, 10, 14))
    for k in o.get("mechanics", {}).get("keyChests", []):
        x, y = k["x"] * PX, k["y"] * PX
        d.rectangle((x - 2, y - 2, x + PX + 2, y + PX + 2), outline=(255, 215, 0), width=3)
        d.text((x - 40, y - 24), "KEY (windbreaker)", fill=(255, 225, 90), **kw)
    gs = np.argwhere(np.array(o["tiles"]) == 19)
    if len(gs):
        y, x = gs.min(0)
        d.text((x * PX - 60, y * PX - 30), "WIND BARRIER (19)", fill=(225, 245, 255), **kw)
    for e in o.get("decals", {}).get("exits", []):
        d.text((img.width - 160, e["y"] * PX - 22), "TRUE EXIT" if e["correct"] else "exit (loops)",
               fill=(200, 255, 190) if e["correct"] else (230, 230, 230), **kw)
    return img


def agreement(o, walk):
    """Cell centres where the pixel collision mask (walkable_mask, what the game would block on)
    disagrees with the authored grid: floor drawn as wall, or wall drawn as floor. The organic
    renderer may move an edge off a cell centre by design; a built floor should show none."""
    g = np.array(o["tiles"]); H, W = g.shape
    fl_wall = wall_fl = 0
    for y in range(H):
        for x in range(W):
            v = walk[y * PX + PX // 2, x * PX + PX // 2]
            if g[y, x] == 1 and v:
                wall_fl += 1
            elif g[y, x] in (0, 6, 9, 19, 25) and not v:
                fl_wall += 1
    return fl_wall, wall_fl


def pixel_checks(o, walk):
    """The same questions the grid validator asks, asked of the COLLISION MASK the art produces
    (walkable_mask), sampled at cell centres:
      reach   every chest / stairs / exit reachable from the arrival
      leak    no wall the grid has is opened in the art into a shortcut: any connected run of
              grid-wall cells drawn as floor must join floor cells whose grid route differs by
              <= 8 steps (a rounded-off wall end, not a hole through a wall)
      gate    with the 19 cells blocked at full-cell size, the stairs cannot be reached"""
    from collections import deque
    from scipy import ndimage
    g = np.array(o["tiles"]); H, W = g.shape
    mw = lambda x, y: bool(walk[y * PX + PX // 2, x * PX + PX // 2])
    arr = next(a for a in o["assets"] if a["kind"] in ("mouth", "stairsUp"))
    s0 = (arr["x"], arr["y"])
    def bfs(ok):
        d = {s0: 0}; q = deque([s0])
        while q:
            x, y = q.popleft()
            for dx, dy in N4:
                n = (x + dx, y + dy)
                if 0 <= n[0] < W and 0 <= n[1] < H and n not in d and ok(*n):
                    d[n] = d[(x, y)] + 1; q.append(n)
        return d
    pm = bfs(mw)
    gd = bfs(lambda x, y: g[y, x] != 1)
    near = lambda d, x, y: any((x + a, y + b) in d for a, b in N4 + ((0, 0),))
    miss = [a["kind"] for a in o["assets"] if a["kind"] in ("chest", "stairsDown", "save", "boss") and not near(pm, a["x"], a["y"])]
    miss += [f"exit{e['y']}" for e in o.get("decals", {}).get("exits", []) if (W - 1, e["y"]) not in pm]
    m = np.array([[g[y, x] == 1 and mw(x, y) for x in range(W)] for y in range(H)])
    lab, n = ndimage.label(m)
    leaks = 0
    for k in range(1, n + 1):
        ds = {gd[(x + a, y + b)] for y, x in np.argwhere(lab == k) for a, b in N4
              if (x + a, y + b) in gd and mw(x + a, y + b)}
        leaks += bool(ds) and max(ds) - min(ds) > 8
    out = [f"pixel reach {'ok' if not miss else 'MISSING ' + ','.join(miss)}", f"wall leaks {leaks}"]
    if (g == 19).any():
        blk = walk.copy()
        for y, x in np.argwhere(g == 19):
            blk[y * PX:(y + 1) * PX, x * PX:(x + 1) * PX] = False
        # the hero's feet box is ~24 px wide, so a sliver under 12 px where a rounded wall corner
        # meets the square 19 cell is not a way through: erode by the half-width before asking
        blk = ndimage.binary_erosion(blk, iterations=6)
        lab2, _ = ndimage.label(blk)
        st = next(a for a in o["assets"] if a["kind"] == "stairsDown")
        root = lab2[s0[1] * PX + 24, s0[0] * PX + 24]
        through = root and any(lab2[(st["y"] + b) * PX + 24, (st["x"] + a) * PX + 24] == root for a, b in N4)
        k = o["mechanics"]["keyChests"][0]
        keyok = any(lab2[(k["y"] + b) * PX + 24, (k["x"] + a) * PX + 24] == root for a, b in N4)
        out.append("key chest reachable" if keyok else "KEY CHEST UNREACHABLE")
        out.append("gate holds in art" if not through else "GATE BYPASSABLE IN ART")
    return ", ".join(out)


N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


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
    fw_, wf_ = agreement(o, walk)
    pc = pixel_checks(o, walk)
    print(f"  {fid}: art vs grid at cell centres: {fw_} floor cells drawn as wall, {wf_} wall cells drawn as floor; {pc}")
    cap += f". {o['width']}x{o['height']} cells. Validator: {'; '.join(o['validation'])}; collision mask: {pc}"
    f16 = font(16)
    lines, cur = [], ""
    for word in cap.split(" "):
        t = (cur + " " + word).strip()
        if f16.getlength(t) > img.width - 20 and cur:
            lines.append(cur); cur = word
        else:
            cur = t
    lines.append(cur)
    top = 14 + 22 * len(lines)
    out = Image.new("RGB", (img.width, img.height + top), (16, 16, 20))
    out.paste(img, (0, top))
    for i, ln in enumerate(lines):
        ImageDraw.Draw(out).text((10, 8 + 22 * i), ln, font=f16, fill=(236, 236, 236))
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
