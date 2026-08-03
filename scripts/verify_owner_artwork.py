#!/usr/bin/env python3
"""Verify an act's finished artwork against the OWNER-PAINTED terrain, cell by cell.

The hard rule from CODEX-ART-BRIEF.md: a cell that is sand (open ground) in the semantic
map must read as WALKABLE in the artwork, and a cell that is green/grey/blue must NOT.

Ground truth is rebuilt from owner-terrain.json + the land mask -- the same two inputs
build_owner_semantic_maps.py renders the semantic PNG from -- so the annotation discs
stamped on top of that PNG cannot contaminate the comparison.

Usage:
    verify_owner_artwork.py <act> [--artwork PATH] [--report-only] [--diff PATH]
"""
from __future__ import annotations

import argparse
import colorsys
import json
import os
from collections import Counter, defaultdict

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain")
SRC = os.path.join(DIR, "owner-terrain.json")
PACK = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent/continent-macro-g3")
PX = 16
PATCH = 10  # sampled square at each cell centre

# truth role per terrain char; sea is forced for any non-land cell
WALKABLE_ROLES = {"ground", "path"}
ROLE_OF = {".": "ground", "F": "vegetation", "M": "rock", "W": "water", "R": "path"}


def classify(r: float, g: float, b: float) -> str:
    """Classify an artwork sample into what a player would read it as."""
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    hue = h * 360.0
    if 180.0 <= hue <= 265.0 and s >= 0.22:
        return "water"
    if 60.0 <= hue < 180.0 and s >= 0.20 and v <= 0.44:
        return "vegetation"
    if s < 0.16 and v <= 0.80:
        return "rock"
    return "ground"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("--artwork")
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--diff")
    args = ap.parse_args()

    act = args.act
    artwork = args.artwork or os.path.join(DIR, f"act{act}-artwork.png")
    if not os.path.exists(artwork):
        raise SystemExit(f"MISSING artwork: {artwork}")

    data = json.load(open(SRC))
    A = data["acts"][act]
    x0, y0, x1, y1 = A["bounds"]
    rows = A["terrainRows"]
    w, h = x1 - x0 + 1, y1 - y0 + 1
    land = np.load(os.path.join(PACK, "land-mask.npy"))

    img = Image.open(artwork).convert("RGB")
    if img.size != (w * PX, h * PX):
        raise SystemExit(f"SIZE MISMATCH: artwork {img.size} != expected {(w*PX, h*PX)}")
    arr = np.asarray(img).astype(np.float64)

    half = PATCH // 2
    truth = np.empty((h, w), dtype=object)
    read = np.empty((h, w), dtype=object)
    samples = defaultdict(list)

    for yy in range(h):
        for xx in range(w):
            role = "water" if not land[y0 + yy, x0 + xx] else ROLE_OF[rows[yy][xx]]
            cy, cx = yy * PX + PX // 2, xx * PX + PX // 2
            patch = arr[cy - half:cy + half, cx - half:cx + half]
            r, g, b = patch.reshape(-1, 3).mean(axis=0)
            truth[yy, xx] = role
            read[yy, xx] = classify(r, g, b)
            samples[role].append((r, g, b))

    print(f"=== act {act} :: {os.path.relpath(artwork, ROOT)} ===")
    print(f"grid {w}x{h} = {w*h} cells, {PX} px/cell, image {img.size[0]}x{img.size[1]}\n")

    print("--- what the artwork actually looks like per owner-painted class ---")
    print(f"{'truth role':<12} {'cells':>7}  mean RGB           mean HSV(h,s,v)")
    for role in sorted(samples):
        a = np.array(samples[role])
        m = a.mean(axis=0)
        hh, ss, vv = colorsys.rgb_to_hsv(m[0] / 255, m[1] / 255, m[2] / 255)
        print(f"{role:<12} {len(a):>7}  ({m[0]:5.1f},{m[1]:5.1f},{m[2]:5.1f})   "
              f"({hh*360:5.1f}, {ss:.2f}, {vv:.2f})")

    print("\n--- confusion: owner-painted class -> what the artwork reads as ---")
    conf = Counter((truth[yy, xx], read[yy, xx]) for yy in range(h) for xx in range(w))
    for role in sorted(samples):
        tot = len(samples[role])
        got = {r2: n for (t, r2), n in conf.items() if t == role}
        line = "  ".join(f"{k} {v} ({100*v/tot:.1f}%)" for k, v in
                         sorted(got.items(), key=lambda kv: -kv[1]))
        print(f"{role:<12} -> {line}")

    if args.report_only:
        return

    # THE HARD RULE, as a binary: walkable vs not.
    bad_open = []      # owner says walkable, artwork reads blocked
    bad_blocked = []   # owner says blocked, artwork reads walkable
    for yy in range(h):
        for xx in range(w):
            tw = truth[yy, xx] in WALKABLE_ROLES
            rw = read[yy, xx] in WALKABLE_ROLES
            if tw and not rw:
                bad_open.append((xx, yy, truth[yy, xx], read[yy, xx]))
            elif not tw and rw:
                bad_blocked.append((xx, yy, truth[yy, xx], read[yy, xx]))

    total = len(bad_open) + len(bad_blocked)
    n_open = sum(1 for yy in range(h) for xx in range(w) if truth[yy, xx] in WALKABLE_ROLES)
    n_blocked = w * h - n_open
    print(f"\n--- THE HARD RULE ---")
    print(f"open ground reading as blocked : {len(bad_open):>6} / {n_open} "
          f"({100*len(bad_open)/max(n_open,1):.2f}%)")
    print(f"blocked reading as walkable    : {len(bad_blocked):>6} / {n_blocked} "
          f"({100*len(bad_blocked)/max(n_blocked,1):.2f}%)")
    print(f"TOTAL MISMATCHES               : {total:>6} / {w*h} "
          f"({100*total/(w*h):.2f}%)")

    if total:
        print("\n--- where the mismatches cluster (8x8-cell blocks, world coords) ---")
        blocks = Counter()
        for xx, yy, t, r2 in bad_open + bad_blocked:
            blocks[(x0 + (xx // 8) * 8, y0 + (yy // 8) * 8)] += 1
        for (bx, by), n in blocks.most_common(15):
            print(f"  block x{bx}-{bx+7} y{by}-{by+7}: {n} mismatched cells")
        print(f"  ({len(blocks)} blocks affected of {((w+7)//8)*((h+7)//8)})")

        print("\n--- mismatch kinds ---")
        for (t, r2), n in Counter((t, r2) for _, _, t, r2 in
                                  bad_open + bad_blocked).most_common():
            print(f"  owner {t:<11} -> artwork reads {r2:<11} : {n}")

    if args.diff:
        d = np.asarray(img).copy()
        for xx, yy, _, _ in bad_open:
            d[yy*PX:(yy+1)*PX, xx*PX:(xx+1)*PX] = (255, 0, 0)      # should be walkable
        for xx, yy, _, _ in bad_blocked:
            d[yy*PX:(yy+1)*PX, xx*PX:(xx+1)*PX] = (255, 255, 0)    # should be blocked
        Image.fromarray(d).save(args.diff)
        print(f"\ndiff written: {args.diff}  (red = open read as blocked, "
              f"yellow = blocked read as walkable)")

    print("\nVERDICT: " + ("PASS" if total == 0 else f"FAIL — {total} mismatches"))


if __name__ == "__main__":
    main()
