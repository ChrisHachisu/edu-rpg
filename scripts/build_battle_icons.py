#!/usr/bin/env python3
"""Turn the Codex-generated battle-command sheet into the alpha mask the battle bar uses.

WHY A SCRIPT AND NOT "SAVE THE PNG"
    Same reason as scripts/build_tab_icons.py, which this deliberately mirrors: the generator
    cannot emit a transparent canvas. Asked for one, it returns an OPAQUE canvas -- `hasAlpha:
    no` -- and the tab-icon run filled the background with the transparency CHEQUERBOARD painted
    in as literal pixels, which is silent because every viewer draws a chequer for real alpha
    too. That would have shipped a grey chequer behind every icon.

    This brief therefore told the generator that if it could not do real transparency it should
    fall back to a FLAT solid dark background and explicitly not paint a chequer. It complied:
    the source here is white strokes on near-black. That is a much cleaner key than the chequer
    was, so the ramp sits low (see LO/HI) instead of at the chequer's 215..245.

    The keying is still done here rather than by hand, and the speckle opening is still applied,
    so that the shipped sheet is reproducible from the archived raw output by one command.

WHAT IT EMITS
    public/ui-icons/battle-icons.png -- a 512x128 sheet, four 128x128 cells, white RGB with the
    recovered alpha. It is a MASK: the button paints it with `currentColor`, so a command's
    colour lives entirely in the tint and no second asset is needed per colour. Order matches
    BATTLE_ACT in ui-overhaul.js: attack, defend, item, flee.

    python3 scripts/build_battle_icons.py --src <sheet.png>
"""
from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "ui-icons" / "battle-icons.png"
CONTACT = ROOT / "design" / "ui-overhaul" / "battle-icons" / "contact-sheet.png"

CELL = 128          # one cell of the emitted sheet
GLYPH = 116         # hard ceiling: nothing may exceed this in either dimension
OPTICAL = 92        # what the TYPICAL glyph's optical size is scaled to -- same as the tab
                    # family, which is what makes the two sets sit at one size on screen
LO, HI = 40.0, 190.0    # alpha ramp; below LO is background, above HI is stroke
OPEN = 5            # opening kernel: wider than any speck, far under the ~20px strokes
NAMES = ("attack", "defend", "item", "flee")


def stroke_width(mask: np.ndarray) -> float:
    """Estimate a line icon's stroke width from its own pixels.

    For a thin stroke, ink area is roughly length x width while the edge count is roughly
    2 x length, so width ~= 2 x area / edges. Crude, but it only has to RANK consistently.
    """
    ink = mask > 0.5
    edge = ink & ~(
        np.roll(ink, 1, 0) & np.roll(ink, -1, 0) & np.roll(ink, 1, 1) & np.roll(ink, -1, 1))
    return 2.0 * ink.sum() / max(1, edge.sum())


def alpha_from(sheet: pathlib.Path) -> np.ndarray:
    """Recover alpha from the flat dark background, then open the result.

    A real alpha channel is used as-is if the generator ever provides one. Otherwise the
    luminance ramp does the keying: the background sits under 32 and the strokes over 224, so
    40..190 clears both by a wide margin while keeping the antialiased edge as a soft ramp
    rather than a jagged 1-bit cut.

    The opening is inherited from the tab-icon build and kept even though this source is far
    cleaner than the chequer was. It costs nothing and it guards the step that actually broke
    last time: stray lit pixels anywhere on the canvas stretch each glyph's measured bounding
    box, which silently poisons the size normalisation below. It removes by SIZE rather than by
    brightness -- erode then dilate with a kernel wider than any speck and much narrower than
    the strokes -- and is used only as a SUPPORT mask, so the soft edge survives intact.
    """
    img = Image.open(sheet)
    if img.mode in ("RGBA", "LA") and np.asarray(img.convert("RGBA"))[:, :, 3].min() < 255:
        a = np.asarray(img.convert("RGBA"), dtype=np.float32)[:, :, 3] / 255.0
        print("  source carries a real alpha channel; using it")
    else:
        lum = np.asarray(img.convert("L"), dtype=np.float32)
        a = np.clip((lum - LO) / (HI - LO), 0.0, 1.0)
        print(f"  source is opaque; keyed on luminance ramp {LO:.0f}..{HI:.0f}")
    a[a < 0.02] = 0.0

    solid = Image.fromarray((a > 0.5).astype(np.uint8) * 255)
    opened = solid.filter(ImageFilter.MinFilter(OPEN)).filter(ImageFilter.MaxFilter(OPEN))
    # Grow the support slightly so the stroke's soft edge is not clipped by the opening.
    support = np.asarray(opened.filter(ImageFilter.MaxFilter(3)), dtype=np.float32) / 255
    cleaned = a * support
    kept = (cleaned > 0.02).sum() / max(1, (a > 0.02).sum())
    print(f"  speckle removed: kept {kept:.1%} of the ramped pixels")
    return cleaned


def columns(a: np.ndarray, want: int) -> list[tuple[int, int]]:
    """Split the sheet into `want` icon columns on the `want - 1` WIDEST empty gutters.

    The tab-icon build split on EVERY empty gutter and asserted the count. That does not survive
    this set: `flee` is a boot with speed lines trailing behind it, and the gap between the lines
    and the boot is a genuine empty column, so a whole-gutter split finds five columns and
    aborts on art that is perfectly correct.

    Ranking gutters by width separates the two cases by an order of magnitude and needs no
    tuning: on the shipped source the three between-cell gutters are 109-120px and the widest
    within-glyph gap is 15px. Taking the top `want - 1` is therefore both robust and deterministic
    -- and the assertion is not lost, it just moves to the ratio check below.
    """
    ink = a.sum(axis=0)
    filled = ink > ink.max() * 0.004
    gaps, start = [], None
    for x, on in enumerate(filled):
        if not on and start is None:
            start = x
        elif on and start is not None:
            gaps.append((start, x))
            start = None
    # Leading and trailing margins are not gutters between cells.
    gaps = [g for g in gaps if g[0] > 0 and g[1] < len(filled)]
    gaps.sort(key=lambda g: g[1] - g[0], reverse=True)
    if len(gaps) < want - 1:
        sys.exit(f"need {want - 1} gutters, found {len(gaps)}")
    cuts = sorted(gaps[:want - 1])
    rest = gaps[want - 1:]
    widest_cut = min(g[1] - g[0] for g in cuts)
    widest_rest = max((g[1] - g[0] for g in rest), default=0)
    print(f"  gutters: cells split on {[g[1] - g[0] for g in cuts]}px gaps; "
          f"widest gap left inside a glyph {widest_rest}px")
    if widest_rest * 2 > widest_cut:
        sys.exit(f"ambiguous split: an in-glyph gap of {widest_rest}px is too close to the "
                 f"narrowest cell gutter of {widest_cut}px to rank them safely")
    edges = [0] + [(g[0] + g[1]) // 2 for g in cuts] + [len(filled)]
    return [(edges[i], edges[i + 1]) for i in range(want)]


def trim(cell: np.ndarray) -> np.ndarray:
    rows = np.where(cell.sum(axis=1) > 0)[0]
    cols = np.where(cell.sum(axis=0) > 0)[0]
    return cell[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]


def normalise(crop: np.ndarray, scale: float) -> Image.Image:
    """Scale by a factor shared with the whole set, then centre in a CELL square.

    One factor for the family, from the median optical size -- exactly as the tab icons do it,
    and for the same reason: the generator already drew the four at one stroke weight, so a
    single shared scale preserves that by construction, while per-icon fitting would give the
    wide flat boot a visibly heavier line than the tall potion.
    """
    h, w = crop.shape
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    img = Image.fromarray((crop * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    out = Image.new("L", (CELL, CELL), 0)
    out.paste(img, ((CELL - nw) // 2, (CELL - nh) // 2))
    return out


def contact_sheet(sheet: Image.Image, out: pathlib.Path) -> None:
    """One image the owner can approve or reject at a glance.

    Two rows on the app's own charcoal, in the app's own gold: the glyphs blown up so the
    drawing can be judged, and the SAME glyphs at 21px, which is the size they are actually
    used at. The small row is the one that decides it -- art that reads at 4x and mushes at
    21px has passed a review it should have failed.
    """
    gold, bg, pad, big = (201, 169, 97), (21, 22, 28), 26, 96
    w = len(NAMES) * (big + pad) + pad
    card = Image.new("RGBA", (w, big + 21 + 3 * pad), bg + (255,))
    for i in range(len(NAMES)):
        cell = sheet.crop((i * CELL, 0, (i + 1) * CELL, CELL))
        for size, y in ((big, pad), (21, big + 2 * pad)):
            g = cell.resize((size, size), Image.LANCZOS)
            tint = Image.new("RGBA", (size, size), gold + (0,))
            tint.putalpha(g.split()[3])
            card.alpha_composite(tint, (pad + i * (big + pad) + (big - size) // 2, y))
    card.save(out)
    print(f"WROTE {out}  (contact sheet: {big}px over {21}px, gold on charcoal)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=pathlib.Path,
                    help="the generated 4-up icon sheet")
    ap.add_argument("--out", type=pathlib.Path, default=OUT,
                    help="where to write the sheet (default: public/ui-icons/battle-icons.png)")
    ap.add_argument("--contact", type=pathlib.Path, default=CONTACT,
                    help="where to write the owner review contact sheet")
    args = ap.parse_args()
    if not args.src.is_file():
        sys.exit(f"missing source sheet: {args.src}")

    a = alpha_from(args.src)
    spans = columns(a, len(NAMES))
    crops = [trim(a[:, x0:x1]) for x0, x1 in spans]

    # Optical size, not the bounding box: sqrt(w*h) is much closer to how big a glyph LOOKS than
    # its longest side, and this set contains both a wide flat boot and a tall potion.
    optical = [float(np.sqrt(c.shape[0] * c.shape[1])) for c in crops]
    base = OPTICAL / float(np.median(optical))

    sheet = Image.new("RGBA", (CELL * len(NAMES), CELL), (255, 255, 255, 0))
    for i in range(len(NAMES)):
        scale = min(base, GLYPH / max(crops[i].shape))
        if scale < base:
            print(f"  {NAMES[i]:7s} clamped to the {GLYPH}px ceiling "
                  f"({scale / base:.0%} of the family scale)")
        mask = normalise(crops[i], scale)
        white = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 255))
        white.putalpha(mask)
        sheet.paste(white, (i * CELL, 0))
        out = np.asarray(mask, dtype=np.float32) / 255
        rows = np.where(out.sum(1) > 0)[0]
        cols = np.where(out.sum(0) > 0)[0]
        box = max(rows[-1] - rows[0], cols[-1] - cols[0]) + 1
        src_sw = stroke_width(crops[i])
        src_opt = optical[i]
        print(f"  {NAMES[i]:7s} cell {i}  src stroke {src_sw:5.1f}px "
              f"({100 * src_sw / src_opt:4.2f}% of optical)"
              f"  -> stroke {stroke_width(out):4.2f}  box {box:3d}/{CELL}"
              f"  ({box * 21 / CELL:4.1f}px at 21)")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out, optimize=True)
    print(f"WROTE {args.out}  {args.out.stat().st_size:,} B  ({CELL * len(NAMES)}x{CELL})")
    if args.contact:
        args.contact.parent.mkdir(parents=True, exist_ok=True)
        contact_sheet(sheet, args.contact)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
