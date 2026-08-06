#!/usr/bin/env python3
"""Cut the authored dungeon layouts down to the runtime's floor payload.

`public/act1-dungeon-floors.json` is what `dq-tiles.js` fetches to override `scene.mapData`
for the Act-1 dungeons in `A1D_MAPS`. It already recorded `build_dungeon_semantic.py` as its
generator, but no script actually performed the cut -- the file had been assembled by hand,
which is why it silently kept the OLD Coastal Reef layout after the generator's own JSONs were
regenerated. A derived file with no generator is a file that goes stale without telling anyone.

The runtime needs eight keys per floor and none of the authoring metadata (pattern traces,
placement metrics, validation, joints), so this drops ~40% of the bytes that would otherwise
ship. `rows` and `assets` are carried verbatim: they ARE the collision and the interactables,
and re-deriving either here would put a second opinion into the pipeline.

SCOPE AND SHAPE ARE THE SHIPPED FILE'S. crystalCave is carried even though `A1D_MAPS` does not
override it and `a1dFloorFor()` will never return one of its floors: the hand-assembled file
carried them, `seed_ios_save.py` derives dev spawns from this file for ANY dungeon, and dropping
data while changing something else is how a size change turns into a silent regression.

`bossId` is STRIPPED, matching the shipped file. The authored value is not the runtime's: the
layouts carry `treant` for whisperingWoodsCave and `tidalSerpent` for coastalReef, where the
bundle's maps declare `mosswarden` and `coralTitan`. Emitting the authored id would put a wrong
boss id into the runtime payload -- latent today because dq-tiles.js keys on the asset KIND, and
a trap the moment anything reads it. Assets are therefore normalised to the four keys the
runtime actually consumes.

    export_act1_dungeon_floors.py [--check]
"""
from __future__ import annotations

import argparse
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "design/act1-dungeon-interiors")
OUT = os.path.join(ROOT, "public/act1-dungeon-floors.json")

# Mirrors A1D_MAPS in public/dq-tiles.js. Kept as a literal rather than parsed out of the JS:
# if the two ever disagree the right outcome is a visible mismatch, not a silent re-scope.
SHIPPED = {"coastalReef": 3, "sunkenCellar": 3, "whisperingWoodsCave": 3,
           "mistyGrotto": 3, "crystalCave": 6}

KEYS = ("dungeonId", "floor", "totalFloors", "width", "height", "theme", "rows", "assets")
ASSET_KEYS = ("kind", "x", "y", "onWall")
NOTE = ("Act-1 dungeon floors. 48 world px per cell. "
        "rows: # = rock, everything else walkable.")


def build() -> dict:
    floors = {}
    for dungeon, count in sorted(SHIPPED.items()):
        for n in range(1, count + 1):
            key = f"{dungeon}-f{n}"
            path = os.path.join(SRC, f"{key}.json")
            if not os.path.isfile(path):
                raise SystemExit(f"missing authored floor: {path}")
            src = json.load(open(path, encoding="utf-8"))
            if src.get("validation") not in (["ok"], None):
                raise SystemExit(f"{key} does not validate: {src.get('validation')}")
            floor = {k: src[k] for k in KEYS}
            floor["assets"] = [{k: a[k] for k in ASSET_KEYS if k in a}
                               for a in floor["assets"]]
            floors[key] = floor
    return {"version": 1, "generatedBy": "scripts/export_act1_dungeon_floors.py",
            "note": NOTE, "floors": floors}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if the shipped file is not what the layouts would produce")
    args = ap.parse_args()

    payload = build()
    text = json.dumps(payload, indent=1)

    if args.check:
        if not os.path.isfile(OUT):
            print("act1-dungeon-floors.json MISSING")
            return 1
        if open(OUT, encoding="utf-8").read() != text:
            print("act1-dungeon-floors.json is STALE against design/act1-dungeon-interiors/")
            return 1
        print(f"ACT1 DUNGEON FLOORS CHECK PASS: {len(payload['floors'])} floors")
        return 0

    open(OUT, "w", encoding="utf-8").write(text)
    cells = sum(len(f["rows"]) * len(f["rows"][0]) for f in payload["floors"].values())
    walk = sum(sum(r.count(c) for r in f["rows"] for c in set(r) if c != "#")
               for f in payload["floors"].values())
    print(f"ACT1 DUNGEON FLOORS: {len(payload['floors'])} floors, {cells} cells, "
          f"{walk} walkable -> {os.path.relpath(OUT, ROOT)}")
    for d in sorted(SHIPPED):
        w = sum(sum(1 for r in payload["floors"][f"{d}-f{n}"]["rows"] for ch in r if ch != "#")
                for n in range(1, SHIPPED[d] + 1))
        print(f"  {d:22s} {w:5d} walkable cells")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
