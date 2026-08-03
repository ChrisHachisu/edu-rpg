#!/usr/bin/env python3
"""Score a cut dungeon prop set against the palette gate in design/DUNGEON-ASSET-PROMPTS.md.

The 2026-07-31 sheet was accepted on a glance and the owner rejected it as "out of place". The
mismatch was measurable the whole time: prop stonework ran 13-19% saturation and WARM (blue at
62-83% of red) while the rock it stands on is 6-10% and COOL (blue at 112-124% of red). So the
check that matters is a palette comparison against the approved render, not a look.

    check_dungeon_assets.py                    # score every asset-*.png
    check_dungeon_assets.py --ref FLOOR.png    # re-derive the rock/floor bands from a render
"""
from __future__ import annotations

import argparse
import colorsys
import glob
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prov  # noqa: E402  (needs the path insert above)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "design/act1-dungeon-interiors/assets")
REFERENCE = os.path.join(ROOT, "design/act1-dungeon-interiors/sunkenCellar-f3-material.png")

# Bands are DERIVED from the reference render, never hardcoded.
#
# They were hardcoded once, from a 07-31 render, and then a material changed underneath it: the
# rock went from 6-10% saturation to 18.2% while the numbers in this file went on describing a
# surface that no longer existed. A threshold copied out of a measurement is a fact with an expiry
# date on it. So the reference is re-measured on every run, and it must be verifiably current.
SAT_HEADROOM = 1.3      # stone props may reach 1.3x the rock's own saturation, no further
# The four props the player must be able to find in a dark cave. Everything else is scenery and
# has to disappear into the rock.
SIGNAL = {"chest", "chestOpen", "save", "torch", "boss"}


def stats(path: str) -> dict:
    px = np.asarray(Image.open(path).convert("RGBA")).reshape(-1, 4)
    px = px[px[:, 3] > 200][:, :3].astype(np.float32) / 255.0
    if not len(px):
        return {}
    hls = np.array([colorsys.rgb_to_hls(*p) for p in px])
    return {
        "n": len(px),
        "sat": float(np.median(hls[:, 2]) * 100),
        "lum": float(np.median(hls[:, 1]) * 100),
        # Share of pixels that are vivid enough to read as a deliberate accent at gameplay size:
        # the red eyes, the brass clasp, the crystal, the flame.
        "accent": float((( hls[:, 2] > 0.45) & (hls[:, 1] > 0.15)).mean() * 100),
        # Warm/cool is the tell. Blue below red = warm = reads as a sticker on cool wet rock.
        "br": float(px[:, 2].sum() / max(px[:, 0].sum(), 1e-6) * 100),
    }


def bands(ref: str) -> dict:
    """Split the reference render on lightness: the dark half is rock, the light half is floor."""
    a = np.asarray(Image.open(ref).convert("RGB")).reshape(-1, 3).astype(np.float32)
    lum = a.mean(axis=1)
    out = {}
    for tag, mask in (("rock", lum < lum.mean()), ("floor", lum >= lum.mean())):
        s = a[mask] / 255.0
        hls = np.array([colorsys.rgb_to_hls(*p) for p in s[::797]])
        out[tag] = {"sat": float(np.median(hls[:, 2]) * 100),
                    "br": float(s[:, 2].sum() / max(s[:, 0].sum(), 1e-6) * 100)}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default=REFERENCE,
                    help="rendered floor the bands are derived from")
    ap.add_argument("--allow-stale", action="store_true")
    args = ap.parse_args()

    # Measuring props against a render that no longer reflects its materials is how the thresholds
    # went wrong in the first place. Refuse rather than quietly produce authoritative-looking
    # numbers from a stale surface.
    prov.require_fresh(args.ref, allow_stale=args.allow_stale)
    b = bands(args.ref)
    sat_ceiling = b["rock"]["sat"] * SAT_HEADROOM
    print(f"reference {os.path.relpath(args.ref, ROOT)}")
    print(f"  rock  sat {b['rock']['sat']:.1f}%  blue/red {b['rock']['br']:.0f}%")
    print(f"  floor sat {b['floor']['sat']:.1f}%  blue/red {b['floor']['br']:.0f}%")
    print(f"  -> stone props must be <= {sat_ceiling:.1f}% saturation and blue >= red\n")

    files = sorted(glob.glob(os.path.join(ASSETS, "asset-*.png")))
    if not files:
        raise SystemExit("no asset-*.png — run make_dungeon_assets.py first")

    print(f"{'prop':12} {'px':>6} {'sat%':>6} {'lum':>6} {'b/r%':>6} {'acc%':>6}  verdict")
    fails, notes = [], []
    for f in files:
        name = os.path.basename(f)[6:-4]
        s = stats(f)
        if not s:
            fails.append(f"{name}: EMPTY after keying")
            print(f"{name:12} {'--':>6} {'--':>6} {'--':>6} {'--':>6}  EMPTY")
            continue
        why = []
        if name in SIGNAL:
            # NO VERDICT ON SIGNAL PROPS — `acc%` is reported and judged by eye.
            #
            # There were two attempts at an automatic rule here and both were wrong. "Median
            # saturation >= 8%" failed the boss, whose near-neutral black smoke is the owner's
            # explicit design. Replacing it with "some pixels must be vivid" then failed both
            # chests, whose brass clasp is genuinely small. Two rules, every failure a false
            # positive.
            #
            # The premise was the mistake: these props are found by SILHOUETTE and VALUE against a
            # pale floor — a black smoke mass on bone-grey rock is among the most visible things
            # on the map — not by carrying saturated colour. A gate should encode a defect that
            # was actually OBSERVED. The observed defect was stone props reading warm and
            # saturated against cool rock, which is checked below. Findability was my assumption,
            # it never failed in the art, and a check whose every failure is a false positive
            # trains people to ignore the gate.
            pass
        else:
            if s["sat"] > sat_ceiling:
                why.append(f"sat {s['sat']:.0f}% > {sat_ceiling:.0f}%")
            if s["br"] < 100:
                why.append(f"warm (blue {s['br']:.0f}% of red, want >=100)")
            # Not a failure. A prop far flatter than its surroundings does not read as a sticker
            # the way a warm saturated one does — it just goes quiet. Worth an eye, not a block.
            if s["sat"] < b["floor"]["sat"] * 0.5:
                notes.append(f"{name}: much flatter than the surface "
                             f"({s['sat']:.0f}% vs floor {b['floor']['sat']:.0f}%)")
        fails += [f"{name}: {w}" for w in why]
        print(f"{name:12} {s['n']:6d} {s['sat']:6.1f} {s['lum']:6.1f} {s['br']:6.0f} "
              f"{s['accent']:6.1f}  "
              f"{'FAIL — ' + '; '.join(why) if why else 'ok'}")

    expected = {"mouth", "stairsUp", "stairsDown", "boss", "chest", "chestOpen", "save", "torch",
                "sign"}
    got = {os.path.basename(f)[6:-4] for f in files}
    if expected - got:
        fails.append(f"missing props: {sorted(expected - got)}")

    print()
    for n in notes:
        print(f"NOTE  {n}")
    if notes:
        print()
    if fails:
        print(f"GATE FAIL ({len(fails)})")
        for x in fails:
            print(f"  - {x}")
        raise SystemExit(1)
    print("GATE PASS — palette gate only; the boss silhouette and chest facing still need eyes")


if __name__ == "__main__":
    main()
