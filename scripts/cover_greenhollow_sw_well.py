#!/usr/bin/env python3
"""Cover the HALF-DRAWN WELL beside greenhollow's south-west woodpile with grass.

OWNER 2026-08-29 (build 63): "the part of the well is still in the map. please cover it with grass
(to the left of the player in the screen shot)."

This is a DIFFERENT well from the central one that `cover_greenhollow_well.py` removed, and from the
herb-shop one repainted on 2026-08-25. It is a C of masonry at art (858-900, 1538-1580), cell
~(29.3, 51.9), sitting in the grass between the woodpile and the south path -- the same
"half drawn well" class of defect the owner first reported on build 59. It carries NO collision at
all: the derivation never saw it as an obstacle, so this is purely a paint fix.

TWO THINGS THIS COVER DOES DIFFERENTLY FROM THE CENTRAL WELL'S

1. GRASS, not cobble, and the source was picked BY EYE before it was checked by numbers. The
   automatic mean/std match chose an offset of (-200,-200) whose disc scored 0.83% "dirty" and was
   in fact a COTTAGE ROOF: green roof tiles are green-dominant, so a grass detector built on
   "green wins" waves them straight through. Eight candidate patches were rendered and looked at,
   and (880, 1760) -- open grass with scattered white and yellow flowers, offset (0, +202) -- was
   chosen from those. A statistic cannot tell you it has handed you a roof.

2. A SHAPED mask, not a feathered disc. The fragment sits within ~8 px of the woodpile above it and
   the barrel to its left, so the disc-plus-34px-feather used on the central well would have ghosted
   both. The mask here is derived from the fragment itself -- everything inside a tight box that is
   NOT green-dominant, i.e. the masonry and its shadow -- then dilated 5 px and blurred 2.5. A tight
   mask is safe here precisely because source and destination are the same material: there is no
   seam to hide, so there is no need for a wide feather.
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

SRC_DX, SRC_DY = 0, 202              # open grass 6.7 cells due south; see note 2 above
BOX = (854, 1536, 906, 1592)         # hugs the fragment and stops clear of the woodpile
DILATE, SIGMA = 5, 2.5

def cover(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    x0, y0, x1, y1 = BOX
    sub = a[y0:y1, x0:x1]
    r, g, b = sub[:, :, 0], sub[:, :, 1], sub[:, :, 2]
    m = np.zeros(a.shape[:2], bool)
    m[y0:y1, x0:x1] = ~((g > r + 8) & (g > b + 25))      # masonry + its shadow; grass is green-dominant
    mask = (Image.fromarray((m * 255).astype("uint8"))
            .filter(ImageFilter.MaxFilter(2 * DILATE + 1))
            .filter(ImageFilter.GaussianBlur(SIGMA)))
    fill = im.transform(im.size, Image.AFFINE, (1, 0, SRC_DX, 0, 1, SRC_DY), resample=Image.NEAREST)
    out = Image.composite(fill, im, mask)
    diff = (np.abs(a - np.asarray(out).astype(int)).sum(2) > 0)
    ys, xs = np.nonzero(diff)
    assert (np.asarray(out)[np.asarray(mask) == 0] == np.asarray(im)[np.asarray(mask) == 0]).all()
    print(f"  {os.path.basename(path)}: {diff.sum()} px changed, "
          f"bbox x {xs.min()}..{xs.max()} y {ys.min()}..{ys.max()}")
    out.save(path)

if __name__ == "__main__":
    for p in (sys.argv[1:] or ["public/act1-hifi/town/greenhollow-screen.png",
                               "design/act1-towns/greenhollow-screen.png"]):
        cover(p)
