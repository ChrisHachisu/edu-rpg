#!/usr/bin/env python3
"""Remove invisible chroma-removal specks from the Act 1 heroine assets."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
HERO = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/hero-g1"
ASSETS = (
    HERO / "hero-act1-female-walk-4x3-alpha-master-v3-clean.png",
    HERO / "hero-act1-female-walk-4x3-64-v3.png",
)


def clean(path: Path) -> int:
    image = Image.open(path).convert("RGBA")
    pixels = list(image.getdata())
    cleaned = sum(0 < alpha <= 8 for *_, alpha in pixels)
    image.putdata([(0, 0, 0, 0) if pixel[3] <= 8 else pixel for pixel in pixels])
    image.save(path)
    return cleaned


if __name__ == "__main__":
    for asset in ASSETS:
        print(f"{asset.relative_to(ROOT)}: removed {clean(asset)} low-alpha pixels")
