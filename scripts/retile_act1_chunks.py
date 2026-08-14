#!/usr/bin/env python3
"""Re-tile the already-baked Act 1 chunk art into a finer grid -- a RE-TILING, not a re-render.

WHY RE-TILING AND NOT A SECOND RENDER_MATERIAL_MAP.PY CALL. bake_act1_chunks.py bakes chunk art by
calling `rm.render_window(...)` once per chunk footprint. Calling it again with different window
boundaries would ask the owner-approved-but-only-empirically-verified-for-32-cell-windows renderer
to prove it produces IDENTICAL pixels at a crop boundary it has never been asked to draw before --
an argument, not a proof. This script instead decodes the pixels the owner already approved,
reassembles them into one full-plate raster, and crops NEW chunk boundaries out of that raster.
"The pixels didn't change" is then a `numpy.array_equal`, not a claim.

ENCODING. Water was already lossless (PNG) and stays lossless. Base and canopy are re-encoded
WebP LOSSLESS, not re-quantized at the original lossy quality -- a second lossy pass would
requantize independently at the new tile's own boundaries, and decode(new) would NOT be provably
identical to crop(decode(old)). Lossless costs more download bytes than a second lossy pass would;
it costs nothing extra in DECODED/GPU memory, since that is governed by pixel count, not by how
the bytes got there. See docs/handoffs for the measured size delta.

    retile_act1_chunks.py --src <act1-hifi dir> --out <staging dir> --cells 16
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil

import numpy as np
from PIL import Image

CELL_UNITS = 16          # 1 world cell == 16 manifest units, fixed by the existing manifest


def sha256_bytes(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def assemble_plate(src: str, manifest: dict):
    chunks = manifest["chunks"]
    plate_w = max(c["x"] + c["width"] for c in chunks)   # manifest units
    plate_h = max(c["y"] + c["height"] for c in chunks)
    S = 3  # base/canopy px per manifest unit; fixed by the r26 bake (48 px/cell / 16 units/cell)

    base_plate = np.zeros((plate_h * S, plate_w * S, 3), dtype=np.uint8)
    canopy_plate = np.zeros((plate_h * S, plate_w * S), dtype=np.uint8)     # alpha only
    water_plate = np.zeros((plate_h, plate_w, 4), dtype=np.uint8)
    water_present = np.zeros((plate_h, plate_w), dtype=bool)

    for c in chunks:
        bx, by = c["x"] * S, c["y"] * S
        bw, bh = c["width"] * S, c["height"] * S
        base_im = np.asarray(Image.open(os.path.join(src, c["base"])).convert("RGB"))
        assert base_im.shape[:2] == (bh, bw), (c["id"], base_im.shape, (bh, bw))
        base_plate[by:by + bh, bx:bx + bw] = base_im

        canopy_im = np.asarray(Image.open(os.path.join(src, c["canopy"])).convert("RGBA"))
        assert canopy_im.shape[:2] == (bh, bw), (c["id"], canopy_im.shape)
        canopy_plate[by:by + bh, bx:bx + bw] = canopy_im[..., 3]

        if c.get("water"):
            wx, wy = c["x"], c["y"]
            ww, wh = c["width"], c["height"]
            water_im = np.asarray(Image.open(os.path.join(src, c["water"])).convert("RGBA"))
            assert water_im.shape[:2] == (wh, ww), (c["id"], water_im.shape)
            water_plate[wy:wy + wh, wx:wx + ww] = water_im
            water_present[wy:wy + wh, wx:wx + ww] = True

    return base_plate, canopy_plate, water_plate, water_present, plate_w, plate_h, S


def make_chunks(plate_w: int, plate_h: int, unit: int):
    out = []
    row = 0
    y0 = 0
    while y0 < plate_h:
        h = min(unit, plate_h - y0)
        col = 0
        x0 = 0
        while x0 < plate_w:
            w = min(unit, plate_w - x0)
            out.append({"id": f"c{col}-r{row}", "x": x0, "y": y0, "width": w, "height": h})
            x0 += unit
            col += 1
        y0 += unit
        row += 1
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="existing act1-hifi dir (32-cell bake)")
    ap.add_argument("--out", required=True, help="staging dir for the re-tiled bake")
    ap.add_argument("--cells", type=int, required=True, help="new chunk footprint, in world cells")
    args = ap.parse_args()

    if os.path.exists(args.out):
        shutil.rmtree(args.out)
    shutil.copytree(args.src, args.out)

    manifest = json.load(open(os.path.join(args.src, "manifest.json")))
    base_plate, canopy_plate, water_plate, water_present, plate_w, plate_h, S = assemble_plate(
        args.src, manifest)

    unit = args.cells * CELL_UNITS
    new_chunks = make_chunks(plate_w, plate_h, unit)

    # wipe the old chunk directories in the staging copy; every file is regenerated
    for layer in ("base", "canopy", "water"):
        d = os.path.join(args.out, "chunks", layer)
        if os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d)

    totals = {"base": 0, "canopy": 0, "water": 0}
    for c in new_chunks:
        bx, by, bw, bh = c["x"] * S, c["y"] * S, c["width"] * S, c["height"] * S
        base_crop = base_plate[by:by + bh, bx:bx + bw]
        canopy_alpha = canopy_plate[by:by + bh, bx:bx + bw]

        rel_base = f"chunks/base/{c['id']}.webp"
        dst_base = os.path.join(args.out, rel_base)
        Image.fromarray(base_crop, "RGB").save(dst_base, "WEBP", lossless=True, method=6)
        c["base"] = rel_base
        c["baseSha256"] = sha256_bytes(dst_base)
        totals["base"] += os.path.getsize(dst_base)

        rel_canopy = f"chunks/canopy/{c['id']}.webp"
        dst_canopy = os.path.join(args.out, rel_canopy)
        canopy_rgba = np.zeros(canopy_alpha.shape + (4,), np.uint8)
        canopy_rgba[..., 3] = canopy_alpha
        Image.fromarray(canopy_rgba, "RGBA").save(dst_canopy, "WEBP", lossless=True, method=6)
        c["canopy"] = rel_canopy
        c["canopySha256"] = sha256_bytes(dst_canopy)
        totals["canopy"] += os.path.getsize(dst_canopy)

        wx, wy, ww, wh = c["x"], c["y"], c["width"], c["height"]
        if water_present[wy:wy + wh, wx:wx + ww].any():
            rel_water = f"chunks/water/{c['id']}.png"
            dst_water = os.path.join(args.out, rel_water)
            Image.fromarray(water_plate[wy:wy + wh, wx:wx + ww], "RGBA").save(dst_water, "PNG")
            c["water"] = rel_water
            c["waterSha256"] = sha256_bytes(dst_water)
            totals["water"] += os.path.getsize(dst_water)
        else:
            c.pop("water", None)
            c.pop("waterSha256", None)

    manifest["chunkSize"] = unit
    manifest["chunks"] = new_chunks
    manifest["source"] = {
        **manifest.get("source", {}),
        "retiledFrom": "public/act1-hifi (32-cell r26 bake)",
        "retiledBy": "scripts/retile_act1_chunks.py",
        "retileMethod": "crop of the existing decoded raster, not a second render_material_map.py call",
        "retileCells": args.cells,
    }
    json.dump(manifest, open(os.path.join(args.out, "manifest.json"), "w"), indent=2)

    print(f"{args.cells}-cell retile: {len(new_chunks)} chunks")
    print(f"  base   {totals['base']/1e6:6.2f} MB (lossless)")
    print(f"  canopy {totals['canopy']/1e3:6.1f} kB (lossless)")
    print(f"  water  {totals['water']/1e6:6.2f} MB (lossless PNG)")
    print(f"  total  {sum(totals.values())/1e6:6.2f} MB -> {args.out}")


if __name__ == "__main__":
    main()
