#!/usr/bin/env python3
"""Snag census, step 0: every Acts 2-5 walk mask as a raw file the node tools read.

  python3 scripts/auto/snags/masks.py [out dir]      (default: $SNAG_MASKS or <tmp>/qok-snag-masks)

One <floor>.bin per public/acts-dungeons/<id>/<floor>-walk.png: u32 width, u32 height, then one byte a pixel
(1 = the mask's white, walkable, by the runtime's own test d[i*4] > 127 in dq-tiles.js a1mBuild).
"""
import glob, os, struct, sys, tempfile
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
out = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SNAG_MASKS") or os.path.join(tempfile.gettempdir(), "qok-snag-masks")
os.makedirs(out, exist_ok=True)
n = 0
for p in sorted(glob.glob(os.path.join(ROOT, "public", "acts-dungeons", "*", "*-walk.png"))):
    a = np.array(Image.open(p).convert("RGBA"))
    w = (a[:, :, 0] > 127).astype(np.uint8)
    h, wd = w.shape
    with open(os.path.join(out, os.path.basename(p).replace("-walk.png", "") + ".bin"), "wb") as f:
        f.write(struct.pack("<II", wd, h))
        f.write(w.tobytes())
    n += 1
print(n, "masks ->", out)
