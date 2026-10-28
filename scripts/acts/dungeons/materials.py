#!/usr/bin/env python3
"""Derive Acts 2-5 material sets (mat-floor/wall/rubble/accent.png, 531 px, tileable) from the
shipped Act 1 sets, per the recipes in themes.py. Writes <scratch>/design/materials/<dungeon>/
plus a materials.json recording source, ops, mean RGB and the wrap-seam step (the same metric
make_dungeon_materials.py records), and a contact sheet.

    materials.py [--only id,id]
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
import common
from common import ACT1_MATS, MATROOT
from themes import T

N = 531


def lum(m):
    return (m[..., 0] * 0.299 + m[..., 1] * 0.587 + m[..., 2] * 0.114)[..., None]


def op_desat(m, k):
    return m * (1 - k) + lum(m) * k


def op_lift(m, k):                  # scale value (keeps contrast ratio), before grade re-centres it
    return m * k


def op_contrast(m, k):
    mu = m.reshape(-1, 3).mean(0)
    return mu + (m - mu) * k


def op_smooth(m, s, k):
    b = np.dstack([ndimage.gaussian_filter(m[..., c], s, mode="wrap") for c in range(3)])
    return m * (1 - k) + b * k


def periodic_noise(seed, scale):
    """FFT-filtered noise is periodic by construction, so it tiles with the material."""
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((N, N)))
    ky = np.fft.fftfreq(N)[:, None]; kx = np.fft.fftfreq(N)[None, :]
    k = np.sqrt(kx ** 2 + ky ** 2)
    f *= np.exp(-(k * scale) ** 2)
    n = np.real(np.fft.ifft2(f))
    return (n - n.mean()) / (n.std() + 1e-6)


def op_veins(m, seed, rgb, w, a):
    """Thin branching cracks: the zero-set of two octaves of periodic noise, lit with `rgb`."""
    n = periodic_noise(seed, 18.0) + 0.45 * periodic_noise(seed + 1, 6.0)
    ridge = np.clip(1.0 - np.abs(n) / (w * 10.0), 0, 1) ** 2.2
    gate = np.clip(periodic_noise(seed + 2, 30.0) * 0.9 + 0.3, 0, 1)   # broken, not a net
    v = (ridge * gate)[..., None]
    glow = ndimage.gaussian_filter(ridge * gate, 1.6, mode="wrap")[..., None] * 0.5
    col = np.array(rgb, np.float32)[None, None, :]
    return m * (1 - v * a) + col * v * a + col * glow * a * 0.35


def op_flecks(m, seed, n, rgb, r):
    """Small mineral glints (ore, frost, embers, stars): wrapped stamps with a 1 px highlight."""
    rng = np.random.default_rng(seed)
    big = Image.new("L", (N * 3, N * 3), 0)
    d = ImageDraw.Draw(big)
    for _ in range(n):
        x, y = rng.uniform(0, N, 2)
        rr = r * rng.uniform(0.6, 1.3)
        for ox in (0, N, 2 * N):
            for oy in (0, N, 2 * N):
                d.ellipse((x + ox - rr, y + oy - rr, x + ox + rr, y + oy + rr), fill=255)
    big = np.asarray(big, np.float32) / 255.0
    msk = big[N:2 * N, N:2 * N]
    msk = np.maximum(msk, 0)
    for oy in (0, N, 2 * N):          # fold the 3x3 back so edge stamps wrap
        for ox in (0, N, 2 * N):
            if (ox, oy) != (N, N):
                msk = np.maximum(msk, big[oy:oy + N, ox:ox + N])
    msk = ndimage.gaussian_filter(msk, 0.5, mode="wrap")[..., None]
    col = np.array(rgb, np.float32)[None, None, :]
    shade = m * 0.55                 # a dark rim under the glint so it sits IN the rock
    rim = np.clip(ndimage.gaussian_filter(msk[..., 0], 1.2, mode="wrap")[..., None] - msk, 0, 1)
    return (m * (1 - rim * 0.6) + shade * rim * 0.6) * (1 - msk) + col * msk


OPS = {"desat": op_desat, "lift": op_lift, "contrast": op_contrast, "smooth": op_smooth,
       "veins": op_veins, "flecks": op_flecks}


def seam(m):
    """Mean abs step across the wrap edge vs across an interior line (make_dungeon_materials)."""
    w = np.abs(m[:, 0].astype(float) - m[:, -1]).mean() + np.abs(m[0].astype(float) - m[-1]).mean()
    i = np.abs(m[:, N // 2].astype(float) - m[:, N // 2 - 1]).mean() + \
        np.abs(m[N // 2].astype(float) - m[N // 2 - 1]).mean()
    return round(w / 2, 2), round(i / 2, 2)


def build(did):
    r = T[did]
    out = os.path.join(MATROOT, did)
    os.makedirs(out, exist_ok=True)
    meta = {"theme": r["theme"], "target": r["target"], "water": r["water"],
            "_method": "derived from Act 1 material sets (scripts/acts/dungeons/materials.py)"}
    for q in ("floor", "wall", "rubble", "accent"):
        src, sq, ops = r[q]
        p = os.path.join(ACT1_MATS, src, f"mat-{sq}.png")
        m = np.asarray(Image.open(p).convert("RGB"), np.float32)
        for name, kw in ops:
            m = OPS[name](m, **kw)
        m = np.clip(m, 0, 255).astype(np.uint8)
        Image.fromarray(m).save(os.path.join(out, f"mat-{q}.png"), optimize=True)
        ws, it = seam(m)
        meta[q] = {"source": f"{src}/mat-{sq}.png", "ops": ops,
                   "meanRGB": [round(float(v), 1) for v in m.reshape(-1, 3).mean(0)],
                   "wrapStep": ws, "interiorStep": it}
    json.dump(meta, open(os.path.join(out, "materials.json"), "w"), indent=1)
    return out


def sheet(ids, path):
    S = 200
    im = Image.new("RGB", (S * 4 + 220, S * len(ids)), (20, 20, 24))
    d = ImageDraw.Draw(im)
    for j, did in enumerate(ids):
        d.text((8, j * S + 8), did, fill=(230, 230, 230))
        d.text((8, j * S + 24), T[did]["theme"], fill=(160, 160, 170))
        for i, q in enumerate(("floor", "wall", "rubble", "accent")):
            m = np.asarray(Image.open(os.path.join(MATROOT, did, f"mat-{q}.png")), np.float32)
            tgt = T[did]["target"]["floor" if q in ("floor", "accent") else "wall"]
            if q == "accent":
                tgt = T[did]["water"]
            mu = m.reshape(-1, 3).mean(0)
            g = np.clip(m * (np.array(tgt) * 1.22 / np.maximum(mu, 1)), 0, 255).astype(np.uint8)
            im.paste(Image.fromarray(g).crop((0, 0, S, S)), (220 + i * S, j * S))
    im.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--sheet")
    a = ap.parse_args()
    ids = a.only.split(",") if a.only else list(T)
    for did in ids:
        build(did)
        print("materials", did)
    if a.sheet:
        sheet(ids, a.sheet)
        print("wrote", a.sheet)


if __name__ == "__main__":
    main()
