#!/usr/bin/env python3
"""Sharpen the shipped Act 1 overworld art in place (chunk base layer + landmark sprites).

WHY A POST-PROCESS AND NOT A RE-BAKE
    Owner, build 70: "image quality poor"; on the options, 2026-09-02: "Sharper the better".
    Measured first: the renderer draws the field as exact 3x nearest (93.6% of aligned 3x3 device
    pixel blocks uniform), so the softness is in the paint -- the material renderer's textures are
    ~48 px per cell and painterly. A re-bake would be the clean route, but the renderer's source
    materials live under design/continent-terrain-class-method/ (gitignored, only on the other
    machine), so this sharpens the tracked chunks themselves. Idempotence is NOT a property of
    this script: running it twice sharpens twice. It records what it did in manifest.source.sharpen
    and refuses to run again while that record is present.

WHAT IT TOUCHES
    public/act1-hifi/chunks/base/*.webp   unsharp mask, re-encoded LOSSLESS WebP (the shipped
                                          chunks are VP8L lossless; a lossy re-encode would trade
                                          the sharpness back for compression noise)
    public/act1-hifi/landmarks/*.png      RGB sharpened, alpha untouched (lossless)
    public/act1-hifi/manifest.json        baseSha256 per chunk + source.sharpen
    NOT the canopy masks (alpha only), NOT the water glints, NOT dungeons or towns (already crisp
    per the record; halos on crisp walls are a new defect), NOT the hero.

    python3 scripts/sharpen_act1_chunks.py [--radius 1.0] [--percent 220] [--threshold 1]
"""
from __future__ import annotations
import argparse, glob, hashlib, json, os
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIFI = os.path.join(ROOT, "public/act1-hifi")

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--radius", type=float, default=1.0)
    ap.add_argument("--percent", type=int, default=220)
    ap.add_argument("--threshold", type=int, default=1)
    a = ap.parse_args()
    mpath = os.path.join(HIFI, "manifest.json")
    manifest = json.load(open(mpath))
    if manifest.get("source", {}).get("sharpen"):
        raise SystemExit("manifest.source.sharpen already present: refusing to sharpen twice")
    usm = ImageFilter.UnsharpMask(radius=a.radius, percent=a.percent, threshold=a.threshold)
    before = after = 0
    for chunk in manifest["chunks"]:
        p = os.path.join(HIFI, chunk["base"])
        before += os.path.getsize(p)
        im = Image.open(p).convert("RGB").filter(usm)
        im.save(p, "WEBP", lossless=True, method=6)
        after += os.path.getsize(p)
        chunk["baseSha256"] = sha256(p)
    lm = 0
    for p in sorted(glob.glob(os.path.join(HIFI, "landmarks/*.png"))):
        im = Image.open(p).convert("RGBA")
        rgb = im.convert("RGB").filter(usm)
        out = Image.merge("RGBA", (*rgb.split(), im.split()[3]))
        out.save(p, "PNG", optimize=True)
        lm += 1
    manifest.setdefault("source", {})["sharpen"] = {
        "method": "PIL UnsharpMask on the base layer and landmark RGB", "radius": a.radius,
        "percent": a.percent, "threshold": a.threshold, "webp": "lossless", "date": "2026-09-02",
        "owner": "Sharper the better (2026-09-02)"}
    json.dump(manifest, open(mpath, "w"), indent=2)
    print(f"sharpened {len(manifest['chunks'])} chunks ({before/1e6:.1f} MB -> {after/1e6:.1f} MB) and {lm} landmarks; manifest updated")

if __name__ == "__main__":
    main()
