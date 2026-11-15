#!/usr/bin/env python3
"""Sprites for the E4 mechanic work, cut or painted by script (no hand work):

  mirror.png, mirror-post.png      Demon Castle mirror frames (from the Codex object sheet B, object 3)
  forge.webp                       Volcanic Forge: troughs, turntables, molten iron, mold frame and deck,
                                   furnace, lever -- relief-lit out of the dungeon's own material tiles
  ../a-art/oasis.webp              Oasis Depths: live water, channel bed, sill stone, foam

  python3 scripts/acts/mech-e4/make_art.py [castle] [forge] [oasis]     (default: all)

Output: public/acts-dungeons/modules/b-art/*.png (loaded by kit-b's art()) and, for the Oasis
Depths water, public/acts-dungeons/modules/a-art/*.png."""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "acts", "mech-b"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "acts", "dungeons2"))
import make_art as MB                                                      # noqa: E402  (objects(): the sheet cutter)

OUT_B = os.path.join(ROOT, "public", "acts-dungeons", "modules", "b-art")
OUT_A = os.path.join(ROOT, "public", "acts-dungeons", "modules", "a-art")
MATS = os.environ.get("D2_WORK", "/home/user/work/e1") + "/materials"


def save(im, name, out=OUT_B):
    os.makedirs(out, exist_ok=True)
    p = os.path.join(out, name)
    im.save(p, optimize=True)
    print(f"{name:24} {im.size[0]}x{im.size[1]}  {os.path.getsize(p) / 1e3:.1f} KB")


def soft_alpha(mask, blur=0.7):
    a = ndimage.gaussian_filter(mask.astype(np.float32), blur)
    return np.clip((a - 0.30) / 0.45, 0, 1)


# ── Demon Castle ─────────────────────────────────────────────────────────────────────────────
def castle():
    obj = MB.objects("mech-tiles-b.png")[2]                               # the mirror in its stone wall
    g = np.asarray(obj).astype(np.float32)
    rgb, al = g[..., :3], g[..., 3] / 255.0
    r, gg, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    H, W = mx.shape
    yy, xx = np.mgrid[0:H, 0:W]
    gold = (r - b > 34) & (r > 70)                                        # bronze and gilt
    gem = (b - gg > 40) & (r - gg > 20) & (mx > 110)                      # violet stones
    box = (xx > 0.25 * W) & (xx < 0.76 * W) & (yy < 0.93 * H)
    dark = (mx < 86) & box                                               # the glass, the frame's shadow lines
    seed = (gold | gem | dark) & box
    seed = ndimage.binary_closing(seed, np.ones((5, 5), bool))
    lab, n = ndimage.label(seed)
    big = np.argmax(ndimage.sum(seed, lab, range(1, n + 1))) + 1
    body = ndimage.binary_fill_holes(lab == big)
    body = ndimage.binary_opening(body, np.ones((3, 3), bool))
    a = soft_alpha(body) * al
    ys, xs = np.nonzero(a > 0.05)
    crop = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    mir = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA").crop(crop)
    save(MB.fit(mir, 46), "mirror.png")
    # one baluster rail of the frame: the doorway posts
    x0, x1 = int(0.262 * W), int(0.345 * W)
    rail = (gold | gem | ((mx < 80) & (xx > x0 + 4) & (xx < x1 - 4))) & (xx >= x0) & (xx < x1) & (yy > 0.16 * H) & (yy < 0.90 * H)
    rail = ndimage.binary_closing(rail, np.ones((3, 3), bool))
    lab, n = ndimage.label(rail)
    big = np.argmax(ndimage.sum(rail, lab, range(1, n + 1))) + 1
    rail = ndimage.binary_fill_holes(lab == big)
    a = soft_alpha(rail) * al
    ys, xs = np.nonzero(a > 0.05)
    post = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    save(MB.fit(post, 14), "mirror-post.png")


# ── shared painting helpers ──────────────────────────────────────────────────────────────────
def mat(did, kind, size):
    """A dungeon material tile, resized (wrap-safe) to `size` px square, float RGB."""
    im = Image.open(os.path.join(MATS, did, f"mat-{kind}.png")).convert("RGB")
    w = im.size[0]
    big = Image.new("RGB", (w * 3, w * 3))
    for j in range(3):
        for i in range(3):
            big.paste(im, (i * w, j * w))
    big = big.resize((size * 3, size * 3), Image.LANCZOS)
    return np.asarray(big.crop((size, size, size * 2, size * 2))).astype(np.float32)


def take(tex, w, h, ox=0, oy=0):
    """A w x h window of a wrapping tile."""
    n = tex.shape[0]
    yy = (np.arange(h) + oy) % n
    xx = (np.arange(w) + ox) % n
    return tex[yy][:, xx].copy()


def grade(rgb, target, keep=0.55):
    """Pull a texture's mean toward `target`, keeping `keep` of its own contrast."""
    m = rgb.reshape(-1, 3).mean(0)
    return (rgb - m) * keep + np.asarray(target, np.float32)


def relief(h, k=1.0, light=(-0.62, -0.78)):
    """Shade factor from a height field lit from the upper left (the map renders' key light)."""
    gy, gx = np.gradient(h)
    return 1.0 + k * (gx * light[0] + gy * light[1])


def disc(n, cx, cy, r):
    yy, xx = np.mgrid[0:n, 0:n]
    return np.hypot(xx + 0.5 - cx, yy + 0.5 - cy) - r                     # signed distance, <0 inside


def down(a, f):
    """Box-filter an (H*f, W*f, C) array down by f."""
    H, W = a.shape[0] // f, a.shape[1] // f
    return a.reshape(H, f, W, f, -1).mean((1, 3))


def rgba(rgb, a=None):
    if a is None:
        a = np.ones(rgb.shape[:2], np.float32)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 1) * 255]).astype(np.uint8), "RGBA")


# ── Volcanic Forge ───────────────────────────────────────────────────────────────────────────
F = 2                                                                     # supersampling
TS = 96                                                                   # a trough tile is 2x2 cells


def chan_mask(mask, half, n=TS * F):
    """The channel of a tile: from the centre to each open side (bit 0 N, 1 E, 2 S, 3 W)."""
    c = n // 2
    h = int(round(half * F))
    m = np.zeros((n, n), bool)
    m[c - h:c + h, c - h:c + h] = True
    if mask & 1: m[0:c, c - h:c + h] = True
    if mask & 2: m[c - h:c + h, c:n] = True
    if mask & 4: m[c:n, c - h:c + h] = True
    if mask & 8: m[c - h:c + h, 0:c] = True
    return m


def forge_tile(mask, turntable, plate, soot, bronze, seed):
    n = TS * F
    rng = np.random.default_rng(seed)
    ox, oy = int(rng.integers(0, 400)), int(rng.integers(0, 400))
    base = take(plate, n, n, ox, oy)
    yy, xx = np.mgrid[0:n, 0:n]
    edge = np.minimum(np.minimum(xx, n - 1 - xx), np.minimum(yy, n - 1 - yy)).astype(np.float32)
    H = np.ones((n, n), np.float32)
    H -= np.clip(1.0 - edge / (2.5 * F), 0, 1) * 0.9                       # the block's chamfered edge
    col = base
    if turntable:
        d = disc(n, n / 2, n / 2, 44 * F)
        gap = np.abs(d) < 1.3 * F                                          # the slit the disc turns in
        on = d < 0
        ring = (d > -7 * F) & (d < -1.3 * F)                               # bronze tyre
        col = np.where(on[..., None], grade(take(plate, n, n, oy, ox), (92, 82, 78), 0.6), col * 0.86)
        col = np.where(ring[..., None], take(bronze, n, n, ox, oy), col)
        H = np.where(on, 1.25, H)
        H = np.where(ring, 1.45, H)
        H = np.where(gap, 0.2, H)
        for sx, sy in ((14, 14), (82, 14), (14, 82), (82, 82)):            # bed studs
            b = disc(n, sx * F, sy * F, 3.6 * F)
            H = np.where(b < 0, H + 0.45 * np.sqrt(np.clip(-b / (3.6 * F), 0, 1)), H)
            col = np.where((b < 0)[..., None], take(bronze, n, n, sx, sy) * 1.1, col)
    ch = chan_mask(mask, 11)
    lip = chan_mask(mask, 15) & ~ch
    col = np.where(lip[..., None], col * 0.80 + np.array([30, 24, 20], np.float32), col)
    H = np.where(lip, H + 0.35, H)
    H = np.where(ch, -0.75, H)
    col = np.where(ch[..., None], take(soot, n, n, ox, oy), col)
    Hs = ndimage.gaussian_filter(H, 0.9 * F)
    sh = np.clip(relief(Hs, 2.4 / F * 2), 0.35, 1.7)
    # the channel's own shadow: its upper and left walls shade the bed
    wall = ndimage.gaussian_filter((~ch).astype(np.float32), 1.0)
    cast = np.maximum(np.roll(wall, 5 * F, 0), np.roll(wall, 4 * F, 1))
    occ = ndimage.gaussian_filter(ch.astype(np.float32), 3 * F)
    sh = sh * np.where(ch, 1.0 - 0.55 * np.clip(cast, 0, 1), 1.0 - 0.10 * occ)
    out = col * sh[..., None]
    out *= (0.94 + 0.12 * ndimage.gaussian_filter(rng.random((n, n)), 6 * F)[..., None] / 0.5 * 0.5)
    out = np.where((edge < F)[..., None], out * 0.45, out)                 # seam with the floor
    return down(out, F)


def forge_iron(mask, lava, seed):
    n = TS * F
    ch = chan_mask(mask, 9.5)
    d = ndimage.distance_transform_edt(ch) / (9.5 * F)                     # 0 at the wall, 1 on the centre line
    core = np.clip(d, 0, 1)
    rng = np.random.default_rng(seed)
    tex = take(lava, n, n, int(rng.integers(0, 300)), int(rng.integers(0, 300)))
    hot = np.array([255, 236, 150], np.float32)
    mid = np.array([255, 150, 40], np.float32)
    lum = tex.mean(-1, keepdims=True) / 255.0
    body = mid * (0.55 + 0.75 * lum) * 0.6 + tex * 0.5
    body = body + (hot - body) * (core[..., None] ** 1.6) * (0.45 + 0.55 * lum)
    a = np.clip(ndimage.gaussian_filter(ch.astype(np.float32), 0.8 * F) * 1.25 - 0.1, 0, 1)
    glow = ndimage.gaussian_filter(chan_mask(mask, 11).astype(np.float32), 5 * F)
    ga = np.clip(glow * 0.62, 0, 0.5) * (1 - a)
    rgb = body * a[..., None] + np.array([255, 120, 30], np.float32) * (1 - a[..., None])
    al = a + ga
    # carry the stream to the tile edge on open sides, so neighbours join without a gap
    return down(np.dstack([rgb, al[..., None] * 255.0]), F)


def forge_deck(plate, seed=5):
    """One 48 px plate of the cast walkway (tiles into any mold)."""
    n = 48 * F
    base = grade(take(plate, n, n, 37, 211), (86, 92, 108), 0.5)
    yy, xx = np.mgrid[0:n, 0:n]
    edge = np.minimum(np.minimum(xx, n - 1 - xx), np.minimum(yy, n - 1 - yy)).astype(np.float32)
    H = np.ones((n, n), np.float32) - np.clip(1.0 - edge / (2.0 * F), 0, 1) * 0.8
    for sx, sy in ((8, 8), (40, 8), (8, 40), (40, 40)):
        b = disc(n, sx * F, sy * F, 2.6 * F)
        H = np.where(b < 0, H + 0.8 * np.sqrt(np.clip(-b / (2.6 * F), 0, 1)), H)
        base = np.where((b < 0)[..., None], base * 1.18 + 8, base)
    sh = np.clip(relief(ndimage.gaussian_filter(H, 0.7 * F), 2.2), 0.4, 1.7)
    out = base * sh[..., None]
    out = np.where((edge < F * 0.75)[..., None], out * 0.5, out)
    return down(out, F)


def forge_frame(band, seed=9):
    """The empty mold: an iron frame (nine-slice, 14 px border) around a dark, see-through well."""
    n = TS * F
    yy, xx = np.mgrid[0:n, 0:n]
    edge = np.minimum(np.minimum(xx, n - 1 - xx), np.minimum(yy, n - 1 - yy)).astype(np.float32) / F
    fr = (edge >= 2) & (edge < 11)
    H = np.where(fr, 1.0, 0.0).astype(np.float32)
    H = np.where((edge >= 4) & (edge < 9), 1.25, H)
    base = grade(take(band, n, n, 60, 20), (96, 86, 88), 0.5)
    sh = np.clip(relief(ndimage.gaussian_filter(H, 0.8 * F), 3.4), 0.35, 1.9)
    rgb = base * sh[..., None]
    a = np.where(fr, 1.0, 0.0)
    a = np.where(edge < 2, np.clip(edge / 2, 0, 1) * 0.55, a)              # contact shadow outside
    well = edge >= 11
    shade = 0.30 + 0.30 * np.clip(1.0 - (edge - 11) / 10.0, 0, 1)          # darker under the frame's inner edge
    a = np.where(well, shade, a)
    rgb = np.where((well | (edge < 2))[..., None], np.array([14, 9, 8], np.float32), rgb)
    return down(np.dstack([rgb, a[..., None] * 255.0]), F)


def forge_furnace(band, lava):
    """96x84: a banded-iron furnace front with a glowing arch and the spout the iron leaves by."""
    W, Hh = 96 * F, 84 * F
    yy, xx = np.mgrid[0:Hh, 0:W]
    x, y = xx / F, yy / F
    body = (x >= 5) & (x < 91) & (y >= 4) & (y < 74)
    cap = body & (y < 15)                                                  # the top we look down on
    base = grade(take(band, W, Hh, 8, 30), (104, 62, 48), 0.75)
    top = grade(take(band, W, Hh, 90, 200), (128, 96, 84), 0.6)
    col = np.where(cap[..., None], top, base)
    Ht = np.where(body, 1.0, 0.0).astype(np.float32)
    Ht = np.where(cap, 1.3, Ht)
    arch = ((np.hypot(x - 48, (y - 42) * 0.9) < 21) & (y <= 42)) | ((np.abs(x - 48) < 21) & (y > 42) & (y < 62))
    rim = ((np.hypot(x - 48, (y - 42) * 0.9) < 26) & (y <= 42)) | ((np.abs(x - 48) < 26) & (y > 42) & (y < 65))
    rim &= ~arch
    col = np.where(rim[..., None], grade(take(band, W, Hh, 150, 90), (58, 46, 46), 0.6), col)
    Ht = np.where(rim, 1.35, Ht)
    Ht = np.where(arch, 0.3, Ht)
    spout = (np.abs(x - 48) < 13) & (y >= 62) & (y < 84)
    stream = (np.abs(x - 48) < 8) & (y >= 60) & (y < 84)
    col = np.where((spout & ~stream)[..., None], grade(take(band, W, Hh, 20, 150), (52, 42, 42), 0.6), col)
    Ht = np.where(spout & ~stream, 1.2, Ht)
    sh = np.clip(relief(ndimage.gaussian_filter(Ht, 0.9 * F), 2.4), 0.35, 1.8)
    out = col * sh[..., None]
    fire = take(lava, W, Hh, 40, 60)
    r = np.clip(1.0 - np.hypot(x - 48, (y - 52) * 0.85) / 24.0, 0, 1)
    glow = fire * 0.55 + np.array([255, 170, 50], np.float32) * 0.5
    glow = glow + (np.array([255, 244, 190], np.float32) - glow) * (r[..., None] ** 1.5)
    inner = ndimage.gaussian_filter(arch.astype(np.float32), 2.0 * F)
    out = np.where(arch[..., None], glow * (0.45 + 0.55 * np.clip(inner * 1.4 - 0.25, 0, 1))[..., None], out)
    sx = 1.0 - np.abs(x - 48) / 8.0
    sc = fire * 0.4 + np.array([255, 160, 40], np.float32) * 0.6
    sc = sc + (np.array([255, 240, 170], np.float32) - sc) * (np.clip(sx, 0, 1)[..., None] ** 1.2)
    out = np.where(stream[..., None], sc, out)
    shape = body | spout
    lit = ndimage.gaussian_filter((arch | stream).astype(np.float32), 5 * F)   # the fire lights the iron round it
    out = out + (np.array([255, 120, 30], np.float32) * 0.5 * np.clip(lit - 0.05, 0, 1)[..., None]) * (shape & ~arch & ~stream)[..., None]
    for sx_, sy_ in ((12, 22), (84, 22), (12, 66), (84, 66), (12, 44), (84, 44)):
        b = np.hypot(x - sx_, y - sy_)
        out = np.where((b < 2.6)[..., None], out * (1.25 - 0.18 * (y - sy_)[..., None]) + 10, out)
    edge = ndimage.distance_transform_edt(shape) / F
    out = np.where((edge < 1.5)[..., None], out * 0.4, out)
    a = np.clip(ndimage.gaussian_filter(shape.astype(np.float32), 0.5 * F) * 1.6 - 0.3, 0, 1)
    return down(np.dstack([out, a[..., None] * 255.0]), F)


def forge_lever(plate, on):
    """48x60: an iron pedestal and a lever with a red grip; thrown = leaning right."""
    S = 4
    W, Hh = 48 * S, 60 * S
    im = Image.new("RGBA", (W, Hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((6 * S, 46 * S, 42 * S, 58 * S), fill=(0, 0, 0, 70))
    base = rgba(grade(take(plate, 32 * S, 18 * S, 120, 40), (98, 88, 90), 0.6) * relief(
        ndimage.gaussian_filter(np.pad(np.ones((18 * S - 4 * S, 32 * S - 4 * S), np.float32), 2 * S), 1.2 * S), 6.0)[..., None])
    im.alpha_composite(base, (8 * S, 36 * S))
    d.rectangle((8 * S, 36 * S, 40 * S - 1, 54 * S - 1), outline=(26, 20, 22, 255), width=S)
    d.rectangle((9 * S, 37 * S, 39 * S, 38 * S), fill=(168, 152, 150, 255))
    d.rectangle((19 * S, 40 * S, 29 * S, 46 * S), fill=(18, 13, 14, 255))
    rod = Image.new("RGBA", (W, Hh), (0, 0, 0, 0))
    r = ImageDraw.Draw(rod)
    cx, cy = 24 * S, 43 * S
    r.rectangle((cx - 3 * S, cy - 34 * S, cx + 3 * S, cy), fill=(30, 24, 26, 255))
    r.rectangle((cx - 2 * S, cy - 33 * S, cx + 0 * S, cy - S), fill=(196, 200, 210, 255))
    r.rectangle((cx + 0 * S, cy - 33 * S, cx + 2 * S, cy - S), fill=(120, 124, 136, 255))
    r.ellipse((cx - 7 * S, cy - 42 * S, cx + 7 * S, cy - 28 * S), fill=(60, 14, 10, 255))
    r.ellipse((cx - 6 * S, cy - 41 * S, cx + 6 * S, cy - 29 * S), fill=(186, 44, 30, 255))
    r.ellipse((cx - 5 * S, cy - 41 * S, cx + 3 * S, cy - 33 * S), fill=(228, 84, 60, 255))
    r.ellipse((cx - 4 * S, cy - 40 * S, cx - 1 * S, cy - 37 * S), fill=(255, 190, 170, 255))
    rod = rod.rotate(-34 if on else 34, resample=Image.BICUBIC, center=(cx, cy))
    im.alpha_composite(rod)
    return np.asarray(im.resize((48, 60), Image.LANCZOS)).astype(np.float32)


def forge():
    did = "volcanicForge"
    floor = mat(did, "floor", 192 * F)
    band = mat(did, "wall", 192 * F)
    lava = mat(did, "accent", 160 * F)
    rub = mat(did, "rubble", 160 * F)
    plate = grade(floor, (78, 72, 74), 0.62)                               # the troughs: darker, cooler iron than the floor
    soot = grade(rub, (30, 23, 22), 0.30)
    bronze = grade(band, (150, 104, 52), 0.55)
    atlas = np.zeros((TS * 4, TS * 16, 4), np.float32)
    for m in range(1, 16):
        atlas[0:TS, m * TS:(m + 1) * TS, :3] = forge_tile(m, False, plate, soot, bronze, 100 + m)
        atlas[0:TS, m * TS:(m + 1) * TS, 3] = 255
        atlas[TS:2 * TS, m * TS:(m + 1) * TS, :3] = forge_tile(m, True, plate, soot, bronze, 7)
        atlas[TS:2 * TS, m * TS:(m + 1) * TS, 3] = 255
        atlas[2 * TS:3 * TS, m * TS:(m + 1) * TS] = forge_iron(m, lava, 300 + m)
    y = 3 * TS
    atlas[y:y + 84, 0:96] = forge_furnace(band, lava)
    atlas[y:y + 60, 96:144] = forge_lever(mat(did, "floor", 192 * 4), False)
    atlas[y:y + 60, 144:192] = forge_lever(mat(did, "floor", 192 * 4), True)
    atlas[y:y + 48, 192:240, :3] = forge_deck(floor)
    atlas[y:y + 48, 192:240, 3] = 255
    atlas[y:y + 96, 288:384] = forge_frame(plate)
    im = Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8), "RGBA")
    p = os.path.join(OUT_B, "forge.webp")
    im.save(p, "WEBP", quality=92, method=6, exact=True)
    print(f"forge.webp               {im.size[0]}x{im.size[1]}  {os.path.getsize(p) / 1e3:.1f} KB")
    return im


# ── Oasis Depths ─────────────────────────────────────────────────────────────────────────────
def oasis():
    """a-art/oasis.webp, 384x384: water (0,0) and its caustic light (192,0), 192 px tiles; the channel
    bed (0,192, a 128 px tile); a sandstone sill strip (192,192, 192x10) and a foam strip, white on black (192,208, 192x12)."""
    did = "oasisDepths"
    n = 192
    rng = np.random.default_rng(11)
    wat = mat(did, "accent", n)
    lum = wat.mean(-1)
    # the sheet sweeps from pale shallows (top) to deep water: tiled, that is a stripe every tile. Level
    # each row's colour and contrast to the deep water's, then take out what slow drift is left.
    rm = ndimage.gaussian_filter1d(wat.mean(1), 2.0, axis=0, mode="wrap")[:, None, :]
    rs = ndimage.gaussian_filter1d(wat.std(1), 2.0, axis=0, mode="wrap")[:, None, :]
    deep = wat[n // 2:]
    wat = (wat - rm) / np.maximum(rs, 1.0) * deep.reshape(-1, 3).std(0) + deep.reshape(-1, 3).mean(0)
    low = ndimage.gaussian_filter(wat, (20, 20, 0), mode="wrap")
    water = grade(wat - low + low.reshape(-1, 3).mean(0), (34, 120, 142), 0.66)
    lum = wat.mean(-1)
    # the light net: what is brighter than its surroundings, wrap-safe
    hp = lum - ndimage.gaussian_filter(lum, 7, mode="wrap")
    net = np.clip((hp - 4.0) / 26.0, 0, 1) ** 1.3
    caust = net[..., None] * np.array([170, 232, 236], np.float32)
    bed = grade(mat(did, "rubble", 128), (132, 98, 56), 0.72)             # 128 px: its pebbles the size of the floor's
    wall = mat(did, "wall", n)
    # sill: a rounded kerb of sandstone blocks
    sh, sw = 10, n
    yy, xx = np.mgrid[0:sh * F, 0:sw * F]
    y, x = yy / F, xx / F
    Hs = np.sqrt(np.clip(1.0 - ((y - 4.6) / 5.0) ** 2, 0, 1))
    joint = np.abs(((x + 7) % 24) - 12) > 11.1
    Hs = np.where(joint, Hs * 0.55, Hs)
    stone = grade(take(np.asarray(Image.fromarray(wall.astype(np.uint8)).resize((n * F, n * F), Image.LANCZOS)).astype(np.float32),
                       sw * F, sh * F, 30, 80), (196, 156, 100), 0.5)
    sill = stone * np.clip(relief(ndimage.gaussian_filter(Hs, 0.6 * F), 3.0), 0.4, 1.7)[..., None]
    sill = np.where((np.abs(y - 4.6) > 4.4)[..., None], sill * 0.45, sill)
    sill = down(sill, F)
    # foam: broken white along y = 0, thinning inward; wraps in x
    fh = 12
    nz = rng.random((fh * 4, n * 3))
    blob = ndimage.gaussian_filter(nz, (1.6, 2.6), mode="wrap")
    fine = ndimage.gaussian_filter(rng.random((fh * 4, n * 3)), 0.8, mode="wrap")
    blob = (blob - blob.mean()) / blob.std() * 0.7 + (fine - fine.mean()) / fine.std() * 0.3
    fy = (np.arange(fh * 4)[:, None] + 0.5) / (fh * 4)
    f = np.clip((blob + 1.5 - 3.4 * fy) * 1.5, 0, 1)
    f = np.asarray(Image.fromarray((f * 255).astype(np.uint8)).resize((n, fh), Image.LANCZOS)).astype(np.float32) / 255.0
    f[:, -6:] = f[:, -6:] * np.linspace(1, 0, 6)[None, :] + f[:, :6][:, ::-1] * np.linspace(0, 1, 6)[None, :]
    foam = f[..., None] * np.array([236, 250, 252], np.float32)
    atlas = np.zeros((384, 384, 3), np.float32)
    atlas[0:n, 0:n] = water
    atlas[0:n, n:2 * n] = caust
    atlas[n:n + 128, 0:128] = bed
    atlas[n:n + sh, n:2 * n] = sill
    atlas[n + 16:n + 16 + fh, n:2 * n] = foam
    im = Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8), "RGB")
    os.makedirs(OUT_A, exist_ok=True)
    p = os.path.join(OUT_A, "oasis.webp")
    im.save(p, "WEBP", quality=92, method=6)
    print(f"oasis.webp               {im.size[0]}x{im.size[1]}  {os.path.getsize(p) / 1e3:.1f} KB")
    return im


JOBS = {"castle": castle, "forge": forge, "oasis": oasis}

if __name__ == "__main__":
    for j in (sys.argv[1:] or list(JOBS)):
        JOBS[j]()
