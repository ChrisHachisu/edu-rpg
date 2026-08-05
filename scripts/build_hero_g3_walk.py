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
# 64, the canonical g3 NATIVE frame -- deliberately NOT downscaled to 48.
# Owner, 2026-08-04: "the hero resolution is a bit too rough though. the size is good but it
# needs to match the dungeon pixel count." The sheet used to be resampled 64->48 here and then
# scaled back UP ~1.35x at runtime to sit correctly against the 48 px/cell dungeon art -- two
# resamples, so the heroine carried ~35x39 real pixels while occupying ~65 screen px. Shipping
# the native 64 px frame makes that ~1:1 with the art she stands on. hero-override.js reads the
# same 64 and drops its scale to 1.0125 so her on-screen SIZE is unchanged.
FW = FH = 64
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

# ---- THE NORTH ROW ARRIVES WITH ITS CROWN CUT OFF -------------------------------------------
# Owner, 2026-08-05, playing the Act 1 dungeon: "the hero's north facing animation cuts off its
# head." It is not a render bug and nothing clips it at runtime -- the defect is IN THE CANONICAL
# SOURCE. Row 4 (N, the square-on back view) of hero-act1-female-walk-8x3-64-g3.png begins at
# y=11/9/9 with a 24-25 px FULLY OPAQUE, PERFECTLY FLAT, un-antialiased horizontal run. Every
# other row of that sheet -- including its two neighbours on the 8-way wheel, NW (row 3) and NE
# (row 5) -- begins at y=3 with a soft, rounded, antialiased crown. A flat opaque edge 7 px inside
# the cell is a crop, not a silhouette: the top of her head is simply absent from the asset.
#
# WHY IT ONLY SURFACED NOW. Nothing read row 4 until 2026-08-04, when DIR_ROW[3] was moved 3 -> 4
# to fix the owner's previous report ("the hero's north facing artwork is swapped with north west
# facing diagonal artwork"). That change is correct -- row 4 IS north -- and it is what exposed
# the damage. The act1-hifi surfaces (town.html, runtime.html) still map up -> row 3, so towns are
# unaffected and always were; only the tile runtime (overworld + every dungeon) shows it.
#
# WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT. It rebuilds the missing crown as a superellipse
# cap over the cut, coloured from the surviving top row of the SAME COLUMN. Column-constant colour
# is not laziness: this sheet draws hair as vertical strands, and it is also the only donor that
# cannot contaminate the crown -- an earlier attempt that mirrored the band below the cut dragged
# the gold pauldron trim up into her hair. The canonical source PNG is NOT rewritten: it is the
# owner's locked asset (docs/CANONICAL-ASSETS.md) and the repair belongs to the derived sheet,
# where it is reviewable, reversible and re-runnable. Nothing below the cut is touched, so the
# soles -- which dq-tiles.js measures at runtime for collision -- are bit-identical.
NORTH_CROWN_TOP = 4      # the row the rebuilt crown reaches; NW/NE crown at y=5, ponytail tip at 3
NORTH_CROWN_EXP = 2.0    # superellipse exponent: 2.0 is a true ellipse, higher is boxier
NORTH_CROWN_LIFT = 0.10  # the crown catches the light: +10% luminance at the very top
_SS = 4                  # supersamples per axis for the cap's antialiased edge


def repair_north_crown(cell: Image.Image) -> Image.Image:
    """Rebuild the clipped top of the head on one N-facing 64x64 cell. See the note above."""
    px = cell.load()
    W, H = cell.size
    for y_top in range(H):
        xs = [x for x in range(W) if px[x, y_top][3] > 8]
        if xs:
            break
    else:
        raise SystemExit("north cell is empty")
    x0, x1 = min(xs), max(xs)
    if y_top <= NORTH_CROWN_TOP:
        return cell                                    # already whole: nothing to rebuild
    # A silhouette's topmost row is a couple of soft pixels; a CROP is a long solid run. Only the
    # run's two end pixels are allowed to be soft, and it has to be at least 12 px wide.
    if (len(xs) != x1 - x0 + 1 or len(xs) < 12
            or any(px[x, y_top][3] < 250 for x in xs[1:-1])):
        raise SystemExit(
            f"north cell's top row (y={y_top}) is not the flat opaque cut this repairs -- "
            "the source art changed; re-inspect before trusting this"
        )
    cx = (x0 + x1) / 2.0
    rx = (x1 - x0) / 2.0 + 0.5
    ry = float(y_top - NORTH_CROWN_TOP)
    for y in range(NORTH_CROWN_TOP - 1, y_top):
        for x in range(max(0, x0 - 2), min(W, x1 + 3)):
            cov = 0
            for sy in range(_SS):
                for sx in range(_SS):
                    u = abs(x + (sx + 0.5) / _SS - cx) / rx
                    v = abs(y + (sy + 0.5) / _SS - y_top) / ry
                    if u ** NORTH_CROWN_EXP + v ** NORTH_CROWN_EXP <= 1.0:
                        cov += 1
            if not cov:
                continue
            alpha = int(round(255 * cov / (_SS * _SS)))
            if px[x, y][3] >= alpha:
                continue
            r, g, b, _ = px[min(max(x, x0), x1), y_top]
            gain = 1.0 + NORTH_CROWN_LIFT * ((y_top - y) / ry)
            px[x, y] = (
                min(255, round(r * gain)), min(255, round(g * gain)), min(255, round(b * gain)),
                alpha,
            )
    return cell


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
    sole = round(ref_bb[3] * FH / 48)      # the reference sheet is 48 px; carry its baseline up

    out = Image.new("RGBA", (FW * FRAMES, FH), (0, 0, 0, 0))
    for d in range(4):
        for pose in range(3):
            cell = g3.crop((pose * 64, DIR_ROW[d] * 64, pose * 64 + 64, DIR_ROW[d] * 64 + 64))
            if d == 3:
                cell = repair_north_crown(cell)
            small = cell if (FW, FH) == cell.size else cell.resize((FW, FH), Image.NEAREST)
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
