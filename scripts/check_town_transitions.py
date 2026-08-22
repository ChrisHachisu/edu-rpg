#!/usr/bin/env python3
"""Every hi-fi town's exit must be its own LANDMARK exit cell in public/act1-world-map.js.

WHICH FILE IS THE AUTHORITY, AND WHY IT IS NOT THE OBVIOUS ONE
--------------------------------------------------------------
`public/act1-hifi/town/<town>-town.json` carries `exit.toX/toY`. There are two candidate sources for
that number and picking the wrong one puts the player tens of cells from the town they just left:

  * `src/data/maps.ts` -- each town's `connections` entry back to the overworld. **LEGACY.**
  * `public/act1-world-map.js` -- `LANDMARKS[].exit`, collected into `EXITS[mapId]`. **AUTHORITY.**

The Act 1 runtime override supersedes maps.ts at runtime, but only on one path. In
`wrapCheckTransition` it takes the base result and, when the target is the overworld and the landing
cell is inside the Act 1 bounds, rewrites it:

    var out = EXITS[this.currentMapId];
    if (out) { result.toX = out.x; result.toY = out.y; }

That path is `scene.checkTransition` -- the SHIPPED town's edge-exit. **A hi-fi town never reaches
it.** `adapter.js`'s `act1-town-exit` handler assigns `scene.heroTileX/heroTileY = data.toX/toY` and
calls `loadMap` directly. So for a hi-fi town the value in town.json is used RAW, with no rewrite,
and it must therefore ALREADY be the landmark exit cell.

For the shipped 16x16 towns maps.ts is still fine, because the override corrects them on the way
out. That is exactly what makes this confusing: maps.ts looks authoritative, is authoritative for
the towns that still use it, and is wrong for the ones that do not.

Measured 2026-08-22: portSapphire carried maps.ts's (130,291) against a landmark exit of (133,348) --
57 cells adrift, and LIVE, because it is the only town TOWN_IDS lets anyone reach.
"""
from __future__ import annotations
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN_DIR = os.path.join(ROOT, "public/act1-hifi/town")
WORLD_MAP = os.path.join(ROOT, "public/act1-world-map.js")


def landmark_exits() -> dict[str, tuple[int, int]]:
    src = open(WORLD_MAP).read()
    m = re.search(r"var LANDMARKS = (\[.*?\]);", src, re.S)
    if not m:
        raise SystemExit("check_town_transitions: no LANDMARKS array in public/act1-world-map.js")
    return {l["mapId"]: (l["exit"]["x"], l["exit"]["y"]) for l in json.loads(m.group(1))}


def main() -> int:
    want = landmark_exits()
    bad, checked = [], 0
    for f in sorted(os.listdir(TOWN_DIR)):
        if not f.endswith("-town.json"):
            continue
        town = f[: -len("-town.json")]
        ex = (json.load(open(os.path.join(TOWN_DIR, f))).get("exit") or {})
        got = (ex.get("toX"), ex.get("toY"))
        if town not in want:
            bad.append(f"  {town}: no LANDMARKS entry in public/act1-world-map.js")
            continue
        checked += 1
        if got != want[town]:
            bad.append(f"  {town}: exit.toX/toY is {got}, landmark exit is {want[town]} "
                       f"-- adapter.js uses this value raw, so the player would land there")
    if bad:
        print("TOWN TRANSITION CHECK FAIL:")
        print("\n".join(bad))
        return 1
    print(f"TOWN TRANSITION CHECK PASS: {checked} hi-fi town exits match their landmark exit cell "
          f"in public/act1-world-map.js")
    return 0


if __name__ == "__main__":
    sys.exit(main())
