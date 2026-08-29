#!/usr/bin/env python3
"""Cover greenhollow's central well with the plaza's own cobble.

OWNER 2026-08-26 (build 62): "can you naturally cover the well that the player is facing on the sim
with grass?" The well stands in the middle of a fully COBBLED plaza -- a grass disc dropped into it
would read as a second defect, so the natural cover is the paving that already surrounds it on all
four sides, including the scattered moss and tufts that come with it.

Method is the herb-shop quarter's (2717844): composite through a feathered mask so the seam falls in
flat ground and the rest of the plate stays byte-identical. The fill is the plate's OWN cobble,
offset (-20, +160) -- chosen by matching mean and standard deviation per channel against the annulus
around the well (r 85-145), which is the tightest match on the plate: mean (163.7,160.5,120.0) and
std (38.6,36.8,52.1) against the annulus's (164.1,159.8,120.8) / (39.1,38.0,51.1). Cloning beats
generating here: it cannot drift in palette or brush from a painting that is already locked.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CX, CY = 993, 1004          # well centre, art px (authored band well-centre is x 942-1042, y 948-1052)
COVER_R = 80                # the well's full visual radius: stone, cast shadow and the tufts at its base
SIGMA = 13                  # feather; a blurred disc reaches full opacity about 2*sigma inside its edge
CORE_R = COVER_R + 2 * SIGMA
SRC_DX, SRC_DY = -20, 160

def cover(src_path, out_path):
    im = Image.open(src_path).convert("RGB")
    fill = im.transform(im.size, Image.AFFINE, (1, 0, SRC_DX, 0, 1, SRC_DY), resample=Image.NEAREST)
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).ellipse([CX - CORE_R, CY - CORE_R, CX + CORE_R, CY + CORE_R], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(SIGMA))
    out = Image.composite(fill, im, mask)
    a, b = np.asarray(im).astype(int), np.asarray(out).astype(int)
    diff = (np.abs(a - b).sum(2) > 0)
    ys, xs = np.nonzero(diff)
    m = np.asarray(mask)
    assert (b[m == 0] == a[m == 0]).all(), "changed a pixel the mask did not touch"
    print(f"{os.path.basename(out_path)}: {100*diff.mean():.2f}% of the plate changed, "
          f"bounded by x {xs.min()}..{xs.max()} y {ys.min()}..{ys.max()} "
          f"(mask core r={CORE_R}, full opacity to r={COVER_R})")
    out.save(out_path)

if __name__ == "__main__":
    cover(sys.argv[1], sys.argv[2])
