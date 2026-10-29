#!/usr/bin/env python3
"""Review PNGs for the REAL-layout renders (bundle_render.py):
  <preview>/act<N>-dungeons.png         one ~800x600 1:1 crop per dungeon, mechanic tiles marked
  <preview>/<floor>-real-preview.png     whole floor, 1:1, mechanic overlay + caption
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
import common
from common import PREVIEW
from specs import SPECS, BY_ID
from previews import save_small, font, CW, CH
ARTS = [os.path.join(common.SCRATCH, "bundle-art-cells"), os.path.join(common.SCRATCH, "bundle-art")]


def art(name):
    """Per-cell renders (bundle-art-cells) first so a sheet is one method; splat/maze dir second."""
    for a in ARTS:
        if os.path.exists(os.path.join(a, name)):
            return os.path.join(a, name)
    return os.path.join(ARTS[-1], name)


def crop_box(meta, W, H):
    g = np.array([[c != "#" for c in r] for r in meta["rows"]], float)
    cw, ch = min(int(CW / 48), g.shape[1]), min(int(CH / 48), g.shape[0])
    best, bx, by = -9, 0, 0
    for y in range(0, g.shape[0] - ch + 1):
        for x in range(0, g.shape[1] - cw + 1):
            fr = g[y:y + ch, x:x + cw].mean()
            n = sum(1 for a in meta["assets"] if x <= a["x"] < x + cw and y <= a["y"] < y + ch)
            sc = -abs(fr - 0.45) + 0.03 * min(n, 3)
            if sc > best:
                best, bx, by = sc, x, y
    x0, y0 = min(bx * 48, max(0, W - CW)), min(by * 48, max(0, H - CH))
    return (x0, y0, min(W, x0 + CW), min(H, y0 + CH))


def caption(s, meta):
    return (f"{s['name']} B{meta['floor'].rsplit('-f',1)[1]}F · REAL in-game layout (bundle Ap) · "
            f"{meta['method'].split(' ')[0]} · {s.get('mechanic') or 'no mechanic'} · "
            f"collision mismatches {meta['collisionMismatchCells']}")


def main():
    acts = [int(a) for a in (sys.argv[1] if len(sys.argv) > 1 else "2,3,4,5").split(",")]
    for act in acts:
        specs = [s for s in SPECS if s["act"] == act and os.path.exists(art(f"{s['id']}-f1.json"))]
        if not specs:
            continue
        cols = 3 if len(specs) > 4 else 2
        rows = (len(specs) + cols - 1) // cols
        pad, lab = 12, 30
        sheet = Image.new("RGB", (cols * (CW + pad) + pad, rows * (CH + lab + pad) + pad + 44), (14, 14, 18))
        d = ImageDraw.Draw(sheet)
        d.text((pad, 12), f"Act {act} dungeons, floor 1: REAL in-game layouts (bundle generator), 1:1 crops. "
                          f"Coloured squares = runtime mechanic tiles (not baked). Placeholder materials.",
               font=font(18), fill=(240, 240, 240))
        for i, s in enumerate(specs):
            meta = json.load(open(art(f"{s['id']}-f1.json")))
            im = Image.open(art(f"{s['id']}-f1-mech-preview.png"))
            box = crop_box(meta, im.width, im.height)
            x = pad + (i % cols) * (CW + pad); y = 44 + pad + (i // cols) * (CH + lab + pad)
            d.text((x, y + 4), f"{s['name']} · {s.get('mechanic') or 'no mechanic'} · {s['floors']}F",
                   font=font(16), fill=(225, 225, 225))
            sheet.paste(im.crop(box), (x, y + lab))
        p = os.path.join(PREVIEW, f"act{act}-dungeons.png")
        print("wrote", p, round(save_small(sheet, p) / 1e6, 2), "MB")
        # whole-floor overview: the structure (maze / tower stairwell / trunk) at a glance
        TH = 560
        ims = [Image.open(art(f"{s['id']}-f1-mech-preview.png")) for s in specs]
        th = [im.resize((max(1, int(im.width * min(TH / im.height, 420 / im.width))),
                         max(1, int(im.height * min(TH / im.height, 420 / im.width)))), Image.LANCZOS) for im in ims]
        ov = Image.new("RGB", (sum(t.width + pad for t in th) + pad, TH + lab + 44 + pad), (14, 14, 18))
        d = ImageDraw.Draw(ov)
        d.text((pad, 12), f"Act {act} floor 1, whole floor (scaled): the real generator structure", font=font(18), fill=(240, 240, 240))
        x = pad
        for s, t in zip(specs, th):
            d.text((x, 48), s["name"], font=font(15), fill=(225, 225, 225))
            ov.paste(t, (x, 44 + lab)); x += t.width + pad
        p = os.path.join(PREVIEW, f"act{act}-dungeons-overview.png")
        print("wrote", p, round(save_small(ov, p) / 1e6, 2), "MB")
        for s in specs:
            meta = json.load(open(art(f"{s['id']}-f1.json")))
            im = Image.open(art(f"{s['id']}-f1-mech-preview.png")).convert("RGB")
            p = os.path.join(PREVIEW, f"{s['id']}-f1-real-preview.png")
            scale = 1
            while True:                         # review PNGs stay under ~4 MB; caption stays full size
                sm = im if scale == 1 else im.resize((im.width // scale, im.height // scale), Image.LANCZOS)
                out = Image.new("RGB", (max(sm.width, 1100), sm.height + 30), (16, 16, 20))
                out.paste(sm, (0, 30))
                cap = caption(s, meta) + ("" if scale == 1 else f" · shown at 1/{scale} scale")
                ImageDraw.Draw(out).text((8, 7), cap, font=font(15), fill=(235, 235, 235))
                n = save_small(out, p)
                if n <= 4e6 or scale >= 4:
                    break
                scale *= 2
            print("wrote", p, round(n / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
