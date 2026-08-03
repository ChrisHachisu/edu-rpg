#!/usr/bin/env python3
"""ONE global colour grade on a town screen, to remove the yellow/olive cast.

Why this exists
---------------
The Port Sapphire generations come back blue-starved on every land surface. Measured on v4
(`design/act1-towns/portSapphire-screen.png`), blue as a percentage of red:

    cobbled square  (180, 167,  65)   36 %      paved stone wants 85-95 %
    dirt lane       (185, 176,  59)   32 %
    stone wall      ( 80,  73,  28)   36 %
    grass border    (116, 145,  10)    8 %
    overworld       ( 68,  78,  40)   59 %      the settled reference

That is not a green cast and it is not a brightness problem -- the luminance is already on
target. It is one channel missing, and the fix is a channel grade, not a regeneration. Tone is
the one thing image generation is least reliable at; a measured grade is repeatable.

The method is `scripts/grade_act_map.py`'s, with one substitution
--------------------------------------------------------------
That script grades the act map against an authored semantic mask. A town painting has no such
mask -- the walkable geometry is DERIVED from the painting, never fed into it -- so the mask is
derived here too, from the painting's own colour, at 1/4 resolution.

Everything downstream is identical in kind, and identical for the same reason:

  * ONE gain per class for the whole image, never per-region. A per-region gain is what made the
    act map read as patchwork: two neighbours get two different gains and the boundary between
    them becomes an edge the artwork never drew.
  * Class edges are FEATHERED (`--sigma`, in mask pixels) so a shoreline or a roof line grades
    across the soft band the painting already has instead of getting a hard cut through it.
  * The gain field is built at mask resolution and upsampled, which is exact enough because it is
    smooth by construction.
  * Highlights roll off through a soft shoulder rather than clipping flat.

Classes, and why these five
---------------------------
Three classes are not enough for a town. Terracotta and paved stone both sit in the "not water,
not vegetation" bucket but want very different amounts of blue -- pushing a roof to stone's 88 %
turns it into grey slate. So the land is split by warmth (R/G), and anything already cool is
excluded from the grade entirely:

    water       B dominant and R low            untouched -- already correct
    vegetation  G > R, blue near zero           gentle lift; the owner approved the greens
    cool        B >= R already (slate, shadow)  untouched -- nothing to restore
    warm        R/G above `--warm-split`        terracotta, timber, thatch: partial lift
    ground      the rest                        cobble, dirt, plaster, stone: full lift

Each class is graded to a target BLUE-TO-RED RATIO, not to an absolute colour, so the material
variation the painting already has inside a class survives. Red and green are then trimmed by a
single common factor so the class lands back on the luminance it started at: the owner approved
this artwork's brightness, and the cast has to come out without touching it.

Usage:
    grade_town_screen.py <in.png> <out.png> [--sigma 4] [--report r.json]
                         [--ground-br 0.88] [--warm-br 0.42] [--veg-br 0.22]
"""
from __future__ import annotations

import argparse
import json

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None

MASK_DIV = 4          # mask resolution = image / MASK_DIV
SHOULDER = 214.0      # highlights compress instead of clipping flat
MAX_GAIN = 3.2
CLASSES = ("water", "vegetation", "cool", "warm", "ground")


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def classify(small: np.ndarray, warm_split: float) -> dict:
    """Derive the semantic mask from the painting itself. Order matters: each test only sees
    what the ones above it did not claim."""
    r, g, b = small[..., 0], small[..., 1], small[..., 2]
    rs, gs = np.maximum(r, 1.0), np.maximum(g, 1.0)

    water = (b > rs * 1.5) & (b > gs * 1.05) & (r < 95)
    veg = ~water & (g > rs * 1.10) & (b < gs * 0.55)
    cool = ~water & ~veg & (b >= rs * 0.80)
    warm = ~water & ~veg & ~cool & (r > gs * warm_split)
    ground = ~water & ~veg & ~cool & ~warm
    return {"water": water, "vegetation": veg, "cool": cool, "warm": warm, "ground": ground}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--sigma", type=float, default=4.0,
                    help="class-edge feather, in MASK pixels (mask is 1/4 scale)")
    ap.add_argument("--ground-br", type=float, default=0.88,
                    help="target blue/red for cobble, dirt, plaster, stone. Owner picked 0.88 "
                         "on 2026-08-01 from a rendered A/B against a warmer 0.80: neutral grey "
                         "stone, inside the 85-95%% band the handoff quotes for paved stone.")
    ap.add_argument("--warm-br", type=float, default=0.42,
                    help="target blue/red for terracotta, timber, thatch")
    ap.add_argument("--veg-br", type=float, default=0.22,
                    help="target blue/red for grass and canopy (0 disables)")
    ap.add_argument("--warm-split", type=float, default=1.14,
                    help="R/G above this is 'warm' rather than 'ground'")
    ap.add_argument("--max-bg", type=float, default=0.86,
                    help="ceiling on per-pixel blue/green within a class, at the 75th "
                         "percentile. This is what stops a reachable-looking blue/red target "
                         "from turning stone lilac, and it binds before --ground-br does on any "
                         "frame that was not badly blue-starved to begin with. Swept on v5: "
                         "1.00 is clearly lilac, 0.92 is cool, 0.86 is clean neutral stone. "
                         "Raise it only for a surface genuinely meant to be blue.")
    ap.add_argument("--report")
    args = ap.parse_args()

    target_br = {"ground": args.ground_br, "warm": args.warm_br,
                 "vegetation": args.veg_br, "water": 0.0, "cool": 0.0}

    img = Image.open(args.src).convert("RGB")
    W, H = img.size
    mw, mh = W // MASK_DIV, H // MASK_DIV
    arr = np.asarray(img)
    small = np.asarray(img.resize((mw, mh), Image.BOX)).astype(np.float32)
    masks = classify(small, args.warm_split)
    print(f"image {W}x{H}   mask {mw}x{mh}   sigma {args.sigma} mask-px")

    # ---- per-class gains: hit the target blue/red, hold the class's own luminance ------------
    gains, report = {}, {}
    for key in CLASSES:
        m = masks[key]
        cov = float(m.mean() * 100)
        if m.sum() < 2000 or target_br[key] <= 0:
            gains[key] = np.ones(3, np.float32)
            report[key] = {"coveragePct": round(cov, 1), "gain": [1.0, 1.0, 1.0],
                           "note": "untouched"}
            print(f"  {key:<11} {cov:5.1f}%  untouched")
            continue
        px = small[m]
        mean = px.mean(axis=0)
        L0 = float(lum(px).mean())
        gb = (target_br[key] * mean[0]) / max(float(mean[2]), 1e-6)
        gb = float(np.clip(gb, 1.0, MAX_GAIN))

        # ---- the violet guard, and it is not optional ----------------------------------------
        # A blue/red ratio does not pin down a hue on its own. Warm stone needs blue to sit
        # BELOW green; the moment blue crosses green while red stays high, the surface reads
        # magenta. Measured on v5: bright paving is (157, 144, 103) -- blue 41 under green, a
        # correct warm stone. Driving it to B/R 0.88 puts blue at 154, now 14 OVER green with
        # red at 153, and the whole square goes lilac.
        #
        # Whether a target is reachable therefore depends on the class's own red-to-green
        # spread, which differs per generation: v4's ground sat at R/G 1.06 and reached 0.88
        # while staying warm; v5's sits at 1.06 but with far more blue already present, so the
        # same target overshoots. So clamp the gain by what the pixels allow rather than
        # trusting the requested number.
        #
        # The clamp is a percentile of the PER-PIXEL blue-over-green ratio, not a ratio of two
        # separately-taken percentiles: those come from different pixels and report headroom no
        # actual pixel has. And it is the 75th, not the mean -- the mean is dragged down by
        # shadow, while the lit paving is most of what the eye sees.
        bg = px[:, 2] / np.maximum(px[:, 1], 1e-6)
        q75 = float(np.percentile(bg, 75))
        gb_max = args.max_bg / max(q75, 1e-6)
        if gb > gb_max:
            report_clamp = (round(gb, 3), round(gb_max, 3))
            gb = float(max(1.0, gb_max))
        else:
            report_clamp = None
        # trim R and G by one common factor so luminance comes back to where it was
        num = L0 - 0.0722 * mean[2] * gb
        den = 0.2126 * mean[0] + 0.7152 * mean[1]
        k = float(np.clip(num / max(den, 1e-6), 0.55, 1.0))
        g = np.array([k, k, gb], np.float32)
        gains[key] = g
        after = mean * g
        report[key] = {"coveragePct": round(cov, 1),
                       "currentRGB": [round(float(v), 1) for v in mean],
                       "currentBR": round(float(mean[2] / max(mean[0], 1e-6)), 3),
                       "targetBR": target_br[key], "currentLum": round(L0, 1),
                       "gain": [round(float(v), 3) for v in g],
                       "predictedRGB": [round(float(v), 1) for v in after],
                       "predictedLum": round(float(lum(after)), 1)}
        note = ""
        if report_clamp:
            report[key]["violetClamp"] = {"requestedGain": report_clamp[0],
                                          "allowedGain": report_clamp[1],
                                          "maxBG": args.max_bg,
                                          "reachedBR": round(float(after[2] / max(after[0], 1e-6)), 3)}
            note = (f"   CLAMPED {report_clamp[0]:.2f}->{report_clamp[1]:.2f} "
                    f"(B/R {after[2]/max(after[0],1e-6):.2f}, not {target_br[key]:.2f}; "
                    f"blue would have crossed green)")
        print(f"  {key:<11} {cov:5.1f}%  ({mean[0]:5.1f},{mean[1]:5.1f},{mean[2]:5.1f})"
              f"  B/R {mean[2]/max(mean[0],1e-6):5.2f} -> {target_br[key]:.2f}"
              f"   gain {np.round(g, 3)}  L{L0:5.1f}{note}")

    # ---- feathered gain field at mask resolution --------------------------------------------
    # Weights come only from the derived mask, so identical neighbourhoods get identical gains
    # anywhere in the image. That is what keeps this from becoming a per-region correction.
    blur = ImageFilter.GaussianBlur(args.sigma)
    wsum = np.zeros((mh, mw), np.float32)
    acc = np.zeros((mh, mw, 3), np.float32)
    for key in CLASSES:
        w = np.asarray(Image.fromarray((masks[key] * 255).astype(np.uint8)).filter(blur),
                       dtype=np.float32) / 255.0
        wsum += w
        acc += w[..., None] * gains[key][None, None, :]
    field = acc / np.maximum(wsum, 1e-6)[..., None]

    # ---- apply, one channel at a time --------------------------------------------------------
    out = np.empty_like(arr)
    for c in range(3):
        gch = np.asarray(Image.fromarray(field[..., c], mode="F").resize((W, H), Image.BILINEAR),
                         dtype=np.float32)
        v = arr[..., c].astype(np.float32) * gch
        hi = v > SHOULDER
        v[hi] = SHOULDER + (255.0 - SHOULDER) * (
            1.0 - np.exp(-(v[hi] - SHOULDER) / (255.0 - SHOULDER)))
        out[..., c] = np.clip(v, 0, 255).astype(np.uint8)
        del gch, v
    res = Image.fromarray(out)
    res.save(args.dst)

    # ---- verify ------------------------------------------------------------------------------
    chk = np.asarray(res.resize((mw, mh), Image.BOX)).astype(np.float32)
    print(f"wrote {args.dst}  {W}x{H}")
    print("  after grade:")
    for key in CLASSES:
        m = masks[key]
        if m.sum() < 2000:
            continue
        gm = chk[m].mean(axis=0)
        report[key]["gradedRGB"] = [round(float(v), 1) for v in gm]
        report[key]["gradedBR"] = round(float(gm[2] / max(gm[0], 1e-6)), 3)
        report[key]["gradedLum"] = round(float(lum(chk[m]).mean()), 1)
        print(f"    {key:<11} ({gm[0]:5.1f},{gm[1]:5.1f},{gm[2]:5.1f})"
              f"  B/R {gm[2]/max(gm[0],1e-6):5.2f}  L{lum(chk[m]).mean():5.1f}")
    whole_before = np.asarray(small).reshape(-1, 3).mean(0)
    whole_after = chk.reshape(-1, 3).mean(0)
    print(f"  whole image  ({whole_before[0]:5.1f},{whole_before[1]:5.1f},{whole_before[2]:5.1f})"
          f" L{lum(whole_before):5.1f}  ->  "
          f"({whole_after[0]:5.1f},{whole_after[1]:5.1f},{whole_after[2]:5.1f})"
          f" L{lum(whole_after):5.1f}")
    if args.report:
        json.dump({"src": args.src, "dst": args.dst, "sigma": args.sigma,
                   "targetBR": target_br, "warmSplit": args.warm_split,
                   "wholeBefore": [round(float(v), 1) for v in whole_before],
                   "wholeAfter": [round(float(v), 1) for v in whole_after],
                   "classes": report}, open(args.report, "w"), indent=1)
        print(f"  report: {args.report}")


if __name__ == "__main__":
    main()
