#!/usr/bin/env python3
"""Review JPGs for pilot2 (under 3 MB): the Act 1-renderer floor (pilot2_render.py) plus the
decal layers the layout JSON carries, placed against the RENDERED edge (the walk mask), not the cell
grid, so they sit on the organic wall:
  tower   open sky outside the round outer wall, window slits on the wall's inner face,
          wind-barrier draught on the 19 gate (a runtime tile; drawn here so the mechanic reads)
  mine    timber sets across the narrow shafts (posts on both walls + cap beam)
  forest  the three east exits, the true one (correctExitY) lit faintly (runtime marker tile 2)
Small labels mark KEY chests and the gate. Everything except the floor picture is preview-only or a
runtime layer.

  python3 pilot2_preview.py [floor,floor]
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import common
from common import SCRATCH
from previews import font

P2 = os.path.join(SCRATCH, "pilot2")
ART = os.path.join(P2, "art")
DEST = "/mnt/project-files/edu-rpg/acts-preview/dungeons/pilot2"
PX = 48


def _noise(h, w, s, seed):
    rng = np.random.default_rng(seed)
    n = rng.random((h // s + 2, w // s + 2)).astype(np.float32)
    return np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w + s, h + s), Image.BICUBIC), np.float32)[:h, :w] / 255


def sky_layer(H, W):
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    base = np.array([92, 146, 212], np.float32) * (1 - t) + np.array([168, 204, 240], np.float32) * t
    cl = np.clip((_noise(H, W, 110, 3) * 0.7 + _noise(H, W, 28, 4) * 0.3 - 0.55) * 3.0, 0, 1)[..., None]
    return np.broadcast_to(base, (H, W, 3)) * (1 - cl) + np.array([244, 247, 255], np.float32) * cl


def tower(img, o, walk):
    a = np.asarray(img, np.float32).copy()
    H, W = a.shape[:2]
    t = o["tower"]
    cx = cy = t["centre"] * PX + PX / 2
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot(xx - cx, yy - cy)
    edge = (t["outerRadius"] + 0.5) * PX
    m = np.clip((r - edge) / 8.0, 0, 1)[..., None]                    # soft 8 px edge
    shadow = np.clip(1 - (r - edge) / 60.0, 0, 1)[..., None] * (m > 0)  # the tower's shade on the cloud deck
    sky = sky_layer(H, W) * (1 - 0.35 * shadow)
    a = a * (1 - m) + sky * m
    # window slits on the inner face: find the rendered face in each decal column
    for x, y in o["decals"].get("skyWindow", []):
        col = x * PX + PX // 2
        y0 = y * PX
        yb = y0
        while yb < min(H - 1, y0 + 3 * PX) and walk[yb, col] == 0:
            yb += 1
        top, hgt, w2 = yb - int(PX * 0.95), int(PX * 0.62), 7
        if top < 4:
            continue
        a[top - 3:top + hgt + 3, col - w2 - 4:col + w2 + 4] *= 0.40
        for k in range(hgt):
            u = k / hgt
            a[top + k, col - w2:col + w2] = (150 + 70 * u, 196 + 44 * u, 242)
        a[top + hgt // 2:top + hgt // 2 + 2, col - w2 + 2:col + w2 - 1] = (248, 250, 255)
        a[top:top + 4, col - w2:col + w2] = (104, 134, 186)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(out, "RGBA")
    g = np.array(o["tiles"])
    for y, x in np.argwhere(g == 19):                                   # wind barrier: visible draught
        x0, y0 = x * PX, y * PX
        d.rectangle((x0, y0, x0 + PX, y0 + PX), fill=(210, 235, 255, 70))
        for k in range(4):
            yy_ = y0 + 8 + k * 10
            d.arc((x0 - 6 + (k % 2) * 8, yy_ - 6, x0 + PX - 4 + (k % 2) * 8, yy_ + 10), 200, 340,
                  fill=(240, 250, 255, 220), width=3)
    return out


def _run(walk, fixed, lo, hi, axis):
    """Contiguous walkable run through the centre of [lo, hi) along one axis."""
    H, W = walk.shape
    mid = (lo + hi) // 2
    get = (lambda v: walk[v, fixed]) if axis == "y" else (lambda v: walk[fixed, v])
    n = H if axis == "y" else W
    if not (0 <= mid < n) or not get(mid):
        return None
    a = mid
    while a > 0 and get(a - 1):
        a -= 1
    b = mid
    while b < n - 1 and get(b + 1):
        b += 1
    return a, b


def timber(img, o, walk):
    """Timber sets: two posts against the rendered walls and a cap beam across the shaft (overhead),
    only where the RENDERED shaft is at most ~3.2 cells wide."""
    out = img.convert("RGBA")
    lay = Image.new("RGBA", out.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    wood, dark, hi = (118, 80, 44, 255), (52, 34, 20, 255), (160, 116, 70, 255)
    def beam(x0, y0, x1, y1, vertical):
        d.rectangle((x0 + 6, y0 + 10, x1 + 6, y1 + 10), fill=(0, 0, 0, 80))           # shadow on the floor
        d.rectangle((x0, y0, x1, y1), fill=wood, outline=dark, width=2)
        for k in range(3):
            if vertical:
                xx = x0 + 4 + k * ((x1 - x0 - 8) // 2); d.line((xx, y0 + 4, xx, y1 - 4), fill=hi if k == 1 else dark, width=1)
            else:
                yy = y0 + 4 + k * ((y1 - y0 - 8) // 2); d.line((x0 + 4, yy, x1 - 4, yy), fill=hi if k == 1 else dark, width=1)
    for t in o["decals"].get("timber", []):
        if t["axis"] == "h":                                            # shaft runs E-W: set spans N-S
            col = t["x"] * PX + PX // 2
            r = _run(walk, col, t["y0"] * PX, (t["y1"] + 1) * PX, "y")
            if not r or r[1] - r[0] > 3.2 * PX:
                continue
            a_, b_ = r
            beam(col - 9, a_ - 26, col + 9, b_ - 8, True)
            for py in (a_ - 30, b_ - 22):
                d.rectangle((py and col - 12, py, col + 12, py + 26), fill=wood, outline=dark, width=2)
        else:
            row = t["y"] * PX + PX // 2
            r = _run(walk, row, t["x0"] * PX, (t["x1"] + 1) * PX, "x")
            if not r or r[1] - r[0] > 3.2 * PX:
                continue
            a_, b_ = r
            beam(a_ - 4, row - 34, b_ + 4, row - 18, False)
            for px_ in (a_ - 6, b_ - 12):
                d.rectangle((px_, row - 38, px_ + 18, row + 8), fill=wood, outline=dark, width=2)
    out.alpha_composite(lay)
    return out.convert("RGB")


def forest(img, o, walk):
    out = img.convert("RGBA")
    lay = Image.new("RGBA", out.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    W = out.width
    for e in o["decals"]["exits"]:
        y = e["y"] * PX
        if e["correct"]:
            for k in range(8, 0, -1):
                d.ellipse((W - 70 - k * 9, y + 24 - k * 7, W + k * 4, y + 24 + k * 7), fill=(200, 255, 190, 10))
    out.alpha_composite(lay.filter(ImageFilter.GaussianBlur(6)))
    return out.convert("RGB")


def labels(img, o):
    d = ImageDraw.Draw(img)
    f = font(14)
    for k in o.get("mechanics", {}).get("keyChests", []):
        x, y = k["x"] * PX, k["y"] * PX
        d.rectangle((x - 2, y - 2, x + PX + 2, y + PX + 2), outline=(255, 215, 0), width=2)
        d.text((x - 12, y - 20), "KEY (windbreaker)", fill=(255, 225, 90), font=f)
    g = np.array(o["tiles"])
    gs = np.argwhere(g == 19)
    if len(gs):
        y, x = gs.min(0)
        d.text((x * PX - 10, y * PX - 22), "WIND BARRIER (19)", fill=(225, 245, 255), font=f)
    for e in o.get("decals", {}).get("exits", []):
        d.text((img.width - 150, e["y"] * PX - 20), "TRUE EXIT" if e["correct"] else "exit (loops)",
               fill=(200, 255, 190) if e["correct"] else (230, 230, 230), font=f)
    return img


CAPTION = {
    "ironMine": "Iron Mine F1: new organic layout from Act 1's generator (mine spec), Act 1 renderer; timber sets on the narrow shafts",
    "hauntedForest": "Haunted Forest F1: organic forest maze (tree-mass walls 2-3 cells), Act 1 renderer; 3 east exits, one true (correctExitY)",
    "stormNest": "Storm Nest F{f}: stone tower floor (round outer wall, hand-built rooms, stair core, windows), Act 1 renderer",
}


def one(fid):
    o = json.load(open(os.path.join(P2, f"{fid}.json")))
    img = Image.open(os.path.join(ART, f"{fid}-props.png")).convert("RGB")
    walk = np.asarray(Image.open(os.path.join(ART, f"{fid}-walk.png")).convert("L")) > 127
    did = o["dungeonId"]
    if did == "stormNest":
        img = tower(img, o, walk)
    elif did == "ironMine":
        img = timber(img, o, walk)
    elif did == "hauntedForest":
        img = forest(img, o, walk)
    img = labels(img, o)
    cap = CAPTION[did].format(f=o["floor"]) + (" + WIND mechanic: 19 gate, windbreaker key chest" if did == "stormNest" and o["floor"] >= 2 else "")
    cap += f". {o['width']}x{o['height']} cells. Placeholder materials. Validator: {'; '.join(o['validation'])}"
    out = Image.new("RGB", (img.width, img.height + 36), (16, 16, 20))
    out.paste(img, (0, 36))
    ImageDraw.Draw(out).text((10, 9), cap, font=font(17), fill=(236, 236, 236))
    os.makedirs(DEST, exist_ok=True)
    p = os.path.join(DEST, f"{fid}-pilot2.jpg")
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
