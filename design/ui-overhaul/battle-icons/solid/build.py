#!/usr/bin/env python3
"""Key a solid-candidate sheet to a tintable alpha mask, and measure it. MOCKUP ROUND ONLY.

This writes into design/ and never into public/. It is the comparison round's builder, not a
replacement for scripts/build_battle_icons.py -- which it IMPORTS rather than copies, so the
candidates go through the identical splitting, family-scale normalisation and stroke measurement
that produced the shipped sheet. A candidate that beat the control because it was measured
differently would prove nothing.

THE ONE THING THAT HAD TO BE ADDED: A SECOND KEY
    The shipped builder keys on a luminance ramp because its source was white on near-black. This
    round's brief said the same thing, and Codex answered it two different ways: candidate C came
    back on flat near-black as asked, and candidates A and B came back on a GREEN SCREEN.

    Neither is the chequerboard the brief exists to prevent, so both are usable -- but a luminance
    ramp cannot key green. Pure green sits at luminance ~150, right in the middle of the shipped
    40..190 ramp, so the shipped keyer would have rendered the entire background at about 73%
    opacity: a solid slab with faint icons in it. It would not have looked like a keying bug, it
    would have looked like the art was bad.

    So the background is DETECTED and keyed accordingly. Green screens key on greenness
    (G - max(R,B)), which is exact for both pure green and pure white and gives a linear ramp
    across the antialiased edge; dark backgrounds fall through to the shipped luminance path,
    unchanged and imported.

WHAT IT EMITS, per candidate
    <candidate>-mask.png     512x128, four cells, white RGB + recovered alpha. Same geometry and
                             the same family scale as public/ui-icons/battle-icons.png, so the
                             mockup can swap one for the other with no other change.
    measured in stdout       source stroke / optical size per glyph -- the number the shipped set
                             was ranked on, against the tab family's measured 5.91-6.67% band.
"""
from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
import build_battle_icons as bbi   # noqa: E402  the shipped pipeline, imported not duplicated

OPEN = bbi.OPEN
NAMES = bbi.NAMES


def key_alpha(path: pathlib.Path) -> np.ndarray:
    """Recover alpha, choosing the keyer from what the background actually is.

    Detection samples the four corners rather than one, so a stray mark in a corner cannot decide
    it. `greenness` is positive only where green genuinely dominates both other channels, which is
    true of the background and false of every white pixel including the antialiased ones, so the
    same expression keys the edge softly instead of cutting it 1-bit.
    """
    img = Image.open(path).convert("RGB")
    rgb = np.asarray(img, dtype=np.float32)
    h, w, _ = rgb.shape
    corners = np.stack([rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]])
    g_dom = float(np.median(corners[:, 1] - corners[:, [0, 2]].max(axis=1)))

    if g_dom > 60:
        greenness = rgb[:, :, 1] - rgb[:, :, [0, 2]].max(axis=2)
        a = np.clip(1.0 - greenness / g_dom, 0.0, 1.0)
        print(f"  green screen detected (corner greenness {g_dom:.0f}); keyed on chroma")
    else:
        lum = np.asarray(img.convert("L"), dtype=np.float32)
        a = np.clip((lum - bbi.LO) / (bbi.HI - bbi.LO), 0.0, 1.0)
        print(f"  dark background; keyed on the shipped luminance ramp "
              f"{bbi.LO:.0f}..{bbi.HI:.0f}")
    a[a < 0.02] = 0.0

    # Speckle opening, identical in intent to the shipped build: it removes by SIZE, and it is
    # used only as a SUPPORT mask so the soft edge survives. It guards the step that has actually
    # broken before -- stray lit pixels stretch every measured bounding box and silently wreck the
    # size normalisation, which is invisible until the icons are the wrong size on a phone.
    solid = Image.fromarray((a > 0.5).astype(np.uint8) * 255)
    opened = solid.filter(ImageFilter.MinFilter(OPEN)).filter(ImageFilter.MaxFilter(OPEN))
    support = np.asarray(opened.filter(ImageFilter.MaxFilter(3)), dtype=np.float32) / 255
    cleaned = a * support
    kept = (cleaned > 0.02).sum() / max(1, (a > 0.02).sum())
    print(f"  speckle removed: kept {kept:.1%} of the ramped pixels")
    return cleaned


def build(src: pathlib.Path, out: pathlib.Path, label: str) -> list[float]:
    print(f"\n== {label}  <- {src.name}")
    a = key_alpha(src)
    spans = bbi.columns(a, len(NAMES))
    crops = [bbi.trim(a[:, x0:x1]) for x0, x1 in spans]

    optical = [float(np.sqrt(c.shape[0] * c.shape[1])) for c in crops]
    base = bbi.OPTICAL / float(np.median(optical))

    sheet = Image.new("RGBA", (bbi.CELL * len(NAMES), bbi.CELL), (255, 255, 255, 0))
    ratios: list[float] = []
    for i, crop in enumerate(crops):
        scale = min(base, bbi.GLYPH / max(crop.shape))
        if scale < base:
            print(f"  {NAMES[i]:7s} clamped to the {bbi.GLYPH}px ceiling "
                  f"({scale / base:.0%} of the family scale)")
        mask = bbi.normalise(crop, scale)
        white = Image.new("RGBA", (bbi.CELL, bbi.CELL), (255, 255, 255, 255))
        white.putalpha(mask)
        sheet.paste(white, (i * bbi.CELL, 0))

        m = np.asarray(mask, dtype=np.float32) / 255
        rows, cols = np.where(m.sum(1) > 0)[0], np.where(m.sum(0) > 0)[0]
        box = max(rows[-1] - rows[0], cols[-1] - cols[0]) + 1
        sw, opt = bbi.stroke_width(crop), optical[i]
        ratio = 100 * sw / opt
        ratios.append(ratio)
        # ink share is what separates a fill from a heavy line: a filled silhouette covers most of
        # its own bounding box, an outline covers a fraction of it however fat the pen gets.
        ink = float((m > 0.5).sum()) / max(1, (box * box))
        print(f"  {NAMES[i]:7s} src stroke {sw:6.1f}px  {ratio:5.2f}% of optical"
              f"  -> out stroke {bbi.stroke_width(m):5.2f}  box {box:3d}/{bbi.CELL}"
              f"  ({box * 21 / bbi.CELL:4.1f}px at 21)  ink {ink:4.0%} of box")

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, optimize=True)
    print(f"  WROTE {out.relative_to(ROOT)}  {out.stat().st_size:,} B")
    print(f"  stroke/optical range: {min(ratios):.2f}% - {max(ratios):.2f}%"
          f"   (tab anchor band 5.91% - 6.67%)")
    return ratios


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=pathlib.Path, action="append", default=[],
                    help="a candidate source png; repeatable. Default: all source-*.png here")
    args = ap.parse_args()
    srcs = args.src or sorted(HERE.glob("source-*.png"))
    if not srcs:
        sys.exit("no candidate sources found")
    for s in srcs:
        label = s.stem.replace("source-", "")
        build(s, HERE / f"{label}-mask.png", label)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
