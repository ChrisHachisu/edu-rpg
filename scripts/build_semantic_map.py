#!/usr/bin/env python3
"""Build the flat-colour SEMANTIC MAP that Codex/sol paints the overworld art from.

Owner-approved method (2026-07-24): instead of img2img over a half-rendered textured
base, hand the model a flat colour-coded map with organic region boundaries plus an
explicit colour->meaning legend. Proven on a 2-tile A/B test: regions land where their
colour is, boundaries stay organic, and rock/vegetation quality beats the textured-base
route. Rationale + evidence: session log 2026-07-24.

Two rules this file exists to enforce:

1. ONE COLOUR PER VISUAL TERRAIN, not per semantic class (owner, 2026-07-24). `meadow`
   and `lightForest` are both walkable tree-free grass, so they share one green -- giving
   them separate colours made the model paint a pointless darker band between them. The
   class map keeps the distinction for gameplay; the ART map must not.

2. THIN + SMALL FEATURES SURVIVE. A Gaussian over one-hot masks is what makes regions
   organic, but it erases anything narrow: Act 1 has 2499 trail cells (mostly 1 cell
   wide), 48 landmarkSolid and 13 structure cells. Those are composited back on top of
   the smoothed terrain instead of competing in the argmax.

Deterministic, no Codex, no network.
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASS_MAP = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent/"
                               "continent-macro-g3/terrain-classes.json")

# Act bounds are INCLUSIVE [minX,minY,maxX,maxY], from CONTINENT-MACRO-GEOGRAPHY-SPEC.md
# section 2. Act 1's is also render_overworld_dq_art.DEFAULT_BOUNDS.
# Owner 2026-07-25: "whether the seams of act 4 and 5 actually match". They did not.
# Three of the five neighbouring pairs had a strip of continent in NEITHER crop:
#   act2 y222.. vs act3 ..y210  -> rows 211-221 shown nowhere
#   act4 x163.. vs act5 ..x158  -> columns 159-162 shown nowhere
#   act1 y218.. vs act5 ..y206  -> rows 207-217 shown nowhere
# so the five maps could not be laid edge to edge, and each connector's two mouths
# sat on opposite sides of a strip that was never drawn. Act 1's rect is ALSO
# render_overworld_dq_art.DEFAULT_BOUNDS and Acts 2/4 are referenced by the spec,
# so the gaps are closed by growing acts 3 and 5 only -- the ends nobody else pins.
ACTS = {
    1: (16, 218, 163, 399),
    2: (161, 222, 312, 399),
    3: (163, 88, 314, 221),   # y1 210 -> 221, meeting act 2's y222
    4: (163, 3, 314, 128),
    5: (9, 7, 162, 217),      # x1 158 -> 162 meeting act 4's x163; y1 206 -> 217 meeting act 1's y218
}

# MINIMAL PALETTE (owner, 2026-07-24: "less colors, only necessary colors are needed").
# A separate colour tells the model to draw a BORDER. So a colour split is only earned
# where a real visual edge belongs -- shoreline, treeline, the foot of a cliff. Ground
# variations that should simply blend into each other (sand into arid scrub, snow into
# tundra, ash into scorched earth) share ONE colour per act; the act's biome is carried
# by the legend text, not by extra colours. Four terrain roles, no more:
GROUND = ["meadow", "lightForest", "sand", "aridFoothill", "snow", "tundra",
          "ash", "scorched", "charcoal", "deadGround", "trail", "bridge"]
VEG = ["forest", "snowForest", "deadForest"]
ROCK = ["mountain", "cliff", "duneRock", "obsidian"]
WATER = ["water", "oasisWater", "darkRiver", "iceRiver"]

# CONTINENT-CONSTANT ROLE COLOURS (owner, 2026-07-24: "stay as consistent as possible
# across the flat maps color-wise so our instructions on boundaries are clear for sol",
# calling out forests and mountain ranges specifically). A green blob is ALWAYS forest,
# a grey blob is ALWAYS rock, a blue blob is ALWAYS water -- in every act. The per-act
# biome flavour ("snow-laden" / "dead") rides in the legend TEXT, not a new colour.
VEG_RGB   = (26, 82, 46)
ROCK_RGB  = (128, 126, 122)
WATER_RGB = (30, 82, 170)

# Only the WALKABLE GROUND colour changes per act, because grass vs snow vs sand vs ash
# is a real thing the player sees on the ground and the act's identity. Everything else
# is constant. (theme, ground_rgb, ground_desc, veg_desc, rock_desc, water_desc)
ACT_THEME = {
    1: ("verdant coastal frontier",
        (150, 205, 80),  "open grass and moss, walkable. NO trees in this colour",
        "dense impassable old-growth evergreen forest",
        "mossy faceted rock: irregular boulders and slabs, moss in the crevices",
        "clear coastal sea and lakes"),
    2: ("fully snowy frozen highlands",
        (238, 244, 250), "wind-packed snow and frozen tundra, walkable",
        "dense SNOW-LADEN evergreen forest, impassable (same forest, under snow)",
        "ice-cracked rock, snow caught in the crevices (same rock, frozen)",
        "frozen lakes and rivers, cracked ice over dark water"),
    3: ("desert, oasis and wind canyon",
        (226, 210, 156), "sun-baked desert sand and dry scrub, walkable",
        "dense palm and scrub thicket, impassable (the act's forest, desert-adapted)",
        "wind-carved sandstone rock, layered strata and mesa walls",
        "precious oasis water, startlingly blue against the sand"),
    # Act 4's ground was (120,110,104) against the constant rock grey (128,126,122)
    # -- a luminance gap of about 12 out of 255. Act 4 is 47% rock and 29% ground,
    # so those two nearly-equal greys covered three quarters of the act and it read
    # as one undifferentiated mush with an orange bar in it (owner: "the terrain
    # does not make sense"). Rock is constant continent-wide by owner rule, so the
    # separation has to come from the ground, which is the one colour an act OWNS.
    # Pale is also the truer read: fresh ash fall IS pale grey, and it lets the
    # obsidian/basalt rock sit as the darker mass it should be.
    4: ("volcanic ashlands and calderas",
        (186, 178, 168), "pale volcanic ash and scorched earth, walkable",
        "burnt DEAD forest, charred standing trunks (the act's forest, scorched)",
        "black obsidian and basalt rock, glassy volcanic stone",
        "dark still water"),
    5: ("dark barren endgame",
        (104, 94, 84),   "dead charcoal earth, nothing grows, walkable",
        "dead leafless forest, bare grey trunks, impassable",
        "cold dark stone, the mountain maze (same rock, lightless)",
        "black, still, dead water"),
}

# Lava: the one thin TERRAIN feature that can't survive blur-and-threshold at its true
# 1-cell width -- it fragments into dots (owner: act 4's magma "looks unnatural"). Grown
# then rounded so it reads as one deliberate flow.
LAVA = ("lava", (226, 88, 24), ["lava"], "molten lava, glowing hot")

# Landmark MARKERS come from the spec roster (landmark-roster.json), NOT the class map,
# because acts 2-5 have zero town cells in the class map. Three player-meaningful roles,
# three constant colours continent-wide. The disc marks WHERE; the model designs a UNIQUE
# building/entrance per act theme there (owner: towns + dungeons need real unique art).
# Owner 2026-07-25: the four Act-5 portals were "the most conspicuous things on
# the map" -- big, bright yellow discs, one per lobe. They are optional side
# content, so they must not out-shout the towns and dungeons that carry the main
# line. Two changes: a smaller disc, and a dull weathered brass instead of a
# saturated yellow. Their POSITIONS were the other half of the problem and are
# fixed in landmark-roster.json / WorldMapScene.ts, not here.
# (rgb, meaning, radius in cells)
# Owner 2026-07-25: connectors need their OWN colour. Every act border is crossed
# only through its connector dungeon, so those four doors are the most important
# things on the continent -- and painted the same purple as an ordinary dungeon
# they were invisible as a class, which is how three of the eight mouths went
# missing from the roster unnoticed. Hot magenta: same family as the dungeon
# purple because a connector IS a dungeon, but unmistakably a different rank.
MARKER = {
    "town":      ((235, 120, 90), "a TOWN/VILLAGE -- design a unique settlement fitting this act's theme", 3),
    "dungeon":   ((170, 90, 190), "a DUNGEON ENTRANCE -- design a unique portal/cave/ruin fitting this act's theme", 3),
    # Radius 3, not 4: the passes these sit in are 3-5 cells wide, and a radius-4 disc
    # is WIDER THAN THE PASS -- it buried the only walkable ground at Shadow Cave's
    # act-3 mouth entirely. A marker must never be bigger than the terrain it marks.
    "connector": ((232, 72, 168), "an ACT-CONNECTING DUNGEON -- the ONLY way through the range into the "
                                  "neighbouring land. Make it read as a major, unmistakable gateway", 3),
    "portal":    ((150, 128, 84), "a small, half-hidden magical PORTAL between lands -- understated, not a landmark", 2),
}

# Owner 2026-07-24: paths REMOVED from the art map -- "the map seems to do a good enough
# job to guide the player into a natural progression". `trail`/`bridge` stay walkable in
# the class map and are painted as ordinary ground here, so this is purely visual and
# reversible: move them out of GROUND and give them a colour to bring paths back.
# Owner 2026-07-25: "you can draw a path connecting side quest dungeons and the story
# progression line, but we just need to clear that in the final version". So paths are
# BACK ON, deliberately temporary -- set this to False for the final art hand-off and
# trail/bridge fall back to plain ground with no other change.
DRAW_TRAILS = True
PATH_RGB = (170, 120, 60)
PATH_DESC = ("the ROUTE the player walks: story progression line plus the spurs to each side "
             "dungeon. REVIEW AID -- this colour is removed before the final art pass")

BLUR_CELLS = 0.85     # organic-boundary strength, in cells; tuned on the Act 1 A/B test
THIN_KEEP = 0.34      # lower threshold for thin overlays so 1-cell trails survive


def load_grid() -> tuple[list[str], np.ndarray]:
    data = json.load(open(CLASS_MAP))
    return data["classes"], np.asarray(data["grid"])


def _mask_field(mask: np.ndarray, px: int, blur: float) -> np.ndarray:
    """Upscale a cell-resolution boolean mask to art resolution and blur it, giving the
    continuous field whose 0.5 crossing is an organic boundary."""
    img = Image.fromarray((mask * 255).astype(np.uint8))
    img = img.resize((mask.shape[1] * px, mask.shape[0] * px), Image.Resampling.BILINEAR)
    return np.asarray(img.filter(ImageFilter.GaussianBlur(px * blur)), dtype=np.float32) / 255.0


def _dilate_cells(mask: np.ndarray, radius: int) -> np.ndarray:
    """Grow a cell mask by `radius` cells (chebyshev). Towns are 1-4 cell clusters, and
    blur-then-threshold SHRINKS features that small until they vanish -- so anything the
    model has to notice gets grown first, then rounded."""
    out = mask.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            out |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return out


def _load_roster() -> dict:
    path = os.path.join(ROOT, "design/continent-terrain-class-method/semantic-maps/landmark-roster.json")
    return json.load(open(path))["acts"]


def _stamp_landmarks(art: np.ndarray, act: int, xs: int, ys: int, px: int) -> list[dict]:
    """Stamp each roster marker for `act` as a disc at its world cell. Returns legend rows
    (one per marker type actually placed). `xs,ys` = the padded sub-grid origin so world
    cells map onto `art`'s pixel coordinates."""
    roster = _load_roster().get(str(act), [])
    h, w = art.shape[:2]
    placed = {}
    for lm in roster:
        cx, cy = lm["cell"]
        px_c = round((cx - xs) * px + px / 2)
        py_c = round((cy - ys) * px + px / 2)
        rgb, _, radius_cells = MARKER[lm["type"]]
        r = radius_cells * px
        yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
        disc = xx * xx + yy * yy <= r * r
        y0, y1 = max(0, py_c - r), min(h, py_c + r + 1)
        x0, x1 = max(0, px_c - r), min(w, px_c + r + 1)
        if y1 <= y0 or x1 <= x0:
            continue
        d = disc[y0 - (py_c - r):y1 - (py_c - r), x0 - (px_c - r):x1 - (px_c - r)]
        art[y0:y1, x0:x1][d] = rgb
        placed[lm["type"]] = rgb
    return [{"key": t, "rgb": list(rgb), "means": MARKER[t][1], "count": sum(
        1 for lm in roster if lm["type"] == t)} for t, rgb in placed.items()]


def _road_masks_for(R, grid: np.ndarray, classes: list[str], region: tuple[int, int, int, int],
                    shape_cells: tuple[int, int], px: int) -> np.ndarray:
    """`_road_masks` at OUR resolution: it works in the renderer's native 48px cell
    divided by `sample`, so sample = 48 // px puts its output on our pixel grid."""
    sample = R.TILE // px
    canvas = (shape_cells[0] * px, shape_cells[1] * px)
    return R._road_masks(grid, classes, region, (region[0], region[1]), sample, canvas)


def build(act: int, px: int = 16, pad: int = 4) -> tuple[Image.Image, list[dict]]:
    """Render one act's semantic map at `px` art-pixels per world cell.

    `pad` cells of neighbouring terrain are included while blurring and cropped off
    after, so boundaries at the act's edge bend against their real neighbours instead
    of against empty space (which would flatten them straight)."""
    classes, grid = load_grid()
    x0, y0, x1, y1 = ACTS[act]
    ys, ye = max(0, y0 - pad), min(grid.shape[0], y1 + 1 + pad)
    xs, xe = max(0, x0 - pad), min(grid.shape[1], x1 + 1 + pad)
    sub = grid[ys:ye, xs:xe]
    name_of = np.asarray(classes, dtype=object)[sub]

    theme, ground_rgb, ground_desc, veg_desc, rock_desc, water_desc = ACT_THEME[act]
    fields, colours, legend = [], [], []
    # Role colours are constant continent-wide (VEG/ROCK/WATER); only ground changes.
    for members, rgb, desc, key in ((GROUND, ground_rgb, ground_desc, "ground"),
                                    (VEG, VEG_RGB, veg_desc, "vegetation"),
                                    (ROCK, ROCK_RGB, rock_desc, "rock"),
                                    (WATER, WATER_RGB, water_desc, "water")):
        use = [c for c in members if DRAW_TRAILS or c not in ("trail", "bridge") or key == "ground"]
        mask = np.isin(name_of, use)
        if not mask.any():
            continue
        fields.append(_mask_field(mask, px, BLUR_CELLS))
        colours.append(rgb)
        legend.append({"key": key, "rgb": list(rgb), "means": desc, "cells": int(mask.sum())})

    idx = np.argmax(np.stack(fields), axis=0)
    art = np.zeros((*idx.shape, 3), dtype=np.uint8)
    for i, rgb in enumerate(colours):
        art[idx == i] = rgb

    # Lava is the one thin TERRAIN feature; still comes from the class map.
    lava = np.isin(name_of, LAVA[2])
    if lava.any():
        # Was `_dilate_cells(lava, 1)` at HALF blur, because the lava used to be a
        # 1-cell polyline that fragmented into dots at full blur. It is a grown
        # flow now (767 cells, 2-9 wide) and that treatment had become the defect:
        # dilating a rectangle just makes a bigger rectangle, and half blur leaves
        # the corners square -- which is exactly how the Act-3 magma seal came out
        # as "a clipped tiny orange SQUARE". Full blur, no dilation, same organic
        # boundary every other terrain role gets.
        art[_mask_field(lava, px, BLUR_CELLS) >= 0.5] = LAVA[1]
        legend.append({"key": LAVA[0], "rgb": list(LAVA[1]), "means": LAVA[3], "cells": int(lava.sum())})

    # Paths are 1-2 cells wide and would lose the argmax against whatever they cross,
    # which is why they were dropped from the role fields entirely. They go back on as
    # a THIN OVERLAY instead -- grown a cell first, then composited over the finished
    # terrain -- the same treatment the module docstring describes for landmarkSolid.
    if DRAW_TRAILS:
        route = np.isin(name_of, ["trail", "bridge"])
        if route.any():
            art[_mask_field(_dilate_cells(route, 1), px, BLUR_CELLS) >= THIN_KEEP] = PATH_RGB
            legend.append({"key": "path", "rgb": list(PATH_RGB), "means": PATH_DESC,
                           "cells": int(route.sum())})

    # Landmarks come from the SPEC ROSTER, not the class map (which is missing most towns
    # in acts 2-5). Each marker is stamped as a fixed-radius disc at its world cell, so
    # every town/dungeon/portal the design calls for appears regardless of the class map.
    legend.extend(_stamp_landmarks(art, act, xs, ys, px))

    top, left = (y0 - ys) * px, (x0 - xs) * px
    h, w = (y1 - y0 + 1) * px, (x1 - x0 + 1) * px
    return Image.fromarray(art[top:top + h, left:left + w]), legend


def demo() -> None:
    """Self-check: every rule this module exists to enforce actually holds."""
    classes, grid = load_grid()
    covered = set(GROUND) | set(VEG) | set(ROCK) | set(WATER) | {"lava", "structure", "landmarkSolid"}
    assert not set(classes) - covered, f"class with no colour: {set(classes) - covered}"
    # Rule 1: grass classes share one colour (owner: "no need for dark grass").
    assert {"meadow", "lightForest"} <= set(GROUND), "grass classes must share one colour"
    # Rule 2 (owner: role colours CONSTANT across acts). veg/rock/water must be the same
    # RGB in every act; only ground may differ.
    for role, want in (("vegetation", list(VEG_RGB)), ("rock", list(ROCK_RGB)), ("water", list(WATER_RGB))):
        seen = set()
        for act in ACTS:
            _, legend = build(act, px=2)
            for row in legend:
                if row["key"] == role:
                    seen.add(tuple(row["rgb"]))
        assert seen <= {tuple(want)}, f"{role} colour drifts across acts: {seen}"
    # Rule 3: every act stays minimal and every legend colour actually paints.
    for act in ACTS:
        img, legend = build(act, px=4)
        keys = [row["key"] for row in legend]
        assert keys.count("ground") == 1 and keys.count("vegetation") <= 1, f"act{act} role dup"
        assert len([k for k in keys if k in ("ground", "vegetation", "rock", "water", "lava")]) <= 5
        px_rows = np.asarray(img).reshape(-1, 3)
        for row in legend:
            assert (px_rows == row["rgb"]).all(axis=1).sum() > 0, f"act{act}: {row['key']} blurred away"
    # Rule 4: paths are a REVIEW AID and must be removable by the flag alone -- trail and
    # bridge stay in GROUND either way, so turning DRAW_TRAILS off restores the final look
    # without touching anything else.
    assert {"trail", "bridge"} <= set(GROUND), "trail/bridge must fall back to ground"
    if DRAW_TRAILS:
        for act in ACTS:
            _, legend = build(act, px=4)
            assert any(row["key"] == "path" for row in legend), f"act{act}: path overlay vanished"
    # Rule 5: act 4 magma stays ONE flow, not specks.
    img, legend = build(4, px=8)
    lit = (np.asarray(img) == next(r["rgb"] for r in legend if r["key"] == "lava")).all(axis=2)
    assert int(lit.any(axis=1).sum()) > lit.shape[0] * 0.05, "lava broke into specks"
    # Rule 6: EVERY act carries towns AND dungeons from the roster (acts 2-5 had none in
    # the class map -- this is the whole point of the roster).
    roster = _load_roster()
    for act in ACTS:
        _, legend = build(act, px=4)
        keys = {row["key"] for row in legend}
        types = {lm["type"] for lm in roster[str(act)]}
        assert types <= keys, f"act{act} missing markers: {types - keys}"
        assert "town" in keys and "dungeon" in keys, f"act{act} has no town or no dungeon"
    print("build_semantic_map.py self-check: PASS")


if __name__ == "__main__":
    demo()
    out_dir = os.path.join(ROOT, "design/continent-terrain-class-method/semantic-maps")
    os.makedirs(out_dir, exist_ok=True)
    index = {}
    for act in sorted(ACTS):
        img, legend = build(act)
        path = os.path.join(out_dir, f"act{act}-semantic.png")
        img.save(path, optimize=True)
        index[f"act{act}"] = {"bounds": ACTS[act], "pxPerCell": 16, "size": list(img.size),
                              "theme": ACT_THEME[act][0], "path": os.path.relpath(path, ROOT),
                              "legend": legend}
        markers = sum(1 for row in legend if row["key"] in MARKER)
        print(f"act{act}: {img.size[0]}x{img.size[1]}  {len(legend)-markers} terrain + {markers} marker types")
    json.dump(index, open(os.path.join(out_dir, "semantic-maps-index.json"), "w"), indent=1)
