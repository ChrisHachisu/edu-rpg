#!/usr/bin/env python3
"""Turn the Codex-generated icon sheet into the alpha mask the tab bars use.

WHY A SCRIPT AND NOT "SAVE THE PNG"
    The generator was asked for a transparent canvas and returned an OPAQUE one with a
    transparency checkerboard PAINTED INTO IT -- the Photoshop chequer as literal pixels,
    `hasAlpha: no`. That is a well-known failure of image models on "transparent background",
    and it is silent: the file looks right in any viewer that shows a chequer for alpha.
    Shipping it as-is would have put a grey chequer behind every tab icon.

    So the alpha is recovered here instead. The strokes are pure white (255) and the chequer
    tops out at 194, which is a wide enough gap to key on directly; a soft ramp across
    215..245 keeps the antialiasing rather than producing a jagged 1-bit edge.

WHAT IT EMITS
    public/ui-icons/tab-icons.png -- a 512x128 sheet, four 128x128 cells, white RGB with the
    recovered alpha. It is a MASK: the tab bar paints it with `currentColor`, so the icons pick
    up the theme's gold and its muted inactive state without a second asset. Order matches
    TAB_ICON in ui-overhaul.js: status, items, equip, settings.

    python3 scripts/build_tab_icons.py --src <sheet.png>
"""
from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "ui-icons" / "tab-icons.png"

CELL = 128          # one cell of the emitted sheet
GLYPH = 116         # hard ceiling: nothing may exceed this in either dimension
OPTICAL = 92        # what the TYPICAL glyph's optical size is scaled to (see main())
LO, HI = 215.0, 245.0   # alpha ramp; below LO is chequer, above HI is stroke
OPEN = 7            # opening kernel: wider than any chequer speck, far under the ~23px stroke
NAMES = ("status", "items", "equip", "settings")


def stroke_width(mask: np.ndarray) -> float:
    """Estimate a line icon's stroke width from its own pixels.

    For a thin stroke, ink area is roughly length x width while the edge count is roughly
    2 x length, so width ~= 2 x area / edges. Crude, but it only has to RANK the four
    consistently, and it needs no scipy.
    """
    ink = mask > 0.5
    edge = ink & ~(
        np.roll(ink, 1, 0) & np.roll(ink, -1, 0) & np.roll(ink, 1, 1) & np.roll(ink, -1, 1))
    return 2.0 * ink.sum() / max(1, edge.sum())


def alpha_from(sheet: pathlib.Path) -> np.ndarray:
    """Recover alpha from the painted chequer, then open the result.

    The ramp alone is not enough. The generated chequer is not flat -- it carries compression
    noise and soft blotches -- so a scatter of its lighter squares clears 215 and survives as
    speckle. Measured: that speckle stretched every icon's bounding box to 857-868px of an
    887px canvas, i.e. essentially the whole sheet, which silently poisoned the size
    normalisation downstream. It is invisible at a glance because each speck is one or two
    pixels.

    A morphological OPENING fixes it by size rather than by brightness: erode then dilate with
    a kernel wider than any speck and far narrower than the ~23px strokes, so specks vanish and
    the strokes come back unchanged. The opened result is used as a SUPPORT mask, with the
    original soft alpha kept inside it, so the antialiasing survives.
    """
    lum = np.asarray(Image.open(sheet).convert("L"), dtype=np.float32)
    a = np.clip((lum - LO) / (HI - LO), 0.0, 1.0)
    a[a < 0.02] = 0.0

    solid = Image.fromarray((a > 0.5).astype(np.uint8) * 255)
    opened = solid.filter(ImageFilter.MinFilter(OPEN)).filter(ImageFilter.MaxFilter(OPEN))
    # Grow the support slightly so the stroke's soft edge is not clipped by the opening.
    support = np.asarray(opened.filter(ImageFilter.MaxFilter(3)), dtype=np.float32) / 255
    cleaned = a * support
    kept = (cleaned > 0.02).sum() / max(1, (a > 0.02).sum())
    print(f"  chequer speckle removed: kept {kept:.1%} of the ramped pixels")
    return cleaned


def columns(a: np.ndarray, want: int) -> list[tuple[int, int]]:
    """Split the sheet into `want` icon columns on the empty gutters between them."""
    ink = a.sum(axis=0)
    filled = ink > ink.max() * 0.004
    spans, start = [], None
    for x, on in enumerate(filled):
        if on and start is None:
            start = x
        elif not on and start is not None:
            spans.append((start, x))
            start = None
    if start is not None:
        spans.append((start, len(filled)))
    spans = [s for s in spans if s[1] - s[0] > a.shape[1] * 0.02]
    if len(spans) != want:
        sys.exit(f"expected {want} icon columns, found {len(spans)}: {spans}")
    return spans


def trim(cell: np.ndarray) -> np.ndarray:
    rows = np.where(cell.sum(axis=1) > 0)[0]
    cols = np.where(cell.sum(axis=0) > 0)[0]
    return cell[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]


def normalise(crop: np.ndarray, scale: float) -> Image.Image:
    """Scale by a factor shared with the whole set, then centre in a CELL square.

    One factor for the family, from the median optical size. Two earlier attempts were wrong:
    fitting each bounding box to the cell gave the tall thin sword a visibly lighter line than
    the square gear, and normalising each icon's stroke instead shrank everything to 48-70% of
    the cell because the constraint fought the size. Neither was necessary -- the generator
    already drew the four at one stroke weight (measured 23.1-24.3px, inside 5%) and at
    sensible relative sizes. A single scale preserves both by construction; the only decision
    left is how large the biggest one sits, which is GLYPH.
    """
    h, w = crop.shape
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    img = Image.fromarray((crop * 255).astype(np.uint8)).resize(
        (nw, nh), Image.LANCZOS)
    out = Image.new("L", (CELL, CELL), 0)
    out.paste(img, ((CELL - nw) // 2, (CELL - nh) // 2))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=pathlib.Path,
                    help="the generated 4-up icon sheet")
    args = ap.parse_args()
    if not args.src.is_file():
        sys.exit(f"missing source sheet: {args.src}")

    a = alpha_from(args.src)
    spans = columns(a, len(NAMES))
    crops = [trim(a[:, x0:x1]) for x0, x1 in spans]

    # Optical size, not the bounding box: sqrt(w*h) is much closer to how big a glyph LOOKS than
    # its longest side. Scaling on the longest side made the sword -- a tall sliver -- 46% taller
    # than the gear and the pouch, which is not how a tab bar should read.
    # One scale from the MEDIAN keeps the family's stroke identical; the ceiling then pulls in
    # only a genuine outlier, and only as far as it has to go.
    optical = [float(np.sqrt(c.shape[0] * c.shape[1])) for c in crops]
    base = OPTICAL / float(np.median(optical))

    sheet = Image.new("RGBA", (CELL * len(NAMES), CELL), (255, 255, 255, 0))
    for i, (x0, x1) in enumerate(spans):
        scale = min(base, GLYPH / max(crops[i].shape))
        if scale < base:
            print(f"  {NAMES[i]:9s} clamped to the {GLYPH}px ceiling "
                  f"({scale / base:.0%} of the family scale)")
        mask = normalise(crops[i], scale)
        cell = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 0))
        cell.putalpha(mask)
        white = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 255))
        white.putalpha(mask)
        sheet.paste(white, (i * CELL, 0))
        out = np.asarray(mask, dtype=np.float32) / 255
        rows = np.where(out.sum(1) > 0)[0]; cols = np.where(out.sum(0) > 0)[0]
        box = max(rows[-1] - rows[0], cols[-1] - cols[0]) + 1
        print(f"  {NAMES[i]:9s} cell {i}  src stroke {stroke_width(crops[i]):5.1f}px"
              f"  -> stroke {stroke_width(out):4.2f}  box {box:3d}/{CELL}"
              f"  ({box * 22 / CELL:4.1f}px at 22)")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, optimize=True)
    print(f"WROTE {OUT.relative_to(ROOT)}  {OUT.stat().st_size:,} B  "
          f"({CELL * len(NAMES)}x{CELL})")
    print("NEXT: copy public/ui-icons/ -> dist/ui-icons/, register it, regenerate_pins.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
