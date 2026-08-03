#!/usr/bin/env python3
"""Regression gates for the semantic maps — the three that kept missing defects.

Every art defect the owner has had to catch by eye over three review rounds would
have been caught mechanically by one of these. The existing linter checks the
CLASS MAP's graph; these check what the owner actually looks at, which is the
RENDERED PNG, plus the blast radius of the change that produced it.

  A. VISIBLE APPROACH. A landmark counts as reachable to the linter if a 1-cell
     trail touches it. Trails are not drawn on the art map, and a 1-cell feature
     does not survive the blur-and-argmax, so a dungeon whose only approach is a
     thread renders as sealed inside rock. Act 1's Coastal Reef sat like that for
     two rounds with every connectivity gate green. This gate floods the GROUND
     COLOUR of the rendered PNG out from the act's town and requires each landmark
     to have connected walkable ground you can actually see near it.

  B. PAINT FRAGMENTATION. The linter counts components on a river's MASK, which
     spans trail fords by design, so a watercourse severed into rectangular bars
     in the PAINT still scores majorComponents == 1. That is exactly how Act 4's
     lava shipped as five disconnected pieces. This gate counts components of what
     is actually painted.

  C. BLAST RADIUS. A change aimed at one act must not silently rewrite another.
     The act-border walling touched all five acts at once and that is where Act 1
     got buried. Compares against a pinned baseline and reports per-act deltas.

Exit code 1 on any failure. Run after build_continent_terrain_class_macro_g3 and
build_semantic_map.
"""
from __future__ import annotations

import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS = os.path.join(ROOT, "design/continent-terrain-class-method/semantic-maps")
PACK = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent/continent-macro-g3")
BASELINE = os.path.join(ROOT, "design/review/overworld-art-blueprint/continent",
                              "continent-macro-g3-pre-lava-reauthor")

ACT_TOWN = {"1": (69, 255), "2": (209, 320), "3": (262, 154), "4": (200, 98), "5": (118, 36)}
APPROACH_CELLS = 5        # how far out a visible approach may be
APPROACH_MIN_PX = 400     # connected ground pixels required in that window
CONNECTOR_MIN_CLEARING_PX = 6000  # ~23 cells; a cave mouth needs a notch, not a route

# Connectors are identified by roster TYPE now, not by a hard-coded name list.
# Each one is filed under the act its mouth actually stands in, so "served by" is
# just the act that owns the roster entry. This replaced a name map that silently
# went stale the moment the entries were renamed.
PAINTED_BODIES = ("lava", "oasisWater", "darkRiver", "iceRiver")
# Bodies that are legitimately more than one piece, with the reason.
EXPECTED_PIECES = {
    "lava": (2, "the Act-4 flow plus the separate Act-3 magma seal at x245-247"),
    "iceRiver": (4, "the four Act-2 lakes are separate bodies by design"),
    "oasisWater": (2, "the wadi's single trail ford splits the paint, not the mask"),
    "darkRiver": (1, ""),
}


def local_ground_blob(is_ground: np.ndarray, centre, px: int) -> int:
    """Size in pixels of the ground body nearest `centre` -- the clearing at a door."""
    height, width = is_ground.shape
    cx, cy = centre
    seed = None
    for radius in range(1, 9 * px):
        ys, ye = max(0, cy - radius), min(height, cy + radius + 1)
        xs, xe = max(0, cx - radius), min(width, cx + radius + 1)
        hits = np.argwhere(is_ground[ys:ye, xs:xe])
        if len(hits):
            seed = (xs + hits[0][1], ys + hits[0][0])
            break
    if seed is None:
        return 0
    seen = np.zeros_like(is_ground)
    queue = deque([seed])
    seen[seed[1], seed[0]] = True
    total = 0
    while queue:
        x, y = queue.popleft()
        total += 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and is_ground[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((nx, ny))
    return total


def components(mask: np.ndarray, through: np.ndarray | None = None) -> list[int]:
    """Sizes of `mask`'s components, largest first.

    `through` is terrain the flood may cross without being part of the body -- a
    bridge deck over a river. Only cells of `mask` are counted, and a component
    made entirely of `through` cells is not a component at all.
    """
    walk = mask if through is None else (mask | through)
    seen = np.zeros_like(walk)
    sizes = []
    height, width = walk.shape
    for y in range(height):
        for x in range(width):
            if not walk[y, x] or seen[y, x]:
                continue
            stack = [(x, y)]
            seen[y, x] = True
            count = 0
            while stack:
                cx, cy = stack.pop()
                if mask[cy, cx]:
                    count += 1
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < width and 0 <= ny < height and walk[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((nx, ny))
            if count:
                sizes.append(count)
    return sorted(sizes, reverse=True)


WALKABLE_CLASSES = (
    "meadow", "trail", "lightForest", "bridge", "snow", "tundra", "sand",
    "aridFoothill", "ash", "scorched", "charcoal", "deadGround",
)


def walkable_cells() -> np.ndarray:
    data = json.load(open(os.path.join(PACK, "terrain-classes.json")))
    code = {name: i for i, name in enumerate(data["classes"])}
    grid = np.asarray(data["grid"])
    return np.isin(grid, [code[n] for n in WALKABLE_CLASSES if n in code])


def gate_visible_approach(failures: list[str]) -> None:
    index = json.load(open(os.path.join(MAPS, "semantic-maps-index.json")))
    roster = json.load(open(os.path.join(MAPS, "landmark-roster.json")))["acts"]
    floods: dict[str, tuple] = {}
    is_ground_of: dict[str, np.ndarray] = {}
    for key in sorted(index, key=lambda k: int(k[3:])):
        entry = index[key]
        act = key[3:]
        ground = tuple(next(r["rgb"] for r in entry["legend"] if r["key"] == "ground"))
        px = entry["pxPerCell"]
        x0, y0 = entry["bounds"][0], entry["bounds"][1]
        art = np.asarray(Image.open(os.path.join(MAPS, f"{key}-semantic.png")))
        # The path overlay paints walkable ROUTE cells in their own colour on top of
        # the ground, so matching the ground RGB alone chops the walkable region into
        # pieces wherever a road crosses it -- which made this gate fail all of Act 5
        # the moment paths were switched on. A path is ground you can stand on.
        def is_colour(rgb):
            return ((art[:, :, 0] == rgb[0]) & (art[:, :, 1] == rgb[1]) & (art[:, :, 2] == rgb[2]))

        is_ground = is_colour(ground)
        path_row = next((r for r in entry["legend"] if r["key"] == "path"), None)
        if path_row is not None:
            is_ground |= is_colour(tuple(path_row["rgb"]))
        # A landmark MARKER is an annotation stamped on top of the terrain, not terrain.
        # Its disc is ~7 cells across, which is wider than this gate's own 5-cell window,
        # so a door standing in open ground had its whole approach hidden under its own
        # icon and was reported "sealed in" -- and worse, the marker cut the flood in two,
        # so the ground beyond it stopped counting as connected to the town. Marker pixels
        # are restored to whatever the CLASS MAP says is under them, which is exact: no
        # door gains ground it does not stand on.
        marker_keys = ("town", "dungeon", "connector", "portal")
        markers = np.zeros_like(is_ground)
        for row in entry["legend"]:
            if row["key"] in marker_keys:
                markers |= is_colour(tuple(row["rgb"]))
        if markers.any():
            walk = walkable_cells()
            cells_y = np.clip(np.arange(is_ground.shape[0]) // px + y0, 0, walk.shape[0] - 1)
            cells_x = np.clip(np.arange(is_ground.shape[1]) // px + x0, 0, walk.shape[1] - 1)
            under = walk[np.ix_(cells_y, cells_x)]
            is_ground |= markers & under
        height, width = is_ground.shape

        # Defaults bound at definition time on purpose: this closure is stored per
        # act and called later, and Python's late binding would otherwise give
        # every act the LAST act's origin.
        def to_px(cell, x0=x0, y0=y0, px=px):
            return round((cell[0] - x0) * px + px / 2), round((cell[1] - y0) * px + px / 2)

        tx, ty = to_px(ACT_TOWN[act])
        seed = None
        for radius in range(1, 14 * px):
            ys, ye = max(0, ty - radius), min(height, ty + radius + 1)
            xs, xe = max(0, tx - radius), min(width, tx + radius + 1)
            hits = np.argwhere(is_ground[ys:ye, xs:xe])
            if len(hits):
                seed = (xs + hits[0][1], ys + hits[0][0])
                break
        if seed is None:
            failures.append(f"[A] act{act}: no ground pixel found near its own town")
            continue
        seen = np.zeros_like(is_ground)
        queue = deque([seed])
        seen[seed[1], seed[0]] = True
        while queue:
            cx, cy = queue.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < width and 0 <= ny < height and is_ground[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((nx, ny))
        floods[act] = (seen, to_px, px, height, width)
        is_ground_of[act] = is_ground

    for act, items in roster.items():
        for landmark in items:
            served = act
            if served not in floods:
                continue
            seen, to_px_owner, px, height, width = floods[act]
            seen_served, to_px_served, px_s, h_s, w_s = floods[served]
            cx, cy = to_px_served(landmark["cell"])
            r = APPROACH_CELLS * px_s
            ys, ye = max(0, cy - r), min(h_s, cy + r + 1)
            xs, xe = max(0, cx - r), min(w_s, cx + r + 1)
            visible = int(seen_served[ys:ye, xs:xe].sum()) if ye > ys and xe > xs else 0
            if visible >= APPROACH_MIN_PX:
                continue
            # A CONNECTOR mouth is the only way through a range that is sealed on
            # purpose, so a wide corridor leading to it would contradict the seal.
            # It still has to be a cave mouth in a wall rather than a marker buried
            # in rock, so it is held to a visible CLEARING instead of a visible
            # route. Coastal Reef's defect scored 0 here and would still fail.
            is_connector = landmark["type"] == "connector"
            pocket = local_ground_blob(is_ground_of[served], to_px_served(landmark["cell"]), px_s)
            if is_connector and pocket >= CONNECTOR_MIN_CLEARING_PX:
                print(f"  [A] act{act} {landmark['name']}: connector mouth, no visible route by "
                      f"design; clearing at the door = {pocket // (px_s * px_s)} cells (ok)")
                continue
            failures.append(
                f"[A] act{act} {landmark['name']} ({landmark['type']}) at {landmark['cell']}: "
                f"only {visible} px of walkable ground connected to the act-{served} town "
                f"within {APPROACH_CELLS} cells, and the clearing at the door is "
                f"{pocket // (px_s * px_s)} cells -- it renders as sealed in")


def gate_paint_fragmentation(failures: list[str]) -> None:
    data = json.load(open(os.path.join(PACK, "terrain-classes.json")))
    classes = data["classes"]
    grid = np.asarray(data["grid"])
    code = {name: i for i, name in enumerate(classes)}
    # A bridge is not a severance. The channel runs UNDER it, so a body split only by
    # the deck of a crossing is one watercourse and must not be counted as two -- the
    # allowances below already say as much in prose ("the wadi's single trail ford
    # splits the paint, not the mask"), they just could not see it. Counted by flooding
    # through bridge cells and keeping components that actually contain water; a real
    # severance, where a range or a corridor buries the channel, still fails.
    bridge = grid == code["bridge"]
    for name in PAINTED_BODIES:
        sizes = components(grid == code[name], through=bridge)
        allowed, reason = EXPECTED_PIECES[name]
        if len(sizes) > allowed:
            failures.append(
                f"[B] {name}: painted as {len(sizes)} pieces {sizes[:6]}, expected at most "
                f"{allowed}{' (' + reason + ')' if reason else ''} -- a severed watercourse "
                f"reads as drawn bars")


def gate_blast_radius(failures: list[str], acts: set[str] | None) -> None:
    if not os.path.exists(os.path.join(BASELINE, "terrain-classes.json")):
        print("  [C] skipped: no baseline pack on disk")
        return
    current = np.asarray(json.load(open(os.path.join(PACK, "terrain-classes.json")))["grid"])
    base = np.asarray(json.load(open(os.path.join(BASELINE, "terrain-classes.json")))["grid"])
    bounds = {"1": (16, 218, 163, 399), "2": (161, 222, 312, 399), "3": (163, 88, 314, 210),
              "4": (163, 3, 314, 128), "5": (9, 7, 158, 206)}
    for act, (x0, y0, x1, y1) in sorted(bounds.items()):
        changed = int((current[y0:y1 + 1, x0:x1 + 1] != base[y0:y1 + 1, x0:x1 + 1]).sum())
        marker = ""
        if acts is not None and act not in acts and changed:
            marker = "  <-- OUTSIDE the declared scope"
            failures.append(f"[C] act{act}: {changed} cells changed but act{act} was not declared in scope")
        print(f"  [C] act{act}: {changed} cells changed vs baseline{marker}")


def main() -> None:
    declared = None
    if len(sys.argv) > 1:
        declared = {a.strip() for a in sys.argv[1].split(",") if a.strip()}
        print(f"declared scope: acts {sorted(declared)}")
    failures: list[str] = []
    print("A. visible approach on the rendered art")
    gate_visible_approach(failures)
    print("B. painted watercourse fragmentation")
    gate_paint_fragmentation(failures)
    print("C. blast radius vs baseline")
    gate_blast_radius(failures, declared)
    print()
    if failures:
        print(f"FAIL — {len(failures)} problem(s):")
        for line in failures:
            print(f"  {line}")
        sys.exit(1)
    print("semantic map gates: PASS")


if __name__ == "__main__":
    main()
