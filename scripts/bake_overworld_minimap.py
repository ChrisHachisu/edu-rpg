#!/usr/bin/env python3
"""Bake the overworld minimap terrain to ONE image, from the map the game collides with.

WHY THIS EXISTS
    `drawFieldMap()` in public/ui-overhaul.js painted the minimap as an 80x80 lattice of
    `fillRect` calls -- 6,402 of them per draw, up to 4.5 times a second on the main thread,
    measured at 2.4-3.1 ms. It also encoded terrain as the tile palette, which puts a portal
    (#33cc66), a haunted portal (#226622), forest (#225522) and a wall barrier (#1a4d1a) in
    four near-identical greens, so a hard blocker and a landmark were indistinguishable.

    This bakes the terrain ONCE, so the renderer becomes a single `drawImage` window blit plus
    a pin per visible landmark. Owner pick, 2026-08-07: variant B "Relief" of
    design/mockups/overworld-minimap-semantic.html -- flat land, NO road network, nothing
    competing with the coastline, the blocking masses and the pins.

ONE IMAGE FOR THE WHOLE WORLD
    Not five stitched act regions. The five act semantic maps tile the 320x400 world, but
    stitching them means seams, an act lookup per draw, and a region that is missing whenever
    the bounds are wrong. This goes back one step to the shared source both the act maps and
    the game come from, `generateOverworldMap(320, 400)`, and bakes the whole world. The
    window is then uniform everywhere and `drawFieldMap`'s existing sx/sy clamp already
    guarantees it never leaves the image.

THE MAP THIS BAKES, AND THE STEP THAT WAS MISSED
    Owner, 2026-08-07: "there is definitely a problem with the minimap. it does not match what
    i see on the actual overworld."

    It did not, and for TWO independent reasons. This script used to assemble its own grid from
    `semantic-maps/runtime-overworld-grid.json` plus the Act 1 runtime SNAPSHOT. Both are wrong
    for this purpose:

      1. The snapshot is extracted by scripts/extract_act1_runtime_snapshot.mjs from the map
         AFTER consolidateMapData and BEFORE act1-world-map.js writes the OWNER'S PAINTED PLATE
         over the Act 1 rect (dq-tiles.js ~line 3316). That plate moves 11,578 cells inside the
         rect -- it is where the owner's coastline, his woods and his eight doors actually are.
         (The snapshot's constant is even NAMED `FINAL_MAP_SHA256`, which is what makes this so
         easy to miss: it is final only up to the plate.)
      2. The cached grid predates the current consolidator constants and disagrees with it by a
         further 1,626 cells OUTSIDE the rect.

    Total: 13,204 of 128,000 cells drawn from a map the game does not use. Coastlines are the
    tell, and the pins were worse than the terrain -- Greenhollow was drawn at the generator's
    (60,340) while the game puts it at the owner's (69,255).

    So the grid is no longer assembled here at all. It is REQUESTED from
    scripts/bake_act1_overworld_walk.mjs --emit-map, which is the collision bake -- the one that
    already hit this exact trap and whose header says so outright ("THE PLATE IS THE STEP THAT
    WAS MISSED FIRST TIME"). That script's buildFinalMap() is now the single definition of the
    shipped map, and it asserts the bundle, the consolidated map and the plated map against
    pinned hashes before handing any of it over. The minimap and the collider therefore cannot
    disagree about which world is real, which is the whole point.

    The plate SOURCE hash rides along in the emitted record and is asserted here, so a plate
    that moves without a re-bake is caught rather than quietly drawn.

THE INVARIANT, inherited from scripts/smooth_owner_semantic.py
    "The class at every cell CENTRE is preserved exactly. Collision is unchanged. Only the
    appearance of the boundary between cell centres moves."

    This script ASSERTS it rather than hoping for it, and exits non-zero if a single cell
    centre disagrees with the grid. That matters: blur+argmax WITHOUT the bump-correction loop
    leaves thousands of centres carrying the wrong class, and a minimap that misstates
    walkability is worse than the lattice it replaces. `build_semantic_map_from_runtime.py`
    has no bump loop, which is why the method is taken from `smooth_owner_semantic.py`.

    The field is solved at exactly the SHIP resolution (S = BAKE_PX = 6 px/cell), so the
    invariant is proven on the pixels that actually ship. `smooth_owner_semantic.py` needs its
    second `enforce_render` pass only because it solves at 12 px/cell and then bicubically
    resamples to 48; there is no resample here, so there is nothing to re-check.

VALUE ENCODES WALKABILITY
    Every walkable class is rendered lighter than every blocking class and water is darkest, so
    "can I get there" is answered by brightness before colour is read. That is asserted too,
    per pixel, after the two tonal modulations (coastal shelf, canopy haze) are applied -- an
    unbounded haze would otherwise be free to darken open ground past a mountain.

    The four semantic classes map 1:1 onto design/continent-terrain-class-method/
    SHIPPED-BLOCKING-RULES.md: tiles 2, 3, 4 and 14 block, everything else is walkable ground
    INCLUDING every landmark tile, because a town or a cave mouth is entered from walkable
    ground and must not read as a wall.

DETERMINISM
    Same inputs, byte-identical PNG. The only randomness is the project's canonical seed 42,
    drawn from one `default_rng` in a fixed class order.

Usage:
    scripts/bake_overworld_minimap.py             # bake + assert + write
    scripts/bake_overworld_minimap.py --check     # assert, and refuse a stale PNG on disk
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import smooth_owner_semantic as SM  # noqa: E402  -- the blur, the constants and the method

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIPPED_MAP_BAKE = os.path.join(ROOT, "scripts/bake_act1_overworld_walk.mjs")
PLATE_SOURCE = os.path.join(ROOT, "public/act1-world-map.js")
OUT_PNG = os.path.join(ROOT, "public/ui-map/overworld-relief.png")
OUT_MARKS = os.path.join(ROOT, "design/ui-overhaul/overworld-minimap-marks.json")
RENDERER = os.path.join(ROOT, "public/ui-overhaul.js")

# The renderer carries the mark table inline rather than fetching a second asset for 50 points.
# It is rewritten IN PLACE between these sentinels, the way scripts/regenerate_pins.py rewrites
# the runtime pins: derived data in a hand-maintained file has to be generated, or the pins and
# the terrain they sit on drift apart the first time the grid moves.
MARK_BEGIN = "  /* BEGIN GENERATED overworld-minimap-marks */\n"
MARK_END = "  /* END GENERATED overworld-minimap-marks */\n"
MM_KINDS = ("town", "castle", "dungeon", "portal", "hauntedPortal",
            "signpost", "stormNest", "gateCave", "specialCave")

WORLD_W, WORLD_H = 320, 400
BAKE_PX = 6                 # px per cell in the baked image; see "SHIP RESOLUTION" below.

# SHIP RESOLUTION. The device is 402x702 CSS at dpr 3 and the minimap is ~150 CSS px, so the
# canvas is ~450 device px across 80 tiles = 5.6 px/tile. 6 px/cell therefore covers dpr 3 with
# no upscaling, and the whole world costs 1920x2400.

# ---------------------------------------------------------------------------------------------
# Overworld tile ids, from the header of src/utils/MapGenerator.ts:
#   0 grass  1 path  2 water  3 tree  4 mountain  5 bridge  6 town  7 cave  8 castle  9 portal
#   10 hauntedPortal  11 signpost  12 stormNest  13 darkPath  14 wallBarrier  15 gateCave
#   16 frozenLake  17 mist  18 desert  19 specialCave  20 desertSignpost
#
# The WALKABILITY split is exactly RUNTIME_ROLE in build_semantic_map_from_runtime.py, which is
# exactly SHIPPED-BLOCKING-RULES.md. The APPEARANCE split below subdivides walkable ground into
# open / desert / ice so the frozen north and the desert read as different country -- a purely
# visual subdivision that cannot change walkability, because each appearance class belongs to
# exactly one walkability.
#
# ROADS ARE DELIBERATELY ABSENT. path (1), bridge (5) and darkPath (13) resolve to plain open
# ground. Variant B is the owner's pick precisely because it draws no route network, so these
# must not come back as a faint thread.
# ---------------------------------------------------------------------------------------------
CLASS_OF_TILE = {
    0: "ground", 1: "ground", 2: "water", 3: "forest", 4: "rock", 5: "ground",
    6: "ground", 7: "ground", 8: "ground", 9: "ground", 10: "ground", 11: "ground",
    12: "ground", 13: "ground", 14: "rock", 15: "ground", 16: "ice", 17: "ice",
    18: "desert", 19: "ground", 20: "desert",
    # 21 is undocumented in MapGenerator.ts's header and appears nowhere in the TS source -- it
    # comes out of the frozen bundle's generator as a 3x2 structure at (245-247, 93-94), a gate
    # straddling the road through a mountain pass, with a cave mouth beside it. The old cached
    # grid predated it entirely and carried plain road there, which is why this table never had
    # to name it before. It BLOCKS in OW_BLOCK and in the bundle's own canMove -- exactly as
    # town, castle and cave mouth do -- so it takes the same treatment they do: drawn as the
    # ground it is approached from, per the convention stated above. Six cells, outside Act 1.
    21: "ground",
}
BLOCKS = {"water", "forest", "rock"}          # walkable: ground, desert, ice
BLOCKING_TILES = {2, 3, 4, 14}                # the authority, SHIPPED-BLOCKING-RULES.md

# Charcoal & Gold Leaf, keyed to the tokens in public/ui-overhaul.css :root. Ordered by value:
# every walkable colour is lighter than every blocking colour, and water is darkest of all.
COLOUR = {
    "water":  (0x14, 0x1a, 0x26),
    "forest": (0x24, 0x3a, 0x2d),
    "rock":   (0x33, 0x31, 0x3a),
    "ground": (0x4b, 0x53, 0x41),
    "desert": (0x6b, 0x5f, 0x43),
    "ice":    (0x66, 0x72, 0x7e),
}
SHELF = (0x1f, 0x2b, 0x3e)    # water within sight of land; still a blocker, still darker than
                              # every walkable class -- it exists to give the coastline an edge.
SHELF_CELLS = 2.2             # how far the shelf reaches out from the shore, in cells
CANOPY_MAX = 0.40             # hard ceiling on the wood haze; see the luminance guard below
CANOPY_CELLS = 2.6            # radius over which scattered trees accumulate into a wood

# Both modulations are quantised to a few discrete steps rather than left as continuous ramps,
# and the image ships as an INDEXED PNG built from the resulting palette. This is a size
# decision with a visual dividend. As a 24-bit image with smooth ramps the bake is 567 KB,
# because a continuous gradient defeats PNG's row filters; quantised to 23 colours it is a
# fraction of that, and the flat banding suits "Relief" -- the variant whose whole point is
# that nothing competes with the coastline, the blocking masses and the pins.
SHELF_STEPS = 5
CANOPY_STEPS = 4

# The game's woods are scattered single trees at roughly half density, so the truthful class
# layer alone renders a wood as static. A soft density haze sits UNDER the class layer: walkable
# ground inside a wood darkens toward the canopy colour while every actually blocking trunk
# still draws on top of it. It moves no boundary and flips no cell centre.
#
# CANOPY_MAX is not a taste value, it is a guard. Blending open ground (luma 78.6) toward forest
# (luma 49.9) reaches the lightest blocker, rock (luma 50.6), at t = 0.70. Capping at 0.40
# leaves the darkest hazed ground at luma 67.1, a 16.5 margin over rock, and assert_value_order()
# re-checks the real pixels rather than trusting this arithmetic.

CLASSES = ("desert", "forest", "ground", "ice", "rock", "water")   # sorted; fixes the rng order


def luma(rgb) -> float:
    """Rec.601 luma. The ordering this file asserts is a VALUE ordering, not a channel one."""
    r, g, b = rgb
    return 0.299 * r + 0.587 * g + 0.114 * b


# ---------------------------------------------------------------------------------------------
# 1. The grid the game actually collides with
# ---------------------------------------------------------------------------------------------
def load_grid() -> tuple[np.ndarray, dict]:
    """THE map the runtime holds: generator -> consolidateMapData -> the owner's painted plate.

    Not assembled here. Requested from the collision bake, which owns that three-step chain and
    asserts every step against a pinned hash (see the header). Re-deriving it in this file would
    be a second authority that can drift from the collider, which is the bug this fixes.
    """
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "shipped-map.json")
        proc = subprocess.run(["node", SHIPPED_MAP_BAKE, "--emit-map", out],
                              capture_output=True, text=True)
        if proc.returncode != 0:
            raise SystemExit("the collision bake refused to emit the shipped map -- the world "
                             f"this minimap would draw is unverified:\n{proc.stderr.strip()}")
        record = json.load(open(out))

    if record.get("schema") != 1:
        raise SystemExit(f"shipped-map record schema {record.get('schema')}, expected 1")
    grid = np.asarray(record["rows"], dtype=np.int16)
    if grid.shape != (WORLD_H, WORLD_W):
        raise SystemExit(f"shipped map is {grid.shape}, expected {(WORLD_H, WORLD_W)}")

    # The emitter hashes the map it hands over; re-hash it here rather than trusting the label,
    # so a truncated or edited record cannot pass as the shipped world.
    got = hashlib.sha256(grid.astype(np.uint8).tobytes()).hexdigest()
    if got != record["platedSha256"]:
        raise SystemExit(f"emitted map hashes {got}, record claims {record['platedSha256']}")

    # THE PLATE IS THE STEP THAT WAS MISSED FIRST TIME. Pin its source here too, so a plate that
    # is repainted without re-running this bake is caught instead of quietly drawn.
    plate_sha = hashlib.sha256(open(PLATE_SOURCE, "rb").read()).hexdigest()
    if plate_sha != record["plateSourceSha256"]:
        raise SystemExit(f"{os.path.relpath(PLATE_SOURCE, ROOT)} hashes {plate_sha[:16]} but the "
                         f"emitted map was built from {record['plateSourceSha256'][:16]}")

    print(f"grid: {WORLD_W}x{WORLD_H}, THE SHIPPED MAP")
    print(f"  consolidated {record['consolidatedSha256'][:16]} -> plated {record['platedSha256'][:16]}")
    print(f"  owner plate source {plate_sha[:16]}, plate rect {record['plateRectSha256'][:16]}")
    return grid, {"plated": record["platedSha256"], "plateSource": plate_sha,
                  "consolidated": record["consolidatedSha256"], "bundle": record["bundleSha256"]}


# ---------------------------------------------------------------------------------------------
# 2. The smoothing, with the bump-correction loop that makes the invariant hold
# ---------------------------------------------------------------------------------------------
def build_fields(truth_idx: np.ndarray, S: int):
    """One occupancy field per class, blurred + noised, then bumped until no centre is wrong.

    Steps 1-5 of scripts/smooth_owner_semantic.py, with that file's own blur and its own
    constants (SIGMA_CELLS 0.85, NOISE_AMP 0.11, NOISE_SIGMA_CELLS 1.6, SEED 42). Only the
    resolution differs: the field is built at the ship resolution so the argmax IS the shipped
    pixel and no resample can flip a centre afterwards.
    """
    h, w = truth_idx.shape
    H, W = h * S, w * S
    rng = np.random.default_rng(SM.SEED)

    fields = []
    for i, name in enumerate(CLASSES):
        m = (truth_idx == i).astype(np.float32)
        up = np.repeat(np.repeat(m, S, axis=0), S, axis=1)
        f = SM.blur(up, SM.SIGMA_CELLS * S)
        n = SM.blur(rng.standard_normal((H, W)).astype(np.float32), SM.NOISE_SIGMA_CELLS * S)
        sd = n.std()
        if sd > 0:
            n /= sd
        fields.append(f + SM.NOISE_AMP * n)
        print(f"  field {name:<7} built")
    fields = np.stack(fields)

    cy = np.arange(h) * S + S // 2
    cx = np.arange(w) * S + S // 2

    br = max(2, int(round(0.55 * S)))
    yy, xx = np.mgrid[-br:br + 1, -br:br + 1]
    bump = np.exp(-(yy ** 2 + xx ** 2) / (2 * (0.42 * S) ** 2)).astype(np.float32)

    for it in range(12):
        lab = fields.argmax(axis=0)
        bad = np.argwhere(lab[np.ix_(cy, cx)] != truth_idx)
        print(f"  bump iteration {it}: {len(bad)} cell centre(s) wrong")
        if len(bad) == 0:
            return fields, lab, it
        amp = 0.30 + 0.22 * it            # the same escalation smooth_owner_semantic.py uses
        for by, bx in bad:
            c = truth_idx[by, bx]
            py, px = by * S + S // 2, bx * S + S // 2
            ay0, ay1 = max(0, py - br), min(H, py + br + 1)
            ax0, ax1 = max(0, px - br), min(W, px + br + 1)
            sub = bump[ay0 - (py - br):ay1 - (py - br), ax0 - (px - br):ax1 - (px - br)]
            fields[c, ay0:ay1, ax0:ax1] += amp * sub

    lab = fields.argmax(axis=0)
    remaining = int((lab[np.ix_(cy, cx)] != truth_idx).sum())
    raise SystemExit(f"REFUSING: {remaining} cell centre(s) could not be preserved after 12 "
                     f"iterations -- a minimap that misstates walkability must not ship")


# ---------------------------------------------------------------------------------------------
# 3. Colour, and the two tonal modulations that do not move a boundary
# ---------------------------------------------------------------------------------------------
def _mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def colourise(lab: np.ndarray, truth_idx: np.ndarray, S: int):
    """Return (index image, palette). Every pixel resolves to one of ~23 registered colours."""
    H, W = lab.shape
    water_i = CLASSES.index("water")
    forest_i = CLASSES.index("forest")
    water = lab == water_i

    # Coastal shelf: water near land lifts toward SHELF, so the coastline has an edge instead of
    # dissolving into one flat dark mass. It is still water, still blocking, still darker than
    # every walkable class.
    land_near = SM.blur((~water).astype(np.float32), SHELF_CELLS * S)
    shelf_s = np.rint(np.clip(land_near / 0.28, 0.0, 1.0) * SHELF_STEPS).astype(np.uint8)

    # Canopy haze: walkable ground inside a wood darkens toward the canopy. Computed from the
    # CELL grid, not from the smoothed label, so it is genuinely a density field and not an
    # outline of the class layer.
    wood = (truth_idx == forest_i).astype(np.float32)
    wood_up = np.repeat(np.repeat(wood, S, axis=0), S, axis=1)
    density = SM.blur(wood_up, CANOPY_CELLS * S)
    haze_s = np.rint(np.clip(density / 0.42, 0.0, 1.0) * CANOPY_STEPS).astype(np.uint8)

    palette, slot = [], {}

    def reg(rgb):
        if rgb not in slot:
            slot[rgb] = len(palette)
            palette.append(rgb)
        return slot[rgb]

    idx = np.zeros((H, W), dtype=np.uint8)
    for i, name in enumerate(CLASSES):
        here = lab == i
        if not here.any():
            continue
        if name == "water":
            for s in range(SHELF_STEPS + 1):
                idx[here & (shelf_s == s)] = reg(_mix(COLOUR["water"], SHELF, s / SHELF_STEPS))
        elif name in BLOCKS:                       # forest and rock: flat, no modulation
            idx[here] = reg(COLOUR[name])
        else:                                      # walkable: ground, desert, ice
            for s in range(CANOPY_STEPS + 1):
                t = (s / CANOPY_STEPS) * CANOPY_MAX
                idx[here & (haze_s == s)] = reg(_mix(COLOUR[name], COLOUR["forest"], t))
    return idx, palette


# ---------------------------------------------------------------------------------------------
# 4. The assertions. Both are failable checks on the real pixels, not on the intent.
# ---------------------------------------------------------------------------------------------
def assert_centres(lab: np.ndarray, truth_idx: np.ndarray, S: int) -> int:
    h, w = truth_idx.shape
    cy = np.arange(h) * S + S // 2
    cx = np.arange(w) * S + S // 2
    wrong = int((lab[np.ix_(cy, cx)] != truth_idx).sum())
    print(f"ASSERT cell centres: {wrong} of {h * w} carry a class different from the grid")
    if wrong:
        raise SystemExit("REFUSING: the bake does not preserve every cell centre")
    return wrong


def assert_walkability(lab: np.ndarray, grid: np.ndarray, S: int) -> None:
    """The rendered class at every cell centre must agree with SHIPPED-BLOCKING-RULES.md."""
    h, w = grid.shape
    cy = np.arange(h) * S + S // 2
    cx = np.arange(w) * S + S // 2
    got_blocks = np.isin(lab[np.ix_(cy, cx)], [CLASSES.index(c) for c in BLOCKS])
    want_blocks = np.isin(grid, list(BLOCKING_TILES))
    wrong = int((got_blocks != want_blocks).sum())
    print(f"ASSERT walkability vs SHIPPED-BLOCKING-RULES: {wrong} of {h * w} cells disagree")
    if wrong:
        raise SystemExit("REFUSING: the bake misstates walkability")


def assert_value_order(idx: np.ndarray, palette, lab: np.ndarray) -> None:
    """Every walkable PIXEL lighter than every blocking pixel, after shelf and haze.

    Measured on the palette entries the pixels actually resolve to, so the quantisation is
    inside the check rather than upstream of it.
    """
    lut = np.array([luma(c) for c in palette], dtype=np.float32)
    lum = lut[idx]
    blocking = np.isin(lab, [CLASSES.index(c) for c in BLOCKS])
    hi_block = float(lum[blocking].max())
    lo_walk = float(lum[~blocking].min())
    print(f"ASSERT value order: lightest blocking pixel {hi_block:.1f}, "
          f"darkest walkable pixel {lo_walk:.1f}, margin {lo_walk - hi_block:+.1f}")
    if lo_walk <= hi_block:
        raise SystemExit("REFUSING: a blocking pixel is lighter than a walkable one -- "
                         "brightness no longer answers 'can I get there'")


# ---------------------------------------------------------------------------------------------
# 5. Landmarks, taken from the grid's OWN landmark tiles
# ---------------------------------------------------------------------------------------------
# NOT from semantic-maps/landmark-roster.json. That file puts every Act 1 landmark on plain
# grass -- Greenhollow is 85.7 cells from where the game puts it, Whispering Woods 80.1,
# Millbrook 65.4, Port Sapphire 56.8. The terrain in those PNGs is truthful because it is
# derived from the runtime grid; the stamped pins are not. The grid's own tiles cannot drift,
# because they are the same array the player walks on.
MARK_TILES = {
    6: "town", 7: "dungeon", 8: "castle", 9: "portal", 10: "hauntedPortal",
    11: "signpost", 12: "stormNest", 15: "gateCave", 19: "specialCave", 20: "signpost",
}


def landmarks(grid: np.ndarray):
    marks = []
    for tile, kind in sorted(MARK_TILES.items()):
        for y, x in np.argwhere(grid == tile):
            marks.append({"t": kind, "tile": tile, "x": int(x), "y": int(y)})
    marks.sort(key=lambda m: (m["y"], m["x"]))
    return marks


def write_marks_into_renderer(marks) -> bool:
    """Rewrite MM_MARKS in public/ui-overhaul.js between the sentinels. Returns True if changed."""
    source = open(RENDERER, encoding="utf-8").read()
    if MARK_BEGIN not in source or MARK_END not in source:
        raise SystemExit(f"sentinels missing from {os.path.relpath(RENDERER, ROOT)}")
    rows = ", ".join(f"[{MM_KINDS.index(m['t'])},{m['x']},{m['y']}]" for m in marks)
    body = "  var MM_MARKS = [" + rows + "];\n"
    head, rest = source.split(MARK_BEGIN, 1)
    _old, tail = rest.split(MARK_END, 1)
    updated = head + MARK_BEGIN + body + MARK_END + tail
    if updated == source:
        return False
    open(RENDERER, "w", encoding="utf-8").write(updated)
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="assert only, write nothing")
    args = ap.parse_args()

    S = BAKE_PX
    grid, prov = load_grid()

    # Name every tile the shipped map actually contains, or refuse. The generator emitted a tile
    # this table had never seen (21) and the bake died on a bare KeyError three steps later; an
    # unnamed tile is a terrain class nobody chose, and guessing one is how a minimap starts
    # lying. Fail here, with the census, so the decision is made deliberately.
    unknown = sorted({int(t) for t in np.unique(grid)} - set(CLASS_OF_TILE))
    if unknown:
        counts = ", ".join(f"tile {t} x{int((grid == t).sum())}" for t in unknown)
        raise SystemExit(f"REFUSING: the shipped map contains tile id(s) CLASS_OF_TILE does not "
                         f"name: {counts}. Classify them (and check OW_BLOCK in public/dq-tiles.js "
                         f"for whether they block) before baking.")

    truth_idx = np.vectorize(lambda t: CLASSES.index(CLASS_OF_TILE[int(t)]))(grid).astype(np.int64)

    fields, lab, iters = build_fields(truth_idx, S)
    print(f"centre-preservation solve: converged after {iters} bump iteration(s)")

    assert_centres(lab, truth_idx, S)
    assert_walkability(lab, grid, S)

    idx, palette = colourise(lab, truth_idx, S)
    assert_value_order(idx, palette, lab)
    print(f"palette: {len(palette)} colours")

    marks = landmarks(grid)
    print(f"landmarks from the grid's own tiles: {len(marks)}")

    payload = Image.fromarray(idx, mode="P")
    flat = [v for c in palette for v in c]
    payload.putpalette(flat + [0] * (768 - len(flat)))

    if args.check:
        # A STALE ARTEFACT IS THE FAILURE THIS WHOLE CHANGE IS ABOUT, so --check compares the
        # actual bytes on disk against a fresh bake rather than merely re-proving, in memory,
        # invariants that a stale PNG would also satisfy. The bake is deterministic (see
        # DETERMINISM above), so any difference is a real staleness.
        with tempfile.TemporaryDirectory() as tmp:
            probe = os.path.join(tmp, "probe.png")
            payload.save(probe, optimize=True, bits=8)
            fresh = open(probe, "rb").read()
        if not os.path.exists(OUT_PNG):
            raise SystemExit(f"REFUSING: {os.path.relpath(OUT_PNG, ROOT)} does not exist")
        have = open(OUT_PNG, "rb").read()
        if have != fresh:
            raise SystemExit(
                f"REFUSING: {os.path.relpath(OUT_PNG, ROOT)} is stale -- on disk "
                f"{hashlib.sha256(have).hexdigest()[:16]}, freshly baked "
                f"{hashlib.sha256(fresh).hexdigest()[:16]}. Rerun scripts/bake_overworld_minimap.py")
        want_marks = json.dumps(marks, indent=1)
        if not os.path.exists(OUT_MARKS) or open(OUT_MARKS, encoding="utf-8").read() != want_marks:
            raise SystemExit(f"REFUSING: {os.path.relpath(OUT_MARKS, ROOT)} is stale -- "
                             "rerun scripts/bake_overworld_minimap.py")
        rows = ", ".join(f"[{MM_KINDS.index(m['t'])},{m['x']},{m['y']}]" for m in marks)
        if ("  var MM_MARKS = [" + rows + "];\n") not in open(RENDERER, encoding="utf-8").read():
            raise SystemExit(f"REFUSING: MM_MARKS in {os.path.relpath(RENDERER, ROOT)} does not "
                             "match the terrain under it -- rerun scripts/bake_overworld_minimap.py")
        print(f"MINIMAP RELIEF CHECK PASS: relief, marks and MM_MARKS all match the shipped map "
              f"(plated {prov['plated'][:16]}, plate source {prov['plateSource'][:16]})")
        return

    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    payload.save(OUT_PNG, optimize=True, bits=8)
    os.makedirs(os.path.dirname(OUT_MARKS), exist_ok=True)
    json.dump(marks, open(OUT_MARKS, "w"), indent=1)

    size = os.path.getsize(OUT_PNG)
    digest = hashlib.sha256(open(OUT_PNG, "rb").read()).hexdigest()
    print(f"wrote {os.path.relpath(OUT_PNG, ROOT)}  {idx.shape[1]}x{idx.shape[0]}  "
          f"{size:,} B  sha256 {digest}")
    print(f"wrote {os.path.relpath(OUT_MARKS, ROOT)}  {len(marks)} marks")
    changed = write_marks_into_renderer(marks)
    print(f"{'rewrote' if changed else 'unchanged'} MM_MARKS in "
          f"{os.path.relpath(RENDERER, ROOT)}  {len(marks)} marks")


if __name__ == "__main__":
    main()
