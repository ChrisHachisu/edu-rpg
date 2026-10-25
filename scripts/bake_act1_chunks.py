#!/usr/bin/env python3
"""Bake the act1-hifi chunk art from the material renderer at 48 px/tile.

The shipped chunks are 16 px/tile, which on an iPhone means one art pixel covers ~5.75 device
pixels; the overworld reads soft next to the crisp hero sprite. The material renderer already
produces 48 px/tile, so this re-bakes the same 30-chunk grid from it -- three times the linear
resolution, ~1.9x on-screen upscale instead of 5.75x. Owner picked 48 on a single-chunk in-game
proof (2026-08-01).

Layers:

  base    RGB, the terrain. Lossy WebP.
  canopy  An ALPHA-ONLY MASK that REPLACES the old `occlusion` layer. That layer's contract was
          MEASURED off the shipped art rather than guessed: alpha is BINARY (0 or 242, no
          midtones) and where it is 242 the RGB is PIXEL-IDENTICAL to base. It was the base,
          masked -- i.e. the same painting shipped twice, and it had to ship LOSSLESSLY to stay
          identical, at ~1MB a chunk. Shipping the mask alone (~2 kB) and letting the runtime cut
          the canopy out of the base it already holds is exact by construction.
  water   LEFT ALONE. A sparse animated glint overlay -- 0.0-0.2% coverage, one colour at two
          alpha levels -- so resolution buys it nothing, and its geometry still lines up because
          the new art is built from the same semantic mask.

`chunk.width/height` in the manifest stay 512: they are the chunk's footprint in WORLD space,
not the image size, and moving them would move the map. The image simply gets denser. That does
require runtime.html to take its source rect from the IMAGE -- see --patch-runtime below.

    bake_act1_chunks.py --out <dir> [--px-tile 48] [--quality 82] [--patch-runtime]
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import time

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "dist/act1-hifi")
ART_PX_TILE = 16          # the shipped chunk grid's resolution, and the world coordinate space


def load_renderer():
    spec = importlib.util.spec_from_file_location(
        "rm", os.path.join(ROOT, "scripts/render_material_map.py"))
    rm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rm)
    return rm


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def patch_runtime(path: str) -> bool:
    """Source rect must follow the IMAGE, not the manifest.

    `drawLayer` samples `0,0,chunk.width,chunk.height` out of the chunk image. At 16 px/tile the
    image happened to BE 512x512 so that read correctly by coincidence. Hand it a 1536px chunk
    unchanged and it silently samples the top-left quarter and stretches it -- terrain that looks
    plausible and is wrong. `drawDetailRegions`, a few lines below in the same file, already uses
    naturalWidth/naturalHeight; this makes drawLayer agree with it.

    It cannot read naturalWidth DIRECTLY, though, and this bit the first cut of this patch
    (2026-08-02, caught in review 2026-08-03 before promotion). The canopy layer no longer arrives
    as an <img>: `canopyFor` composites it and hands back a <canvas>, and a canvas has `width`, not
    `naturalWidth`. `drawImage` with an undefined source width takes NaN, and the spec says a
    non-finite argument makes it return **without drawing and without throwing** -- verified in the
    browser: drawing a 64x64 canvas through `naturalWidth` yields rgba(0,0,0,0), through `width`
    yields the pixels. So the canopy would silently never render, in exactly the same
    looks-fine-but-wrong way this patch exists to prevent. `??` rather than `||` because a decoded
    <img> legitimately reports a truthy naturalWidth and only `undefined` means "this is a canvas".
    """
    s = open(path).read()
    old = ("        targetCtx.drawImage(image, 0, 0, chunk.width, chunk.height,\n"
           "          chunk.x + offsetX - .35, chunk.y - .35, chunk.width + .7, chunk.height + .7);")
    # The first cut of this patch, kept so an already-patched file upgrades in place.
    naive = ("        targetCtx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight,\n"
             "          chunk.x + offsetX - .35, chunk.y - .35, chunk.width + .7, chunk.height + .7);")
    new = ("        const iw = image.naturalWidth ?? image.width;\n"
           "        const ih = image.naturalHeight ?? image.height;\n"
           "        targetCtx.drawImage(image, 0, 0, iw, ih,\n"
           "          chunk.x + offsetX - .35, chunk.y - .35, chunk.width + .7, chunk.height + .7);")
    # each half is applied independently so a re-run cannot skip the second because the first
    # was already there
    if new not in s:
        if s.count(naive) == 1:
            s = s.replace(naive, new)
        elif s.count(old) == 1:
            s = s.replace(old, new)
        else:
            raise SystemExit(f"drawLayer source-rect line not found exactly once in {path}")
    if "canopyFor(chunk)" in s:
        open(path, "w").write(s)
        return False

    # --- canopy: cut it out of the base the runtime already holds ---------------------------
    # The old layer arrived as a ready-made RGBA image. The mask replaces it, so the canopy image
    # has to be built here -- ONCE per chunk, cached, so the per-frame draw path is byte-for-byte
    # the work it was before. `destination-in` keeps the base only where the mask has alpha, and
    # multiplies alpha through: 255 * 242/255 = 242, the shipped value, exactly.
    helper = """
    const canopyCache = new Map();
    function canopyFor(chunk) {
      const hit = canopyCache.get(chunk.id);
      if (hit !== undefined) return hit;
      const base = assets.get(chunk.base), mask = assets.get(chunk.canopy);
      if (!base || !mask) return null;          // not cached: retry once both have streamed in
      const cv = document.createElement('canvas');
      cv.width = base.naturalWidth; cv.height = base.naturalHeight;
      const cx = cv.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(base, 0, 0);
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(mask, 0, 0, mask.naturalWidth, mask.naturalHeight, 0, 0, cv.width, cv.height);
      canopyCache.set(chunk.id, cv);
      return cv;
    }
"""
    anchor = "    function drawLayer(key, view, offsetX = 0, alpha = 1, targetCtx = ctx) {"
    if s.count(anchor) != 1:
        raise SystemExit("drawLayer definition not found exactly once")
    s = s.replace(anchor, helper + anchor)

    old_get = "        const image = assets.get(chunk[key]);"
    if s.count(old_get) != 1:
        raise SystemExit("drawLayer asset lookup not found exactly once")
    s = s.replace(
        old_get,
        "        const image = key === 'occlusion' ? canopyFor(chunk) : assets.get(chunk[key]);")

    # stream the mask instead of the retired layer, and drop the derived canvas with the chunk
    s = s.replace("[chunk.base, chunk.water, chunk.occlusion]",
                  "[chunk.base, chunk.water, chunk.canopy]")
    s = s.replace(
        "[candidate.chunk.base, candidate.chunk.water, candidate.chunk.occlusion]"
        ".forEach(path => assets.delete(path));",
        "[candidate.chunk.base, candidate.chunk.water, candidate.chunk.canopy]"
        ".forEach(path => assets.delete(path));\n"
        "            canopyCache.delete(candidate.chunk.id);")
    s = s.replace(
        "[record.chunk.base, record.chunk.water, record.chunk.occlusion]"
        ".forEach(path => assets.delete(path));",
        "[record.chunk.base, record.chunk.water, record.chunk.canopy]"
        ".forEach(path => assets.delete(path));\n"
        "          canopyCache.delete(record.chunk.id);")
    if "chunk.occlusion" in s:
        raise SystemExit("a chunk.occlusion reference survived the patch")

    open(path, "w").write(s)
    return True


def paint_pilot(source_root: str, out_root: str, ppc: int, quality: int,
                only: str, raw_root: str | None) -> None:
    """Stage a bounded new-raster pilot without touching public/ or dist/."""
    if ppc <= 0 or ppc > 48:
        raise SystemExit("--ppc must be between 1 and 48 source pixels per semantic cell")
    source_root = os.path.abspath(source_root)
    out_root = os.path.abspath(out_root)
    public_root = os.path.join(ROOT, "public/act1-hifi")
    if source_root != public_root:
        raise SystemExit("pilot source must be the current public/act1-hifi tree")
    if out_root.startswith(os.path.abspath(os.path.join(ROOT, "public"))) or out_root.startswith(os.path.abspath(os.path.join(ROOT, "dist"))):
        raise SystemExit("paint pilot output must remain outside public/ and dist/")
    if os.path.exists(out_root):
        shutil.rmtree(out_root)
    shutil.copytree(source_root, out_root)

    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    import render_material_map as rm
    manifest_path = os.path.join(source_root, "manifest.json")
    renderer = rm.Act1PaintRenderer(manifest_path=manifest_path, old_root=source_root)
    manifest = json.load(open(os.path.join(out_root, "manifest.json"), encoding="utf-8"))
    wanted = set(only.split(",")) if only else set()
    chunks = [c for c in manifest["chunks"] if not wanted or c["id"] in wanted]
    if wanted and wanted != {c["id"] for c in chunks}:
        raise SystemExit(f"unknown pilot chunk ids: {sorted(wanted - {c['id'] for c in chunks})}")
    if not chunks:
        raise SystemExit("no chunks selected for raster pilot")
    if raw_root:
        raw_root = os.path.abspath(raw_root)
        stage_root = os.path.abspath(os.path.dirname(os.path.dirname(out_root)))
        if os.path.commonpath((stage_root, raw_root)) != stage_root:
            raise SystemExit("raw pilot PNGs must remain inside the paint-pilot staging root")
        if os.path.exists(raw_root):
            shutil.rmtree(raw_root)
        os.makedirs(raw_root)

    totals = {"base": 0, "canopy": 0}
    for i, c in enumerate(chunks, 1):
        rgb, alpha = renderer.render_window(c["x"], c["y"], c["width"], c["height"], ppc=ppc)
        expected = (c["height"] // 16 * ppc, c["width"] // 16 * ppc)
        if rgb.shape[:2] != expected or alpha.shape != expected:
            raise SystemExit(f"{c['id']}: renderer returned {rgb.shape[:2]}, expected {expected}")
        base_path = os.path.join(out_root, c["base"])
        canopy_path = os.path.join(out_root, c["canopy"])
        os.makedirs(os.path.dirname(base_path), exist_ok=True)
        os.makedirs(os.path.dirname(canopy_path), exist_ok=True)
        Image.fromarray(rgb, "RGB").save(base_path, "WEBP", quality=quality, method=6)
        # Preserve the binary 0/242 occlusion alpha contract, but derive the silhouette from
        # the new imagegen crown sprites instead of retaining the former alpha bitmap.
        binary = np.where(alpha >= 128, 242, 0).astype(np.uint8)
        rgba = np.zeros(rgb.shape[:2] + (4,), np.uint8)
        rgba[..., 3] = binary
        Image.fromarray(rgba, "RGBA").save(canopy_path, "WEBP", lossless=True, method=6)
        c["baseSha256"] = sha256(base_path)
        c["canopySha256"] = sha256(canopy_path)
        c["basePixelsPerCell"] = ppc
        totals["base"] += os.path.getsize(base_path)
        totals["canopy"] += os.path.getsize(canopy_path)
        if raw_root:
            Image.fromarray(rgb, "RGB").save(os.path.join(raw_root, c["id"] + "-base.png"))
            Image.fromarray(binary, "L").save(os.path.join(raw_root, c["id"] + "-canopy.png"))
        print(f"[{i}/{len(chunks)}] {c['id']} {expected[1]}x{expected[0]} "
              f"base={os.path.getsize(base_path)/1024:.1f}KB mask={os.path.getsize(canopy_path)/1024:.1f}KB")

    # Whole-map backing is an image from the same materials, routes and global motif seed.
    # It covers exact semanticBounds; browser/runtime positioning comes from the manifest.
    bw, bh = renderer.cells_w * 16, renderer.cells_h * 16
    underpaint, _ = renderer.render_window(0, 0, bw, bh, ppc=6)
    upath = os.path.join(out_root, "underpaint/act1-plate.png")
    os.makedirs(os.path.dirname(upath), exist_ok=True)
    Image.fromarray(underpaint, "RGB").save(upath, "PNG", optimize=True)
    manifest["underpaint"] = {
        "src": "underpaint/act1-plate.png",
        "pixelWidth": renderer.cells_w * 6,
        "pixelHeight": renderer.cells_h * 6,
        "pixelsPerCell": 6,
    }
    src = dict(manifest.get("source", {}))
    src.update({
        "renderer": "scripts/render_material_map.py::Act1PaintRenderer",
        "mask": os.path.relpath(renderer.mask_path, ROOT),
        "maskSha256": renderer.mask_hash,
        "paintSource": os.path.relpath(rm.PAINT_CONFIG, ROOT),
        "paintSourceSha256": rm._sha256_file(rm.PAINT_CONFIG),
        "paintSeed": int(renderer.cfg.get("seed", rm.ACT1_PAINT_SEED)),
        "pilotPixelsPerCell": ppc,
        "pilotChunks": sorted(c["id"] for c in chunks),
        "stage": "mixed-resolution-review-pilot",
    })
    manifest["source"] = src
    manifest["status"] = "act1-r26-painted-pilot"
    json.dump(manifest, open(os.path.join(out_root, "manifest.json"), "w", encoding="utf-8"),
              indent=2, ensure_ascii=False)
    print(f"staged {len(chunks)} painted chunks; changed base {totals['base']/1024:.1f}KB, "
          f"new canopy {totals['canopy']/1024:.1f}KB, underpaint {os.path.getsize(upath)/1024:.1f}KB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="staging directory (a full act1-hifi copy)")
    ap.add_argument("--paint", action="store_true", help="use the new imagegen raster pilot compositor")
    ap.add_argument("--source-root", default=os.path.join(ROOT, "public/act1-hifi"))
    ap.add_argument("--ppc", type=int, default=32, help="new raster source pixels per semantic cell")
    ap.add_argument("--raw-dir", help="optional staging directory for lossless PNG join evidence")
    ap.add_argument("--px-tile", type=int, default=48)
    ap.add_argument("--quality", type=int, default=82, help="WebP quality for the base layer")
    ap.add_argument("--patch-runtime", action="store_true")
    ap.add_argument("--only", help="comma-separated chunk ids, for a quick trial")
    args = ap.parse_args()

    if args.paint:
        paint_pilot(args.source_root, args.out, args.ppc, args.quality, args.only, args.raw_dir)
        return

    scale = args.px_tile // ART_PX_TILE
    if scale * ART_PX_TILE != args.px_tile:
        raise SystemExit("--px-tile must be a multiple of 16")

    if os.path.abspath(args.out) == os.path.abspath(SRC):
        raise SystemExit("refusing to bake over dist/act1-hifi; stage it and promote deliberately")
    if os.path.exists(args.out):
        shutil.rmtree(args.out)
    shutil.copytree(SRC, args.out)

    manifest = json.load(open(os.path.join(args.out, "manifest.json")))
    rm = load_renderer()
    print("materials (graded once to the owner's target palette):")
    mats = rm.load_materials()
    sem = np.asarray(Image.open(rm.MASK).convert("RGB")).astype(int)

    wanted = set(args.only.split(",")) if args.only else None
    chunks = [c for c in manifest["chunks"] if not wanted or c["id"] in wanted]
    print(f"\nbaking {len(chunks)} chunks at {args.px_tile} px/tile "
          f"({scale}x the shipped grid), WebP q{args.quality}\n")

    totals = {"base": 0, "canopy": 0}
    t0 = time.time()
    for i, chunk in enumerate(chunks, 1):
        # chunk x/y/width/height are in 16px-art space, which is also world space; the render
        # window is that footprint expressed in the denser pixels.
        rgba = rm.render_window(chunk["x"] * scale, chunk["y"] * scale,
                                chunk["width"] * scale, chunk["height"] * scale,
                                mats, sem, occlusion=True)

        # Base is lossy: it is the whole terrain, it is what the payload is made of, and nothing
        # depends on its exact values.
        rel_base = f"chunks/base/{chunk['id']}.webp"
        dst_base = os.path.join(args.out, rel_base)
        Image.fromarray(rgba[..., :3]).save(
            dst_base, "WEBP", quality=args.quality, method=6)

        # The canopy ships as an ALPHA-ONLY MASK, not as a second copy of the terrain.
        #
        # The shipped occlusion layer's RGB is pixel-identical to base -- so storing it at all
        # was storing the same painting twice. Worse, it had to be stored LOSSLESSLY to stay
        # identical (a lossy copy drifted a median of 4 against forest values around 22, enough
        # to visibly re-texture the forest), which cost ~1MB a chunk. Shipping the mask alone and
        # having the runtime cut the canopy out of the base it already holds is exact by
        # construction and costs about 2 kB a chunk -- three orders of magnitude less, with no
        # drift possible because there is no second copy to drift.
        #
        # RGB is deliberately all-zero: nothing reads it. The canopy silhouette lives entirely in
        # the alpha channel so the runtime can apply it with a single `destination-in` composite,
        # which multiplies the base's alpha by this one -- 255 * 242/255 = 242, the shipped value.
        rel_canopy = f"chunks/canopy/{chunk['id']}.webp"
        dst_canopy = os.path.join(args.out, rel_canopy)
        os.makedirs(os.path.dirname(dst_canopy), exist_ok=True)
        mask = np.zeros(rgba.shape[:2] + (4,), np.uint8)
        mask[..., 3] = rgba[..., 3]
        Image.fromarray(mask).save(dst_canopy, "WEBP", lossless=True, method=6)

        for layer, rel, dst in (("base", rel_base, dst_base), ("canopy", rel_canopy, dst_canopy)):
            for stale in (f"chunks/{layer}/{chunk['id']}.png",
                          f"chunks/occlusion/{chunk['id']}.png",
                          f"chunks/occlusion/{chunk['id']}.webp"):
                p = os.path.join(args.out, stale)
                if os.path.exists(p):
                    os.remove(p)
            chunk.pop("occlusion", None)
            chunk.pop("occlusionSha256", None)
            chunk[layer] = rel
            chunk[f"{layer}Sha256"] = sha256(dst)
            totals[layer] += os.path.getsize(dst)

        # The occlusion pass is only invisible over terrain while its RGB matches base. Encoding
        # the two layers separately can pull them apart, so measure it rather than assume.
        a = np.asarray(Image.open(os.path.join(args.out, chunk["canopy"])).convert("RGBA"))[..., 3]
        alphas = sorted(set(np.unique(a).tolist()))
        if not set(alphas) <= {0, rm.CANOPY_ALPHA}:
            raise SystemExit(f"{chunk['id']}: canopy mask alpha is not binary: {alphas}")
        print(f"  [{i:2d}/{len(chunks)}] {chunk['id']:<7} canopy {100*(a>0).mean():4.1f}%  "
              f"base {os.path.getsize(os.path.join(args.out, chunk['base']))/1e6:4.2f}MB  "
              f"mask {os.path.getsize(os.path.join(args.out, chunk['canopy']))/1e3:5.1f}kB",
              flush=True)

    manifest["source"] = {
        "renderer": "scripts/render_material_map.py",
        "mask": os.path.relpath(rm.MASK, ROOT),
        "pxPerTile": args.px_tile,
        "note": "re-baked from the material renderer; water layer retained from the 16px bake",
    }
    json.dump(manifest, open(os.path.join(args.out, "manifest.json"), "w"), indent=2)

    if args.patch_runtime:
        changed = patch_runtime(os.path.join(args.out, "runtime.html"))
        print(f"\nruntime.html source-rect patch: {'applied' if changed else 'already present'}")

    print(f"\nbase {totals['base']/1e6:.1f}MB + canopy masks {totals['canopy']/1e3:.0f}kB "
          f"= {(sum(totals.values()))/1e6:.1f}MB  (shipped 16px PNG: base 11MB + occl 7.9MB)")
    print(f"elapsed {time.time()-t0:.0f}s -> {args.out}")


if __name__ == "__main__":
    main()
