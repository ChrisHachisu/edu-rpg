#!/usr/bin/env python3
"""Contact sheets for review: python3 contact.py <outdir> <sheetdir> [glob-prefix] [per-sheet=8]
Each sheet: 4 x 2 thumbnails (1/3 size of the 780x1688 captures) with the file name above each."""
import sys, os, glob
from PIL import Image, ImageDraw
src, dst = sys.argv[1], sys.argv[2]
pre = sys.argv[3] if len(sys.argv) > 3 else ''
per = int(sys.argv[4]) if len(sys.argv) > 4 else 8
os.makedirs(dst, exist_ok=True)
files = sorted(f for f in glob.glob(os.path.join(src, pre + '*.png')))
tw, th, lab, cols = 300, 650, 22, 4
for i in range(0, len(files), per):
    chunk = files[i:i + per]
    rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rows * (th + lab)), (40, 40, 40))
    d = ImageDraw.Draw(sheet)
    for j, f in enumerate(chunk):
        im = Image.open(f).convert('RGB'); im.thumbnail((tw, th))
        x, y = (j % cols) * tw, (j // cols) * (th + lab)
        sheet.paste(im, (x, y + lab)); d.text((x + 3, y + 4), os.path.basename(f)[:-4][:46], fill=(255, 255, 0))
    out = os.path.join(dst, f'{pre or "all"}-{i // per:02d}.jpg')
    sheet.save(out, quality=85); print(out)
