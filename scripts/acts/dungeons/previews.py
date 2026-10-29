#!/usr/bin/env python3
"""Review PNGs for the owner: per-dungeon full floor previews and one contact sheet per act.

  <preview>/act<N>-dungeons.png        one ~800x600 1:1 crop per dungeon (floor 1), labelled
  <preview>/<dungeon>-f<n>-preview.png  the whole floor at 1:1 (props layer), labelled strip;
                                       quantised to 192 colours (the renderer's own PALETTE_COLORS) only if a 24-bit PNG exceeds 4 MB
  <preview>/materials-act2-5.png       the derived material sets, graded as the renderer grades

    previews.py [--floors f1|all] [--acts 2,3,4,5]
"""
import argparse, io, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import common
from common import DESIGN, RUNTIME, PREVIEW
from specs import SPECS, BY_ID

CW, CH = 800, 600
LIMIT = 4_000_000


def font(sz):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def best_crop(fl, W, H):
    """The 800x600 window that best SHOWS the theme: about half floor, half wall (a pure-floor
    window hides the wall treatment), preferring windows that also hold props."""
    g = np.array([[c != "#" for c in r] for r in fl["rows"]], float)
    cw, ch = int(CW / 48), int(CH / 48)
    pts = [(a["x"], a["y"]) for a in fl.get("assets", [])]
    best, bx, by = -9, 0, 0
    for y in range(0, max(1, fl["height"] - ch) + 1):
        for x in range(0, max(1, fl["width"] - cw) + 1):
            frac = g[y:y + ch, x:x + cw].mean()
            n = sum(1 for (px, py) in pts if x <= px < x + cw and y <= py < y + ch)
            sc = -abs(frac - 0.5) + 0.04 * min(n, 3)
            if sc > best:
                best, bx, by = sc, x, y
    x0, y0 = min(bx * 48, max(0, W - CW)), min(by * 48, max(0, H - CH))
    return (x0, y0, x0 + CW, y0 + CH)


def save_small(im, path):
    """24-bit PNG if it fits under LIMIT, else the fewest-loss palette that does (192 first: the
    renderer's own PALETTE_COLORS)."""
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True)
    for n in (192, 128, 96):
        if buf.tell() <= LIMIT:
            break
        buf = io.BytesIO(); im.quantize(n, method=Image.Quantize.MEDIANCUT,
                                        dither=Image.Dither.NONE).save(buf, "PNG", optimize=True)
    open(path, "wb").write(buf.getvalue())
    return buf.tell()


def props_path(fid):
    did = fid.rsplit("-f", 1)[0]
    return os.path.join(RUNTIME, f"act{BY_ID[did]['act']}-dungeon-art", f"{fid}-props.png")


def full_preview(fid):
    fl = json.load(open(os.path.join(DESIGN, f"{fid}.json")))
    im = Image.open(props_path(fid)).convert("RGB")
    s = BY_ID[fl["dungeonId"]]
    bar = 34
    out = Image.new("RGB", (im.width, im.height + bar), (16, 16, 20))
    out.paste(im, (0, bar))
    d = ImageDraw.Draw(out)
    d.text((10, 8), f"{s['name']}  B{fl['floor']}F of {fl['totalFloors']}  ·  {fl['width']}x{fl['height']} cells"
                    f"  ·  {fl['walkableCells']} walkable  ·  {fl['pattern']}  ·  theme: {fl['theme']}"
                    f"  ·  1:1 (48 px/cell)", font=font(16), fill=(235, 235, 235))
    p = os.path.join(PREVIEW, f"{fid}-preview.png")
    n = save_small(out, p)
    print(f"wrote {p} {n/1e6:.2f} MB")


def contact(act):
    specs = [s for s in SPECS if s["act"] == act and os.path.exists(props_path(f"{s['id']}-f1"))]
    if not specs:
        return
    cols = 3 if len(specs) > 4 else 2
    rows = (len(specs) + cols - 1) // cols
    pad, lab = 12, 30
    sheet = Image.new("RGB", (cols * (CW + pad) + pad, rows * (CH + lab + pad) + pad + 44), (14, 14, 18))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 12), f"Act {act} dungeons — floor 1, 1:1 crops (48 px/cell), material renderer, "
                      f"design preview", font=font(20), fill=(240, 240, 240))
    for i, s in enumerate(specs):
        fid = f"{s['id']}-f1"
        fl = json.load(open(os.path.join(DESIGN, f"{fid}.json")))
        im = Image.open(props_path(fid)).convert("RGB")
        box = best_crop(fl, im.width, im.height)
        x = pad + (i % cols) * (CW + pad)
        y = 44 + pad + (i // cols) * (CH + lab + pad)
        d.text((x, y + 4), f"{s['name']}  ·  {s['theme']}  ·  {s['floors']}F"
                           f"{'  ·  mech ' + s['mechanic'] if s.get('mechanic') else ''}",
               font=font(16), fill=(225, 225, 225))
        sheet.paste(im.crop(box), (x, y + lab))
    p = os.path.join(PREVIEW, f"act{act}-dungeons.png")
    n = save_small(sheet, p)
    print(f"wrote {p} {n/1e6:.2f} MB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--floors", default="f1")
    ap.add_argument("--acts", default="2,3,4,5")
    ap.add_argument("--no-full", action="store_true")
    a = ap.parse_args()
    os.makedirs(PREVIEW, exist_ok=True)
    acts = [int(x) for x in a.acts.split(",")]
    for act in acts:
        contact(act)
    if a.no_full:
        return
    for s in SPECS:
        if s["act"] not in acts:
            continue
        for n in (range(1, s["floors"] + 1) if a.floors == "all" else [1]):
            fid = f"{s['id']}-f{n}"
            if os.path.exists(props_path(fid)):
                full_preview(fid)


if __name__ == "__main__":
    main()
