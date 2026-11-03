#!/usr/bin/env python3
"""What the runtime SHADER route would draw from the shippable data alone: one floor's 1/4-res
field (fields.py) plus its dungeon's 4 materials (material_pack.py), composited the way a small
WebGL fragment shader can, per pixel with no neighbourhood passes beyond one pre-blurred field:

  f      = bilinear(field)                     # 12 px/cell -> 48 px/cell
  wallT  = smoothstep(0.40, 0.60, 1 - f)       # floor/wall blend at the 0.5 edge
  face   = wallT(y) - wallT(y + 0.42 cell)     # south face band: wall above floor
  ao     = blurred field (baked into a mip)    # contact darkening near walls
  rgb    = mix(floor, wall * (1.15 - 0.55 face), wallT) * (1 - 0.4 ao_near)

Materials are sampled on Act 1's 57/32 lattice. It is a REFERENCE for the shader port and an honest
preview of the shippable look; it is not the baked splat look and will not match it byte for byte.

  python3 shader_preview.py            # act<N>-shader-route.png on the mount (floor 1 crops)
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import common
from common import RUNTIME, PREVIEW, MATROOT
from specs import SPECS
from themes import T
from previews import save_small, font
import render_dungeon_material_map as R

PX = 48
FD = os.path.join(RUNTIME, "fields")


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def compose(fid, box_cells=None):
    meta = json.load(open(os.path.join(FD, f"{fid}.json")))
    did = meta["dungeon"]
    fl = Image.open(os.path.join(FD, f"{fid}-field.png"))
    W, H = meta["width"] * PX, meta["height"] * PX
    f = np.asarray(fl.resize((W, H), Image.BILINEAR), np.float32) / 255
    if box_cells:
        x0, y0, x1, y1 = [v * PX for v in box_cells]
        f = f[y0:y1, x0:x1]
    else:
        x0 = y0 = 0
    h, w = f.shape
    tgt = T[did]["target"]
    mats = {k: R.grade(np.asarray(Image.open(os.path.join(MATROOT, did, f"mat-{k}.png")).convert("RGB"), np.float32),
                       tgt["floor" if k in ("floor", "rubble") else "wall"])
            for k in ("floor", "wall")}
    yy, xx = np.mgrid[y0:y0 + h, x0:x0 + w]
    k = 57 / 32
    sy, sx = (yy * k).astype(np.int64), (xx * k).astype(np.int64)
    fm, wm = mats["floor"], mats["wall"]
    ft = fm[sy % fm.shape[0], sx % fm.shape[1]]
    wt = wm[(sy + 211) % wm.shape[0], (sx + 97) % wm.shape[1]]
    wall = smooth(0.40, 0.60, 1 - f)
    d = int(PX * 0.42)
    below = np.zeros_like(wall); below[:-d] = wall[d:]
    face = np.clip(wall - below, 0, 1)
    ao = np.asarray(Image.fromarray((wall * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14)), np.float32) / 255
    sh = np.zeros_like(wall); s = int(PX * 0.28); sh[s:] = wall[:-s]
    sh = np.clip(sh - wall, 0, 1)
    floor = ft * (1 - 0.40 * ao[..., None]) * (1 - 0.5 * sh[..., None])
    wallc = wt * (1.15 - 0.55 * face[..., None])
    rgb = floor * (1 - wall[..., None]) + wallc * wall[..., None]
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    from make_dungeon_assets import sprite_at
    im = img.convert("RGBA")
    for it in meta["assets"]:
        sp = sprite_at(it["kind"], int(PX * R.PROP_CELLS.get(it["kind"], 1.0)))
        if sp is not None:
            im.alpha_composite(sp.convert("RGBA"), (int(it["x"] * PX + PX / 2 - sp.width / 2) - x0,
                                                     int(it["y"] * PX + PX / 2 - sp.height / 2) - y0)
                               if 0 <= it["x"] * PX - x0 < w - PX and 0 <= it["y"] * PX - y0 < h - PX else (-999, -999))
    return im.convert("RGB"), meta


def main():
    from bundle_previews import crop_box, art
    CW, CH = 800, 600
    for act in (2, 3, 4, 5):
        specs = [s for s in SPECS if s["act"] == act and os.path.exists(os.path.join(FD, f"{s['id']}-f1.json"))]
        if not specs:
            continue
        cols = 3 if len(specs) > 4 else 2
        rows = (len(specs) + cols - 1) // cols
        pad, lab = 12, 30
        sheet = Image.new("RGB", (cols * (CW + pad) + pad, rows * (CH + lab + pad) + pad + 44), (14, 14, 18))
        dr = ImageDraw.Draw(sheet)
        dr.text((pad, 12), f"Act {act} floor 1 via the SHIPPABLE route: 1/4-res field + 4 materials, shader-style "
                           f"composite (no baked floor PNG). Placeholder materials until the Codex sheets land.",
                 font=font(18), fill=(240, 240, 240))
        for i, s in enumerate(specs):
            fid = f"{s['id']}-f1"
            meta = json.load(open(os.path.join(FD, f"{fid}.json")))
            rows_ = ["".join("#" for _ in range(meta["width"]))] * meta["height"]
            try:
                bmeta = json.load(open(art(f"{fid}.json")))
                bx = crop_box(bmeta, meta["width"] * PX, meta["height"] * PX)
            except Exception:
                bx = (0, 0, min(CW, meta["width"] * PX), min(CH, meta["height"] * PX))
            cells = (bx[0] // PX, bx[1] // PX, -(-bx[2] // PX), -(-bx[3] // PX))
            im, _ = compose(fid, cells)
            im = im.crop((bx[0] - cells[0] * PX, bx[1] - cells[1] * PX,
                          bx[0] - cells[0] * PX + (bx[2] - bx[0]), bx[1] - cells[1] * PX + (bx[3] - bx[1])))
            x = pad + (i % cols) * (CW + pad); y = 44 + pad + (i // cols) * (CH + lab + pad)
            dr.text((x, y + 4), f"{s['name']} · field {meta['bytes']['field'] / 1e3:.0f} KB + walk "
                                f"{meta['bytes']['walk'] / 1e3:.1f} KB", font=font(16), fill=(225, 225, 225))
            sheet.paste(im, (x, y + lab))
        p = os.path.join(PREVIEW, f"act{act}-shader-route.png")
        print("wrote", p, round(save_small(sheet, p) / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
