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

TWO BACKGROUNDS, DETECTED -- NOT ASSUMED
    The 2026-08-07 solid-icon round asked for the same flat dark background and Codex answered it
    TWO different ways in the same hour: candidate C came back on flat near-black as asked, and
    candidates A and B came back on a GREEN SCREEN. Neither is the chequerboard, so both look
    fine to a human opening the file -- and that is the trap, because a luminance ramp CANNOT key
    green. Pure green sits at luminance ~150, squarely inside the 40..190 ramp below, so keying it
    on luminance renders the whole background at about 73% opacity: a solid slab with faint icons
    floating in it. That does not look like a keying bug, it looks like the art is bad, and the
    art would get blamed and re-rolled.

    The shipped icons are candidate B, so the shipped sheet is one of the green ones. The
    background is therefore DETECTED from the four corners and keyed accordingly. This code was
    proven in the candidate round's builder and moved here on promotion, so there is one keyer and
    not two; design/ui-overhaul/battle-icons/solid/build.py now calls this function.

WHAT IT EMITS
    public/ui-icons/battle-icons.png -- a 512x128 sheet, four 128x128 cells, white RGB with the
    recovered alpha. It is a MASK: the button paints it with `currentColor`, so a command's
    colour lives entirely in the tint and no second asset is needed per colour. Order matches
    BATTLE_ACT in ui-overhaul.js: attack, defend, item, flee.

    python3 scripts/build_battle_icons.py --src <sheet.png> [--replace attack=<glyph.png>]

REPLACING ONE CELL
    The owner accepted three of the four glyphs and rejected one, so --replace swaps a single
    cell's ARTWORK for a separately generated single-glyph image while leaving the other three
    to come out of --src through the identical code path, byte for byte. Regenerating all four
    would have re-rolled three glyphs that were already approved.

    A separately generated glyph carries neither of the guarantees a shared sheet gives -- one
    pen weight and one relative scale -- so it cannot use the family scale. It is scaled to match
    the family's OUTPUT STROKE instead, which is the invariant the family scale exists to
    preserve in the first place. See replace_scale().
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
GREEN = 60.0        # corner greenness above which the canvas is a green screen, not a dark one.
                    # Measured: the green-screen sources sit at ~200, every dark source at <2, so
                    # any threshold in between separates them; 60 is nowhere near either.
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


def background_greenness(img: Image.Image) -> float:
    """How green the canvas corners are: median of `G - max(R, B)` over the four of them.

    Four corners rather than one, so a stray mark in a corner cannot decide it, and a median
    rather than a mean so a single outlier corner cannot either. `G - max(R, B)` is positive only
    where green genuinely dominates BOTH other channels: it is ~200 on a green screen, ~0 on
    near-black, and 0 on white -- including every antialiased white pixel, which is what lets the
    same expression key the glyph edge softly instead of cutting it 1-bit.
    """
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, _ = rgb.shape
    corners = np.stack([rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]])
    return float(np.median(corners[:, 1] - corners[:, [0, 2]].max(axis=1)))


def alpha_from(sheet: pathlib.Path) -> np.ndarray:
    """Recover alpha from whichever background the generator actually used, then open the result.

    A real alpha channel is used as-is if the generator ever provides one. Otherwise the
    background is DETECTED (see the module docstring -- this generator has shipped both a
    near-black canvas and a green screen for the same instruction) and keyed on the matching
    axis:

      green screen   alpha = 1 - greenness / corner greenness. Exact at pure green (0) and at
                     pure white (1), linear across the antialiased edge in between.
      anything else  the luminance ramp: the background sits under 32 and the strokes over 224,
                     so 40..190 clears both by a wide margin while keeping the antialiased edge
                     as a soft ramp rather than a jagged 1-bit cut.

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
    elif (g_dom := background_greenness(img)) > GREEN:
        rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
        greenness = rgb[:, :, 1] - rgb[:, :, [0, 2]].max(axis=2)
        a = np.clip(1.0 - greenness / g_dom, 0.0, 1.0)
        print(f"  source is opaque; GREEN SCREEN detected (corner greenness {g_dom:.0f}); "
              f"keyed on chroma")
    else:
        lum = np.asarray(img.convert("L"), dtype=np.float32)
        a = np.clip((lum - LO) / (HI - LO), 0.0, 1.0)
        print(f"  source is opaque; dark background (corner greenness {g_dom:.0f}); "
              f"keyed on luminance ramp {LO:.0f}..{HI:.0f}")
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


def replace_scale(crop: np.ndarray, family_stroke: float) -> float:
    """Scale a separately generated glyph to the family's OUTPUT stroke, not to its optical size.

    The family scale cannot be used here. It is one factor derived from the median optical size
    of the four crops on one sheet, and it works only because the generator drew those four with
    one pen at sensible relative sizes -- a guarantee that exists per SHEET and does not extend
    to a glyph generated on its own canvas at its own scale.

    Matching the stroke instead preserves the property the family scale was protecting all along:
    every glyph in the sheet is drawn with the same weight of line. Size then follows from that,
    which is the right dependency -- a diagonal blade needs a larger bounding box than a compact
    shield to look the same size, and this lands it there on its own.

    Judgement, recorded because a future run will face it again: the replacement's own source
    ratio came in under the anchor band after four attempts (4.62 / 5.04 / 5.56 / 4.72 percent,
    against 6.09-6.24 for the accepted three), and the generator plateaued rather than converging.
    Scaling to the family stroke makes the SHIPPED cell match regardless -- what a light source
    ratio costs is glyph size, not weight, and the ceiling below catches that if it goes too far.
    """
    return min(family_stroke / stroke_width(crop), GLYPH / max(crop.shape))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=pathlib.Path,
                    help="the generated 4-up icon sheet")
    ap.add_argument("--out", type=pathlib.Path, default=OUT,
                    help="where to write the sheet (default: public/ui-icons/battle-icons.png)")
    ap.add_argument("--contact", type=pathlib.Path, default=CONTACT,
                    help="where to write the owner review contact sheet")
    ap.add_argument("--replace", action="append", default=[], metavar="NAME=PNG",
                    help=f"swap one cell for a separately generated single glyph; "
                         f"NAME is one of {'/'.join(NAMES)}. Repeatable.")
    args = ap.parse_args()
    if not args.src.is_file():
        sys.exit(f"missing source sheet: {args.src}")

    swaps: dict[int, pathlib.Path] = {}
    for spec in args.replace:
        name, _, path = spec.partition("=")
        if name not in NAMES:
            sys.exit(f"--replace name must be one of {NAMES}, got {name!r}")
        p = pathlib.Path(path)
        if not p.is_file():
            sys.exit(f"missing replacement glyph: {p}")
        swaps[NAMES.index(name)] = p

    a = alpha_from(args.src)
    spans = columns(a, len(NAMES))
    crops = [trim(a[:, x0:x1]) for x0, x1 in spans]

    # Optical size, not the bounding box: sqrt(w*h) is much closer to how big a glyph LOOKS than
    # its longest side, and this set contains both a wide flat boot and a tall potion.
    #
    # Deliberately computed over ALL FOUR crops even when a cell is being replaced. The median is
    # what fixes the family scale, so recomputing it over the survivors would shift every
    # untouched cell by a pixel or two and quietly re-roll glyphs the owner has already approved.
    optical = [float(np.sqrt(c.shape[0] * c.shape[1])) for c in crops]
    base = OPTICAL / float(np.median(optical))

    masks: dict[int, Image.Image] = {}
    for i in range(len(NAMES)):
        if i in swaps:
            continue
        scale = min(base, GLYPH / max(crops[i].shape))
        if scale < base:
            print(f"  {NAMES[i]:7s} clamped to the {GLYPH}px ceiling "
                  f"({scale / base:.0%} of the family scale)")
        masks[i] = normalise(crops[i], scale)

    # The family's output stroke, measured on the cells that came off the sheet, is what a
    # replacement is matched to. Median, so one odd cell cannot drag the target.
    family_stroke = float(np.median(
        [stroke_width(np.asarray(m, dtype=np.float32) / 255) for m in masks.values()]))
    if swaps:
        print(f"  family output stroke from {len(masks)} sheet cells: {family_stroke:.2f}px")

    replaced_crops: dict[int, np.ndarray] = {}
    for i, path in swaps.items():
        print(f"  {NAMES[i]:7s} REPLACED from {path.name}")
        crop = trim(alpha_from(path))
        replaced_crops[i] = crop
        scale = replace_scale(crop, family_stroke)
        if scale * max(crop.shape) >= GLYPH:
            print(f"  {NAMES[i]:7s} clamped to the {GLYPH}px ceiling -- its stroke will land "
                  f"UNDER the family's; regenerate it heavier rather than shipping this")
        masks[i] = normalise(crop, scale)

    sheet = Image.new("RGBA", (CELL * len(NAMES), CELL), (255, 255, 255, 0))
    for i in range(len(NAMES)):
        mask = masks[i]
        white = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 255))
        white.putalpha(mask)
        sheet.paste(white, (i * CELL, 0))
        out = np.asarray(mask, dtype=np.float32) / 255
        rows = np.where(out.sum(1) > 0)[0]
        cols = np.where(out.sum(0) > 0)[0]
        box = max(rows[-1] - rows[0], cols[-1] - cols[0]) + 1
        crop = replaced_crops.get(i, crops[i])
        src_sw = stroke_width(crop)
        src_opt = float(np.sqrt(crop.shape[0] * crop.shape[1]))
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
