#!/usr/bin/env python3
"""Mechanical gate for the Act 1 eight-direction heroine G2 sheet."""

from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
HERO_ROOT = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2"
G1 = HERO_ROOT / "hero-g1/hero-act1-female-walk-4x3-64-v3.png"
G2 = HERO_ROOT / "hero-g2/hero-act1-female-walk-8x3-64-g2.png"
CARDINAL_ROWS = {0: 0, 2: 1, 4: 3, 6: 2}


def main() -> None:
    g1 = Image.open(G1).convert("RGBA")
    g2 = Image.open(G2)
    assert g2.mode == "RGBA" and g2.size == (192, 512)
    assert not any(0 < alpha <= 8 for alpha in g2.getchannel("A").getdata())

    diagonal_idles = []
    for row in range(8):
        row_frames = []
        baselines = []
        for column in range(3):
            frame = g2.crop((column * 64, row * 64, (column + 1) * 64, (row + 1) * 64))
            bbox = frame.getchannel("A").getbbox()
            assert bbox is not None
            assert bbox[0] > 0 and bbox[1] > 0 and bbox[2] < 64 and bbox[3] < 64
            baselines.append(bbox[3] - 1)
            row_frames.append(frame)
        assert baselines == [58, 58, 58]
        assert ImageChops.difference(row_frames[0], row_frames[1]).getbbox() is not None
        assert ImageChops.difference(row_frames[0], row_frames[2]).getbbox() is not None
        if row in CARDINAL_ROWS:
            source_row = CARDINAL_ROWS[row]
            expected = g1.crop((0, source_row * 64, 192, (source_row + 1) * 64))
            actual = g2.crop((0, row * 64, 192, (row + 1) * 64))
            assert ImageChops.difference(expected, actual).getbbox() is None
        else:
            diagonal_idles.append(row_frames[0])

    for index, frame in enumerate(diagonal_idles):
        for other in diagonal_idles[index + 1:]:
            assert ImageChops.difference(frame, other).getbbox() is not None
    print("ACT 1 HIFI HERO G2 TEST PASS: 24 padded RGBA frames; eight directions; cardinal rows exact")


if __name__ == "__main__":
    main()
