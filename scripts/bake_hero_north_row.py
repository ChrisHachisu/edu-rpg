#!/usr/bin/env python3
"""Replace the heroine's damaged NORTH row (row 4) in the canonical g3 sheet.

WHY
    `public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png` is 192x512 = 3 pose columns
    by 8 direction rows of 64. The wheel starts at SOUTH in 45 deg steps:
    0=S 1=SW 2=W 3=NW 4=N 5=NE 6=E 7=SE.

    Row 4 (N) was drawn ~15% larger than every other direction, so the head never fitted the
    64 px cell and its top ~12 rows are simply absent -- the crown is sheared flat. The same
    damage exists in g2 and g1, git carries a single commit for the file, and no intact copy
    exists anywhere. The row could not be repaired; it had to be redrawn.

    EIGHT attempts were made and reverted before this one. Five of them were hand-patches --
    a superellipse dome cap, grafting the NE head onto the N body (which produced a second
    ponytail), procedural rebuilds from her own hair rows -- and the owner identified every
    one on sight. Owner, 2026-08-06: the fix has to be GENERATED pixels, and the answer was
    the obvious one he named himself: "isn't it as simple as providing codex the other facing
    assets as references and telling it to generate a north facing walking animation?"

    The two findings that finally made it work, both hard-won:
      * The head was NEVER too big. Candidate craniums measured 19-20 px against NW/NE's
        19-22. The real defect was that the FIGURE was 30-45% too NARROW, and a correct head
        on a narrow body reads head-heavy. Five attempts adjusted the head and could not work.
      * The prompt SHAPE decides the result. A silhouette template locks the scale but
        flattens the shading; simply asking for "the missing eighth direction, three poses"
        with her other facings attached beats it.

PROVENANCE -- this is the point of this script existing
    design/hero-north-generation/raw-S1k3-generated.png is the RAW, UNMODIFIED output of
    Codex's image-generation tool (gpt-5.6-terra), byte-identical to
    ~/.codex/generated_images/019fd41f-6b2d-7610-9ac1-bfcae3f11a3d/exec-fae487a4-e884-419a-86be-d21b3e856c33.png
    (md5 9c3deb2c8f189e0d47e2b57dc421d566). The check matters: Codex has been caught in this
    project generating an image and then overwriting it with 40+ ImageMagick `-draw` calls, so
    every delivered render is diffed against its own raw file before it is believed.

    design/hero-north-generation/prompt-S1k.txt is the prompt, and ref_*.png the four
    attachments it refers to. Nothing below draws, retouches or composites a single pixel:
    the render is chroma-keyed, split into its three figures, resampled to the 64 px cell by
    coverage-weighted MODE (mode, not mean, so edges stay hard), and snapped to the sheet's
    own palette. Every step is a measurement or a resample.

WHY IT ASSERTS THE PRE-BAKE HASH
    The palette snap reads the sheet it is about to write. Run it twice and the second run
    would snap against a sheet that already contains the new row, so it is NOT idempotent by
    construction. This is a one-shot repair, so it declares that plainly: it refuses to run
    against anything but the exact damaged sheet, and re-running after the bake is an error
    rather than a silent second answer.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png"
RENDER = ROOT / "design/hero-north-generation/raw-S1k3-generated.png"

# The damaged sheet, exactly as it stood before this bake. See the docstring.
SHEET_BEFORE = "01ca51fe722899cfcf3ada03aab0878399e82f8e6c2a7a1a82f47f4d88d53329"
# The raw generated render, as delivered by Codex.
RENDER_SHA = "bb3495d72dbb59f3bae29d011cd981d1314a2f950b7f4321bacdf45467b6a619"

NORTH_ROW = 4
CELL = 64
# Every other row on the sheet stands its figure with the soles on y=58 (inclusive), i.e. a
# bbox bottom of 59. The crown sits at y=3 for the wide diagonals and y=5..7 for the narrow
# axis-aligned views; the render's three figures are measured against those, in order.
SOLE_TARGET = 58
TOP_TARGETS = (5, 3, 3)

# snap() weights the alpha channel hardest: a colour that is right but an opacity that is
# wrong shows up as a halo, which is far more visible at 64 px than a shade of chestnut.
SNAP_WEIGHTS = np.array([0.9, 1.2, 0.7, 2.5])
SUBSAMPLES = 12          # 12x12 samples per destination pixel
COVERAGE_FLOOR = 0.30    # below this a destination pixel is background, not a soft edge


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def chroma_key(path: Path) -> np.ndarray:
    """Magenta #ff00ff is the prompt's background. Key it to alpha 0."""
    g = np.array(Image.open(path).convert("RGB")).astype(np.float64)
    r, gg, b = g[:, :, 0], g[:, :, 1], g[:, :, 2]
    mask = (r - gg > 55) & (b - gg > 55)
    rgba = np.dstack([g, np.where(mask, 0.0, 255.0)])
    rgba[mask] = 0
    return rgba


def figures(rgba: np.ndarray, gap: int = 12) -> list[tuple[int, int]]:
    """Split the render into its three side-by-side poses on column occupancy.

    Her cape is the widest thing in the sprite and in some renders the capes of neighbouring
    poses touch, merging two or three figures into one run. When that happens the widest run
    is split at the deepest minimum of its own occupancy profile, which lands in the gap
    between two capes rather than through a figure.
    """
    opaque = rgba[:, :, 3] > 128
    occ = opaque.sum(0)
    runs: list[tuple[int, int]] = []
    start = None
    blank = 0
    for i, filled in enumerate(occ > 0):
        if filled:
            if start is None:
                start = i
            blank = 0
        elif start is not None:
            blank += 1
            if blank > gap:
                runs.append((start, i - blank))
                start = None
    if start is not None:
        runs.append((start, len(occ) - 1))
    runs = [r for r in runs if r[1] - r[0] > 40]

    while len(runs) < 3:
        i = max(range(len(runs)), key=lambda k: runs[k][1] - runs[k][0])
        a, b = runs[i]
        width = b - a
        others = [r[1] - r[0] + 1 for j, r in enumerate(runs) if j != i]
        typical = min(others) if others else width / (3 - len(runs) + 1)
        if width < 1.5 * typical:
            break
        seg = occ[a:b + 1].astype(float)
        m0, m1 = int(width * 0.28), int(width * 0.72)
        cut = a + m0 + int(np.argmin(seg[m0:m1]))
        if cut <= a + 20 or cut >= b - 20:
            break
        runs = runs[:i] + [(a, cut - 1), (cut + 1, b)] + runs[i + 1:]
        runs.sort()
    if len(runs) != 3:
        raise SystemExit(f"expected 3 figures in the render, found {len(runs)}")
    return runs


def resample(src: np.ndarray, scale: float, dx: float, dy: float) -> np.ndarray:
    """Coverage-weighted MODE down to one 64x64 cell.

    The generator emits ~1254x1254 on its own block grid regardless of the size asked for, so
    the reduction is large. Averaging it would soften every edge into a gradient and the sheet
    is hand-pixelled art with hard edges, so each destination pixel takes the MODE of the
    source colours under it and an alpha equal to its opaque coverage.
    """
    h, w, _ = src.shape
    offs = (np.arange(SUBSAMPLES) + 0.5) / SUBSAMPLES - 0.5
    out = np.zeros((CELL, CELL, 4))
    for ty in range(CELL):
        sys_ = [((ty + 0.5 + oy) - dy) / scale for oy in offs]
        for tx in range(CELL):
            sxs = [((tx + 0.5 + ox) - dx) / scale for ox in offs]
            counts: dict[tuple[int, int, int], int] = {}
            opaque = 0
            for sy in sys_:
                if sy < 0 or sy >= h:
                    continue
                row = src[int(sy)]
                for sx in sxs:
                    if sx < 0 or sx >= w:
                        continue
                    px = row[int(sx)]
                    if px[3] > 128:
                        opaque += 1
                        k = (int(px[0]), int(px[1]), int(px[2]))
                        counts[k] = counts.get(k, 0) + 1
            if not counts:
                continue
            cov = opaque / float(SUBSAMPLES * SUBSAMPLES)
            if cov < COVERAGE_FLOOR:
                continue
            r, g, b = max(counts.items(), key=lambda kv: kv[1])[0]
            out[ty, tx] = [r, g, b, min(255.0, round(cov * 255))]
    return out


def snap(cell: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """Nearest colour in the sheet's own palette, so the row introduces no new colours."""
    flat = cell.reshape(-1, 4)
    out = np.zeros_like(flat)
    for i in range(flat.shape[0]):
        if flat[i, 3] < 1:
            out[i] = [0, 0, 0, 0]
            continue
        d = (palette - flat[i]) * SNAP_WEIGHTS
        out[i] = palette[(d * d).sum(1).argmin()]
    return out.reshape(CELL, CELL, 4).astype(np.uint8)


def fit(sub: np.ndarray, top_target: int, palette: np.ndarray) -> np.ndarray:
    """Scale the figure so crown->sole spans the row's band, and centre it in the cell."""
    opaque = sub[:, :, 3] > 128
    rows = np.where(opaque.any(1))[0]
    cols = np.where(opaque.any(0))[0]
    top, bottom = rows.min(), rows.max()
    scale = (SOLE_TARGET - top_target + 1) / float(bottom - top + 1)
    dy = top_target - top * scale
    cx = (cols.min() + cols.max() + 1) / 2.0
    return snap(resample(sub, scale, CELL / 2.0 - cx * scale, dy), palette)


def main() -> int:
    if not RENDER.is_file():
        raise SystemExit(f"missing raw render: {RENDER.relative_to(ROOT)}")
    got = sha256(RENDER)
    if got != RENDER_SHA:
        raise SystemExit(
            f"raw render is not the generated file this bake was verified against\n"
            f"  expected {RENDER_SHA}\n  got      {got}")

    before = sha256(SHEET)
    if before != SHEET_BEFORE:
        raise SystemExit(
            "the g3 sheet is not the damaged sheet this one-shot repair was written for.\n"
            f"  expected {SHEET_BEFORE}\n  got      {before}\n"
            "If the north row has already been baked, this script has done its job and must\n"
            "not be run again -- the palette snap would read its own output. See the docstring.")

    sheet = Image.open(SHEET).convert("RGBA")
    if sheet.size != (192, 512):
        raise SystemExit(f"g3 sheet is {sheet.size}, expected (192, 512)")
    arr = np.array(sheet)
    palette = np.unique(arr.reshape(-1, 4), axis=0).astype(np.float64)
    palette = palette[palette[:, 3] > 0]

    rgba = chroma_key(RENDER)
    runs = figures(rgba)
    print(f"raw render {rgba.shape[1]}x{rgba.shape[0]}, three figures at "
          + ", ".join(f"x={a}..{b}" for a, b in runs))

    for pose, (c0, c1) in enumerate(runs):
        sub = rgba[:, max(0, c0 - 4):c1 + 5]
        cell = fit(sub, TOP_TARGETS[pose], palette)
        bb = Image.fromarray(cell).getbbox()
        arr[NORTH_ROW * CELL:(NORTH_ROW + 1) * CELL, pose * CELL:(pose + 1) * CELL] = cell
        print(f"  pose {pose}: bbox x{bb[0]}..{bb[2]} y{bb[1]}..{bb[3]} "
              f"({bb[2]-bb[0]}x{bb[3]-bb[1]}), {(cell[:, :, 3] > 0).sum()} opaque px")

    Image.fromarray(arr).save(SHEET)
    print(f"\nNORTH ROW BAKED into {SHEET.relative_to(ROOT)}")
    print(f"  sha256 {sha256(SHEET)}")
    print("  now re-run scripts/build_hero_g3_walk.py and re-pin the runtime baseline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
