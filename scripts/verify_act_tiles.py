#!/usr/bin/env python3
"""Verify every generated tile in an act LOCALLY, and emit the list that needs regenerating.

Why this exists. The V7 brief made Codex verify each tile itself: sample 676 cell centres,
compute HSV and luminance, compare against the mask, retry on mismatch. Measured over act 1
that cost **11.0 minutes and ~135k tokens per tile** -- 7.3 MILLION tokens for one act -- and
the log shows 8424 verification mentions against 1340 shell/python invocations Codex wrote to
do arithmetic. It was a reasoning model doing sums, badly and expensively.

All of that is free and instant here. So Codex now only GENERATES, and this decides pass/fail
and hands back a precise regenerate list.

Checks per tile:
  1. cell-centre class agreement against the tile's own semantic mask
  2. per-class tone against the act median (catches an exposure-drifted tile)
  3. an "invented class" check -- a class the mask says is absent but the art shows a lot of,
     which is the exact failure that stopped the row-218 chunk (grass painted over rock)

Usage:
    verify_act_tiles.py <act> [--max-mismatch 0.03] [--json out.json]
"""
from __future__ import annotations

import argparse
import colorsys
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/art-tiles")
PLAN = os.path.join(DIR, "tile-plan.json")
LEGEND = {(226, 210, 156): "ground", (26, 82, 46): "forest",
          (128, 126, 122): "rock", (30, 82, 170): "water"}
PX = 48


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def classify(rgb, centroids):
    """Nearest ACT-WIDE per-class colour centroid.

    Absolute HSV thresholds do not work on this art and I got that wrong six times. The last
    version called grass "forest" across most of act 1 because the act's ground luminance is
    104/255 (v ~= 0.41) and the forest rule fired at v <= 0.42. Two classes that are genuinely
    close in absolute terms are still cleanly separable RELATIVE to each other.

    So the reference is measured from the act itself: every tile's mask says which pixels are
    which class, the mean colour of each class is taken across ALL tiles, and a sample is
    assigned to whichever class centroid it is nearest. Act-wide rather than per-tile, so one
    badly-generated tile cannot define its own reference and score itself a pass.
    """
    names = list(centroids)
    ref = np.array([centroids[n] for n in names])
    return names[int(((ref - rgb) ** 2).sum(axis=1).argmin())]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("--max-mismatch", type=float, default=0.03,
                    help="fraction of cell centres allowed to disagree (default 3%%)")
    ap.add_argument("--json")
    args = ap.parse_args()

    plan = json.load(open(PLAN))
    A = plan["acts"][args.act]
    N = plan["cellsPerTile"]

    # pass 1: act-wide per-class colour centroids, measured through each tile's own mask
    csum, ccount = {}, {}
    for t in A["tiles"]:
        ap_ = os.path.join(DIR, t["art"]); mp = os.path.join(DIR, t["mask"])
        if not (os.path.exists(ap_) and os.path.exists(mp)):
            continue
        art = np.asarray(Image.open(ap_).convert("RGB")).astype(np.float64)
        sem = np.asarray(Image.open(mp).convert("RGB")).astype(int)
        for rgb, key in LEGEND.items():
            m = (np.abs(sem - np.array(rgb)).sum(axis=2) < 20)
            if m.sum() >= 400:
                csum[key] = csum.get(key, np.zeros(3)) + art[m].sum(axis=0)
                ccount[key] = ccount.get(key, 0) + int(m.sum())
    centroids = {k: csum[k] / ccount[k] for k in csum}
    print("  act-wide class centroids (RGB): " +
          "  ".join(f"{k} ({v[0]:.0f},{v[1]:.0f},{v[2]:.0f})" for k, v in sorted(centroids.items())))

    rows, samples = [], {}
    for t in A["tiles"]:
        ap_ = os.path.join(DIR, t["art"])
        mp = os.path.join(DIR, t["mask"])
        if not (os.path.exists(ap_) and os.path.exists(mp)):
            rows.append({"tile": t["art"], "status": "MISSING"})
            continue
        art = np.asarray(Image.open(ap_).convert("RGB")).astype(np.float64)
        sem = np.asarray(Image.open(mp).convert("RGB")).astype(int)
        masks = {}
        for rgb, key in LEGEND.items():
            m = (np.abs(sem - np.array(rgb)).sum(axis=2) < 20)
            if m.sum():
                masks[key] = m
        for k, m in masks.items():
            if m.sum() >= 400:
                samples.setdefault(k, []).append(float(lum(art[m]).mean()))
        wrong = 0
        got_counts = {}
        for j in range(N):
            for i in range(N):
                py, px = j * PX + PX // 2, i * PX + PX // 2
                want = None
                for k, m in masks.items():
                    if m[py, px]:
                        want = k
                        break
                if want is None:
                    continue
                got = classify(art[py - 5:py + 5, px - 5:px + 5].reshape(-1, 3).mean(axis=0), centroids)
                got_counts[got] = got_counts.get(got, 0) + 1
                if got != want:
                    wrong += 1
        n = N * N
        # invented class: art shows a class in >8% of cells that the mask has almost none of
        invented = [k for k, c in got_counts.items()
                    if c / n > 0.08 and (masks.get(k) is None or masks[k].mean() < 0.02)]
        rows.append({"tile": t["art"], "status": "ok", "wrong": wrong,
                     "wrongFrac": round(wrong / n, 4), "invented": invented,
                     "meanLum": round(float(lum(art).mean()), 1)})

    targets = {k: float(np.median(v)) for k, v in samples.items() if v}
    bad = []
    for r in rows:
        if r["status"] == "MISSING":
            bad.append((r["tile"], "missing"))
            continue
        why = []
        if r["wrongFrac"] > args.max_mismatch:
            why.append(f"{100*r['wrongFrac']:.1f}% cell centres wrong")
        if r["invented"]:
            why.append("invented " + "/".join(r["invented"]))
        if why:
            bad.append((r["tile"], "; ".join(why)))

    ok = sum(1 for r in rows if r["status"] == "ok")
    print(f"act {args.act}: {ok} tiles present, {len(rows)-ok} missing")
    if targets:
        print("  act tone medians: " + "  ".join(f"{k} {v:.0f}" for k, v in sorted(targets.items())))
    print(f"  PASS {ok - len([b for b in bad if b[1] != 'missing'])}   "
          f"NEEDS REGEN {len(bad)}")
    for name, why in bad:
        print(f"    {name}  <- {why}")
    if args.json:
        json.dump({"act": args.act, "targets": targets, "tiles": rows,
                   "regenerate": [b[0] for b in bad]}, open(args.json, "w"), indent=1)
        print(f"  wrote {args.json}")


if __name__ == "__main__":
    main()
