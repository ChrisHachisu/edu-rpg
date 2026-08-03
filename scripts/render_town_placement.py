#!/usr/bin/env python3
"""Render a generated town at a scale where the LAYOUT and the PLACEMENT can be judged by eye.

Owner, 2026-07-31: "i can't tell by words so go ahead and create the town and i will review
with my own eyes."

Every rule the generator claims to follow is drawn, so it is checkable by looking rather than
only by assertion:

  - walkable ground is one family of warm tones; everything that blocks is cool or dark
  - the quay street is the spine and runs gate to gate
  - buildings present a wall face to the street they front, with the door in that face
  - the shop's counter faces the water
  - the jetty deck is walkable to its end

Usage:
  render_town_placement.py                 # every town json in design/act1-towns
  render_town_placement.py --only portSapphire --px 30
"""
from __future__ import annotations

import argparse
import glob
import json
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/act1-towns")

# warm = you can walk here. cool/dark = it stands up.
TILE = {
    ".": ((232, 212, 172), "open ground: square / yard / jetty deck  (WALK)"),
    "=": ((178, 138, 92),  "street: the quay + the lanes  (WALK)"),
    ",": ((118, 162, 92),  "yard grass, touching a street  (WALK)"),
    "E": ((250, 226, 84),  "gate  (WALK, leaves town)"),
    "#": ((46, 68, 50),    "hedge / fence / town edge  (blocks)"),
    "^": ((146, 72, 56),   "roof  (blocks)"),
    "H": ((206, 180, 148), "wall face, street side  (blocks)"),
    "D": ((72, 44, 30),    "door  (blocks, interact)"),
    "W": ((96, 156, 186),  "shop window  (blocks)"),
    "C": ((242, 186, 52),  "shop counter  (blocks, interact)"),
    "A": ((214, 104, 62),  "awning  (blocks)"),
    "S": ((72, 220, 152),  "save point  (blocks, interact)"),
    "~": ((38, 72, 122),   "sea  (blocks)"),
}

PROP = {
    "well":        ((122, 128, 140), "well"),
    "crate":       ((160, 116, 62),  "crate"),
    "cargoCrate":  ((160, 116, 62),  "cargo stack"),
    "barrel":      ((142, 100, 54),  "barrel"),
    "dryingNet":   ((190, 182, 130), "drying net"),
    "mooringPost": ((104, 78, 56),   "mooring post"),
    "boat":        ((222, 214, 196), "moored boat"),
}

NPC = (250, 96, 120)
INK = (238, 238, 238)
DIM = (150, 156, 166)
BG = (22, 24, 28)


def render(town: dict, px: int, out: str) -> None:
    rows = town["rows"]
    h, w = len(rows), len(rows[0])
    pad, legend_h = px, px * 12
    W, H = w * px + pad * 2, h * px + pad * 2 + legend_h
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    def cell(x, y):
        return pad + x * px, pad + y * px

    for y in range(h):
        for x in range(w):
            ch = rows[y][x]
            col = TILE.get(ch, ((255, 0, 255), "?"))[0]
            cx, cy = cell(x, y)
            d.rectangle([cx, cy, cx + px - 1, cy + px - 1], fill=col)

    # faint grid so cell counts stay readable
    for x in range(w + 1):
        d.line([cell(x, 0), (pad + x * px, pad + h * px)], fill=(0, 0, 0), width=1)
    for y in range(h + 1):
        d.line([cell(0, y), (pad + w * px, pad + y * px)], fill=(0, 0, 0), width=1)

    # props: everything that stands up gets a solid disc, so no prop can read as flat ground
    for p in town["props"]:
        col = PROP.get(p["kind"], ((255, 255, 255), p["kind"]))[0]
        cx, cy = cell(p["x"], p["y"])
        m = px * 0.22
        d.ellipse([cx + m, cy + m, cx + px - m, cy + px - m], fill=col,
                  outline=(20, 20, 20), width=max(1, px // 16))

    # the shop counter's standing cell, drawn as the arrow the player actually walks
    sc = town["shopCounter"]
    sx, sy = cell(sc["standX"], sc["standY"])
    cx2, cy2 = cell(sc["x"], sc["y"])
    d.line([sx + px // 2, sy + px // 2, cx2 + px // 2, cy2 + px // 2],
           fill=(255, 240, 180), width=max(2, px // 8))

    # NPCs
    for n in town["npcs"]:
        cx, cy = cell(n["x"], n["y"])
        m = px * 0.15
        d.ellipse([cx + m, cy + m, cx + px - m, cy + px - m], fill=NPC,
                  outline=(24, 24, 24), width=max(1, px // 12))
        d.text((cx + px * 0.32, cy + px * 0.22), n["id"][0].upper(), fill=(30, 20, 24))

    # gate labels
    seen = set()
    for gt in town["gates"]:
        if gt["id"] in seen:
            continue
        seen.add(gt["id"])
        cx, cy = cell(gt["x"], gt["y"])
        d.text((cx + 2, cy - px * 0.75 if gt["y"] == 0 else cy + px * 1.1),
               gt["id"].upper() + " GATE", fill=(246, 226, 108))

    # header
    d.text((pad, pad * 0.28),
           f"{town['id']}  ·  {town['pattern']} plan  ·  {w}x{h}  ·  seed {town['seed']}  ·  "
           f"gates {len(seen)}  ·  validation {', '.join(town['validation'])}", fill=INK)

    # legend
    ly = pad + h * px + int(px * 0.9)
    d.text((pad, ly), "WALKABLE / BLOCKED — the whole legibility rule is this table", fill=INK)
    ly += int(px * 0.9)
    col_x = [pad, pad + int(w * px * 0.36), pad + int(w * px * 0.68)]
    items = list(TILE.items())
    per = (len(items) + 2) // 3
    for i, (ch, (col, label)) in enumerate(items):
        cxx = col_x[min(i // per, 2)]
        yy = ly + (i % per) * int(px * 0.72)
        d.rectangle([cxx, yy, cxx + px * 0.6, yy + px * 0.55], fill=col)
        d.text((cxx + px * 0.8, yy), label, fill=DIM)

    ly2 = ly + per * int(px * 0.72) + int(px * 0.5)
    d.text((pad, ly2), "PLACED — all props block; NPCs stand on walkable ground", fill=INK)
    ly2 += int(px * 0.9)
    entries = [(NPC, f"NPC: {', '.join(n['id'] for n in town['npcs'])}")]
    entries += [(PROP[k][0], PROP[k][1]) for k in
                sorted({p["kind"] for p in town["props"]}, key=str)]
    for i, (col, label) in enumerate(entries):
        cxx = col_x[min(i // 4, 2)]
        yy = ly2 + (i % 4) * int(px * 0.72)
        d.ellipse([cxx, yy, cxx + px * 0.55, yy + px * 0.55], fill=col)
        d.text((cxx + px * 0.8, yy), label, fill=DIM)

    img.save(out)
    print(f"  -> {out}  ({W}x{H})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--px", type=int, default=30)
    args = ap.parse_args()

    for path in sorted(glob.glob(os.path.join(DIR, "*.json"))):
        town = json.load(open(path))
        if args.only and town["id"] != args.only:
            continue
        print(town["id"])
        render(town, args.px, path.replace(".json", "-placement.png"))


if __name__ == "__main__":
    main()
