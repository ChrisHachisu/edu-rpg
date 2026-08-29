#!/usr/bin/env python3
"""Every dungeon puts the player on its own MOUTH, facing in -- and cannot do anything else.

WHAT THIS GUARDS, AND WHY IT IS NOT OBVIOUS
    A dungeon entry does not carry a landing cell. `public/act1-world-map.js`'s LANDMARKS give every
    cave the same `toX/toY` of (50, 1) -- a leftover from the procedural 100x100 dungeons -- which
    is not a coordinate on any of these hand-authored floors. Nothing goes wrong today only because
    that coordinate is ILLEGAL on all five: it is off the map on four of them and solid rock on
    coastalReef, so `dq-tiles.js`'s a1dRescueHero fires and relocates her to the floor's `mouth`
    asset, which is where she is supposed to be.

    That is luck, not design. The moment a floor is regenerated a few cells wider, or a corridor
    happens to run through (50, 1), the engine's landing becomes LEGAL, the rescue never fires, and
    the player materialises somewhere in the middle of the dungeon with no way to know she has
    skipped the entrance. Owner, build 65: "entering into dungeons should always position the
    players in the entrance direction or hard block the player from entering the dungeon from an
    unauthorized location." This is the hard block, as a gate.

    It asserts three things per floor-1 dungeon:
      1. The floor HAS a `mouth` asset, and it is walkable. It is the authored entrance.
      2. The engine's fixed landing is NOT a legal standing cell on that floor, so the rescue is
         guaranteed to run and the authored mouth is guaranteed to win.
      3. The mouth has exactly ONE open neighbour. That is what makes "the entrance direction"
         well defined -- a1dRescueHero reads the facing off it, and a mouth with two exits would
         make the direction it picks depend on scan order.
"""
from __future__ import annotations
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOORS = os.path.join(ROOT, "public/act1-dungeon-floors.json")
WORLD_MAP = os.path.join(ROOT, "public/act1-world-map.js")
DQ_TILES = os.path.join(ROOT, "public/dq-tiles.js")
OPEN = "."          # act1-dungeon-floors rows: '#' is rock, anything else is a floor marker
ROCK = "#"


def a1d_maps() -> set[str]:
    """The dungeons whose RUNTIME map is act1-dungeon-floors.json -- read from the runtime, not
    hardcoded, because this check is only meaningful where that file is the map actually loaded.

    crystalCave is the reason this matters. It has a `crystalCave-f1` entry in the floors JSON,
    44x53 with a mouth at (8,49), and NONE of it is loaded: `A1D_MAPS` in dq-tiles.js excludes it,
    so the engine builds it from src/data/maps.ts instead -- 100x100, with its overworld connection
    at (50,99), which is exactly where the engine lands. Judging it against the floors JSON says
    "she lands 24 cells from the mouth" and is simply the wrong map. A check that reads authored
    data the runtime ignores does not find bugs, it invents them.
    """
    m = re.search(r"var A1D_MAPS=\{([^}]*)\}", open(DQ_TILES).read())
    if not m:
        raise SystemExit("check_dungeon_entries: no A1D_MAPS in public/dq-tiles.js")
    return set(re.findall(r"(\w+)\s*:", m.group(1)))


def landmark_entries() -> dict[str, tuple[int, int]]:
    src = open(WORLD_MAP).read()
    m = re.search(r"var LANDMARKS = (\[.*?\]);", src, re.S)
    if not m:
        raise SystemExit("check_dungeon_entries: no LANDMARKS array in public/act1-world-map.js")
    return {l["mapId"]: (l["toX"], l["toY"]) for l in json.loads(m.group(1))}


def main() -> int:
    want = landmark_entries()
    scope = a1d_maps()
    floors = json.loads(open(FLOORS).read())["floors"]
    bad, checked = [], 0
    for key, fl in sorted(floors.items()):
        if fl.get("floor") != 1:
            continue
        dungeon = key.split("-")[0]
        if dungeon not in want:
            continue                              # not reachable from the Act 1 overworld
        if dungeon not in scope:
            print(f"  {key:26s} skipped -- outside A1D_MAPS, so this floor JSON is not its map")
            continue
        rows, W, H = fl["rows"], fl["width"], fl["height"]
        mouth = next((a for a in fl.get("assets", []) if a.get("kind") == "mouth"), None)
        if not mouth:
            bad.append(f"  {key}: no `mouth` asset -- there is no authored entrance to land on")
            continue
        checked += 1
        mx, my = mouth["x"], mouth["y"]
        if rows[my][mx] == ROCK:
            bad.append(f"  {key}: the mouth ({mx},{my}) is rock; she cannot stand on her own entrance")
        tx, ty = want[dungeon]
        legal = 0 <= tx < W and 0 <= ty < H and rows[ty][tx] != ROCK
        if legal and (tx, ty) != (mx, my):
            bad.append(f"  {key}: the engine lands at ({tx},{ty}), which is WALKABLE and is not the "
                       f"mouth ({mx},{my}) -- a1dRescueHero will not fire and the player enters "
                       f"mid-dungeon. Point this dungeon's LANDMARKS toX/toY at its mouth.")
        opens = [(dx, dy) for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))
                 if 0 <= my + dy < H and 0 <= mx + dx < W and rows[my + dy][mx + dx] != ROCK]
        if len(opens) != 1:
            bad.append(f"  {key}: the mouth has {len(opens)} open neighbours {opens}; "
                       f"'the entrance direction' is then whichever one scan order finds first")
        print(f"  {key:26s} mouth ({mx:3d},{my:3d})  engine lands ({tx},{ty}) "
              f"{'LEGAL' if legal else 'illegal -> rescue fires'}  facing {opens}")

    if bad:
        print("DUNGEON ENTRY CHECK FAIL:")
        print("\n".join(bad))
        return 1
    print(f"DUNGEON ENTRY CHECK PASS: {checked} dungeon(s) land on their own mouth with one "
          f"unambiguous way in ({len(scope)} in A1D_MAPS)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
