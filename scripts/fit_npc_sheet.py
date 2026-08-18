#!/usr/bin/env python3
"""Fit one RAW generated NPC grid into the shipped 192x256 / 3x4 / 64px sheet format.

Why this exists
---------------
The image generator always returns ~1254 px and cannot be asked for 192x256 directly. Two facts
decide the whole method:

  * Downscaling SHARPENS and anti-aliases; upscaling destroys both (measured mean pixel step
    25.67 downscaled vs 13.97 upscaled). So the sheet is always generated large and reduced here,
    never the other way round.
  * `check_character_finish.py` measures a SOFT edge -- ~13 partially-transparent px per 100
    opaque, matching the heroine. That softness is produced by this LANCZOS reduction. A raw
    grid pasted at 1:1, or reduced with NEAREST, measures under 1 and fails.

It also normalises the two things the generator gets wrong every time and that are invisible
until the sprite is in the game:

  * SCALE. Each of the 12 frames is fitted to ONE global scale derived from the sheet's own
    content, so an NPC stands the same height the heroine does (~51 px of a 64 px cell, measured
    off the four accepted Port Sapphire sheets) and does not grow or shrink as it turns.
  * BASELINE. Every frame's feet land on the same row (58, again measured off the accepted
    sheets) and every frame is centred horizontally. A drifting baseline makes the NPC bob when
    it changes facing, which is the single most common defect in this format.

Usage:
    fit_npc_sheet.py RAW.png OUT.png [--target-h 51.5] [--baseline 58] [--tol 88]
                     [--rows 4] [--cols 3] [--debug]
    fit_npc_sheet.py RAW.png [RAW.png ...] --out-dir DIR     (raw-<name>.png -> <name>-4x3-64.png)
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image

KEY = np.array([255, 0, 255], dtype=np.float32)
N = 64


def mask_of(im: Image.Image, tol: float) -> np.ndarray:
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    return np.sqrt(((a - KEY) ** 2).sum(axis=2)) > tol


def despeck(m: np.ndarray, min_area: int) -> np.ndarray:
    """Drop connected components smaller than min_area.

    The generator leaves stray flecks on the field -- a dropped pixel of hair, a bit of ringing
    at the border. They are harmless in the artwork but they wreck the grid fit, because a fleck
    sitting in a gutter closes the gap the column split is found in.
    """
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    cur = 0
    ys, xs = np.nonzero(m)
    seen = m.copy()
    keep = np.zeros((h, w), bool)
    for y0, x0 in zip(ys, xs):
        if not seen[y0, x0]:
            continue
        cur += 1
        stack = [(y0, x0)]
        seen[y0, x0] = False
        comp = []
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and seen[ny, nx]:
                    seen[ny, nx] = False
                    stack.append((ny, nx))
        if len(comp) >= min_area:
            for y, x in comp:
                keep[y, x] = True
        lab[:] = lab
    return keep


def strip_keyline(im: Image.Image, m: np.ndarray, k: int, drop: float) -> tuple[Image.Image, np.ndarray]:
    """Erode away a DRAWN dark contour, at raw scale, before anything is reduced.

    The generator keeps drawing the near-black silhouette contour that `design/ART-DIRECTION.md`
    withdrew for this family in the 2026-08-01 field-character amendment -- the exact defect the
    owner rejected the first Port Sapphire batch for. Measured on a raw sheet, the outermost three
    pixel rings run 63 / 49 / 63 mean luminance against a body mean of 108, and the fourth ring is
    already back at 86: a drawn line about three pixels thick, sitting on top of artwork that is
    correct underneath it.

    Removing it here rather than asking for another generation is deliberate. It is the SAME
    correction the brief asks for, applied deterministically, and it is applied to the raw where
    three pixels is one percent of the figure's height -- so the silhouette does not visibly shrink
    and no interior detail is touched.

    `drop` guards it: rings are peeled only while they are genuinely darker than the body by that
    margin, so a sheet drawn correctly in the first place is left exactly as it is.
    """
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    body = float(L[m].mean())
    cur = m.copy()
    peeled = 0
    for _ in range(k):
        p = np.pad(cur, 1, constant_values=False)
        ero = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:] & cur
        ring = cur & ~ero
        if ring.sum() == 0 or float(L[ring].mean()) > body - drop:
            break
        cur = ero
        peeled += 1
    if peeled:
        out = np.asarray(im.convert("RGB")).copy()
        out[~cur] = KEY.astype(np.uint8)
        im = Image.fromarray(out)
    return im, cur, peeled


def splits(proj: np.ndarray, want: int) -> list[int]:
    """Cut a projection into `want` bands at its `want-1` widest empty runs.

    Taking the WIDEST runs rather than the first ones matters: a walking figure leaves small
    internal gaps (between the legs, under an arm) that a first-fit search happily mistakes for
    a gutter.
    """
    runs, start = [], None
    for i, v in enumerate(proj):
        if v == 0 and start is None:
            start = i
        elif v != 0 and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(proj)))
    inner = [r for r in runs if r[0] > 0 and r[1] < len(proj)]
    inner.sort(key=lambda r: r[1] - r[0], reverse=True)
    chosen = sorted(inner[: want - 1], key=lambda r: r[0])
    if len(chosen) < want - 1:
        raise SystemExit(f"only found {len(chosen)} gutters, needed {want - 1}")
    return [0] + [(a + b) // 2 for a, b in chosen] + [len(proj)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+",
                    help="RAW OUT, or several RAWs together with --out-dir")
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--rows", type=int, default=4)
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--tol", type=float, default=88.0)
    ap.add_argument("--target-h", type=float, default=51.5,
                    help="content height in the 64px cell. 51.5 is the mean of the four "
                         "accepted Port Sapphire sheets (51.4/51.1/51.5/50.3).")
    ap.add_argument("--baseline", type=int, default=58,
                    help="cell row the feet land on. All 48 accepted cells bottom out at 58.")
    ap.add_argument("--strip-keyline", type=int, default=4,
                    help="max pixel rings of DRAWN dark contour to peel off the raw silhouette "
                         "before reducing. 4 is a ceiling, not a quota -- see strip_keyline().")
    ap.add_argument("--strip-drop", type=float, default=12.0,
                    help="a ring counts as keyline only while it is this much darker than the "
                         "body mean, so a correctly drawn sheet is left untouched.")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if args.out_dir:
        os.makedirs(args.out_dir, exist_ok=True)
        for raw in args.paths:
            stem = os.path.basename(raw)[:-4].removeprefix("raw-")
            fit(raw, os.path.join(args.out_dir, f"{stem}-4x3-64.png"), args)
    else:
        if len(args.paths) != 2:
            raise SystemExit("give RAW OUT, or several RAWs with --out-dir")
        fit(args.paths[0], args.paths[1], args)


def fit(raw_path: str, out_path: str, args) -> None:
    im = Image.open(raw_path).convert("RGB")
    W, H = im.size
    m = despeck(mask_of(im, args.tol), min_area=max(24, (W * H) // 20000))
    im, m, peeled = strip_keyline(im, m, args.strip_keyline, args.strip_drop)

    xs = splits(m.sum(axis=0), args.cols)
    ys = splits(m.sum(axis=1), args.rows)
    if args.debug:
        print(f"  raw {W}x{H}  col cuts {xs}  row cuts {ys}")

    boxes = []          # per cell: content bbox in raw pixels
    for r in range(args.rows):
        for c in range(args.cols):
            sub = m[ys[r]:ys[r + 1], xs[c]:xs[c + 1]]
            yy, xx = np.nonzero(sub)
            if len(yy) == 0:
                raise SystemExit(f"cell r{r}c{c} is empty")
            boxes.append((xs[c] + xx.min(), ys[r] + yy.min(),
                          xs[c] + xx.max() + 1, ys[r] + yy.max() + 1))

    # ONE scale for the whole sheet. The 75th percentile rather than the max, so a single tall
    # frame -- a raised staff, a hat brim caught mid-step -- does not shrink the other eleven.
    hs = np.array([b[3] - b[1] for b in boxes], dtype=np.float32)
    src_h = float(np.percentile(hs, 75))
    scale = args.target_h / src_h
    cell_src = N / scale                       # how many raw px one 64px cell covers

    out = Image.new("RGB", (args.cols * N, args.rows * N), tuple(int(v) for v in KEY))
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        r, c = divmod(i, args.cols)
        cx = (x0 + x1) / 2.0
        # Isolate this cell's own grid region on a magenta field FIRST. The square window below
        # is sized by the character, not by the grid, so on a tight sheet it reaches past the
        # gutter and would otherwise drag a slice of the neighbouring frame in with it -- which
        # shows up as a stray elbow at the edge of the cell and nowhere in the numbers.
        # The canvas is padded by a whole cell so a window that runs off the sheet is filled with
        # MAGENTA rather than PIL's default black -- a black bar would key as opaque artwork.
        P = int(cell_src) + 2
        src = Image.new("RGB", (W + 2 * P, H + 2 * P), tuple(int(v) for v in KEY))
        src.paste(im.crop((xs[c], ys[r], xs[c + 1], ys[r + 1])), (P + xs[c], P + ys[r]))
        # the cell's raw-space window: content centred on x, feet on the baseline row
        left = cx - cell_src / 2.0
        bottom = y1 + (N - 1 - args.baseline) * cell_src / N
        top = bottom - cell_src
        crop = src.crop((P + int(round(left)), P + int(round(top)),
                         P + int(round(left + cell_src)), P + int(round(top + cell_src))))
        if crop.size != (N, N):
            crop = crop.resize((N, N), Image.LANCZOS)
        out.paste(crop, (c * N, r * N))
        if args.debug:
            print(f"   r{r}c{c} src {x1-x0:4d}x{y1-y0:4d} -> {(x1-x0)*scale:5.1f}x{(y1-y0)*scale:5.1f}")

    out.save(out_path)
    # report what actually landed, measured off the file just written
    mm = mask_of(Image.open(out_path), args.tol)
    tops, bots, hh = [], [], []
    for r in range(args.rows):
        for c in range(args.cols):
            yy, xx = np.nonzero(mm[r * N:(r + 1) * N, c * N:(c + 1) * N])
            tops.append(yy.min()); bots.append(yy.max()); hh.append(yy.max() - yy.min() + 1)
    print(f"  {os.path.basename(out_path):<34} {out.size}  scale {scale:.4f}  "
          f"top {min(tops)}..{max(tops)}  bottom {min(bots)}..{max(bots)}  "
          f"h {min(hh)}..{max(hh)} (mean {np.mean(hh):.1f})  coverage {100*mm.mean():.2f}%"
          f"  keyline rings peeled {peeled}")


if __name__ == "__main__":
    main()
