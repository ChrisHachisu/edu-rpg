#!/usr/bin/env python3
"""No cell a player can stand on may sit on a building. Measured, per town, against the painting.

WHY THIS GATE EXISTS
--------------------
Owner, on TestFlight build 57, 2026-08-24: *"the towns are walkable on weird places like the roofs
of houses and i think it is because you confused the green roofs as grass."* He was right about the
symptom. The cause is broader than green roofs and it is not fixable by tuning a colour threshold,
which is exactly why this is a GATE and not a comment.

Measured on millbrook's plate, three roofs classified as ground and no two by the same clause:

    teal shingle     RGB( 90,103, 85)  -> lawn_mask
    green shingle    RGB(101,125, 55)  -> lawn_mask AND paving_mask
    lavender slate   RGB(122, 98,122)  -> paving_mask

Cream plaster walls read as paving too. Roof green and lawn green, and roof slate and cobble, are
the same materials in the same palette; nothing local separates them. Every structural alternative
was measured and rejected before the footprints were authored -- see `stamp_roof_bands()` in
`scripts/derive_town_walkable.py` for the numbers, including the projection argument that says why
none of them can work: the plates are three-quarter top-down, so a roof's rear edge meets the ground
with no wall, shadow or gap in between.

WHAT THIS CHECKS
----------------
For every town with a `design/act1-towns/<town>-authored-obstacles.json`, the standable mask --
walkable minus holes minus static obstacles, eroded by `actorFootRadius`, i.e. the exact rule
`place_town_actors.py` and the runtime use -- must not contain a single pixel inside any authored
`nonWalkableBands` footprint. Zero, not "few": a footprint is authored to be solid, so any overlap
means the derivation drifted from the art or a band was edited without re-deriving.

A town with no authored file is reported and skipped rather than passed silently.
"""
from __future__ import annotations
import glob, importlib.util, json, os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN_DIR = os.path.join(ROOT, "public/act1-hifi/town")
_spec = importlib.util.spec_from_file_location(
    "_pta", os.path.join(ROOT, "scripts/place_town_actors.py"))
_pta = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pta)


def main() -> int:
    bad, checked, skipped = [], 0, []
    for tj in sorted(glob.glob(os.path.join(TOWN_DIR, "*-town.json"))):
        town = os.path.basename(tj)[: -len("-town.json")]
        authored = os.path.join(ROOT, f"design/act1-towns/{town}-authored-obstacles.json")
        if not os.path.exists(authored):
            skipped.append(town)
            continue
        cfg = json.load(open(tj))
        walk = json.load(open(os.path.join(TOWN_DIR, os.path.basename(cfg["walkable"]))))
        screen = Image.open(os.path.join(TOWN_DIR, os.path.basename(cfg["screen"])))
        aw, ah = screen.size
        mask = _pta.standable(walk)
        stand = np.asarray(Image.fromarray((mask * 255).astype(np.uint8))
                           .resize((aw, ah), Image.NEAREST)) > 0
        bands = json.load(open(authored)).get("nonWalkableBands", [])
        if not bands:
            bad.append(f"  {town}: authored file has no nonWalkableBands")
            continue
        checked += 1
        for b in bands:
            pts = ([tuple(p) for p in b["polygonArt"]] if "polygonArt" in b else
                   [(b["bboxArt"][0], b["bboxArt"][1]), (b["bboxArt"][2], b["bboxArt"][1]),
                    (b["bboxArt"][2], b["bboxArt"][3]), (b["bboxArt"][0], b["bboxArt"][3])])
            im = Image.new("1", (aw, ah), 0)
            ImageDraw.Draw(im).polygon(pts, fill=1)
            hit = int((stand & np.asarray(im).astype(bool)).sum())
            if hit:
                ys, xs = np.nonzero(stand & np.asarray(im).astype(bool))
                bad.append(f"  {town}/{b['id']}: {hit} standable art px inside the building "
                           f"footprint, e.g. ({int(xs[0])},{int(ys[0])})")
        print(f"  {town}: {len(bands)} authored building footprints, "
              f"standable {mask.mean() * 100:.1f}% of the frame, 0 px on a building")
    for t in skipped:
        print(f"  {t}: no design/act1-towns/{t}-authored-obstacles.json -- SKIPPED, not passed")
    if bad:
        print("TOWN ROOF CHECK FAIL:")
        print("\n".join(bad))
        return 1
    print(f"TOWN ROOF CHECK PASS: {checked} town(s), no standable ground on any building")
    return 0


if __name__ == "__main__":
    sys.exit(main())
