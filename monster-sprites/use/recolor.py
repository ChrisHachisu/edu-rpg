#!/usr/bin/env python3
"""
Pixel-by-pixel sprite recoloring.
Converts each pixel to HSL, shifts hue/sat/lightness individually,
preserving all detail and shading. Skips near-black background pixels.
"""

from PIL import Image
import colorsys
import os
import sys

ORIG_DIR = "originals"
OUT_DIR = "game-ready"
GAME_SIZE = 128
BG_THRESHOLD = 25  # pixels with R+G+B < this are treated as background

def recolor_sprite(src_path, dst_path, hue_shift=0, sat_mult=1.0, light_mult=1.0,
                   target_hue=None, sat_set=None, colorize=False):
    """
    Recolor a sprite pixel by pixel in HSL space.

    Args:
        hue_shift: degrees to rotate hue (0-360)
        sat_mult: multiply saturation by this (1.0 = no change)
        light_mult: multiply lightness by this (1.0 = no change)
        target_hue: if set, force all colored pixels to this hue (0-360)
                    while preserving their original saturation and lightness
        sat_set: if set, force saturation to this value (0.0-1.0)
        colorize: if True, use target_hue as absolute hue for all pixels
    """
    img = Image.open(src_path).convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]

            # Skip fully transparent pixels
            if a == 0:
                continue

            # Skip near-black background pixels
            if r + g + b < BG_THRESHOLD:
                continue

            # Convert to HLS (Python's colorsys uses HLS not HSL)
            r_f, g_f, b_f = r / 255.0, g / 255.0, b / 255.0
            h_val, l_val, s_val = colorsys.rgb_to_hls(r_f, g_f, b_f)

            # Skip very desaturated pixels (greys) unless colorizing
            if s_val < 0.08 and not colorize:
                # Still apply lightness changes to greys
                l_val = min(1.0, l_val * light_mult)
                r2, g2, b2 = colorsys.hls_to_rgb(h_val, l_val, s_val)
                pixels[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
                continue

            # Apply hue transformation
            if target_hue is not None:
                h_val = target_hue / 360.0
            else:
                h_val = (h_val + hue_shift / 360.0) % 1.0

            # Apply saturation
            if sat_set is not None:
                s_val = sat_set
            else:
                s_val = min(1.0, s_val * sat_mult)

            # Apply lightness
            l_val = min(1.0, max(0.0, l_val * light_mult))

            # Convert back to RGB
            r2, g2, b2 = colorsys.hls_to_rgb(h_val, l_val, s_val)
            pixels[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)

    # Resize to game size with nearest-neighbor (pixel art)
    img = img.resize((GAME_SIZE, GAME_SIZE), Image.NEAREST)
    img.save(dst_path)
    print(f"  ✓ {os.path.basename(dst_path)}")


def recolor_swap_channels(src_path, dst_path, swap="rg"):
    """Swap color channels for dramatic color changes (e.g. green↔red)."""
    img = Image.open(src_path).convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0 or r + g + b < BG_THRESHOLD:
                continue
            if swap == "rg":
                pixels[x, y] = (g, r, b, a)
            elif swap == "rb":
                pixels[x, y] = (b, g, r, a)
            elif swap == "gb":
                pixels[x, y] = (r, b, g, a)

    img = img.resize((GAME_SIZE, GAME_SIZE), Image.NEAREST)
    img.save(dst_path)
    print(f"  ✓ {os.path.basename(dst_path)}")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    variants = [
        # (output_name, source_file, method, kwargs)

        # 1. magma-slime ← slime (green → red): swap R↔G channels
        ("magma-slime", "1_slime.png", "swap", {"swap": "rg"}),

        # 2. frost-wolf ← wolf (warm brown → ice blue): shift hue +180°, boost sat
        ("frost-wolf", "4_wolf.png", "recolor", {
            "hue_shift": 180, "sat_mult": 1.3, "light_mult": 1.15
        }),

        # 3. frost-stalker ← wolf (warm → colder ice blue, slightly darker)
        ("frost-stalker", "4_wolf.png", "recolor", {
            "hue_shift": 195, "sat_mult": 1.4, "light_mult": 1.05
        }),

        # 4. flame-bat ← bat (purple → orange): force target hue
        ("flame-bat", "7_bat.png", "recolor", {
            "target_hue": 25, "sat_mult": 1.4, "light_mult": 1.1, "colorize": True
        }),

        # 5. sand-golem ← golem (stone grey/brown → sandy tan)
        ("sand-golem", "10_golem.png", "recolor", {
            "target_hue": 40, "sat_mult": 1.5, "light_mult": 1.15, "colorize": True
        }),

        # 6. lava-golem ← golem (stone → red/molten)
        ("lava-golem", "10_golem.png", "recolor", {
            "target_hue": 10, "sat_mult": 2.0, "light_mult": 1.0, "colorize": True
        }),

        # 7. glacial-golem ← golem (stone → ice crystal blue)
        ("glacial-golem", "10_golem.png", "recolor", {
            "target_hue": 200, "sat_mult": 1.8, "light_mult": 1.2, "colorize": True
        }),

        # 8. frozen-skeleton ← skeleton (bone white → ice blue tint)
        ("frozen-skeleton", "25_skeleton.png", "recolor", {
            "target_hue": 210, "sat_mult": 1.5, "light_mult": 1.1, "colorize": True
        }),

        # 9. sand-wraith ← wraith (purple → sandy tan/gold)
        ("sand-wraith", "26_wraith.png", "recolor", {
            "target_hue": 45, "sat_mult": 1.2, "light_mult": 1.1
        }),

        # 10. cloud-wraith ← wraith (purple ~270° → grey/blue ~210°): -60°
        ("cloud-wraith", "26_wraith.png", "recolor", {
            "hue_shift": -60, "sat_mult": 0.4, "light_mult": 1.2
        }),

        # 11. void-shade ← wraith (purple → deeper violet/darker)
        ("void-shade", "26_wraith.png", "recolor", {
            "hue_shift": -15, "sat_mult": 1.4, "light_mult": 0.7
        }),

        # 12. ice-wyrm ← dragon (red → ice blue)
        ("ice-wyrm", "19_dragon.jpg", "recolor", {
            "target_hue": 210, "sat_mult": 1.3, "light_mult": 1.1, "colorize": True
        }),

        # 13. lava-wyrm ← dragon (red → orange/molten)
        ("lava-wyrm", "19_dragon.jpg", "recolor", {
            "hue_shift": 25, "sat_mult": 1.4, "light_mult": 1.05
        }),

        # 14. dark-knight ← knight (silver/gold → dark black/purple)
        ("dark-knight", "24_knight.png", "recolor", {
            "target_hue": 270, "sat_mult": 1.2, "light_mult": 0.55, "colorize": True
        }),

        # 15. storm-harpy ← harpy (pink → purple/electric blue)
        ("storm-harpy", "16_harpy.png", "recolor", {
            "hue_shift": -40, "sat_mult": 1.3, "light_mult": 0.95
        }),

        # 16. giant-crab ← crab (same, just resize)
        ("giant-crab", "9_crab.png", "recolor", {
            "hue_shift": 0, "sat_mult": 1.1, "light_mult": 1.0
        }),

        # 17. bandit-archer ← bandit (brown leather → green/forest)
        ("bandit-archer", "6_bandit.png", "recolor", {
            "hue_shift": 75, "sat_mult": 1.2, "light_mult": 1.0
        }),
    ]

    print(f"Generating {len(variants)} color variants (pixel-by-pixel)...\n")

    for name, src_file, method, kwargs in variants:
        src = os.path.join(ORIG_DIR, src_file)
        dst = os.path.join(OUT_DIR, f"{name}.png")

        if not os.path.exists(src):
            print(f"  ✗ MISSING: {src}")
            continue

        if method == "swap":
            recolor_swap_channels(src, dst, **kwargs)
        else:
            recolor_sprite(src, dst, **kwargs)

    print(f"\nDone! {len(variants)} variants in {OUT_DIR}/")


if __name__ == "__main__":
    main()
