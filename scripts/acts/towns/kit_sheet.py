#!/usr/bin/env python3
"""Contact sheet of the kit cut-outs over a flat snow-ish backdrop, so matte defects are visible."""
import glob
import os
import sys

from PIL import Image, ImageDraw

from kitlib import SCRATCH

bg = tuple(int(v) for v in (sys.argv[1] if len(sys.argv) > 1 else "214,222,232").split(","))
only = sys.argv[2].split(",") if len(sys.argv) > 2 else None
files = sorted(f for f in glob.glob(os.path.join(SCRATCH, "kit", "*.png"))
               if not f.endswith(("-shadow.png", "-roof.png", "-ground.png")) and "sheet" not in f)
if only:
    files = [f for f in files if os.path.basename(f)[:-4] in only]
cell = 330
cols = 6
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + 16)), bg)
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f)
    sh = Image.open(f[:-4] + "-shadow.png")
    k = min(cell / im.width, cell / im.height)
    im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
    sh = sh.resize(im.size, Image.LANCZOS)
    x, y = (i % cols) * cell, (i // cols) * (cell + 16)
    dark = Image.new("RGB", im.size, (40, 50, 70))
    sheet.paste(dark, (x, y), sh)
    sheet.paste(im, (x, y), im)
    rf = f[:-4] + "-roof.png"
    if os.path.exists(rf) and os.environ.get("ROOFS"):
        r = Image.open(rf).resize(im.size, Image.NEAREST).point(lambda v: 110 if v > 127 else 0)
        sheet.paste(Image.new("RGB", im.size, (255, 0, 0)), (x, y), r)
        gf = f[:-4] + "-ground.png"
        if os.path.exists(gf):
            g = Image.open(gf).resize(im.size, Image.NEAREST).point(lambda v: 140 if v > 127 else 0)
            sheet.paste(Image.new("RGB", im.size, (0, 90, 255)), (x, y), g)
    d.text((x + 3, y + cell + 2), os.path.basename(f)[:-4], fill=(0, 0, 0))
out = os.path.join(SCRATCH, "kit", "kit-sheet.png")
sheet.save(out)
print(out, sheet.size)
