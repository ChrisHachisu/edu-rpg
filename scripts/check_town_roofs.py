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

AND A SET OF FIXED PROBE POINTS, WHICH IS THE HALF THAT CANNOT BE GAMED. The footprint test above
measures the standable mask against the authored bands, so it says nothing at all if a BAND itself
is wrong -- shrink a band off a roof and the test still passes while the roof is walkable again.
That is not hypothetical: on 2026-08-24 the owner said the boundaries were still wrong in places
and every band in millbrook and greenhollow was pulled inward to stop them eating the lanes
(`scripts/tighten_town_bands.py`), which is exactly the edit this test is blind to.

So `ROOF_PROBES` holds eight points per town, measured once ON a roof in ART coordinates, and they
must never be standable no matter what the bands say. They are deliberately hard-coded and
deliberately NOT derived from the bands -- a probe derived from the thing it is checking is not a
check. If a plate is ever repainted these have to be re-measured, and the RGB each one sampled when
it was frozen is recorded beside it so that re-measurement can be verified rather than guessed.
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


# art-space points ON a roof, frozen 2026-08-24 with the RGB each one sampled at the time.
ROOF_PROBES = {
    "millbrook": {
        "green-roof": ((1094, 269), (101, 125, 55)), "teal-roof": ((412, 1287), (90, 103, 85)),
        "purple-roof": ((1512, 1287), (122, 98, 122)), "thatch": ((1512, 862), (188, 146, 48)),
        "terracotta-roof": ((1560, 500), (84, 44, 6)), "olive-roof": ((1100, 1300), (211, 173, 94)),
        "market-roof": ((470, 800), (181, 92, 30)), "mill-roof": ((300, 250), (44, 75, 105)),
    },
    # herb-shop-roof was re-frozen 2026-08-25 from (60,47,1) to (37,23,0): the herb-shop
    # quarter was repainted on owner report ("the town artwork is incorrect in some
    # locations"), which is exactly the case this check exists to catch. The probe point
    # itself did not move and was verified BY EYE to still sit on the roof shingles before
    # the new RGB was accepted -- re-measuring without looking would let a probe drift off
    # a roof onto whatever replaced it and keep passing forever.
    "greenhollow": {
        "stone-roof-nw": ((330, 220), (0, 1, 0)), "cottages-n-roof": ((760, 300), (8, 7, 0)),
        "market-stall-roof": ((430, 760), (79, 66, 0)), "herb-shop-roof": ((1380, 700), (37, 23, 0)),
        "teal-roof-sw": ((370, 1280), (0, 63, 58)), "green-roof-s": ((690, 1290), (42, 63, 8)),
        "brown-roof-se": ((1220, 1300), (234, 210, 152)), "blue-roof-se": ((1580, 1330), (0, 64, 36)),
    },
    "portSapphire": {
        "blue-roof-n": ((720, 180), (36, 52, 33)), "terracotta-roof-nw": ((370, 360), (116, 62, 0)),
        "market-roof": ((690, 640), (88, 103, 43)), "red-roof-w": ((240, 760), (25, 7, 2)),
        "slate-roof-e": ((1700, 850), (159, 160, 99)), "net-loft-roof": ((1350, 1150), (193, 206, 160)),
        "green-roof-se": ((1700, 1250), (255, 252, 199)), "blue-roof-sw": ((240, 1180), (102, 113, 53)),
    },
}


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
        probes = ROOF_PROBES.get(town, {})
        art_px = np.asarray(screen.convert("RGB"))
        for name, ((px, py), was) in probes.items():
            wx, wy = int(px * mask.shape[1] / aw), int(py * mask.shape[0] / ah)
            if mask[wy, wx]:
                bad.append(f"  {town}/{name}: the fixed roof probe at art ({px},{py}) is STANDABLE "
                           f"-- a band was pulled off a roof, or the plate moved")
            now = tuple(int(v) for v in art_px[py, px])
            if now != was:
                bad.append(f"  {town}/{name}: probe art ({px},{py}) sampled {now}, was {was} when "
                           f"frozen -- the plate was repainted, so re-measure the probes")
        print(f"  {town}: {len(bands)} authored building footprints, {len(probes)} fixed roof probes, "
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
