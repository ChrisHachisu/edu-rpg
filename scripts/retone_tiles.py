#!/usr/bin/env python3
"""RETIRED 2026-07-31. Per-tile tone correction is the thing that broke this map. Do not use.

Tone is now corrected ONCE, globally, on the ONE stitched map: `scripts/grade_act_map.py`.

Why this script must not run again: it corrects each tile against a per-class target, so two
neighbours get two different gains. Their shared 144px band -- byte-identical by construction
via prime_tile_base.py --lock -- is pulled apart by that difference, and the step lands 144px
inside each tile as a visible rectangle. It was also run once with --apply and NO BACKUP, which
is how the original tile tones were lost permanently. A global gain on the finished map cannot
do either thing, because a constant gain preserves byte-identical pixels.

`--apply` is now hard-disabled. The dry-run path is left intact for measurement only.

--- original rationale, kept for the record ---

Correct a tile's per-class tone toward the owner-approved level. No generation.

The primed run produced structurally good, seam-perfect tiles that came out uniformly too
dark -- open grass at 53 against the 71-80 of art the owner accepted, i.e. the same level as
a batch they had already rejected. The cause was a missing tone anchor in the prompt, not a
rendering failure, so the pixels are fine; only the exposure is wrong.

That is a deterministic fix. For each terrain class, the semantic mask says exactly which
pixels belong to it, so each class can be scaled independently toward its target. Doing it
per class rather than globally matters: a tile that is 40% water would be dragged the wrong
way by a whole-image correction, and water and grass need different amounts.

Gain is applied in linear-ish space with a soft shoulder so highlights roll off instead of
clipping to white, and is clamped, because a large gain amplifies noise and cannot invent
detail that was rendered dark.

    retone_tiles.py --tiles x,y [x,y ...] [--act 1] [--suffix -retoned] [--apply]

Without --apply it writes alongside the original for comparison; with --apply it overwrites,
after which seams must be re-locked (prime_tile_base.py --lock) since neighbours shift too.
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/art-tiles")
LEGEND = {(226, 210, 156): "ground", (26, 82, 46): "forest",
          (128, 126, 122): "rock", (30, 82, 170): "water"}
MAX_GAIN = 2.10
SHOULDER = 210.0     # above this, gain rolls off so highlights do not clip flat


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def retone(art, sem, targets):
    out = art.copy()
    report = {}
    for rgb, key in LEGEND.items():
        if key not in targets:
            continue
        m = (np.abs(sem - np.array(rgb)).sum(axis=2) < 20)
        if m.sum() < 2000:
            continue
        cur = float(lum(art[m]).mean())
        if cur < 1e-6:
            continue
        gain = float(np.clip(targets[key] / cur, 1.0 / MAX_GAIN, MAX_GAIN))
        px = art[m]
        # soft shoulder: full gain in the shadows/midtones, easing off near white
        t = np.clip((lum(px) - SHOULDER) / (255.0 - SHOULDER), 0, 1)[:, None]
        eff = gain * (1 - t) + 1.0 * t
        out[m] = np.clip(px * eff, 0, 255)
        report[key] = (cur, float(lum(out[m]).mean()), gain)
    return out, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiles", nargs="+", required=True)
    ap.add_argument("--act", default="1")
    ap.add_argument("--targets", default="/tmp/tone-targets.json")
    ap.add_argument("--suffix", default="-retoned")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if args.apply:
        raise SystemExit(
            "retone_tiles.py --apply is RETIRED and hard-disabled (2026-07-31).\n"
            "Per-tile gains pull the byte-identical locked seam bands apart and the last\n"
            "--apply run overwrote every tile with no backup. Grade the stitched map instead:\n"
            "    scripts/grade_act_map.py 1")
    targets = json.load(open(args.targets))

    for spec in args.tiles:
        x, y = spec.split(",")
        ap_ = os.path.join(DIR, f"act{args.act}-tile-{x}-{y}-ART.png")
        mp = os.path.join(DIR, f"act{args.act}-tile-{x}-{y}-semantic-smooth-26.png")
        if not (os.path.exists(ap_) and os.path.exists(mp)):
            print(f"  skip {spec}: missing art or mask")
            continue
        art = np.asarray(Image.open(ap_).convert("RGB")).astype(np.float64)
        sem = np.asarray(Image.open(mp).convert("RGB")).astype(int)
        out, rep = retone(art, sem, targets)
        dst = ap_ if args.apply else ap_.replace("-ART.png", f"{args.suffix}.png")
        Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst)
        detail = "  ".join(f"{k} {a:.0f}->{b:.0f} (x{g:.2f})" for k, (a, b, g) in sorted(rep.items()))
        print(f"  {spec}: {detail}")
        clipped = 100.0 * float((out.max(axis=2) >= 254).mean())
        if clipped > 1.0:
            print(f"     note: {clipped:.1f}% of pixels near white -- gain may be flattening highlights")


if __name__ == "__main__":
    main()
