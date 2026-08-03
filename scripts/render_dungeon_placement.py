#!/usr/bin/env python3
"""Render Act-1 dungeon floors at a scale where the ASSET PLACEMENT can actually be judged.

Owner, 2026-07-31: "i want to see the maps you generated and the asset placement to see if you
are getting it right."

The build script's review sheets are 11 px per cell, which is fine for reading a floor's shape
and useless for reading where a chest went. This draws one floor big, with the thing that
explains every placement decision: the MAIN ROUTE from the way in to the payoff.

Every placement rule is stated in terms of that route, so drawing it makes the rules checkable
by eye rather than only by assertion:

  - the payoff sits at the far end of the journey, not merely far away in a straight line
  - chests sit OFF the route, at dead ends — if a chest is drawn on the route, that is a defect
  - the save crystal sits ON the route at the boss chamber's mouth
  - the sign sits just inside the way in

Usage:
  render_dungeon_placement.py                    # every dungeon, one sheet each
  render_dungeon_placement.py --only mistyGrotto --px 22
"""
from __future__ import annotations

import argparse
import glob
import json
import os
from collections import deque

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-dungeon-interiors")

PAL = {"bg": (15, 16, 19), "rock": (26, 24, 29), "edge": (70, 64, 74),
       "floor": (150, 139, 119), "floor2": (128, 118, 100),
       "text": (230, 230, 230), "dim": (146, 152, 160), "route": (250, 236, 150)}

ASSET = {
    "mouth":      ((236, 200, 96),  "M", "way in from the overworld"),
    "stairsUp":   ((154, 204, 244), "U", "stairs up to the floor above"),
    "stairsDown": ((86, 148, 234),  "D", "stairs down"),
    "boss":       ((222, 62, 62),   "B", "boss"),
    "chest":      ((236, 168, 52),  "C", "chest — must be OFF the route, at a dead end"),
    "save":       ((92, 220, 150),  "S", "save crystal — at the boss chamber mouth"),
    "sign":       ((176, 184, 194), "i", "plaque — mounted ON the wall"),
    
    "hiddenDoor": ((196, 146, 236), "h", "false wall — hidden room behind it"),
    "torch":      ((255, 172, 66),  "T", "torch — +2 fog radius"),
    "keyChest":   ((244, 228, 112), "K", "key chest (not generated)"),
    "lockedDoor": ((200, 90, 202),  "L", "locked door (not generated)"),
}


def route_of(fl: dict) -> tuple[list[tuple[int, int]], dict, int]:
    """Recompute the route from the grid, so the picture shows what the CHECK sees, not what
    the placer claimed."""
    rows = fl["rows"]
    h, w = len(rows), len(rows[0])
    walk = {(x, y) for y in range(h) for x in range(w) if rows[y][x] != "#"}
    kinds: dict[str, list[tuple[int, int]]] = {}
    for a in fl["assets"]:
        kinds.setdefault(a["kind"], []).append((a["x"], a["y"]))
    entry = (kinds.get("mouth") or kinds.get("stairsUp") or [None])[0]
    if entry is None:
        return [], {}, 0
    dist = {entry: 0}
    q = deque([entry])
    while q:
        c = q.popleft()
        for nb in ((c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)):
            if nb in walk and nb not in dist:
                dist[nb] = dist[c] + 1
                q.append(nb)
    payoff = (kinds.get("boss") or kinds.get("stairsDown") or [None])[0]
    route: list[tuple[int, int]] = []
    if payoff in dist:
        cur = payoff
        route.append(cur)
        while dist[cur] > 0:
            nxt = min((nb for nb in ((cur[0] + 1, cur[1]), (cur[0] - 1, cur[1]),
                                     (cur[0], cur[1] + 1), (cur[0], cur[1] - 1)) if nb in dist),
                      key=lambda z: dist[z])
            if dist[nxt] >= dist[cur]:
                break
            cur = nxt
            route.append(cur)
    return route, dist, max(dist.values()) if dist else 0


def render_floor(fl: dict, px: int) -> Image.Image:
    rows = fl["rows"]
    h, w = len(rows), len(rows[0])
    img = Image.new("RGB", (w * px, h * px), PAL["rock"])
    d = ImageDraw.Draw(img, "RGBA")

    for y in range(h):
        for x in range(w):
            if rows[y][x] == "#":
                continue
            tone = PAL["floor"] if (x // 3 + y // 3) % 2 == 0 else PAL["floor2"]
            d.rectangle([x * px, y * px, x * px + px - 1, y * px + px - 1], fill=tone)
    for y in range(h):
        for x in range(w):
            if rows[y][x] != "#":
                continue
            if any(0 <= x + dx < w and 0 <= y + dy < h and rows[y + dy][x + dx] != "#"
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                d.rectangle([x * px, y * px, x * px + px - 1, y * px + px - 1], fill=PAL["edge"])

    route, dist, ecc = route_of(fl)
    for x, y in route:
        cx, cy = x * px + px // 2, y * px + px // 2
        r = max(2, px // 6)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*PAL["route"], 110))

    for a in fl["assets"]:
        rgb, letter, _ = ASSET[a["kind"]]
        if a.get("onWall"):                   # a plaque hangs on rock; outline it, do not fill
            x, y = a["x"] * px, a["y"] * px
            d.rectangle([x + 1, y + 1, x + px - 2, y + px - 2], outline=rgb, width=3)
            if px >= 16:
                d.text((x + px // 2 - 3, y + px // 2 - 6), letter, fill=rgb)
            continue
        x, y = a["x"] * px, a["y"] * px
        d.rectangle([x + 1, y + 1, x + px - 2, y + px - 2], fill=rgb, outline=(8, 8, 10), width=2)
        if px >= 16:
            d.text((x + px // 2 - 3, y + px // 2 - 6), letter, fill=(12, 12, 14))
    return img


def sheet(spec_floors: list[dict], name: str, px: int, path: str) -> None:
    pad, gap, header = 18, 18, 66
    tiles = [render_floor(f, px) for f in spec_floors]
    per_row = 3 if len(tiles) > 3 else len(tiles)
    rows_n = (len(tiles) + per_row - 1) // per_row
    tw = max(t.width for t in tiles)
    th = max(t.height for t in tiles)
    foot = 30 + 14 * ((len(ASSET) + 2) // 3)
    W = max(pad * 2 + per_row * tw + gap * (per_row - 1), 900)
    H = header + rows_n * (th + 44) + foot
    img = Image.new("RGB", (W, H), PAL["bg"])
    d = ImageDraw.Draw(img)

    f0 = spec_floors[0]
    d.text((pad, 12), f"{name}  ·  {f0['totalFloors']} floors  ·  pattern "
                      f"{'/'.join(sorted({f['pattern'] for f in spec_floors}))}"
                      f"  ·  joints {'/'.join(str(j) + chr(176) for j in f0['joints'])}",
           fill=PAL["text"])
    d.text((pad, 30), "Pale dots = the main route from the way in to the payoff. "
                      "Chests must sit OFF it, at dead ends; the save crystal ON it, "
                      "at the boss chamber mouth.", fill=PAL["dim"])
    d.text((pad, 46), "Every rule below is re-derived from the grid by validate(), not taken "
                      "from the placer.", fill=PAL["dim"])

    for i, (tile, fl) in enumerate(zip(tiles, spec_floors)):
        cx = pad + (i % per_row) * (tw + gap)
        cy = header + (i // per_row) * (th + 44)
        img.paste(tile, (cx, cy))
        p = fl["placement"]
        ratio = p["payoffDistance"] / max(1, p["eccentricity"])
        d.text((cx, cy + tile.height + 5),
               f"F{fl['floor']}  {fl['width']}x{fl['height']}  {fl['pattern']}",
               fill=PAL["text"])
        d.text((cx, cy + tile.height + 19),
               f"payoff {p['payoffDistance']}/{p['eccentricity']} steps ({ratio:.0%} of the "
               f"floor's reach) · arena {p['payoffArena']} cells · {fl['deadEnds']} dead ends",
               fill=PAL["dim"])

    ly = H - foot + 8
    lx = pad
    for kind, (rgb, letter, label) in ASSET.items():
        if lx > W - 300:
            lx, ly = pad, ly + 14
        d.rectangle([lx, ly + 2, lx + 10, ly + 12], fill=rgb, outline=(8, 8, 10))
        d.text((lx + 15, ly + 1), f"{letter}  {label}", fill=PAL["dim"])
        lx += 300
    img.save(path)


def single(fl: dict, name: str, path: str) -> None:
    """One floor, one image, sized so a phone shows it at full width.

    Three floors side by side is fine on a desktop and shrinks to nothing on a phone. Cell size
    is chosen to land the image near 1100 px wide whatever the floor's dimensions, so every
    floor arrives at roughly the same on-screen scale.
    """
    rows = fl["rows"]
    w = len(rows[0])
    px = int(max(14, min(34, 1100 // w)))
    tile = render_floor(fl, px)
    pad, header, foot = 16, 62, 58
    W = max(tile.width + pad * 2, 560)
    img = Image.new("RGB", (W, header + tile.height + foot), PAL["bg"])
    d = ImageDraw.Draw(img)

    p_ = fl["placement"]
    ratio = p_["payoffDistance"] / max(1, p_["eccentricity"])
    d.text((pad, 13), f"{name} — Floor {fl['floor']}", fill=PAL["text"])
    d.text((pad, 32), f"{fl['width']}x{fl['height']} cells · {fl['pattern']} · payoff at "
                      f"{ratio:.0%} of the floor's reach · arena {p_['payoffArena']}",
           fill=PAL["dim"])
    img.paste(tile, ((W - tile.width) // 2, header))

    ly = header + tile.height + 10
    lx = pad
    for kind, (rgb, letter, label) in ASSET.items():
        if kind in ("keyChest", "lockedDoor", "hiddenDoor"):
            continue
        if not any(a["kind"] == kind for a in fl["assets"]):
            continue
        d.rectangle([lx, ly + 2, lx + 11, ly + 13], fill=rgb, outline=(8, 8, 10))
        short = label.split(" — ")[0]
        d.text((lx + 16, ly + 1), f"{letter} {short}", fill=PAL["dim"])
        lx += 150
        if lx > W - 150:
            lx, ly = pad, ly + 16
    d.text((pad, header + tile.height + 40), "pale dots = main route from the way in",
           fill=PAL["dim"])
    img.save(path)


def stack(floors: list, name: str, path: str) -> None:
    """Floors stacked VERTICALLY, each at full width.

    Three floors side by side shrinks each to a third of the screen on a phone. Stacked, every
    floor gets the full width and the reader scrolls instead of squinting.
    """
    tiles = []
    for fl in floors:
        w = len(fl["rows"][0])
        px = int(max(14, min(30, 1080 // w)))
        tiles.append((render_floor(fl, px), fl))
    pad, gap, head, cap = 16, 30, 46, 40
    W = max(max(t.width for t, _ in tiles) + pad * 2, 620)
    H = head + sum(t.height + cap + gap for t, _ in tiles)
    img = Image.new("RGB", (W, H), PAL["bg"])
    d = ImageDraw.Draw(img)
    d.text((pad, 12), name, fill=PAL["text"])
    d.text((pad, 28), "pale dots = main route from the way in  ·  "
                      "M way in · U up · D down · B boss · C chest · S save crystal · "
                      "i plaque (on wall)", fill=PAL["dim"])
    y = head
    for tile, fl in tiles:
        p_ = fl["placement"]
        ratio = p_["payoffDistance"] / max(1, p_["eccentricity"])
        d.text((pad, y), f"Floor {fl['floor']} — {fl['width']}x{fl['height']} · {fl['pattern']}"
                         f" · payoff at {ratio:.0%} of the floor's reach", fill=PAL["text"])
        img.paste(tile, ((W - tile.width) // 2, y + 22))
        y += tile.height + cap + gap
    img.save(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--px", type=int, default=18)
    ap.add_argument("--single", action="store_true", help="one image per floor, phone sized")
    ap.add_argument("--stack", action="store_true", help="floors stacked vertically, max 3/image")
    args = ap.parse_args()

    ids = sorted({os.path.basename(p).split("-f")[0] for p in glob.glob(os.path.join(DIR, "*-f*.json"))})
    if args.only:
        ids = [i for i in ids if i == args.only] or ids
    names = {"sunkenCellar": "Sunken Cellar", "whisperingWoodsCave": "Whispering Woods",
             "mistyGrotto": "Darkfang Grotto", "coastalReef": "Coastal Reef",
             "crystalCave": "Crystal Cave"}
    for did in ids:
        paths = sorted(glob.glob(os.path.join(DIR, f"{did}-f*.json")),
                       key=lambda p: int(p.rsplit("-f", 1)[1].split(".")[0]))
        floors = [json.load(open(p)) for p in paths]
        if args.stack:
            for i in range(0, len(floors), 3):
                chunk = floors[i:i + 3]
                suffix = "" if len(floors) <= 3 else f"-{chunk[0]['floor']}to{chunk[-1]['floor']}"
                out = os.path.join(DIR, f"{did}-stack{suffix}.png")
                stack(chunk, names.get(did, did), out)
                print(f"  {os.path.basename(out)}")
            continue
        if args.single:
            for fl in floors:
                out = os.path.join(DIR, f"{did}-f{fl['floor']}-placement.png")
                single(fl, names.get(did, did), out)
                print(f"  {os.path.basename(out)}")
            continue
        out = os.path.join(DIR, f"{did}-placement.png")
        sheet(floors, names.get(did, did), args.px, out)
        print(f"{did:22s} {len(floors)} floors -> {os.path.basename(out)}")


if __name__ == "__main__":
    main()
