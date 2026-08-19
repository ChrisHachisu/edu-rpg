#!/usr/bin/env python3
"""Where each Act 1 art family's detail actually comes from, and what limits it.

WHY THIS EXISTS
    Asked whether the town's resolution fix could be applied to the overworld and the dungeons. The
    answer for both is no, for two DIFFERENT reasons, and neither is visible without measuring.

    The town fix is one rule: DRAW AT MORE SOURCE PIXELS PER WORLD PIXEL THAN YOU SHIP, THEN
    DOWNSCALE. Measured on one generation: 20.64 mean pixel step native, 13.97 upscaled to 1950,
    25.67 downscaled to 650. Downscaling sharpens; upscaling destroys. The 2x2 tiling is only the
    workaround for a generator that always returns 1254 px -- it is not the principle.

DUNGEONS: ALREADY DONE, AND MY FIRST MEASUREMENT OF THEM WAS WRONG
    `render_dungeon_material_map.py` carries `LATTICE_SCALE = 57/32 = 1.78125`, within 0.195% of the
    heroine's own grain (a 64 px frame drawn at 36 world px = 1.7778), and its header says why:
    rendering straight at 1 px per world px "is COARSER than the hero and is why the dungeon art
    looked like it came from a different game."

    Measured whole-plate, dungeons look terrible -- 8..16 mean. That is an ARTEFACT OF DARKNESS, not
    softness: the plates are 45..52% near-black wall at mean luminance 28..37, and a dark region
    cannot carry a large luminance step. Measured on the LIT WALKABLE FLOOR, which is what the player
    looks at, they hold up against the town's accepted 22.17/29.7%:
        mistyGrotto  42.37 / 58.7%      coastalReef  18.91 / 27.6%      sunkenCellar  16.61 / 21.6%
    Compare any plate to a walk mask before calling it soft.

OVERWORLD: THE CEILING IS THE MATERIAL, NOT THE RENDERER OR THE CHUNK
    `render_material_map.py` has no lattice scale at all and the manifest locks
    `worldSourcePixelsPerWorldPixel: 1`, so on the face of it the overworld is the one family that
    never got the fix. But raising the chunk density would make it WORSE, and this is arithmetic:

    `sample()` is `mat[wy % 531, wx % 531]` -- NEAREST NEIGHBOUR, one material texel per world pixel.
    A 531 px material covers ~11 cells = 528 world px. So the material is already applied at 1:1 and
    the chunk is already at the material's ceiling; measured, chunk `c3-r3` (19.79 / 28.5%) carries
    slightly MORE than `mat-grass` itself (18.27 / 25.0%), because the renderer adds its own noise
    modulation and coast work on top.

    Baking chunks at 1.78x with today's materials therefore magnifies a 531 px texture. Measured on
    mat-grass: 18.27/25.0% -> 10.95/10.3% magnified. That is the same 20.64 -> 13.97 the town rule
    already forbids, and it costs 3.2x the texture memory to get it.

    THE REAL LEVER IS THE MATERIAL, AND IT IS CHEAP. Regenerate the four textures at ~945 px covering
    the SAME ~11 cells, so the ratio becomes 1.78 and matches the hero and the dungeons. The chunks
    STAY 768 px -- the renderer then reduces 1.78 -> 1.0 on the way in, which is the sharpening half
    of the rule -- so texture memory does not move at all. Four generations, not four hundred and
    eighty, and no change to a chunk, a pin or the streaming budget.

    Do NOT "fix" mat-water this way. It measures 4.18 / 2.0% flat on purpose; the renderer's own
    header explains the swell is deliberately regular so the 531 px repeat reads as a net at
    gameplay zoom rather than as tiling.

USAGE
    python3 scripts/measure_art_density.py
"""
from __future__ import annotations

import glob
import os

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lum(a: np.ndarray) -> np.ndarray:
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def steps(path: str, mask_path: str | None = None):
    """Mean/hard/flat pixel-step statistics, optionally restricted to a mask.

    Steps are counted only where BOTH pixels of the pair are inside the mask -- otherwise every
    boundary between masked and unmasked ground contributes a fake edge and a dark plate scores as
    though it were full of detail.
    """
    a = np.asarray(Image.open(os.path.join(ROOT, path)).convert("RGB")).astype(float)
    l = lum(a)
    if mask_path:
        m = np.asarray(Image.open(os.path.join(ROOT, mask_path)).convert("L")) > 127
        m = m[:l.shape[0], :l.shape[1]]
    else:
        m = np.ones(l.shape, bool)
    hs, hm = np.abs(np.diff(l, axis=1)), m[:, :-1] & m[:, 1:]
    vs, vm = np.abs(np.diff(l, axis=0)), m[:-1, :] & m[1:, :]
    s = np.concatenate([hs[hm].ravel(), vs[vm].ravel()])
    return l.shape[1], l.shape[0], s.mean(), 100 * (s >= 24).mean(), 100 * (s < 4).mean(), l[m].mean()


def row(label: str, path: str, mask: str | None = None) -> None:
    w, h, mean, hard, flat, li = steps(path, mask)
    print(f"  {label:<40} {w}x{h:<10} {mean:6.2f} {hard:7.1f}% {flat:7.1f}% {li:7.1f}")


def main() -> None:
    print(f"  {'artefact':<40} {'size':<14} {'mean':>6} {'hard>=24':>8} {'flat<4':>8} {'lum':>7}")
    print("  -- the bar: the town plate the owner accepted " + "-" * 34)
    row("TOWN portSapphire plate", "public/act1-hifi/town/portSapphire-screen.png")

    print("  -- dungeons: whole plate vs the LIT FLOOR the player looks at " + "-" * 18)
    for d in ("coastalReef", "mistyGrotto", "sunkenCellar"):
        row(f"{d} whole plate", f"public/act1-dungeon-art/{d}-f1-props.png")
        row(f"{d} walkable floor", f"public/act1-dungeon-art/{d}-f1-props.png",
            f"public/act1-dungeon-art/{d}-f1-walk.png")

    print("  -- overworld: the chunk is already at the material's ceiling " + "-" * 19)
    for m in ("grass", "rock", "forest", "water"):
        row(f"MATERIAL mat-{m}", f"public/materials/mat-{m}.png")
    for c in sorted(glob.glob(os.path.join(ROOT, "public/act1-hifi/chunks/base/*.webp")))[40:43]:
        row("CHUNK base " + os.path.basename(c), os.path.relpath(c, ROOT))

    print("  -- and what a denser CHUNK would actually do to a 531px material " + "-" * 14)
    g = Image.open(os.path.join(ROOT, "public/materials/mat-grass.png")).convert("RGB")
    for name, im in (("mat-grass magnified x1.781", g.resize((945, 945), Image.LANCZOS)),
                     ("mat-grass reduced /1.781", g.resize((298, 298), Image.LANCZOS))):
        a = np.asarray(im).astype(float)
        l = lum(a)
        s = np.concatenate([np.abs(np.diff(l, axis=1)).ravel(), np.abs(np.diff(l, axis=0)).ravel()])
        print(f"  {name:<40} {im.size[0]}x{im.size[1]:<10} {s.mean():6.2f} "
              f"{100*(s>=24).mean():7.1f}% {100*(s<4).mean():7.1f}% {l.mean():7.1f}")
    print("\n  Magnifying loses detail; reducing keeps it. That is the whole rule, and it is why the\n"
          "  overworld's answer is higher-resolution MATERIALS reduced into today's 768px chunks,\n"
          "  not bigger chunks. Four generations, and texture memory does not move.")


if __name__ == "__main__":
    main()
