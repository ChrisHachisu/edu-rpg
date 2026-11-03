#!/usr/bin/env python3
"""Design previews for the option (a) authored floors: F1 and the top floor of each dungeon, drawn by
the per-cell renderer (bundle_render.render_maze, placeholder materials, low memory). Adds the two
looks the layout data carries as decor: open sky around a tower, and glowing lava channels in the
forge. Mechanic tiles are marked with bundle_render.mech_overlay (PREVIEW ONLY). Tower stairs use
the climbing sprite for the next floor.

  python3 authored_previews.py [floor,floor]   -> /mnt/project-files/edu-rpg/acts-preview/dungeons/authored/
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import common
from common import PREVIEW
import bundle_render as BR
from bundle_render import render_maze, mech_overlay, CELL_STYLE, PX
from authored_floors import OUT, DUNGEONS
from previews import save_small, font

DEST = os.path.join(PREVIEW, "authored")
SWAP = {"stairsDown": "stairsUp", "stairsUp": "stairsDown"}


def _noise(h, w, s, seed):
    rng = np.random.default_rng(seed)
    n = rng.random((h // s + 2, w // s + 2)).astype(np.float32)
    return np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w + s, h + s), Image.BICUBIC),
                      np.float32)[:h, :w] / 255


def decorate(img, o):
    a = np.asarray(img, np.float32)
    H, W = a.shape[:2]
    dec = np.array([list(r) for r in o["decorRows"]])
    for ch, fn in (("s", sky), ("l", lava)):
        m = (dec == ch)
        if not m.any():
            continue
        mm = np.kron(m, np.ones((PX, PX))).astype(np.float32)
        mm = np.asarray(Image.fromarray((mm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3 if ch == "s" else 2)),
                        np.float32)[..., None] / 255
        a = a * (1 - mm) + fn(H, W) * mm
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def windows(img, cells):
    """bundle_render._windows' slit, drawn only at the JSON's skyWindow decals (outer wall only)."""
    a = np.asarray(img, np.float32).copy()
    for x, y in cells:
        cx, top = x * PX + PX // 2, y * PX + int(PX * 0.12)
        w2, hgt = 8, int(PX * 0.66)
        a[top - 2:top + hgt + 2, cx - w2 - 3:cx + w2 + 3] *= 0.45
        for k in range(hgt):
            t = k / hgt
            a[top + k, cx - w2:cx + w2] = (150 + 60 * t, 196 + 40 * t, 240)
        a[top + hgt // 2 - 1:top + hgt // 2 + 2, cx - w2:cx + w2 - 1] = (245, 248, 255)
        a[top:top + 3, cx - w2:cx + w2] = (110, 140, 190)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def sky(H, W):
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    base = np.array([96, 150, 214], np.float32) * (1 - t) + np.array([170, 205, 240], np.float32) * t
    cl = np.clip((_noise(H, W, 96, 3) * 0.7 + _noise(H, W, 24, 4) * 0.3 - 0.55) * 3.2, 0, 1)[..., None]
    return np.broadcast_to(base, (H, W, 3)) * (1 - cl) + np.array([246, 248, 255], np.float32) * cl


def lava(H, W):
    n = _noise(H, W, 20, 9) * 0.6 + _noise(H, W, 6, 10) * 0.4
    hot = np.clip((n - 0.35) * 2.2, 0, 1)[..., None]
    crust = np.array([70, 22, 10], np.float32); glow = np.array([255, 150, 40], np.float32)
    return crust * (1 - hot) + glow * hot


def one(fid):
    o = json.load(open(os.path.join(OUT, f"{fid}.json")))
    did = o["dungeonId"]
    assets = [dict(a, kind=SWAP.get(a["kind"], a["kind"])) if o.get("ascending") else a for a in o["assets"]]
    fl = {"rows": o["rows"], "assets": assets, "sub": np.array(o["tiles"])}
    style = CELL_STYLE.get(did, "masonry")
    img, walk = render_maze(did, fl, "masonry" if style == "tower" else style)   # windows from decals below
    img = decorate(img, o)
    img = windows(img, o.get("decals", {}).get("skyWindow", []))
    prev = mech_overlay(img, fl["sub"])
    m = o.get("mechanics", {})
    d = ImageDraw.Draw(prev)
    for k in m.get("keyChests", []):
        d.rectangle((k["x"] * PX + 1, k["y"] * PX + 1, (k["x"] + 1) * PX - 2, (k["y"] + 1) * PX - 2), outline=(255, 215, 0), width=3)
        d.text((k["x"] * PX + 4, k["y"] * PX - 14), "KEY", fill=(255, 215, 0), font=font(13))
    for s in m.get("mimicChests", []):
        x, y = map(int, s.split(","))
        d.text((x * PX + 2, y * PX - 14), "MIMIC", fill=(255, 90, 90), font=font(13))
    for s in m.get("hiddenRoomChests", []):
        x, y = map(int, s.split(","))
        d.text((x * PX - 4, y * PX + PX), "hidden", fill=(255, 120, 230), font=font(13))
    cap = (f"{DUNGEONS[did]['theme']}: {did} {o['floor']}F/{o['totalFloors']}F, AUTHORED option (a) mockup, "
           f"{o['width']}x{o['height']} cells, mechanic {o['mechanic'] or 'none'}. "
           f"{'Floors go UP; stairs climb. ' if o.get('ascending') else ''}Placeholder materials."
           + (f" windCorridorDir dx={m['windCorridorDir']['dx']} dy={m['windCorridorDir']['dy']} (lane = tile 25)."
              if "windCorridorDir" in m else ""))
    out = Image.new("RGB", (max(prev.width, 1200), prev.height + 34), (16, 16, 20))
    out.paste(prev, (0, 34))
    ImageDraw.Draw(out).text((8, 8), cap, font=font(16), fill=(235, 235, 235))
    os.makedirs(DEST, exist_ok=True)
    p = os.path.join(DEST, f"{fid}-authored.png")
    n = save_small(out, p)
    if n > 4e6:
        out = out.resize((out.width * 2 // 3, out.height * 2 // 3), Image.LANCZOS)
        n = save_small(out, p)
    print("wrote", p, round(n / 1e6, 2), "MB")
    return p


def main():
    if len(sys.argv) > 1:
        fids = sys.argv[1].split(",")
    else:
        fids = [f"{d}-f{f}" for d, s in DUNGEONS.items() for f in (1, s["floors"])]
    for fid in fids:
        one(fid)


if __name__ == "__main__":
    main()
