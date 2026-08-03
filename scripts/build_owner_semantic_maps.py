#!/usr/bin/env python3
"""Render the OWNER-PAINTED semantic maps that Codex paints the artwork from.

Owner, 2026-07-29: the generated semantic map was rejected ("the semantic map is a
mess"), so the terrain is now hand-drawn in terrain-planner.html. This turns that export
into the same flat colour-coded contract the art pass already consumed -- one colour per
visual terrain, landmark markers stamped on top -- but sourced from the owner's hand
instead of the generator.

Input : design/continent-terrain-class-method/owner-terrain/owner-terrain.json
Output: <same dir>/actN-owner-semantic.png  + owner-semantic-index.json

The owner's JSON is INPUT and is never rewritten here.
"""
from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain")
SRC = os.path.join(DIR, "owner-terrain.json")
PACK = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent/continent-macro-g3")
PX = 16  # matches the previous semantic maps, so the art pass sees the same scale

# One colour per VISUAL terrain, same legend the art pass already used.
ROLE = {
    ".": ("ground", (226, 210, 156)),
    "F": ("vegetation", (26, 82, 46)),
    "M": ("rock", (128, 126, 122)),
    "W": ("water", (30, 82, 170)),
    "R": ("path", (170, 120, 60)),
}
SEA = (30, 82, 170)
KIND_RGB = {"town": (235, 120, 90), "story": (170, 90, 190), "side": (127, 157, 196),
            "connector": (232, 72, 168), "portal": (150, 128, 90)}
# Marker kind per landmark name, from the planner roster.
KIND_OF = {
    "Greenhollow": "town", "Millbrook": "town", "Port Sapphire": "town",
    "Ironkeep": "town", "Frostwatch": "town", "Ravenhollow": "town",
    "Ruins Camp": "town", "Oasis Haven": "town", "Ember's Rest": "town",
    "Cinderwatch": "town", "Last Bastion": "town", "Haven's Edge": "town",
    "Storm Nest": "story", "Haunted Forest": "story",
    "Haunted Forest (second entrance)": "story", "Desert Tomb": "story",
    "Demon Barracks": "story", "Void Rift": "story", "Demon Castle": "story",
    "Crystal Cave": "connector", "Crystal Cave (Act 2 side)": "connector",
    "Shadow Cave": "connector", "Shadow Cave (Act 3 side)": "connector",
    "Magma Tunnels": "connector", "Magma Tunnels (Act 4 side)": "connector",
    "Volcanic Forge": "connector", "Volcanic Forge (Act 5 side)": "connector",
}


def kind_of(name: str) -> str:
    if name in KIND_OF:
        return KIND_OF[name]
    return "portal" if name.startswith("Portal") else "side"


def main() -> None:
    data = json.load(open(SRC))
    land = np.load(os.path.join(PACK, "land-mask.npy"))
    index = {}

    for act in sorted(data["acts"]):
        A = data["acts"][act]
        x0, y0, x1, y1 = A["bounds"]
        rows = A["terrainRows"]
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if len(rows) != h or any(len(r) != w for r in rows):
            raise SystemExit(f"act {act}: terrainRows do not match bounds")

        rgb = np.zeros((h, w, 3), dtype=np.uint8)
        used = set()
        for yy in range(h):
            row = rows[yy]
            for xx in range(w):
                if not land[y0 + yy, x0 + xx]:
                    rgb[yy, xx] = SEA
                    used.add("water")
                    continue
                role, colour = ROLE[row[xx]]
                rgb[yy, xx] = colour
                used.add(role)

        img = Image.fromarray(rgb).resize((w * PX, h * PX), Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(img)
        markers = []
        for name, cell in sorted(A["landmarks"].items()):
            kind = kind_of(name)
            cx = (cell[0] - x0) * PX + PX // 2
            cy = (cell[1] - y0) * PX + PX // 2
            r = PX * 3 // 2
            draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                         fill=KIND_RGB[kind], outline=(255, 255, 255), width=3)
            markers.append({"name": name, "kind": kind, "cell": cell})

        out = os.path.join(DIR, f"act{act}-owner-semantic.png")
        img.save(out)
        index[f"act{act}"] = {
            "bounds": [x0, y0, x1, y1], "pxPerCell": PX, "size": [w * PX, h * PX],
            "legend": [{"key": k, "rgb": list(v)} for k, v in
                       [(ROLE[c][0], ROLE[c][1]) for c in ROLE] if k in used]
            + [{"key": k, "rgb": list(v)} for k, v in KIND_RGB.items()],
            "markers": markers,
        }
        counts = {ROLE[c][0]: sum(r.count(c) for r in rows) for c in ROLE}
        print(f"act{act}: {w*PX}x{h*PX}  " +
              "  ".join(f"{k} {v}" for k, v in counts.items() if v))

    json.dump(index, open(os.path.join(DIR, "owner-semantic-index.json"), "w"), indent=1)
    print("wrote", os.path.relpath(DIR, ROOT))


if __name__ == "__main__":
    main()
