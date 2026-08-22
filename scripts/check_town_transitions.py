#!/usr/bin/env python3
"""Every hi-fi town's exit must land where the SHIPPED overworld actually keeps that town's door.

THE BUG THIS EXISTS TO CATCH, found 2026-08-22. `public/act1-hifi/town/<town>-town.json` carries
`exit.toX/toY`, and `adapter.js` writes those straight into `scene.heroTileX/heroTileY` with no
conversion. The scene they land in is the SHIPPED tile runtime -- `TOWN_IDS` gates only the TOWNS
onto the hi-fi overlay, and adapter.js says so in its own header: the overworld "goes back to the
shipped tile runtime until a real hi-fi overworld exists". So those numbers live in the 320x400
space of `src/data/maps.ts`, and nothing else.

Two of the three towns had them in the WRONG SPACE. millbrook read (39,345) and greenhollow (69,256)
-- their landmark exit cells from `public/act1-world-map.js`, a different grid entirely. millbrook's
own note asserted this was correct. Walking out of millbrook would have put the player about 61
cells from its door. Port Sapphire was right, and that is exactly why nobody noticed: it is the only
town TOWN_IDS lets anyone reach, so it is the only exit ever walked through.

That is the shape of bug a gate is for -- silent, data-only, invisible until the feature ships, and
introduced by a note confidently describing the wrong authority.
"""
from __future__ import annotations
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN_DIR = os.path.join(ROOT, "public/act1-hifi/town")
MAPS_TS = os.path.join(ROOT, "src/data/maps.ts")


def shipped_exits() -> dict[str, tuple[int, int]]:
    """Each town's own `connections` entry back to the overworld, from the shipped map data."""
    src = open(MAPS_TS).read()
    out = {}
    for m in re.finditer(r"^  (\w+): \{\n(.*?)\n  \},", src, re.S | re.M):
        town, body = m.group(1), m.group(2)
        if "type: 'town'" not in body:
            continue
        c = re.search(r"targetMap: 'overworld',[^}]*?toX: (\d+), toY: (\d+)", body)
        if c:
            out[town] = (int(c.group(1)), int(c.group(2)))
    return out


def main() -> int:
    shipped = shipped_exits()
    bad = []
    checked = 0
    for f in sorted(os.listdir(TOWN_DIR)):
        if not f.endswith("-town.json"):
            continue
        town = f[: -len("-town.json")]
        d = json.load(open(os.path.join(TOWN_DIR, f)))
        ex = d.get("exit") or {}
        got = (ex.get("toX"), ex.get("toY"))
        want = shipped.get(town)
        if want is None:
            bad.append(f"  {town}: no 'town' entry with an overworld connection in src/data/maps.ts")
            continue
        checked += 1
        if got != want:
            bad.append(f"  {town}: exit.toX/toY is {got}, shipped maps.ts says {want}")
    if bad:
        print("TOWN TRANSITION CHECK FAIL:")
        print("\n".join(bad))
        return 1
    print(f"TOWN TRANSITION CHECK PASS: {checked} hi-fi town exits land on their shipped "
          f"overworld door")
    return 0


if __name__ == "__main__":
    sys.exit(main())
