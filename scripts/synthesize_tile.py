#!/usr/bin/env python3
"""Synthesise a terrain tile LOCALLY by quilting patches out of already-generated art.

Why. Generating every tile through Codex cost 11 minutes and ~152k tokens each -- 7.3M tokens
for one act, 51% of the account's plan for a single incomplete pass. That does not scale to
266 tiles. But we already hold 93 megapixels of *approved* generated art for act 1, and the
terrain is highly repetitive: what actually varies between tiles is where the class boundaries
sit, not what grass or rock looks like.

So: harvest a patch library from the real art, keyed by the class pattern each patch covers,
then build any new tile from its semantic mask by picking patches whose class pattern matches
and quilting them together with minimum-error boundary cuts (Efros & Freeman image quilting).

This is NOT the flat mask-compositing that failed earlier in the project. That failed because
the donors were flat procedural fills and the masks were axis-aligned staircases. Here the
donors are real generated artwork including genuine class TRANSITIONS -- treelines, shorelines,
scree at a rock foot -- and the masks are the smoothed organic ones. A boundary patch is
harvested with its transition intact and re-used where a similar transition is needed.

Zero generation cost. Codex is then only needed for landmark sprites and any tile whose class
pattern has no match in the library.

Usage:
    synthesize_tile.py <act> --build-library          # scan generated art into a patch library
    synthesize_tile.py <act> --tile x,y [--out p.png] # synthesise one tile
    synthesize_tile.py <act> --missing                # synthesise every tile lacking art
    synthesize_tile.py <act> --selftest x,y           # rebuild a tile that ALREADY has art and
                                                      # compare, to prove the method honestly
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/art-tiles")
PLAN = os.path.join(DIR, "tile-plan.json")
LIB = os.path.join(DIR, "patch-library.npz")
LEGEND = {(226, 210, 156): 0, (26, 82, 46): 1, (128, 126, 122): 2, (30, 82, 170): 3}
NAMES = ["ground", "forest", "rock", "water"]
PATCH = 96          # px; 2 world cells -- big enough to carry real material, small enough to place
STEP = 48           # harvest stride
OVER = 24           # quilt overlap between neighbouring patches

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stitch_art_tiles import min_error_seam  # noqa: E402


def class_map(sem):
    """Semantic RGB -> class index array."""
    out = np.full(sem.shape[:2], -1, np.int8)
    for rgb, i in LEGEND.items():
        out[np.abs(sem - np.array(rgb)).sum(axis=2) < 20] = i
    return out


def signature(cm):
    """A patch's class pattern, coarsened to 4x4 blocks -- the key we match on."""
    h, w = cm.shape
    bh, bw = h // 4, w // 4
    sig = []
    for j in range(4):
        for i in range(4):
            blk = cm[j * bh:(j + 1) * bh, i * bw:(i + 1) * bw]
            vals, cnt = np.unique(blk[blk >= 0], return_counts=True)
            sig.append(int(vals[cnt.argmax()]) if len(vals) else -1)
    return np.array(sig, np.int8)


def build_library(act):
    """Harvest patches, TONE-NORMALISED per class.

    The first self-test reproduced forest and shoreline near-perfectly but left visible
    patchwork across open grass. The cause was tone, not texture: neighbouring donors came
    from tiles generated in different Codex calls with slightly different exposure, so a flat
    meadow ended up a quilt of subtly different greens. Correcting each patch's per-class mean
    to the act-wide centroid at harvest time removes the patchwork while leaving the material
    detail untouched.
    """
    plan = json.load(open(PLAN))
    # act-wide per-class colour centroid
    csum, ccnt = {}, {}
    for t in plan["acts"][act]["tiles"]:
        ap = os.path.join(DIR, t["art"]); mp = os.path.join(DIR, t["mask"])
        if not (os.path.exists(ap) and os.path.exists(mp)):
            continue
        art = np.asarray(Image.open(ap).convert("RGB")).astype(np.float64)
        cm = class_map(np.asarray(Image.open(mp).convert("RGB")).astype(int))
        for i in range(4):
            m = cm == i
            if m.sum() >= 400:
                csum[i] = csum.get(i, np.zeros(3)) + art[m].sum(axis=0)
                ccnt[i] = ccnt.get(i, 0) + int(m.sum())
    cen = {i: csum[i] / ccnt[i] for i in csum}
    print("  class centroids: " + "  ".join(
        f"{NAMES[i]} ({v[0]:.0f},{v[1]:.0f},{v[2]:.0f})" for i, v in sorted(cen.items())))

    pats, sigs = [], []
    for t in plan["acts"][act]["tiles"]:
        ap = os.path.join(DIR, t["art"])
        mp = os.path.join(DIR, t["mask"])
        if not (os.path.exists(ap) and os.path.exists(mp)):
            continue
        art = np.asarray(Image.open(ap).convert("RGB")).astype(np.float64)
        cm = class_map(np.asarray(Image.open(mp).convert("RGB")).astype(int))
        for y in range(0, art.shape[0] - PATCH + 1, STEP):
            for x in range(0, art.shape[1] - PATCH + 1, STEP):
                sub = cm[y:y + PATCH, x:x + PATCH]
                if (sub < 0).any():
                    continue
                pt = art[y:y + PATCH, x:x + PATCH].astype(np.float64)
                for i in range(4):
                    m = sub == i
                    if m.sum() < 200 or i not in cen:
                        continue
                    cur = pt[m].mean(axis=0)
                    gain = np.clip(cen[i] / np.maximum(cur, 1e-6), 0.75, 1.33)
                    pt[m] = np.clip(pt[m] * gain, 0, 255)
                pats.append(pt.astype(np.uint8))
                sigs.append(signature(sub))
    if not pats:
        raise SystemExit("no generated art to harvest -- generate some tiles first")
    np.savez_compressed(LIB, patches=np.array(pats, np.uint8), sigs=np.array(sigs, np.int8))
    print(f"library: {len(pats)} patches of {PATCH}x{PATCH}px from act {act}")
    uniq = len(set(map(tuple, sigs)))
    print(f"  {uniq} distinct class patterns covered")
    return np.array(pats, np.uint8), np.array(sigs, np.int8)


def load_library():
    if not os.path.exists(LIB):
        raise SystemExit("no patch library -- run --build-library first")
    z = np.load(LIB)
    return z["patches"], z["sigs"]


def synth(cm, patches, sigs, rng):
    """Quilt a tile from its class map."""
    H, W = cm.shape
    out = np.zeros((H, W, 3), np.float64)
    filled = np.zeros((H, W), bool)
    stride = PATCH - OVER
    for y in range(0, H, stride):
        for x in range(0, W, stride):
            y = min(y, H - PATCH)
            x = min(x, W - PATCH)
            want = signature(cm[y:y + PATCH, x:x + PATCH])
            d = (sigs != want).sum(axis=1)
            best = np.flatnonzero(d == d.min())
            pick = patches[best[rng.integers(len(best))]].astype(np.float64)
            reg = filled[y:y + PATCH, x:x + PATCH]
            if not reg.any():
                out[y:y + PATCH, x:x + PATCH] = pick
            else:
                cur = out[y:y + PATCH, x:x + PATCH]
                take = ~reg
                lw = int(reg[:, :OVER].any(axis=0).sum())
                if lw > 2:
                    keep = min_error_seam(cur[:, :lw], pick[:, :lw], axis=1)
                    take[:, :lw] |= (~keep) & reg[:, :lw]
                th = int(reg[:OVER, :].any(axis=1).sum())
                if th > 2:
                    keep = min_error_seam(cur[:th], pick[:th], axis=0)
                    take[:th] |= (~keep) & reg[:th]
                a = take.astype(np.float64)
                out[y:y + PATCH, x:x + PATCH] = cur * (1 - a[..., None]) + pick * a[..., None]
            filled[y:y + PATCH, x:x + PATCH] = True
    return np.clip(out, 0, 255).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("act")
    ap.add_argument("--build-library", action="store_true")
    ap.add_argument("--tile")
    ap.add_argument("--missing", action="store_true")
    ap.add_argument("--selftest")
    ap.add_argument("--out")
    args = ap.parse_args()

    if args.build_library:
        build_library(args.act)
        return

    patches, sigs = load_library()
    plan = json.load(open(PLAN))
    rng = np.random.default_rng(42)
    todo = []
    if args.tile or args.selftest:
        spec = args.tile or args.selftest
        tx, ty = (int(v) for v in spec.split(","))
        todo = [t for t in plan["acts"][args.act]["tiles"] if t["worldTopLeft"] == [tx, ty]]
    elif args.missing:
        todo = [t for t in plan["acts"][args.act]["tiles"]
                if not os.path.exists(os.path.join(DIR, t["art"]))]
    if not todo:
        raise SystemExit("nothing to do")

    for t in todo:
        mp = os.path.join(DIR, t["mask"])
        if not os.path.exists(mp):
            print(f"  skip {t['art']}: no mask")
            continue
        cm = class_map(np.asarray(Image.open(mp).convert("RGB")).astype(int))
        img = synth(cm, patches, sigs, rng)
        if args.selftest:
            real = np.asarray(Image.open(os.path.join(DIR, t["art"])).convert("RGB"))
            d = np.abs(img.astype(float) - real.astype(float)).mean()
            out = args.out or "/tmp/selftest.png"
            side = np.concatenate([real, np.full((real.shape[0], 8, 3), 30, np.uint8), img], 1)
            Image.fromarray(side).save(out)
            print(f"selftest {t['art']}: mean |synth-real| {d:.1f}/255   side-by-side -> {out}")
        else:
            out = args.out or os.path.join(DIR, t["art"])
            Image.fromarray(img).save(out)
            print(f"  synthesised {os.path.basename(out)}")


if __name__ == "__main__":
    main()
