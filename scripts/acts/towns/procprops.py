#!/usr/bin/env python3
"""The few props the Act 1 kit does not contain (palms, gravestones, dead trees, tents), drawn
procedurally at HALF resolution and upscaled 2x nearest so their pixel clusters sit on the same
2-px grain as the Act 1 paintings, with a 1-logical-px dark outline and upper-left light like the
kit. Coloured in Act 1 space (greens/browns/greys) so grade.py re-grades them with everything else.

Writes $SCRATCH/kit/<name>.png (+ empty -shadow/-roof/-ground) and registers them in kit-meta.json.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

from kitlib import SCRATCH, read_json, write_json

KIT = os.path.join(SCRATCH, "kit")
OUTLINE = (34, 30, 18, 255)


_TEX = {}


def texture(kind):
    """Half-res swatches cut from the Act 1 plates, so procedural shapes wear painted pixels."""
    if kind not in _TEX:
        from kitlib import ACT1_TOWN
        im = Image.open(os.path.join(ACT1_TOWN, "greenhollow-screen.png")).convert("RGB")
        box = {"leaf": (40, 1545, 160, 1665), "stone": (850, 600, 1060, 820)}[kind]
        t = np.asarray(im.crop(box).resize(((box[2] - box[0]) // 2, (box[3] - box[1]) // 2), Image.BOX)).astype(np.float32)
        _TEX[kind] = t
    return _TEX[kind]


def skin(a, leaf_mix=1.0):
    """Re-skin flat fills with Act 1 texture, keeping the drawn light/shade as a multiplier."""
    rgb = a[..., :3].astype(np.float32)
    al = a[..., 3] > 0
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = rgb.mean(2)
    g = al & (rgb[..., 1] > rgb[..., 0] * 1.15) & (sat > 0.3)
    st = al & (sat < 0.2) & (lum > 90)
    H, W = al.shape
    for mask, kind, k in ((g, "leaf", 1.0), (st, "stone", 0.35)):
        if not mask.any():
            continue
        t = texture(kind)
        th, tw = t.shape[:2]
        reps = np.tile(t, (H // th + 1, W // tw + 1, 1))[:H, :W]
        tl = reps.mean(2, keepdims=True)
        if kind == "leaf":
            ref = lum[mask].mean()
            new = reps * (lum[..., None] / ref) * (rgb.mean() * 0 + 1)
            new = new * (np.array([0.9, 1.0, 0.85]))
            new = rgb * (1 - leaf_mix) + new * leaf_mix
        else:
            new = rgb * (1 + k * (tl / tl.mean() - 1))
        rgb[mask] = new[mask]
    a = a.copy()
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return a


def finish(img, name, outline=OUTLINE):
    a = skin(np.asarray(img).copy(), 0.4 if name.startswith("palm") else 1.0)
    al = a[..., 3] > 0
    ring = ndi.binary_dilation(al, iterations=1) & ~al
    a[ring] = outline
    up = Image.fromarray(a, "RGBA").resize((img.width * 2, img.height * 2), Image.NEAREST)
    up.save(os.path.join(KIT, f"{name}.png"))
    z = Image.new("L", up.size, 0)
    for suf in ("shadow", "roof", "ground"):
        z.save(os.path.join(KIT, f"{name}-{suf}.png"))
    return up.size


def palm(seed, lean=1):
    rng = np.random.default_rng(seed)
    W, H = 76, 100
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    bx, by = W // 2 - lean * 4, H - 2
    top = (bx + lean * rng.uniform(6, 10), 34 + rng.uniform(-2, 2))
    # trunk: quadratic curve, banded, lit from the left
    pts = []
    for i in range(41):
        t = i / 40
        x = (1 - t) ** 2 * bx + 2 * (1 - t) * t * (bx + lean * 1) + t ** 2 * top[0]
        y = (1 - t) ** 2 * by + 2 * (1 - t) * t * (by - 30) + t ** 2 * top[1]
        pts.append((x, y, t))
    for x, y, t in pts:
        w = 3.4 - 1.4 * t
        band = int(t * 40) % 4
        base = [(112, 80, 44), (128, 94, 54), (100, 70, 38), (120, 88, 50)][band]
        d.ellipse([x - w, y - 1.2, x + w, y + 1.2], fill=base + (255,))
        d.point((x - w + 0.8, y), fill=(168, 128, 76, 255))
        d.point((x + w - 0.8, y), fill=(70, 48, 26, 255))
    cx, cy = top
    # fronds
    n = 9
    order = sorted(range(n), key=lambda k: -math.sin(2 * math.pi * k / n))   # back fronds first
    for k in order:
        ang = 2 * math.pi * k / n + rng.uniform(-0.2, 0.2)
        up = -math.sin(ang)                    # 1 = pointing up the screen (away)
        length = rng.uniform(20, 26) * (0.75 + 0.25 * (1 - up))
        droop = rng.uniform(8, 13)
        prev = None
        for i in range(26):
            t = i / 25
            x = cx + math.cos(ang) * length * t
            y = cy + math.sin(ang) * length * t * 0.75 + droop * t * t
            if prev is not None:
                dx, dy = x - prev[0], y - prev[1]
                nl = math.hypot(dx, dy) or 1
                px, py = -dy / nl, dx / nl
                leaf = 5.0 * math.sin(math.pi * min(1, t * 1.15)) + 0.6
                lit = math.cos(ang) < 0.2
                for sgn in (1, -1):
                    col = (96, 156, 44, 255) if (sgn == 1) == lit else (52, 104, 30, 255)
                    if rng.random() < 0.25:
                        col = (128, 178, 58, 255) if col[1] > 120 else (40, 84, 24, 255)
                    d.line([(x, y), (x + sgn * px * leaf + dx * 1.6, y + sgn * py * leaf + dy * 1.6)],
                           fill=col, width=1)
                d.line([prev, (x, y)], fill=(140, 186, 62, 255), width=1)
            prev = (x, y)
    for k in range(3):
        a = 0.7 + k * 1.9
        d.ellipse([cx - 2 + 2.5 * math.cos(a), cy + 1 + 1.5 * math.sin(a), cx + 2 + 2.5 * math.cos(a),
                   cy + 5 + 1.5 * math.sin(a)], fill=(92, 62, 30, 255))
    return im


def gravestone(seed):
    rng = np.random.default_rng(seed)
    W, H = 16, 20
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = rng.integers(9, 12)
    x0 = (W - w) // 2
    if seed % 3 == 0:     # cross
        d.rectangle([7, 2, 9, 17], fill=(150, 150, 140, 255))
        d.rectangle([4, 5, 12, 7], fill=(150, 150, 140, 255))
        d.line([(7, 2), (7, 17)], fill=(190, 190, 178, 255))
    else:
        d.rounded_rectangle([x0, 3, x0 + w, 17], radius=4, fill=(144, 146, 136, 255))
        d.line([(x0 + 1, 6), (x0 + 1, 16)], fill=(188, 190, 178, 255))
        d.line([(x0 + w - 1, 6), (x0 + w - 1, 16)], fill=(98, 100, 92, 255))
        d.line([(x0 + 3, 8), (x0 + w - 3, 8)], fill=(110, 112, 104, 255))
        d.line([(x0 + 3, 11), (x0 + w - 4, 11)], fill=(110, 112, 104, 255))
    d.ellipse([3, 16, W - 4, 19], fill=(70, 66, 52, 255))
    return im


def dead_tree(seed):
    rng = np.random.default_rng(seed)
    W, H = 48, 60
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def branch(x, y, ang, ln, w, depth):
        x2 = x + math.cos(ang) * ln
        y2 = y + math.sin(ang) * ln
        d.line([(x, y), (x2, y2)], fill=(84, 66, 50, 255), width=max(1, int(w)))
        if w > 1.5:
            d.line([(x - w / 3, y), (x2 - w / 3, y2)], fill=(122, 100, 78, 255), width=1)
        if depth > 0:
            for s in (-1, 1):
                branch(x2, y2, ang + s * rng.uniform(0.35, 0.7), ln * rng.uniform(0.6, 0.75), w * 0.6, depth - 1)

    branch(W / 2, H - 3, -math.pi / 2 + rng.uniform(-0.1, 0.1), 18, 5, 4)
    d.ellipse([W / 2 - 7, H - 5, W / 2 + 7, H - 1], fill=(66, 52, 40, 255))
    return im


def pine(seed, h=1.0):
    rng = np.random.default_rng(seed)
    W, H = 56, 84
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = W / 2
    d.rectangle([cx - 2.5, H - 14, cx + 2.5, H - 3], fill=(92, 64, 38, 255))
    d.line([(cx - 2, H - 14), (cx - 2, H - 3)], fill=(130, 94, 58, 255))
    tiers = 5
    for t in range(tiers):
        top = 4 + t * 12 * h
        bot = top + 22 * h
        half = 8 + t * 4.2
        d.polygon([(cx, top), (cx + half, bot), (cx - half, bot)], fill=(46, 92, 40, 255))
        d.polygon([(cx, top), (cx - half, bot), (cx - half * 0.15, bot)], fill=(78, 132, 52, 255))
        for k in range(int(half)):
            x = cx - half + rng.uniform(0, 2 * half)
            y = bot - rng.uniform(0, 3)
            d.point((x, y), fill=(30, 64, 30, 255) if x > cx else (110, 160, 66, 255))
        d.line([(cx + half, bot), (cx - half, bot)], fill=(28, 56, 28, 255))
    return im


def column(seed):
    rng = np.random.default_rng(seed)
    W, H = 26, 48
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    top = int(rng.integers(6, 20))
    d.rectangle([3, H - 8, W - 4, H - 2], fill=(150, 146, 128, 255))
    d.line([(3, H - 8), (W - 4, H - 8)], fill=(196, 192, 170, 255))
    for x in range(6, W - 6):
        t = (x - 6) / (W - 13)
        v = int(200 - 90 * t)
        d.line([(x, top + (x % 3 == 0) * 2), (x, H - 9)], fill=(v, v - 4, v - 24, 255))
    for x in range(8, W - 7, 3):
        d.line([(x, top + 3), (x, H - 10)], fill=(120, 116, 98, 255))
    jag = [(6, top + 2), (9, top - 1), (12, top + 3), (15, top), (18, top + 4), (W - 7, top + 1)]
    d.polygon(jag + [(W - 7, top + 5), (6, top + 5)], fill=(176, 172, 150, 255))
    return im


def mine(seed):
    """A timber-framed mine adit cut into a rock shoulder, rails running out (Ironkeep)."""
    W, H = 96, 80
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(seed)
    for k in range(14):                                                 # rock shoulder, lumpy
        x = rng.uniform(6, W - 6)
        y = rng.uniform(8, 40)
        r = rng.uniform(10, 18)
        d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=(118, 114, 104, 255))
        d.ellipse([x - r * 0.7, y - r * 0.75, x + r * 0.3, y], fill=(150, 146, 134, 255))
    d.rectangle([10, 34, W - 10, H - 2], fill=(118, 114, 104, 255))
    x0, x1, y0 = 26, W - 26, 26
    for k in range(10):                                                 # dark mouth, graded
        v = 6 + k * 3
        d.rectangle([x0 + k // 2, y0 + k * 2, x1 - k // 2, H - 3], fill=(v, v - 2, v - 2, 255))
    for x in (x0 - 6, x1):                                              # posts
        d.rectangle([x, y0 - 2, x + 6, H - 3], fill=(118, 82, 46, 255))
        d.line([(x, y0 - 2), (x, H - 3)], fill=(164, 120, 74, 255))
        d.line([(x + 6, y0 - 2), (x + 6, H - 3)], fill=(70, 46, 24, 255))
    d.rectangle([x0 - 10, y0 - 9, x1 + 10, y0 - 2], fill=(126, 88, 50, 255))   # lintel
    d.line([(x0 - 10, y0 - 9), (x1 + 10, y0 - 9)], fill=(176, 130, 80, 255))
    d.line([(x0 - 10, y0 - 2), (x1 + 10, y0 - 2)], fill=(66, 44, 22, 255))
    for x in (x0 + 8, x1 - 8):                                          # rails
        d.line([(x, H - 1), (x + (2 if x < W / 2 else -2), y0 + 18)], fill=(160, 160, 168, 255))
    for y in range(y0 + 22, H, 6):
        d.line([(x0 + 5, y), (x1 - 5, y)], fill=(92, 66, 40, 255))
    return im


def brazier(seed):
    """Iron fire-basket on a stone plinth -- a lit accent for the dark acts."""
    W, H = 28, 40
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([7, 28, W - 8, H - 2], fill=(140, 136, 124, 255))           # plinth
    d.line([(7, 28), (W - 8, 28)], fill=(190, 186, 170, 255))
    d.line([(W - 8, 28), (W - 8, H - 2)], fill=(92, 88, 80, 255))
    d.polygon([(4, 16), (W - 5, 16), (W - 9, 28), (8, 28)], fill=(58, 50, 46, 255))   # bowl
    d.line([(4, 16), (W - 5, 16)], fill=(110, 96, 86, 255))
    for x in (8, 13, 18):
        d.line([(x, 17), (x + 1, 27)], fill=(36, 30, 28, 255))
    # fire: layered tongues, hot core
    d.polygon([(6, 16), (10, 6), (13, 11), (15, 1), (18, 10), (21, 5), (W - 6, 16)], fill=(236, 96, 26, 255))
    d.polygon([(9, 16), (12, 9), (15, 6), (18, 11), (W - 9, 16)], fill=(255, 178, 52, 255))
    d.polygon([(12, 16), (15, 10), (17, 16)], fill=(255, 238, 150, 255))
    return im


def lamp(seed):
    """Iron street lantern on a post."""
    W, H = 20, 60
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([9, 18, 11, H - 4], fill=(52, 46, 42, 255))
    d.line([(9, 18), (9, H - 4)], fill=(96, 88, 80, 255))
    d.rectangle([6, H - 5, 14, H - 2], fill=(60, 54, 50, 255))
    d.polygon([(5, 6), (15, 6), (14, 18), (6, 18)], fill=(44, 38, 34, 255))
    d.rectangle([7, 8, 13, 16], fill=(255, 214, 120, 255))
    d.rectangle([9, 9, 11, 15], fill=(255, 244, 196, 255))
    d.polygon([(4, 6), (10, 1), (16, 6)], fill=(60, 52, 46, 255))
    return im


def anvil(seed):
    W, H = 30, 24
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([9, 14, 20, H - 2], fill=(110, 76, 44, 255))            # stump
    d.line([(9, 14), (20, 14)], fill=(150, 108, 64, 255))
    d.polygon([(2, 6), (W - 4, 6), (W - 2, 9), (21, 10), (18, 14), (11, 14), (9, 10), (4, 10)], fill=(70, 72, 78, 255))
    d.line([(3, 6), (W - 5, 6)], fill=(170, 176, 186, 255))
    return im


def tent(seed):
    W, H = 70, 54
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # A-frame canvas tent seen 3/4 from the south: roof ridge, two canvas slopes, dark doorway
    d.polygon([(6, 40), (35, 8), (64, 40)], fill=(214, 196, 150, 255))
    d.polygon([(35, 8), (64, 40), (52, 44), (30, 12)], fill=(176, 156, 110, 255))
    for k in range(6):
        x = 10 + k * 9
        d.line([(x, 40), (35, 9)], fill=(190, 170, 124, 255))
    d.polygon([(26, 44), (35, 22), (44, 44)], fill=(52, 40, 28, 255))
    d.polygon([(6, 40), (64, 40), (66, 46), (4, 46)], fill=(150, 128, 86, 255))
    d.line([(35, 8), (35, 3)], fill=(90, 64, 36, 255), width=2)
    d.polygon([(35, 3), (44, 5), (35, 7)], fill=(170, 52, 40, 255))
    return im


def main():
    os.makedirs(KIT, exist_ok=True)
    mp = os.path.join(KIT, "kit-meta.json")
    meta = read_json(mp) if os.path.exists(mp) else {}
    made = {}
    for i in range(3):
        made[f"palm-{i}"] = palm(100 + i, lean=1 if i % 2 == 0 else -1)
    for i in range(4):
        made[f"grave-{i}"] = gravestone(200 + i)
    for i in range(2):
        made[f"deadtree-{i}"] = dead_tree(300 + i)
    made["tent-0"] = tent(400)
    made["mine-0"] = mine(700)
    made["brazier-0"] = brazier(800)
    made["lamp-0"] = lamp(801)
    made["anvil-0"] = anvil(802)
    for i in range(3):
        made[f"pine-{i}"] = pine(500 + i, h=1.0 - 0.08 * i)
    for i in range(3):
        made[f"column-{i}"] = column(600 + i)
    for name, img in made.items():
        size = finish(img, name)
        meta[name] = {"size": list(size), "tags": ["procedural"], "src": "procprops.py", "box": None,
                      "foot": None, "front": None, "roof": None, "band": None}
        print(name, size)
    write_json(mp, meta)


if __name__ == "__main__":
    main()
