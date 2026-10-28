#!/usr/bin/env python3
"""Turn rendered floors into the full Act-1-shaped runtime set, in the scratch dir only:

  runtime/act<N>-dungeon-floors.json   same shape as public/act1-dungeon-floors.json
                                       (8 keys/floor, assets cut to kind/x/y/onWall)
  runtime/act<N>-dungeon-art/<floor>-overhead.png  + patched f1 -walk.png
                                       via scripts/bake_dungeon_arch.do_floor, unchanged
  runtime/act<N>-dungeon-art/<floor>-chests.png    via make_dungeon_chest_patches, unchanged

The shipped scripts are imported and only their path globals are pointed at the scratch tree.

ARCH ASSETS ARE BORROWED: bake_dungeon_arch needs an AUTHORED arch silhouette per dungeon
(design/act1-dungeons/arch/archasset-<dungeon>.png -- owner rule: never derive the arch from the
plate). No Act 2-5 arches have been drawn, so each dungeon borrows the Act 1 arch of the family
in ARCH_FROM. The bake's own invariants (jamb collision passable by a 16 px body; overlay never
hides the hero) still run and refuse rather than write a bad overhead.

    bake_runtime.py [--only id,id] [--floor1-only]
"""
import argparse, json, os, shutil, sys
from pathlib import Path
import common
from common import DESIGN, RUNTIME, SCRATCH, ROOT
from specs import SPECS
import bake_dungeon_arch as A
import make_dungeon_chest_patches as CP

SC, WW, MG, CR = "sunkenCellar", "whisperingWoodsCave", "mistyGrotto", "coastalReef"
ARCH_FROM = {
    "ironMine": SC, "stormNest": MG, "hauntedForest": WW, "frozenLake": MG, "shadowCave": MG,
    "oasisDepths": CR, "desertTomb": SC, "banditHideout": WW, "scorchedRuins": SC,
    "emberMines": SC, "magmaTunnels": MG, "obsidianCavern": MG, "volcanicForge": SC,
    "demonBarracks": SC, "voidRift": MG, "demonCastle": SC, "stormreachSpire": SC,
    "frostfallCavern": MG, "sunkenTempleDungeon": CR, "twilightDungeon": MG,
}
KEYS = ("dungeonId", "floor", "totalFloors", "width", "height", "theme", "rows", "assets")
ASSET_KEYS = ("kind", "x", "y", "onWall")


def export_floors(act, specs):
    floors = {}
    for s in specs:
        for n in range(1, s["floors"] + 1):
            p = os.path.join(DESIGN, f"{s['id']}-f{n}.json")
            if not os.path.exists(p):
                continue
            src = json.load(open(p))
            assert src["validation"] == ["ok"], (p, src["validation"])
            fl = {k: src[k] for k in KEYS}
            fl["assets"] = [{k: a[k] for k in ASSET_KEYS if k in a} for a in src["assets"]]
            floors[f"{s['id']}-f{n}"] = fl
    out = os.path.join(RUNTIME, f"act{act}-dungeon-floors.json")
    json.dump({"_note": f"Act-{act} dungeon floors (DESIGN PREVIEW, not shipped). 48 world px per "
                        "cell. rows: # = rock, everything else walkable.",
               "_generator": "scripts/acts/dungeons/author_floors.py -> build_dungeon_semantic.py",
               "floors": floors}, open(out, "w"), separators=(",", ":"))
    return out, floors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--floor1-only", action="store_true")
    a = ap.parse_args()
    only = set(a.only.split(",")) if a.only else None
    archdir = Path(SCRATCH) / "arch"
    (archdir / "walk-base").mkdir(parents=True, exist_ok=True)
    A.ASSETS = archdir
    A.BASE = archdir / "walk-base"
    for act in (2, 3, 4, 5):
        specs = [s for s in SPECS if s["act"] == act and (not only or s["id"] in only)]
        if not specs:
            continue
        fj, floors = export_floors(act, [s for s in SPECS if s["act"] == act])
        art = Path(RUNTIME) / f"act{act}-dungeon-art"
        A.ART = art
        # ---- arch: overhead + jamb-patched f1 walk
        for s in specs:
            key = f"{s['id']}-f1"
            fl = floors.get(key)
            if not fl or not (art / f"{key}-props.png").exists():
                continue
            shutil.copyfile(os.path.join(ROOT, "design/act1-dungeons/arch",
                                         f"archasset-{ARCH_FROM[s['id']]}.png"),
                            archdir / f"archasset-{s['id']}.png")
            mouth = next((x for x in fl["assets"] if x["kind"] == "mouth"), None)
            if mouth is None:
                print(f"  {key}: no mouth asset"); continue
            # bake_dungeon_arch snapshots the PRISTINE walk mask into arch/walk-base on first run
            # and patches from it afterwards (idempotent). render_floors.py deletes that snapshot
            # whenever it re-renders a floor, so a fresh render is re-seeded, never a patched one.
            try:
                ok, msg = A.do_floor(key, mouth, False, Path(SCRATCH) / "arch-proof", False, A.ARCH_SCALE)
            except SystemExit as e:
                ok, msg = False, f"{key}: {e}"
            print("  arch", msg)
        # ---- chest patches
        CP.ROOT = RUNTIME
        CP.FLOORS_JSON = os.path.basename(fj)
        CP.ART = art.name
        for s in specs:
            for n in range(1, (1 if a.floor1_only else s["floors"]) + 1):
                fid = f"{s['id']}-f{n}"
                if not (art / f"{fid}-props.png").exists():
                    continue
                sys.argv = ["make_dungeon_chest_patches.py", "--floor", fid]
                try:
                    CP.main()
                except SystemExit as e:
                    print(f"  chests {fid}: {e}")


if __name__ == "__main__":
    main()
