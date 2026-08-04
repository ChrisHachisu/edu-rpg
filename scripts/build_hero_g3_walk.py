#!/usr/bin/env python3
"""Cut the canonical g3 heroine down to the shipped tile runtime's 48 px walk sheet.

WHY
    Three different characters were shipping at once. The overworld and every dungeon run on
    the shipped tile runtime, which loads `assets/hero/hero-<variant>-walk.png` via
    hero-override.js -- a blocky closed-helm knight. Only the TOWNS, which run the act1-hifi
    overlay, showed the canonical g3 heroine. So walking out of Port Sapphire silently swapped
    your protagonist. docs/CANONICAL-ASSETS.md had already recorded the owner on this: "the
    hero is the old asset. you keep defaulting to this hero in new sessions so we need to fix
    this for good" -- but the fix never reached the tile runtime.

    Owner, 2026-08-03: "use the canonical g3 as the default and stop using anything else."

NO NEW ART IS GENERATED. The g3 sheet maps cleanly onto the tile runtime's documented
contract, so this is a re-cut, not a redraw:

    source  hero-act1-female-walk-8x3-64-g3.png   192x512 = 3 cols x 8 rows of 64x64
            rows are directions, cols are poses; town.html uses {down:0,left:2,up:3,right:6}
            with col 0 as the idle and cols 1-2 as the walk pair
    target  576x48 = 12 frames of 48x48, "12 frames = dir*3 + pose,
            dir 0=down 1=left 2=right 3=up, frame 0 = down-idle" (hero-override.js, verified
            2026-07-11 -- frame 0 is also the title/create/victory standing pose)

SCALE AND BASELINE
    The two characters fill their cells almost identically -- g3 occupies 81% of its 64px cell
    against the old sheet's 79% of 48px -- so a straight 64->48 NEAREST downscale lands within
    3% of the existing on-screen size and needs no compensation. What DOES need care is the
    baseline: g3's soles sit at y=59/64, which scales to ~44/48, three pixels higher than the
    shipped sheet's y=47. Left alone the hero floats above the tile. Each frame is therefore
    shifted so its lowest opaque row lands on the shipped sheet's sole row, measured from that
    sheet rather than assumed.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
G3 = ROOT / "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png"
REF = ROOT / "public/assets/hero/hero-openface-walk.png"   # baseline reference only, never written
OUT = ROOT / "public/assets/hero/hero-g3-walk.png"
FW = FH = 48
FRAMES = 12
# hero-override.js dir order -> g3 sheet row.
# The g3 source is an 8-way wheel in 45 deg steps starting at SOUTH:
#   0=S  1=SW  2=W  3=NW  4=N  5=NE  6=E  7=SE
# which the three known rows confirm (down=0, left=2, right=6 are 0/90/270 deg).
# UP therefore has to be row 4 -- the full back view, cape square to camera. This read
# row 3 (NW: the back at three-quarters, one ponytail and part of the shield showing),
# so walking north drew the diagonal. Owner, 2026-08-04: "the hero's north facing
# artwork is swapped with north west facing diagonal artwork." Verified by eye against
# every row of the source sheet before changing it.
DIR_ROW = {0: 0, 1: 2, 2: 6, 3: 4}


def main() -> int:
    g3 = Image.open(G3).convert("RGBA")
    if g3.size != (192, 512):
        raise SystemExit(f"g3 sheet is {g3.size}, expected (192, 512) -- 3 cols x 8 rows of 64")
    ref = Image.open(REF).convert("RGBA")
    if ref.size != (576, 48):
        raise SystemExit(f"reference sheet is {ref.size}, expected (576, 48)")
    ref_bb = ref.crop((0, 0, FW, FH)).getbbox()
    if not ref_bb:
        raise SystemExit("reference frame 0 is empty -- cannot measure the sole row")
    sole = ref_bb[3]

    out = Image.new("RGBA", (FW * FRAMES, FH), (0, 0, 0, 0))
    for d in range(4):
        for pose in range(3):
            cell = g3.crop((pose * 64, DIR_ROW[d] * 64, pose * 64 + 64, DIR_ROW[d] * 64 + 64))
            small = cell.resize((FW, FH), Image.NEAREST)      # pixel art: never resample smoothly
            bb = small.getbbox()
            if not bb:
                raise SystemExit(f"g3 cell dir={d} pose={pose} is empty")
            shifted = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
            shifted.paste(small, (0, sole - bb[3]))
            out.paste(shifted, ((d * 3 + pose) * FW, 0))

    got = out.crop((0, 0, FW, FH)).getbbox()
    if got[3] != sole:
        raise SystemExit(f"frame 0 soles at {got[3]}, expected {sole} -- the hero would float")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)
    print(f"HERO G3 WALK SHEET: {OUT.relative_to(ROOT)}  {out.size}  {FRAMES} frames")
    print(f"  soles aligned to y={sole}, measured from {REF.name}")
    print(f"  frame 0 content {got[2]-got[0]}x{got[3]-got[1]}px in a {FW}px cell")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
