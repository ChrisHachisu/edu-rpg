#!/usr/bin/env python3
"""Stitch generated art tiles into one act map, cross-fading the overlap, and REPORT THE SEAM.

The unproven risk in the whole tile pipeline: every tile generated so far has been isolated and
non-adjacent. Two neighbouring tiles are generated in separate calls, so the model has no idea
what it drew next door -- their shared edge will not match on its own. The previous pipeline
carried a 3-cell overlap plus separable linear blending and kept a seam report with a
mean-absolute-step threshold of 24.0 to prove the joins were invisible
(dq-art-full-v2/seam-report-fixedbase2.json).

This does the same two jobs:
  1. blend  -- linear cross-fade across the overlap band, per axis
  2. measure -- mean/p95/max absolute luminance step ACROSS each seam line, compared against
     the step found at an equivalent line in a tile's interior. If the seam step is close to
     the interior step, the join is invisible. If it is far larger, blending is not enough and
     the tiles must be generated with real context instead.

Usage:
    stitch_art_tiles.py <act> [--out map.png] [--seam-report r.json]
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/art-tiles")
PLAN = os.path.join(DIR, "tile-plan.json")
THRESHOLD = 24.0     # the previous pipeline's accepted mean step
LEGEND = {(226, 210, 156): "ground", (26, 82, 46): "forest",
          (128, 126, 122): "rock", (30, 82, 170): "water"}


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def min_error_seam(a, b, axis=1):
    """Minimum-error boundary cut through an overlap band (image-quilting style).

    A linear cross-fade AVERAGES the two tiles, which is right for smooth terrain and wrong
    for a hard linear feature. The seam test found a shoreline displaced 7-19 px between
    neighbouring tiles: averaging two offset shorelines ghosts them into a double edge.

    So instead of blending everywhere, find the path through the band where the two tiles
    already agree most, and CUT along it -- taking A on one side and B on the other. Where
    the tiles agree the cut is invisible; where they disagree it routes around the conflict
    rather than smearing it.
    """
    if axis == 0:
        return min_error_seam(a.transpose(1, 0, 2), b.transpose(1, 0, 2), 1).T
    d = ((a.astype(np.float64) - b.astype(np.float64)) ** 2).sum(axis=2)
    h, w = d.shape
    cost = d.copy()
    back = np.zeros((h, w), np.int8)
    for y in range(1, h):
        left = np.r_[np.inf, cost[y - 1, :-1]]
        mid = cost[y - 1]
        right = np.r_[cost[y - 1, 1:], np.inf]
        stack = np.vstack([left, mid, right])
        choice = stack.argmin(axis=0)
        back[y] = choice - 1
        cost[y] += stack.min(axis=0)
    mask = np.zeros((h, w), bool)
    x = int(cost[-1].argmin())
    for y in range(h - 1, -1, -1):
        mask[y, :x] = True          # take A left of the cut
        x = int(np.clip(x + int(back[y, x]), 0, w - 1))
    return mask


def normalise_tone(img, mask_path, targets):
    """RETIRED 2026-07-31 -- kept only so the reasoning is not lost. Do not call this.

    The intent was right (correct each material against its own target) but the mechanism was
    self-defeating: the gain is computed PER TILE, so two neighbours got two different gains,
    and each applied its own gain across the whole tile INCLUDING the 144px locked band. The
    band is byte-identical between neighbours by construction (prime_tile_base.py --lock) --
    this function was the one step that pulled those two copies apart again, right before the
    min-error cut had to choose between them. That is the tile blocking in the sea.

    It was also the third correction stacked on the same pixels (generation, then
    retone_tiles.py --apply, then this), each against a different reference.

    Replacement: ONE global grade on the ONE stitched image (grade_act_map.py). A gain that is
    constant over the whole map cannot pull byte-identical strips apart, so it cannot patchwork.
    """
    raise AssertionError("normalise_tone is retired; grade the stitched map instead")
    if not os.path.exists(mask_path):
        return img
    sem = np.asarray(Image.open(mask_path).convert("RGB")).astype(int)
    a = img.astype(np.float64)
    out = a.copy()
    for rgb, key in LEGEND.items():
        if key not in targets:
            continue
        m = (np.abs(sem - np.array(rgb)).sum(axis=2) < 20)
        if m.sum() < 400:
            continue
        cur = lum(a[m]).mean()
        if cur < 1e-6:
            continue
        gain = float(np.clip(targets[key] / cur, 0.72, 1.38))
        out[m] = np.clip(a[m] * gain, 0, 255)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("--out")
    ap.add_argument("--seam-report")
    args = ap.parse_args()

    plan = json.load(open(PLAN))
    N, OV, PX = plan["cellsPerTile"], plan["overlapCells"], plan["pxPerCell"]
    A = plan["acts"][args.act]
    x0, y0, _x1, _y1 = A["bounds"]
    W, H = A["cells"][0] * PX, A["cells"][1] * PX

    acc = np.zeros((H, W, 3), np.float64)
    wsum = np.zeros((H, W), np.float64)
    ramp = np.ones(N * PX, np.float64)
    ov_px = OV * PX
    if ov_px > 0:
        e = np.linspace(0.0, 1.0, ov_px, endpoint=False) + 0.5 / ov_px
        ramp[:ov_px] = e
        ramp[-ov_px:] = e[::-1]

    # Pass 1: the act's own per-class median luminance becomes the target. Independent
    # generations drift in exposure; a measured seam test found a 14.8 ramp between two
    # neighbours, which is what makes horizontal joins read as a patchwork.
    samples = {}
    for t in A["tiles"]:
        p = os.path.join(DIR, t["art"])
        mp = os.path.join(DIR, t["mask"])
        if not (os.path.exists(p) and os.path.exists(mp)):
            continue
        im = np.asarray(Image.open(p).convert("RGB")).astype(np.float64)
        sem = np.asarray(Image.open(mp).convert("RGB")).astype(int)
        for rgb, key in LEGEND.items():
            m = (np.abs(sem - np.array(rgb)).sum(axis=2) < 20)
            if m.sum() >= 400:
                samples.setdefault(key, []).append(float(lum(im[m]).mean()))
    targets = {k: float(np.median(v)) for k, v in samples.items() if v}
    if targets:
        print("  act-wide tone targets (median across tiles): " +
              "  ".join(f"{k} {v:.1f}" for k, v in sorted(targets.items())))

    # Sequential compositing with MIN-ERROR CUTS.
    #
    # A weighted cross-fade averages the overlap, which is right for exposure drift and wrong
    # for structural mismatch: tone normalisation above moved the horizontal seam ratio only
    # 1.77 -> 1.75, so the joins differ in CONTENT, not brightness. Averaging two versions of a
    # treeline that sit a few px apart smears both. Instead, cut along the path where the two
    # already agree, and feather only 1.5 px so the cut itself is not a hard line.
    canvas = np.zeros((H, W, 3), np.uint8)
    covered = np.zeros((H, W), bool)
    present = missing = 0
    for t in A["tiles"]:
        p = os.path.join(DIR, t["art"])
        if not os.path.exists(p):
            missing += 1
            continue
        present += 1
        im = np.asarray(Image.open(p).convert("RGB")).astype(np.float64)
        # NO per-tile tone correction here. See the note above `normalise_tone`: it computed a
        # DIFFERENT gain per tile and applied it across the whole tile, locked band included,
        # which destroyed the byte-identical shared strips at stitch time and is what made the
        # sea read as tile blocks. Tone is now a single global grade on the finished map.
        tx, ty = t["worldTopLeft"]
        px0, py0 = (tx - x0) * PX, (ty - y0) * PX
        th, tw = im.shape[0], im.shape[1]
        sl = (slice(py0, py0 + th), slice(px0, px0 + tw))
        ovl = covered[sl]
        if not ovl.any():
            canvas[sl] = np.clip(im, 0, 255).astype(np.uint8)
            covered[sl] = True
            continue
        exist = canvas[sl].astype(np.float64)
        take_new = ~ovl                      # anywhere untouched, the new tile wins
        # left overlap -> vertical cut
        lw = int(ovl[:, :ov_px].any(axis=0).sum())
        if lw > 2:
            keep = min_error_seam(exist[:, :lw], im[:, :lw], axis=1)
            take_new[:, :lw] |= (~keep) & ovl[:, :lw]
        # top overlap -> horizontal cut
        thh = int(ovl[:ov_px, :].any(axis=1).sum())
        if thh > 2:
            keep = min_error_seam(exist[:thh], im[:thh], axis=0)
            take_new[:thh] |= (~keep) & ovl[:thh]
        a = np.asarray(Image.fromarray((take_new * 255).astype(np.uint8), "L")
                       .filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float64) / 255.0
        blended = exist * (1 - a[..., None]) + im * a[..., None]
        canvas[sl] = np.clip(blended, 0, 255).astype(np.uint8)
        covered[sl] |= True
    img = Image.fromarray(canvas)
    op = args.out or os.path.join(DIR, f"act{args.act}-map.png")
    img.save(op)
    print(f"wrote {os.path.relpath(op, ROOT)}  {img.size[0]}x{img.size[1]}")

    # ---- seam measurement -------------------------------------------------------------
    L = lum(np.asarray(img).astype(np.float64))
    stride_px = plan["strideCells"] * PX
    seam_x = sorted({(t["worldTopLeft"][0] - x0) * PX for t in A["tiles"]} - {0})
    seam_y = sorted({(t["worldTopLeft"][1] - y0) * PX for t in A["tiles"]} - {0})

    def step_at_cols(cols):
        vals = []
        for c in cols:
            if 2 <= c < L.shape[1] - 2:
                vals.append(np.abs(L[:, c] - L[:, c - 1]))
        return np.concatenate(vals) if vals else np.zeros(1)

    def step_at_rows(rows):
        vals = []
        for r in rows:
            if 2 <= r < L.shape[0] - 2:
                vals.append(np.abs(L[r, :] - L[r - 1, :]))
        return np.concatenate(vals) if vals else np.zeros(1)

    # interior control lines: same count, offset well away from any seam
    ctl_x = [c + stride_px // 2 for c in seam_x if c + stride_px // 2 < L.shape[1] - 2]
    ctl_y = [r + stride_px // 2 for r in seam_y if r + stride_px // 2 < L.shape[0] - 2]

    rep = {}
    for name, s, c in (("vertical", step_at_cols(seam_x), step_at_cols(ctl_x)),
                       ("horizontal", step_at_rows(seam_y), step_at_rows(ctl_y))):
        rep[name] = {
            "seamMeanStep": round(float(s.mean()), 3),
            "seamP95Step": round(float(np.percentile(s, 95)), 3),
            "seamMaxStep": round(float(s.max()), 3),
            "interiorMeanStep": round(float(c.mean()), 3),
            "ratioSeamOverInterior": round(float(s.mean() / max(c.mean(), 1e-6)), 3),
        }
        r = rep[name]
        verdict = ("INVISIBLE" if r["seamMeanStep"] <= THRESHOLD
                   and r["ratioSeamOverInterior"] < 1.6 else "VISIBLE")
        rep[name]["verdict"] = verdict
        print(f"  {name:<11} seam mean {r['seamMeanStep']:6.2f}  p95 {r['seamP95Step']:6.2f}  "
              f"interior mean {r['interiorMeanStep']:6.2f}  "
              f"ratio {r['ratioSeamOverInterior']:.2f}  -> {verdict}")
    rep["threshold"] = THRESHOLD
    rep["note"] = ("seam is judged against an interior control line, because busy terrain has "
                   "a high step everywhere; what matters is whether the seam is WORSE")
    if args.seam_report:
        json.dump(rep, open(args.seam_report, "w"), indent=1)
        print(f"seam report: {args.seam_report}")


if __name__ == "__main__":
    main()
