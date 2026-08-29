#!/usr/bin/env python3
"""Take the lantern out of the greenhollow/millbrook/portSapphire healer sprite.

OWNER 2026-08-29 (build 63): "the healer is also holding a lantern for some reason but this is
weird. she does not need it."

The lantern was one of three deliberate silhouette marks given to her on 2026-08-25 (winged coif,
lit lantern, flared hem). Two of the three survive, which is enough to keep her readable against the
rest of the cast -- the coif is still the only flared headwear and the hem the only triangle.

METHOD: mirror, not erase. Her raised right arm exists only to hold the lantern up, so deleting the
lantern alone would leave an arm reaching for nothing. Instead the strip left of her body axis is
replaced by a mirror of the strip right of it, which carries her LOWERED left arm across. She is
drawn nearly symmetric -- skirt x 22..47 and feet x 25..44 both centre on 34.5 -- so the mirror
lands without a seam, and it costs no new art.

SCOPE: row 0 only, the three FRONT-FACING frames. town.html draws NPCs with
`drawActor(n.sheet, n.point, 0, 0, ...)` -- column 0, row 0, always, because the owner made these
NPCs stationary -- so row 0 is the entire visible sprite. Rows 1-3 are a walk cycle nothing renders
and they still carry the lantern; the mirror cannot fix them (mirroring a side view flips which way
she faces) and colour cannot find the lantern either -- measured against her hair it is the same
range, mean (149,117,68) against (156,114,71). If NPC animation is ever switched on, those nine
frames need regenerating, not patching.
"""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AXIS_SUM = 69          # x + x' = 69, i.e. the axis at 34.5 measured off skirt and feet
STRIP = range(12, 30)  # the lantern side; x 30+ (face, right arm) is left untouched
FRAME = 64
ROW = 0                # front-facing; see SCOPE above

TARGETS = [f"public/act1-hifi/town/npc/{t}-healer-4x3-64.png" for t in
           ("greenhollow", "millbrook", "portSapphire")] + \
          [f"design/act1-towns/npc/final/{t}-healer-4x3-64.png" for t in
           ("greenhollow", "millbrook", "portSapphire")]


def drop(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).copy()
    cols = im.width // FRAME
    for col in range(cols):
        x0, y0 = col * FRAME, ROW * FRAME
        f = a[y0:y0 + FRAME, x0:x0 + FRAME].copy()
        for x in STRIP:
            f[:, x] = f[:, AXIS_SUM - x]
        a[y0:y0 + FRAME, x0:x0 + FRAME] = f
    Image.fromarray(a.astype("uint8"), "RGBA").save(path)
    return cols


if __name__ == "__main__":
    for rel in TARGETS:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            sys.exit(f"missing: {rel}")
        print(f"  {rel}: {drop(p)} front frame(s) de-lanterned")
