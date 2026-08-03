#!/usr/bin/env python3
"""Small mechanical gate for the Act 1 heroine G1 sheet."""

from hashlib import sha256
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/hero-g1/hero-act1-female-walk-4x3-64-v3.png"
EXPECTED_SHA256 = "bbad74be9e496e22d2ef75bd484c04ad1d08a03c91775f299a47add6ac4f3a59"


def main() -> None:
    data = SHEET.read_bytes()
    assert sha256(data).hexdigest() == EXPECTED_SHA256
    image = Image.open(SHEET)
    assert image.mode == "RGBA" and image.size == (192, 256)
    assert all(image.getpixel(point)[3] == 0 for point in ((0, 0), (191, 0), (0, 255), (191, 255)))
    assert not any(0 < alpha <= 8 for alpha in image.getchannel("A").getdata())

    frames = []
    for row in range(4):
        row_frames = []
        baselines = []
        for column in range(3):
            frame = image.crop((column * 64, row * 64, (column + 1) * 64, (row + 1) * 64))
            alpha = frame.getchannel("A")
            bbox = alpha.getbbox()
            assert bbox is not None
            assert bbox[0] > 0 and bbox[1] > 0 and bbox[2] < 64 and bbox[3] < 64
            baselines.append(bbox[3] - 1)
            row_frames.append(frame)
        assert baselines == [58, 58, 58]
        assert ImageChops.difference(row_frames[0], row_frames[1]).getbbox() is not None
        assert ImageChops.difference(row_frames[0], row_frames[2]).getbbox() is not None
        frames.extend(row_frames)

    assert len(frames) == 12
    print("ACT 1 HIFI HERO TEST PASS: 12 padded RGBA frames; four directions; shared baseline y=58")


if __name__ == "__main__":
    main()
