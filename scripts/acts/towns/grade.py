#!/usr/bin/env python3
"""Re-grade an Act-1-space town plate into its Act 2-5 biome, surface by surface.

The same idea as scripts/match_town_palette.py (grade foliage and paving each onto its own anchor,
never a whole-frame grade), pushed further: every surface class from compose.py has its own
transfer, keyed on the source pixel's LUMINANCE so the painted shading, pixel clusters and outlines
of the Act 1 art survive and only the material changes.

  snow    : lawn -> snow, cobble -> frosted grey stone, roofs -> snow caps with a dark eave,
            foliage -> dark evergreen with snow on the lit tops, water -> ice
  haunted : snow + dusk (Ravenhollow: dark evergreen village, cold violet light, warm windows)
  desert  : lawn -> sand, cobble -> sandstone flags, stone -> warm sandstone, water -> turquoise
  ash     : lawn -> ash, cobble -> basalt, roofs/timber charred, water -> lava with glow
  barren  : lawn -> dead earth, everything desaturated and cold, low light
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

from compose import (C_BORDER, C_FIELD, C_LANE, C_OBJ, C_ROCK, C_ROOF, C_STONE, C_TREE, C_WALL, C_WATER)
from kitlib import PLATE, hsv, value_noise


def lerp(a, b, t):
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    return a + (b - a) * t[..., None]


def ramp(L, lo, hi, gamma=1.0):
    return np.clip((L - lo) / (hi - lo), 0, 1) ** gamma


def desat(rgb, k):
    L = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2])[..., None]
    return rgb * (1 - k) + L * k


def tint(rgb, mul):
    return rgb * np.asarray(mul, np.float32)


def green(rgb, smin=0.22):
    h, s, v, L = hsv(rgb)
    return (h > 50) & (h < 170) & (s > smin)


def grade(comp, layout):
    src = comp["rgb"].astype(np.float32)
    cls = comp["cls"]
    biome = layout["biome"]
    variant = layout.get("variant", "")
    seed = layout.get("seed", 1)
    h, s, v, L = hsv(src)
    Llow = ndi.gaussian_filter(L, 1.3)
    out = src.copy()
    n1 = value_noise(PLATE, PLATE, 22, seed + 5)
    n2 = value_noise(PLATE, PLATE, 70, seed + 9)

    field = cls == C_FIELD
    lane = cls == C_LANE
    roof = cls == C_ROOF
    obj = cls == C_OBJ
    tree = cls == C_TREE
    water = cls == C_WATER
    rock = (cls == C_ROCK) | (cls == C_BORDER)
    stone = (cls == C_STONE) | (cls == C_WALL)
    leafy = ((h >= 76) & (h < 170) & (s > 0.45)) | ((h >= 58) & (h < 76) & (s > 0.9) & (L > 60))
    foliage = ((obj | tree) & leafy) | (tree & green(src)) | (rock & green(src, 0.45) & (L > 60))
    # lawn left inside a cut-out (garden plots) is ground, not foliage
    lawnish = (h > 58) & (h < 100) & (s > 0.5) & (L > 105)
    garden = obj & lawnish
    foliage &= ~garden

    if biome in ("snow", "haunted"):
        snow_lo, snow_hi = (150, 166, 194), (242, 246, 252)
        t = 0.60 + 0.30 * (ramp(Llow, 60, 190) - 0.5) + 0.12 * (ramp(L, 60, 200) - 0.5) + 0.14 * (n2 - 0.5)
        sn = lerp(snow_lo, snow_hi, np.clip(t, 0, 1))
        # rocks/pebbles in the lawn stay as stones peeking through
        peb = field & (s < 0.25)
        out[field & ~peb] = sn[field & ~peb]
        out[garden] = sn[garden]
        out[peb] = tint(desat(src, 0.7), (0.80, 0.86, 0.98))[peb]
        # lanes: cool stone, snow packed in the joints, trodden centre
        st = tint(desat(src, 0.75), (0.80, 0.86, 0.98)) * 0.86
        # packed snow lies in crisp patches on the stones (hard edge, lit rim), not a wash over them
        dust = ndi.binary_opening(n1 > 0.80, iterations=3)
        st = np.where(dust[..., None], sn * 0.96, st)
        drim = dust & ~np.roll(dust, 2, axis=0)
        st = np.where(drim[..., None], np.minimum(sn * 1.06 + 8, 255), st)
        dlo = np.roll(dust, -2, axis=0) & ~dust
        st = np.where(dlo[..., None], st * 0.7, st)
        out[lane] = st[lane]
        if variant == "forge":   # ironkeep: soot-dark streets between the forges
            out[lane] = (out[lane] * 0.82)
        # roofs: snow cap, keep the painted tile shading as blue-grey, dark eave strip
        rs = lerp((136, 150, 180), (246, 249, 253), ramp(L, 15, 130, 0.7))
        below = np.zeros_like(roof)
        for k in range(3, 13, 3):
            below[:-k] |= ~roof[k:]
        eave = roof & below
        out[roof & ~eave] = rs[roof & ~eave]
        out[eave] = tint(desat(src, 0.3), (0.80, 0.84, 0.95))[eave]
        # walls / timber / props: cool, a little desaturated
        out[obj & ~garden] = tint(desat(src, 0.28), (0.90, 0.94, 1.04))[obj & ~garden]
        # foliage -> dark evergreen, snow on the lit tops
        ev = lerp((14, 38, 40), (60, 104, 90), ramp(L, 20, 150))
        cap = foliage & (L > 128)
        out[foliage] = ev[foliage]
        out[cap] = lerp((200, 214, 232), (246, 249, 253), ramp(L, 128, 200))[cap]
        # cliff / boulders: cool grey, moss -> snow
        rk = tint(desat(src, 0.85), (0.84, 0.89, 1.0)) * 1.05
        rmask = rock & ~foliage
        out[rmask] = rk[rmask]
        rcap = rock & ~foliage & (L > 150)
        out[rcap] = lerp((214, 224, 238), (248, 250, 254), ramp(L, 150, 220))[rcap]
        out[stone] = tint(desat(src, 0.7), (0.86, 0.92, 1.04))[stone]
        # water -> ice
        ice = lerp((120, 160, 196), (214, 234, 246), ramp(L, 20, 110))
        out[water] = ice[water]
        if biome == "haunted":
            out = tint(out, (0.7, 0.7, 0.86))
            out = desat(out, 0.25)
            # windows: the Act 1 windows are saturated blue -> warm candle glow
            win = obj & (h > 190) & (h < 225) & (s > 0.45) & (L > 70)
            out[win] = lerp((210, 140, 50), (255, 214, 120), ramp(L, 70, 180))[win]
    elif biome == "desert":
        sand = lerp((176, 136, 82), (242, 216, 160), np.clip(0.55 + 0.35 * (ramp(Llow, 60, 190) - 0.5)
                                                             + 0.16 * (n2 - 0.5), 0, 1))
        yy = np.arange(PLATE)[:, None]
        ripple = 0.03 * np.sin((yy * 0.21 + np.arange(PLATE)[None, :] * 0.05) + n2 * 9)
        sand = sand * (1 + ripple[..., None])
        peb = field & (s < 0.25)
        out[field & ~peb] = sand[field & ~peb]
        out[garden] = sand[garden]
        out[peb] = tint(desat(src, 0.6), (1.10, 0.98, 0.82))[peb]
        flag = tint(desat(src, 0.6), (1.10, 0.99, 0.80)) * 1.04
        out[lane] = flag[lane]
        # stone + timber warm: low-saturation pixels (stone walls) -> sandstone / adobe
        lowsat = obj & ~garden & ~foliage & ((s < 0.32) | ((h > 38) & (h < 80) & (s < 0.92)))
        out[lowsat] = tint(desat(src, 0.5), (1.14, 1.0, 0.78))[lowsat]
        warm = obj & ~lowsat & ~garden
        out[warm] = tint(src, (1.04, 0.99, 0.92))[warm]
        out[roof] = tint(desat(src, 0.15), (1.06, 1.0, 0.9))[roof]
        # green roofs read as wrong in the desert: turn them to sun-baked clay
        groof = roof & (h > 50) & (h < 170) & (s > 0.2)
        clay = lerp((92, 40, 24), (226, 140, 84), ramp(L, 20, 170))
        out[groof] = clay[groof]
        # vegetation: oasis olive / date-palm green, warmer than Act 1
        fol = lerp((40, 52, 18), (170, 176, 70), ramp(L, 20, 190))
        out[foliage] = fol[foliage]
        rk = tint(desat(src, 0.7), (1.18, 0.98, 0.74))
        rmask = rock & ~foliage
        out[rmask] = rk[rmask]
        rf = rock & foliage
        out[rf] = sand[rf] * 0.85
        out[stone] = tint(desat(src, 0.55), (1.12, 1.0, 0.8))[stone]
        tq = lerp((14, 92, 110), (90, 214, 214), ramp(L, 15, 120))
        out[water] = tq[water]
    elif biome == "ash":
        ash = lerp((66, 60, 58), (150, 136, 126), np.clip(0.5 + 0.35 * (ramp(Llow, 60, 190) - 0.5)
                                                          + 0.2 * (n2 - 0.5), 0, 1))
        peb = field & (s < 0.25)
        out[field & ~peb] = ash[field & ~peb]
        out[garden] = ash[garden]
        out[peb] = (desat(src, 0.9) * 0.55)[peb]
        bas = desat(src, 0.85) * 0.66 + np.array([4, 0, 0], np.float32)
        grout = (L < ndi.uniform_filter(L, 9) - 10)
        bas = np.where(grout[..., None], lerp((40, 16, 10), (110, 36, 14), n1), bas)
        out[lane] = bas[lane]
        out[roof] = (desat(src, 0.55) * 0.72)[roof]
        out[obj & ~garden] = tint(desat(src, 0.5) * 0.72, (1.05, 0.96, 0.92))[obj & ~garden]
        dead = lerp((30, 26, 24), (122, 104, 84), ramp(L, 20, 190))
        out[foliage] = dead[foliage]
        rmask = rock & ~foliage
        out[rmask] = (desat(src, 0.9) * 0.55)[rmask]
        out[rock & foliage] = ash[rock & foliage] * 0.8
        out[stone] = (desat(src, 0.85) * 0.62)[stone]
        lava = lerp((150, 30, 8), (255, 214, 90), ramp(L, 10, 120, 0.8))
        out[water] = lava[water]
        glow = ndi.gaussian_filter(water.astype(np.float32), 30)
        out += glow[..., None] * np.array([90, 34, 0], np.float32) * (~water)[..., None]
        out = tint(out, (1.04, 0.96, 0.92))
        # embers: rare orange specks in the ash
        rng = np.random.default_rng(seed)
        sp = (rng.random((PLATE, PLATE)) > 0.9993) & field
        sp = ndi.binary_dilation(sp, iterations=1)
        out[sp] = (230, 110, 30)
    elif biome == "barren":
        earth = lerp((62, 58, 64), (152, 140, 132), np.clip(0.5 + 0.35 * (ramp(Llow, 60, 190) - 0.5)
                                                            + 0.2 * (n2 - 0.5), 0, 1))
        peb = field & (s < 0.25)
        out[field & ~peb] = earth[field & ~peb]
        out[garden] = earth[garden]
        out[peb] = (desat(src, 0.9) * 0.6)[peb]
        out[lane] = tint(desat(src, 0.85) * 0.84, (0.96, 0.96, 1.04))[lane]
        out[roof] = tint(desat(src, 0.55) * 0.86, (0.95, 0.95, 1.05))[roof]
        out[obj & ~garden] = tint(desat(src, 0.45) * 0.92, (0.95, 0.95, 1.04))[obj & ~garden]
        dead = lerp((28, 28, 26), (110, 108, 88), ramp(L, 20, 190))
        out[foliage] = dead[foliage]
        rmask = rock & ~foliage
        out[rmask] = tint(desat(src, 0.9) * 0.72, (0.95, 0.95, 1.06))[rmask]
        out[rock & foliage] = earth[rock & foliage] * 0.8
        out[stone] = (desat(src, 0.85) * 0.7)[stone]
        if variant == "fort":
            wl = cls == C_WALL
            out[wl] = tint(desat(src, 0.8) * 0.9, (1.0, 0.98, 0.96))[wl]
            out[rmask] *= 0.72
        out[water] = lerp((20, 22, 40), (70, 76, 110), ramp(L, 10, 120))[water]
        out = tint(out, (0.96, 0.95, 1.0))
        # windows glow: the last lights of the world
        win = obj & (h > 190) & (h < 225) & (s > 0.45) & (L > 70)
        out[win] = lerp((200, 140, 60), (255, 214, 130), ramp(L, 70, 180))[win]

    out = liquid_surface(out, src, water, biome, layout, seed)
    out, sc = scatter(out, cls, biome, seed)
    # EMISSIVE pixels (fire in braziers, lantern glass, lit tower windows) keep their own colour
    em = comp.get("emissive")
    if em is not None:
        out[em] = src[em]
    # lit Act 1 windows in the dark acts: the painted glass is saturated blue/teal
    if biome in ("ash", "barren", "haunted"):
        win = (obj | (cls == C_ROOF)) & (h > 175) & (h < 230) & (s > 0.4) & (L > 45) & (L < 170)
        win = ndi.binary_opening(win, iterations=1)
        lab, n = ndi.label(win)
        if n:
            sz = ndi.sum(np.ones_like(win), lab, index=np.arange(1, n + 1))
            win = np.isin(lab, 1 + np.nonzero((sz > 12) & (sz < 900))[0])
        lit = lerp((222, 150, 60), (255, 230, 150), ramp(L, 45, 160))
        out[win] = lit[win]
        layout.setdefault("_winglow", win)
    # RESTORE LOCAL CONTRAST. The surface transfers above flatten pixel-scale detail (a smooth
    # snow/sand/ash ramp, x0.6 darkening). check_town_finish.py measures exactly that: flat steps
    # rose from Act 1's 34% to 55-66%. Put back a fraction of the SOURCE's own high-pass luminance,
    # so the Act 1 pixel clusters come through at their painted strength -- never more than the
    # source had, which is what keeps this from over-sharpening.
    # k is the share of the source's detail the output carries, per surface. k <= 1 everywhere:
    # never more detail than Act 1 painted, which is what keeps this from over-sharpening. The dark
    # acts take the full source detail -- darkening compresses every step, and the owner's bar is
    # Act 1 Millbrook's local contrast (check_town_finish: step 15.2, hard 20%).
    import os as _os
    gain = {"snow": 0.85, "haunted": 1.0, "desert": 0.9, "ash": 1.0, "barren": 1.0}[biome]
    fg = {"snow": 0.6, "haunted": 1.0, "desert": 0.55, "ash": 0.95, "barren": 0.95}[biome]
    hp_src = L - ndi.gaussian_filter(L, 1.2)
    Lo = 0.299 * out[..., 0] + 0.587 * out[..., 1] + 0.114 * out[..., 2]
    hp_out = Lo - ndi.gaussian_filter(Lo, 1.2)
    k = np.where(water, 0.6, np.where(field | garden, fg, gain))
    em = comp.get("emissive")
    if em is not None:
        k = np.where(em, 0, k)
    # take whichever detail is STRONGER per pixel: the source's (where a transfer flattened it) or
    # the output's own (where the grade authored a crisp edge -- snow patch, outline, crack).
    # Swapping blindly erased authored edges and ghosted the cobbles under snow.
    hs = hp_src * k
    corr = np.where(np.abs(hs) > np.abs(hp_out), hs - hp_out, 0.0)
    # authored detail (liquid texture, emissive glass/fire, ground scatter) keeps its own pixels:
    # the restore would otherwise swap it for the flat source detail underneath
    keep = water | sc | (em if em is not None else False)
    corr[keep] = 0
    out = out + corr[..., None]

    # shadows from compose, tinted to the biome's ambient
    amb = {"snow": (0.58, 0.66, 0.86), "haunted": (0.5, 0.5, 0.7), "desert": (0.62, 0.52, 0.48),
           "ash": (0.5, 0.42, 0.42), "barren": (0.5, 0.5, 0.6)}[biome]
    sh = comp["shadow"][..., None]
    out = out * (1 - sh) + out * np.asarray(amb, np.float32) * sh
    if biome in ("haunted", "barren"):
        yy, xx = np.mgrid[0:PLATE, 0:PLATE]
        r = np.hypot(xx - PLATE / 2, yy - PLATE / 2) / (PLATE * 0.72)
        out *= (1 - 0.25 * np.clip(r, 0, 1) ** 2.2)[..., None]
    lights = list(comp.get("lights", []))
    dark = biome in ("ash", "barren", "haunted")
    lay2 = dict(layout)
    lay2["fx"] = list(layout.get("fx", [])) + [
        {"glow": [x, y], "r": r * (1.25 if dark else 0.9), "col": [255, 170, 70], "a": 0.55 if dark else 0.3}
        for x, y, r in lights]
    out = fx(out, lay2)
    win = layout.pop("_winglow", None)
    if win is not None and win.any():
        wg = ndi.gaussian_filter(win.astype(np.float32), 7) * 1.6
        out = 255 - (255 - out) * (1 - np.clip(wg, 0, 0.5)[..., None] * np.array([1.0, 0.7, 0.35]))
    return np.clip(out, 0, 255)


def scatter(out, cls, biome, seed):
    """Ground scatter on open field: small pixel-art tufts, pebbles, drifts and cracks on the
    2-px grain, coloured from the ground they sit on (dark outline below, lit pixel on top).
    Non-blocking and drawn only where the whole sprite sits on open field. This is the fine
    texture a Dragon Quest field carries; the biome transfers above leave the ground too plain."""
    from kitlib import value_noise as _vn
    field = cls == 0
    rng = np.random.default_rng(seed + 303)
    H = PLATE // 2
    fh = field[::2, ::2][:H, :H]
    fh = ndi.binary_erosion(fh, iterations=4)
    dens = _vn(H, H, 40, seed + 5)
    base = out[::2, ::2][:H, :H].copy()
    dark = np.zeros((H, H), bool); lit = np.zeros((H, H), bool); mid = np.zeros((H, H), bool)
    kinds = {"snow": ("tuft", "drift", "pebble"), "haunted": ("tuft", "tuft", "pebble", "drift"),
             "desert": ("pebble", "pebble", "tuft"), "ash": ("pebble", "crack", "crack"),
             "barren": ("pebble", "crack", "tuft", "tuft")}[biome]
    ys, xs = np.nonzero(fh & (dens > 0.42))
    n = min(len(xs), int(fh.sum() / {"snow": 160, "haunted": 130, "desert": 200, "ash": 100, "barren": 95}[biome]))
    if n == 0:
        return out, np.zeros(field.shape, bool)
    for i in rng.choice(len(xs), n, replace=False):
        y, x = ys[i], xs[i]
        kd = kinds[rng.integers(0, len(kinds))]
        if kd == "tuft":
            for j in range(rng.integers(2, 5)):
                hh = rng.integers(2, 4)
                xx = x + j - 1 + rng.integers(0, 2)
                dark[y - hh:y + 1, xx] = True
                lit[y - hh, xx] = True
        elif kd == "pebble":
            for j in range(rng.integers(1, 4)):
                px, py = x + rng.integers(-3, 4), y + rng.integers(-2, 3)
                w = rng.integers(1, 3)
                mid[py:py + 1, px:px + w + 1] = True
                lit[py, px] = True
                dark[py + 1, px:px + w + 1] = True
        elif kd == "drift":
            w = rng.integers(4, 8)
            lit[y, x:x + w] = True
            lit[y - 1, x + 1:x + w - 1] = True
            dark[y + 1, x + 1:x + w] = True
        else:  # crack
            px, py = x, y
            for j in range(rng.integers(4, 9)):
                dark[min(py, H - 1), min(px, H - 1)] = True
                px += rng.integers(-1, 2); py += rng.integers(0, 2) if j % 2 else 0
                px += 1
    dark &= ~lit
    mid &= ~(lit | dark)
    dcol = {"snow": (0.50, 0.55, 0.62), "haunted": (0.42, 0.40, 0.46), "desert": (0.62, 0.52, 0.42),
            "ash": (0.42, 0.36, 0.34), "barren": (0.50, 0.48, 0.48)}[biome]
    tile = base.copy()
    tile[dark] = base[dark] * np.asarray(dcol, np.float32)
    tile[mid] = base[mid] * 0.82
    tile[lit] = np.minimum(base[lit] * 1.18 + 16, 255)
    m = dark | lit | mid
    big = np.repeat(np.repeat(m, 2, 0), 2, 1)
    bt = np.repeat(np.repeat(tile, 2, 0), 2, 1)
    M = np.zeros(field.shape, bool); M[:2 * H, :2 * H] = big
    M &= field
    T = out.copy(); T[:2 * H, :2 * H] = bt
    out[M] = T[M]
    return out, M


def liquid_surface(out, src, water, biome, layout, seed):
    """Pools and channels: textured from the Act 1 water pixels, normalised so the ripple pattern
    reads at full strength, plus per-biome surface detail (ice cracks, lava crust)."""
    if not water.any():
        return out
    L = 0.299 * src[..., 0] + 0.587 * src[..., 1] + 0.114 * src[..., 2]
    lo, hi = np.percentile(L[water], [4, 97])
    t = np.clip((L - lo) / max(hi - lo, 1), 0, 1)
    rng = np.random.default_rng(seed + 41)
    if biome in ("snow", "haunted"):
        base = lerp((128, 168, 200), (218, 236, 248), t ** 0.8)
        # cracks: random-walk lines, dark with a light edge
        cr = Image.new("L", (PLATE, PLATE), 0)
        d = ImageDraw.Draw(cr)
        ys, xs = np.nonzero(water)
        for k in range(26):
            i = rng.integers(0, len(xs))
            x, y = float(xs[i]), float(ys[i])
            ang = rng.uniform(0, 6.28)
            pts = [(x, y)]
            for j in range(rng.integers(4, 9)):
                ang += rng.uniform(-0.8, 0.8)
                x += 14 * np.cos(ang); y += 9 * np.sin(ang)
                pts.append((x, y))
            d.line(pts, fill=255, width=2)
        crack = (np.asarray(cr) > 127) & water
        base[crack] = (96, 128, 160)
        edge = np.roll(crack, 2, axis=0) & water & ~crack
        base[edge] = (240, 248, 255)
        # sheen: diagonal bright streaks
        yy, xx = np.mgrid[0:PLATE, 0:PLATE]
        sheen = water & (((xx + yy * 2) // 9) % 23 == 0) & (value_noise(PLATE, PLATE, 30, seed) > 0.55)
        base[sheen] = (250, 252, 255)
    elif biome == "ash":
        n = value_noise(PLATE, PLATE, 26, seed + 3, octaves=2)
        heat = np.clip(0.55 * t + 0.6 * (n - 0.3), 0, 1)
        base = lerp((120, 22, 6), (255, 150, 30), heat)
        hot = heat > 0.78
        base[hot] = lerp((255, 196, 60), (255, 246, 170), np.clip((heat - 0.78) * 4, 0, 1))[hot]
        crust = (t < 0.22) & (n < 0.45)
        crust = ndi.binary_opening(crust, iterations=1)
        base[crust] = lerp((34, 16, 12), (78, 34, 20), t)[crust]
        # glowing edge where lava meets the rim
        rimglow = water & ~ndi.binary_erosion(water, iterations=5)
        base[rimglow] = (255, 214, 110)
    elif biome == "desert":
        base = lerp((10, 84, 104), (110, 224, 220), t ** 0.9)
    else:
        base = lerp((16, 18, 36), (86, 96, 136), t)
    out[water] = base[water]
    return out


def fx(out, layout):
    """Light and air the kit cannot carry: forge/lava/lantern glow (screen blend), chimney smoke,
    ground fog. Kept soft and sparse so the pixel art underneath stays crisp."""
    from kitlib import APC
    yy, xx = np.mgrid[0:PLATE, 0:PLATE].astype(np.float32)
    rng = np.random.default_rng(layout.get("seed", 1) + 77)
    for f in layout.get("fx", []):
        if "glow" in f:
            cx, cy = f["glow"][0] * APC, f["glow"][1] * APC
            r = f["r"] * APC
            m = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (r * 0.55) ** 2))) * f.get("a", 0.4)
            col = np.asarray(f["col"], np.float32)
            out = 255 - (255 - out) * (1 - m[..., None] * col / 255)
        elif "smoke" in f:
            cx, cy = f["smoke"][0] * APC, f["smoke"][1] * APC
            sm = np.zeros((PLATE, PLATE), np.float32)
            for k in range(4):
                px = cx + k * 9 + rng.uniform(-4, 4)
                py = cy - k * 26
                rr = 14 + k * 7
                sm = np.maximum(sm, (((xx - px) ** 2 + (yy - py) ** 2) < rr ** 2) * (0.42 - k * 0.08))
            sm = ndi.gaussian_filter(sm, 3)
            sc = np.asarray(f.get('col', [150, 146, 150]), np.float32)
            out = out * (1 - sm[..., None]) + sc * sm[..., None]
        elif f.get("fog"):
            n = value_noise(PLATE, PLATE, 160, layout.get("seed", 1) + 3, octaves=2)
            a = np.clip((n - 0.45) * 0.6, 0, 0.22)
            out = out * (1 - a[..., None]) + np.array([150, 150, 190], np.float32) * a[..., None]
    return out
