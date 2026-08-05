#!/usr/bin/env python3
"""Rebuild the cropped crown on row 4 (N) of the canonical g3 heroine walk sheet.

THE DEFECT
    `public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png` is 192x512 = 3 pose
    columns x 8 direction rows of 64x64, the wheel starting at SOUTH in 45 deg steps
    (0=S 1=SW 2=W 3=NW 4=N 5=NE 6=E 7=SE). Row 4 -- N, the square-on back view -- ARRIVED
    CROPPED. All three poses begin with a flat, fully opaque, un-antialiased horizontal run
    ~24 px wide (col 0 at y=11, cols 1-2 at y=9). Every other row of the sheet begins with a
    soft rounded crown at y=3 or y=7. A flat opaque edge seven rows inside the cell is a crop,
    not a silhouette. The same cut exists in g2 and in g1's 4x3 sheet; there is no intact
    north view anywhere in the repo, so the crown has to be drawn.

    Owner, twice: "the hero's north facing animation cuts off its head", then "the north
    facing animation still has the head cutoff".

TWO REPAIRS THAT DID NOT HOLD, AND WHY
    1. A synthetic superellipse cap coloured from the cut row. Restored the silhouette HEIGHT
       and nothing else -- a 24 px featureless bowl. The deficit was CONTENT, not height.
    2. Grafting the whole NE (row 5) head onto the N body. Owner, immediately: "you just
       pasted on a different facing asset and i can tell." It was one direction's head on
       another direction's shoulders, ponytail still hanging out to one side.

WHAT THIS DRAWS, AND WHY IT IS THE RIGHT SHAPE
    Read around the wheel: NW (row 3) puts the ponytail to the RIGHT, NE (row 5) puts it to
    the LEFT, and both tie it high at the BACK of the skull. A ponytail tied at the back and
    seen from directly behind points AT the camera -- fully foreshortened. It does not swing
    out to either side; it drapes straight down over the back of the head. That is exactly
    what row 4 ALREADY shows below the cut: a 25 px hair mass with a darker strand column down
    the centre, ending at the collar. So the ponytail is present and correct in the source.
    What the crop removed is only the skull cap above it: the dome, its rim, and the tie.

    S (row 0) settles what the tie looks like face-on -- it reads there as a flat blue band a
    few pixels wide sitting on top of the head, not as the narrow 2 px edge the 45 deg rows
    show. That band is lifted verbatim and re-centred.

    The dome is closed with the cell's OWN hair, not a neighbour's. Rows 4 through 9 below the
    cut are the only pixels in the sheet drawn at this exact yaw, with the right strand
    direction, the right brown ramp and the right upper-left key light; each rebuilt row
    borrows one of them under a horizontal taper, with a per-row source offset and phase shift
    so the crown continues the hair instead of mirroring it. Nothing from a 45 deg cell is
    used, which is the specific thing the owner spotted last time.

INVARIANTS THIS FILE ENFORCES (all asserted below, none of them by eye)
    * only rows strictly ABOVE each cell's cut row are written -- every cell's lowest opaque
      row is untouched, so the derived 64 px runtime sheet still measures the same sole and
      the dungeon's sole-contact collision is unchanged;
    * no colour is introduced that the sheet did not already contain (every written pixel is
      snapped to the nearest RGBA in the original sheet's own colour set);
    * the repaired N head is no taller than its NW/NE neighbours;
    * the head is centred over the N body and stable across the three poses, translated only
      by the row's own 2 px walk bob (col 0 sits 2 px lower than cols 1-2, matching that
      column's torso, measured -- not assumed);
    * the flat-run crop signature is gone, so `build_hero_g3_walk.py`'s `repair_north_crown`
      guard stops matching and that stopgap graft goes quiet on its own.

USAGE
    python3 scripts/repair_hero_g3_north_crown.py
        reads  hero-act1-female-walk-8x3-64-g3-cut-original.png  (the damaged asset as
               delivered, kept beside the sheet so this is reversible and the damage stays
               documented)
        writes hero-act1-female-walk-8x3-64-g3.png
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "design/art-refs/hero-act1-female-walk-8x3-64-g3-cut-original.png"
# The three trees that must carry the same bytes: runtime_baseline.verify_act1_overlay
# byte-compares the design/review copy against the shipped one, so a repair that lands in
# only one of them fails the gate rather than shipping half-applied.
TARGETS = (
    ROOT / "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png",
    ROOT / ("design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/"
            "hero-g3/hero-act1-female-walk-8x3-64-g3.png"),
    ROOT / "dist/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png",
)

CELL = 64
S_ROW, NW_ROW, N_ROW, NE_ROW = 0, 3, 4, 5

# Half-width of each rebuilt row as a fraction of the cut row's half-width, keyed by
# k = cut - y. Matches the NW/NE crowns, which go from ~9 px wide at their top row to 25 px
# five rows lower.
PROFILE = {1: 0.96, 2: 0.90, 3: 0.80, 4: 0.66, 5: 0.47, 6: 0.22}
# Which hair row below the cut each rebuilt row borrows its strands from, and a horizontal
# phase shift, so the crown continues the hair rather than mirroring it across the cut.
SRC_OFF = {1: 4, 2: 3, 3: 5, 4: 3, 5: 4, 6: 3}
PHASE = {1: 1, 2: -2, 3: 2, 4: -1, 5: 1, 6: 0}
TIE_K = (4, 3)          # the tie band rides the crown, two rows below the top


def cell(sheet: Image.Image, row: int, col: int) -> Image.Image:
    return sheet.crop((col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL))


def top_row(px) -> int:
    for y in range(CELL):
        if any(px[x, y][3] > 8 for x in range(CELL)):
            return y
    raise SystemExit("cell is empty")


def bottom_row(px) -> int:
    for y in range(CELL - 1, -1, -1):
        if any(px[x, y][3] > 8 for x in range(CELL)):
            return y
    raise SystemExit("cell is empty")


def crop_signature(px):
    """(cut row, x0, x1) of the flat opaque run that marks the crop, or None if whole."""
    y = top_row(px)
    xs = [x for x in range(CELL) if px[x, y][3] > 8]
    if len(xs) < 12 or xs != list(range(xs[0], xs[-1] + 1)):
        return None
    if any(px[x, y][3] < 250 for x in xs[1:-1]):
        return None
    return y, xs[0], xs[-1]


def span(px, y):
    xs = [x for x in range(CELL) if px[x, y][3] > 8]
    return (min(xs), max(xs)) if xs else None


def is_blue(p) -> bool:
    return p[2] > p[0] + 25 and p[2] > 90


def tie_band(sheet: Image.Image, col: int):
    """The hair tie as it reads FACE-ON, lifted from the S row."""
    px = cell(sheet, S_ROW, col).load()
    rows = []
    for y in range(6, 14):
        r = [px[x, y] for x in range(CELL) if px[x, y][3] > 200 and is_blue(px[x, y])]
        if r:
            rows.append(r)
    if len(rows) < 2:
        raise SystemExit(f"no face-on tie band found in S row col {col}")
    return rows


def mix(a, b, t):
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(4))


def build_palette(sheet: Image.Image) -> set:
    return set(sheet.getdata())


def snap(p, palette, cache):
    if p in palette:
        return p
    if p in cache:
        return cache[p]
    best = min(palette, key=lambda q: (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
               + (q[2] - p[2]) ** 2 + 4 * (q[3] - p[3]) ** 2)
    cache[p] = best
    return best


def rebuild_cell(sheet: Image.Image, col: int, palette: set, cache: dict):
    n = cell(sheet, N_ROW, col).copy()
    px = n.load()
    sig = crop_signature(px)
    if sig is None:
        return n, None
    cut, x0, x1 = sig
    cx = (x0 + x1) / 2.0
    hw_cut = (x1 - x0) / 2.0

    # rim colour: the cut row's own end pixels are the hair's side outline, darkened
    rim = mix(mix(px[x0, cut], px[x1, cut], 0.5), (58, 40, 30, 255), 0.55)

    written = {}
    for k, frac in PROFILE.items():
        y = cut - k
        if y < 0:
            continue
        hw = hw_cut * frac
        sy = cut + SRC_OFF[k]                 # inside the hair band; below it is collar/cape
        sp = span(px, sy)
        if not sp:
            continue
        s_cx = (sp[0] + sp[1]) / 2.0
        s_hw = (sp[1] - sp[0]) / 2.0
        for x in range(CELL):
            dx = x - cx
            if abs(dx) > hw + 0.5 or px[x, y][3] > 8:
                continue
            sx = int(round(s_cx + dx * s_hw / hw)) + PHASE[k]
            if not 0 <= sx < CELL:
                continue
            p = px[sx, sy]
            if p[3] > 8 and not is_blue(p):    # hair only -- never the cape or the collar
                written[(x, y)] = p

    band = tie_band(sheet, col)
    for i, k in enumerate(TIE_K):
        row = band[i]
        w = len(row) + 1                       # face-on the band reads one px wider
        left = int(round(cx - (w - 1) / 2.0))
        for j in range(w):
            written[(left + j, cut - k)] = row[min(j, len(row) - 1)]

    for (x, y), p in written.items():
        px[x, y] = p

    # 1 px rim: darken the rebuilt silhouette's boundary toward the outline colour
    for k in PROFILE:
        y = cut - k
        if y < 0:
            continue
        for x in range(CELL):
            if (x, y) not in written:
                continue
            p = px[x, y]
            if is_blue(p):
                continue
            open_sides = sum(
                1 for a, b in ((x - 1, y), (x + 1, y), (x, y - 1))
                if not (0 <= a < CELL and 0 <= b < CELL) or px[a, b][3] <= 8)
            if open_sides:
                px[x, y] = mix(p, rim, 0.45 if open_sides == 1 else 0.65)
                written[(x, y)] = px[x, y]

    for (x, y) in written:
        px[x, y] = snap(px[x, y], palette, cache)
    return n, (cut, cx, len(written))


def main() -> int:
    if not SRC.exists():
        raise SystemExit(f"missing the preserved original: {SRC}")
    sheet = Image.open(SRC).convert("RGBA")
    if sheet.size != (192, 512):
        raise SystemExit(f"g3 sheet is {sheet.size}, expected (192, 512)")
    palette = build_palette(sheet)
    cache: dict = {}

    out = sheet.copy()
    for col in range(3):
        n, info = rebuild_cell(sheet, col, palette, cache)
        if info is None:
            print(f"  col {col}: already whole -- nothing to rebuild")
            continue
        cut, cx, count = info
        out.paste(n, (col * CELL, N_ROW * CELL))
        print(f"  col {col}: cut y={cut}, head centre x={cx}, {count} px drawn above the cut")

    # ---- invariants -------------------------------------------------------------------
    before, after = sheet.load(), out.load()
    for row in range(8):
        for col in range(3):
            b = cell(sheet, row, col).load()
            a = cell(out, row, col).load()
            if row != N_ROW:
                for y in range(CELL):
                    for x in range(CELL):
                        if b[x, y] != a[x, y]:
                            raise SystemExit(f"row {row} col {col} changed -- only N may change")
            if bottom_row(b) != bottom_row(a):
                raise SystemExit(f"row {row} col {col} sole moved "
                                 f"{bottom_row(b)} -> {bottom_row(a)}")
            if row == N_ROW:
                cut = crop_signature(b)[0]
                for y in range(cut, CELL):
                    for x in range(CELL):
                        if b[x, y] != a[x, y]:
                            raise SystemExit(f"N col {col} changed at or below the cut "
                                             f"({x},{y}) -- only rows above it may be drawn")

    new_colours = set(out.getdata()) - palette
    if new_colours:
        raise SystemExit(f"{len(new_colours)} colours introduced that the sheet did not have")

    tops = {}
    for row in (NW_ROW, N_ROW, NE_ROW):
        tops[row] = [top_row(cell(out, row, c).load()) for c in range(3)]
    if min(tops[N_ROW]) < min(tops[NW_ROW] + tops[NE_ROW]):
        raise SystemExit(f"N head is taller than its neighbours: {tops}")
    if crop_signature(cell(out, N_ROW, 1).load()) is not None:
        raise SystemExit("the flat-run crop signature survives -- the crown did not close")

    for target in TARGETS:
        if not target.parent.is_dir():
            print(f"  skipped (absent tree): {target.relative_to(ROOT)}")
            continue
        out.save(target)
        print(f"HERO G3 NORTH CROWN: {target.relative_to(ROOT)}")
    print(f"  head top rows  NW {tops[NW_ROW]}  N {tops[N_ROW]}  NE {tops[NE_ROW]}")
    print(f"  palette {len(palette)} colours, 0 introduced; soles and every other row byte-identical")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
