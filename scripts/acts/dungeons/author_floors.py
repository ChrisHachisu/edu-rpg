#!/usr/bin/env python3
"""Author Acts 2-5 floor layouts with the SAME generator that authored Act 1.

Act 1's layouts are not the bundle's seeded `Ap()` generator: they are authored by
`scripts/build_dungeon_semantic.py` (joint-controlled karst patterns, ADR-0076 chests, 3-cell
canvas frame) and swapped into `scene.mapData` at runtime by `public/dq-tiles.js` (`A1D_MAPS`,
fed by `public/act1-dungeon-floors.json`). Because the engine reads mapData for collision, the
authored JSON IS the collision once that override covers a dungeon -- art and gameplay cannot
disagree. This script imports that module unchanged and only swaps its DUNGEONS / OUT / ACT,
so no generator code is forked and the seed rule (crc32(id) + floor*7919) is identical.

    author_floors.py [--only id[,id]] [--floor1-only]
"""
import argparse, json, os, zlib
import common  # noqa: F401  (sys.path)
from common import DESIGN
import build_dungeon_semantic as B
from specs import SPECS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--floor1-only", action="store_true")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    os.makedirs(DESIGN, exist_ok=True)
    idx_path = os.path.join(DESIGN, "index.json")
    index = json.load(open(idx_path)) if os.path.exists(idx_path) else {"dungeons": {}}
    total_bad = 0
    for spec in SPECS:
        if only and spec["id"] not in only:
            continue
        B.ACT = spec["act"]                     # hidden rooms switch on from Act 3, as authored
        B.OUT = DESIGN
        floors = []
        last = 1 if a.floor1_only else spec["floors"]
        for f in range(1, last + 1):
            fl = B.crop_to_content(
                B.generate_floor(spec, f, zlib.crc32(spec["id"].encode()) + f * 7919))
            errs = B.validate(fl)
            fl["validation"] = errs or ["ok"]
            fl["act"] = spec["act"]
            if spec.get("mechanic"):
                fl["bundleMechanic"] = spec["mechanic"]
            total_bad += len(errs)
            floors.append(fl)
            with open(os.path.join(DESIGN, f"{spec['id']}-f{f}.json"), "w") as fh:
                json.dump(fl, fh, indent=1)
            print(f"{spec['id']}-f{f}: {fl['width']}x{fl['height']} walk {fl['walkableCells']} "
                  f"{fl['pattern']} {'OK' if not errs else 'FAIL ' + '; '.join(errs)}")
        B.render_dungeon(spec, floors, os.path.join(DESIGN, f"{spec['id']}-review.png"))
        index["dungeons"][spec["id"]] = {
            "act": spec["act"], "floorsAuthored": len(floors), "floorsBundle": spec["floors"],
            "walkable": [f["walkableCells"] for f in floors],
            "errors": [f"F{f['floor']}: {'; '.join(f['validation'])}" for f in floors
                       if f["validation"] != ["ok"]]}
    index["_source"] = "scripts/acts/dungeons/author_floors.py -> scripts/build_dungeon_semantic.py"
    json.dump(index, open(idx_path, "w"), indent=1)
    print("ALL FLOORS VALID" if total_bad == 0 else f"{total_bad} VALIDATION ERRORS")


if __name__ == "__main__":
    main()
