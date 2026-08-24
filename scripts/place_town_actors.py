#!/usr/bin/env python3
"""Snap a town's actors onto ground the derived collision actually allows, and prove they connect.

WHY THIS EXISTS. Every actor cell in the three town manifests -- startCell, savePoint, shopCounter
and each NPC -- was placed against a collision authority that no longer describes the art. millbrook
and greenhollow got theirs from `scripts/town_layout.py`, the plan-primed route the owner scrapped
twice, and their `_layoutNote` still says "do not hand-edit these" while pointing at a spec file
that the repainting made obsolete. Port Sapphire's are fitted to a plate that is being replaced.
Towns are art-first: the painting is authored, collision is DERIVED from it, and the actors are
placed LAST, against that derived geometry. This is the last step, and until now there was no tool
for it -- the snapping lived inside the scrapped planner.

WHAT "VALID" MEANS. The runtime's rule, quoted from the walkable JSON itself, is "actor center must
remain inside at least one walkable polygon with actor-foot clearance". So a cell is valid when the
walkable area, ERODED by actorFootRadius, still contains it. Testing the raw polygon instead puts
NPCs half inside walls: the body, not the point, has to fit.

REACHABILITY IS A SEPARATE QUESTION FROM VALIDITY, and both have to be asked. A cell can sit on
perfectly good paving in a courtyard the player cannot enter. Every actor is therefore flood-filled
from startCell over the eroded mask, and an unreachable one is an ERROR even though it is 'valid'.

THE EXIT IS DELIBERATELY NOT SNAPPED. millbrook's exit sits at cell y=60.5, outside its own gate, on
purpose: town.html only arms an exit once the player is more than 2.5 cells clear of it, so an exit
pulled back onto walkable ground near the arrival point either never arms or bounces the player
straight out. It is reported, never moved.
"""
from __future__ import annotations
import argparse, json, os
from collections import deque
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOWN_DIR = os.path.join(ROOT, "public/act1-hifi/town")
# Actors that live on walkable ground. `exit` is excluded on purpose -- see the docstring.
SCALARS = ("startCell", "savePoint", "shopCounter")


def _poly(draw, pts, fill):
    draw.polygon([(p["x"], p["y"]) for p in pts], fill=fill)


def standable(walk: dict) -> np.ndarray:
    """World-pixel mask of where an actor's CENTRE may sit: walkable, minus holes and props,
    eroded by actorFootRadius so the body fits rather than just the point."""
    w, h = int(walk["width"]), int(walk["height"])
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    for reg in walk["regions"]:
        _poly(d, reg["outer"], 255)
        for hole in reg.get("holes", []):
            _poly(d, hole, 0)
    for ob in walk.get("staticObstacles", []):
        _poly(d, ob["polygon"], 0)
    m = np.asarray(img) > 0
    r = int(round(float(walk.get("actorFootRadius", 4))))
    for _ in range(r):                       # 4-neighbour erosion, r times
        acc = m.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.zeros_like(m)
            ys, ye = max(0, dy), min(h, h + dy)
            xs, xe = max(0, dx), min(w, w + dx)
            sh[ys:ye, xs:xe] = m[ys - dy:ye - dy, xs - dx:xe - dx]
            acc &= sh
        m = acc
    return m


def nearest(mask: np.ndarray, x: float, y: float, limit_px: int = 240):
    """Closest standable pixel to (x, y), searched by growing radius so the snap is minimal."""
    h, w = mask.shape
    xi, yi = int(round(x)), int(round(y))
    if 0 <= yi < h and 0 <= xi < w and mask[yi, xi]:
        return xi, yi, 0.0
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return None
    d2 = (xs - x) ** 2 + (ys - y) ** 2
    k = int(np.argmin(d2))
    dist = float(np.sqrt(d2[k]))
    return (int(xs[k]), int(ys[k]), dist) if dist <= limit_px else None


# town.html's nearestNpc() band, and the disc every stationary NPC is registered as.
NPC_BLOCK_RADIUS = 7.0                        # world px
DX_MAX, DY_MIN, DY_MAX = 1.1, -0.35, 2.1      # cells; dy positive = player BELOW the NPC


def talk_band_area(reachable: np.ndarray, cx: float, cy: float, cell: float,
                   own_disc: bool = True) -> int:
    """How much ground the player can actually stand on inside this NPC's talk band.

    STANDING ON A VALID CELL IS NOT THE SAME AS BEING TALKABLE, and that gap shipped once.
    `nearestNpc()` only sees the player from a band BELOW the NPC, so an NPC placed hard against a
    building's south wall is perfectly valid, perfectly reachable, and can never be spoken to --
    her band is inside the wall. Nothing else in this file would notice.

    It became load-bearing on 2026-08-24, when building footprints were authored to get the player
    off the roofs (`derive_town_walkable.py::stamp_roof_bands`). That removed about a cell of margin
    around every building, and greenhollow's healer and fisherman went from 1225 and 646 reachable
    band pixels to 137 each -- still non-zero, so still 'valid', but a sliver the player has to
    hunt for."""
    h, w = reachable.shape
    x0, x1 = int(round(cx - DX_MAX * cell)), int(round(cx + DX_MAX * cell)) + 1
    y0, y1 = int(round(cy + DY_MIN * cell)), int(round(cy + DY_MAX * cell)) + 1
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    if x1 <= x0 or y1 <= y0:
        return 0
    sub = reachable[y0:y1, x0:x1]
    if own_disc:
        # The player cannot stand ON the NPC. The band starts 0.35 cells ABOVE her feet, which is
        # inside her own 7 px blocker, so counting that overlap would credit her with ground she is
        # occupying herself.
        yy, xx = np.mgrid[y0:y1, x0:x1]
        sub = sub & ~((xx - cx) ** 2 + (yy - cy) ** 2 <= NPC_BLOCK_RADIUS ** 2)
    return int(sub.sum())


def nearest_talkable(reachable: np.ndarray, x: float, y: float, cell: float,
                     min_band: int, limit_px: int = 240):
    """Nearest reachable standable pixel whose TALK BAND also has room to stand in.

    `reachable` here must already have every OTHER NPC's blocker disc removed but NOT this NPC's
    own. Removing her own would make her current cell illegal to herself, and the snap would then
    shuffle her about 7 px -- one blocker radius -- on every single run. That is not a hypothetical:
    it made this script non-idempotent, so the ship gate reported a 0.44-cell move for every NPC in
    all three towns forever, and a gate that is never a fixed point stops being read.

    Falls back to the plain nearest reachable pixel when no candidate clears `min_band`, so this can
    only ever improve on the old behaviour -- it never refuses to place an NPC."""
    ys, xs = np.nonzero(reachable)
    if not len(ys):
        return None, 0
    d2 = (xs - x) ** 2 + (ys - y) ** 2
    order = np.argsort(d2)
    best_any = None
    for k in order:
        dist = float(np.sqrt(d2[k]))
        if dist > limit_px:
            break
        px, py = int(xs[k]), int(ys[k])
        if best_any is None:
            best_any = (px, py, dist, talk_band_area(reachable, px, py, cell))
        area = talk_band_area(reachable, px, py, cell)
        if area >= min_band:
            return (px, py, dist), area
    return (best_any[:3] if best_any else None), (best_any[3] if best_any else 0)


def reach(mask: np.ndarray, start) -> np.ndarray:
    seen = np.zeros_like(mask)
    if not mask[start[1], start[0]]:
        return seen
    q = deque([start]); seen[start[1], start[0]] = True
    h, w = mask.shape
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((nx, ny))
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--town", required=True)
    ap.add_argument("--write", action="store_true", help="update the manifest in place")
    ap.add_argument("--min-talk-band", type=int, default=600,
                    help="minimum REACHABLE world px inside an NPC's south approach band, with her "
                         "own blocker and every other NPC's removed. An NPC standing in the open "
                         "measures ~1370, the theoretical maximum for the band. 600 was chosen by "
                         "sweeping: at 600 every NPC in all three towns is satisfied by a move of "
                         "0.50 cells or less, and at 700 millbrook's sage jumps 3.6 cells because "
                         "nothing nearer clears it -- a floor that rearranges the composition is "
                         "the wrong floor. Snapping ignores this when nothing within 240 px clears "
                         "it, so it can only improve a placement, never block one.")
    a = ap.parse_args()
    tj = os.path.join(TOWN_DIR, f"{a.town}-town.json")
    town = json.load(open(tj))
    walk = json.load(open(os.path.join(TOWN_DIR, os.path.basename(town["walkable"]))))
    cell = float(town["worldPxPerCell"])
    mask = standable(walk)
    print(f"{a.town}: standable {mask.mean()*100:.1f}% of {walk['width']}x{walk['height']} world px")

    items = [(k, town[k]) for k in SCALARS if town.get(k)]
    # A `fixed` NPC is deliberately standing somewhere the PLAYER cannot: the shopkeeper is behind
    # his counter, inside the stall, and the inside of a stall is not walkable on purpose. Snapping
    # him would put him out on the lane, which is exactly the bug this tool exists to prevent for
    # everyone else. He is reported, never moved -- the player reaches him across the counter,
    # which nearestNpc() allows (it accepts the player up to ~2 cells below an NPC).
    fixed = {f"npc:{n['id']}" for n in town.get("npcs", []) if n.get("fixed")}
    items += [(f"npc:{n['id']}", n["cell"]) for n in town.get("npcs", []) if not n.get("fixed")]

    # SNAP TO REACHABLE GROUND, NOT MERELY STANDABLE GROUND. Snapping to the eroded mask alone
    # finds the nearest place a body FITS, which is not the same as the nearest place a body can
    # GET TO: a pocket cut off by a neck narrower than two foot-radii is standable and stranded.
    # Measured on Port Sapphire's repainted plate, where 5.3% of standable ground is walled off in
    # exactly that way -- the sailor snapped 1.59 cells onto one of those pockets and came back
    # unreachable. Reporting it would have been enough to catch it; refusing to choose it is
    # better, because then the reported distance is the distance to somewhere the player can
    # actually stand next to the NPC.
    start = nearest(mask, town["startCell"][0] * cell, town["startCell"][1] * cell)
    if start is None:
        print("  FATAL: startCell has nowhere to stand; everything else is moot")
        return 1
    seen = reach(mask, (start[0], start[1]))
    reachable_mask = mask & seen

    # NPCs are solid to each other and to the player, so the ground an NPC's own talk band offers
    # has to be measured with every OTHER NPC's disc already removed -- otherwise two neighbours
    # each "have" a band that is really the same square of paving one of them is standing on.
    yy, xx = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
    def disc(bx, by):
        return (xx - bx) ** 2 + (yy - by) ** 2 <= NPC_BLOCK_RADIUS ** 2
    all_npcs = town.get("npcs", [])

    snapped, bands, fails = {}, {}, []
    for name, c in items:
        if name == "startCell":
            got = nearest(mask, c[0] * cell, c[1] * cell)
            area = None
        elif name.startswith("npc:"):
            me = name[len("npc:"):]
            others = np.zeros_like(mask)
            for n in all_npcs:
                if n["id"] == me:
                    continue
                others |= disc(n["cell"][0] * cell, n["cell"][1] * cell)
            got, area = nearest_talkable(reachable_mask & ~others,
                                         c[0] * cell, c[1] * cell, cell, a.min_talk_band)
        else:
            got, area = nearest(reachable_mask, c[0] * cell, c[1] * cell), None
        if got is None:
            fails.append(f"{name}: no reachable standable ground within 240 world px of cell {c}")
            continue
        x, y, dist = got
        snapped[name] = (x, y, round(x / cell, 2), round(y / cell, 2), dist)
        if area is not None:
            bands[name] = area

    sx, sy = snapped["startCell"][0], snapped["startCell"][1]

    print(f"  {'actor':22s} {'cell':>14s} -> {'snapped':>14s}  {'moved':>7s}  reachable  talk band")
    bad = 0
    for name, (x, y, cx, cy, dist) in snapped.items():
        ok = bool(seen[y, x])
        band = bands.get(name)
        # A band under the floor is reported, not failed: the floor is a comfort target, and an NPC
        # the composition wants against a wall may honestly have less. Zero IS a failure -- that NPC
        # can never be talked to. scripts/check_town_talkable.py gates the zero case.
        bad += (not ok) or dist > 1.5 * cell or (band == 0)
        orig = dict(items)[name]
        print(f"  {name:22s} {f'[{orig[0]},{orig[1]}]':>14s} -> {f'[{cx},{cy}]':>14s}  "
              f"{dist/cell:6.2f}c  {'yes' if ok else 'NO':>9s}  "
              f"{'-' if band is None else f'{band:5d} px'}")
    for f in fails:
        print("   ", f)
    for name in sorted(fixed):
        c = next(n["cell"] for n in town["npcs"] if f"npc:{n['id']}" == name)
        print(f"  {name + ' (fixed)':22s} {f'[{c[0]},{c[1]}]':>14s}  not snapped -- stands inside "
              f"its building by design")
    ex = town.get("exit", {}).get("cell")
    if ex:
        exx, exy = int(ex[0] * cell), int(ex[1] * cell)
        inside = (0 <= exy < mask.shape[0] and 0 <= exx < mask.shape[1] and mask[exy, exx])
        print(f"  {'exit (not snapped)':22s} {f'[{ex[0]},{ex[1]}]':>14s}  "
              f"{'on walkable ground' if inside else 'outside the walkable surface, as intended'}")

    if a.write:
        for k in SCALARS:
            if k in snapped:
                town[k] = [snapped[k][2], snapped[k][3]]
        for n in town.get("npcs", []):
            s = snapped.get(f"npc:{n['id']}")
            if s:
                n["cell"] = [s[2], s[3]]
        json.dump(town, open(tj, "w"), indent=2)
        open(tj, "a").write("\n")
        print(f"  wrote {os.path.relpath(tj, ROOT)}")
    return 1 if (bad or fails) else 0


if __name__ == "__main__":
    raise SystemExit(main())
