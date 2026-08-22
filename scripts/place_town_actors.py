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
    a = ap.parse_args()
    tj = os.path.join(TOWN_DIR, f"{a.town}-town.json")
    town = json.load(open(tj))
    walk = json.load(open(os.path.join(TOWN_DIR, os.path.basename(town["walkable"]))))
    cell = float(town["worldPxPerCell"])
    mask = standable(walk)
    print(f"{a.town}: standable {mask.mean()*100:.1f}% of {walk['width']}x{walk['height']} world px")

    items = [(k, town[k]) for k in SCALARS if town.get(k)]
    items += [(f"npc:{n['id']}", n["cell"]) for n in town.get("npcs", [])]

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

    snapped, fails = {}, []
    for name, c in items:
        target = reachable_mask if name != "startCell" else mask
        got = nearest(target, c[0] * cell, c[1] * cell)
        if got is None:
            fails.append(f"{name}: no reachable standable ground within 240 world px of cell {c}")
            continue
        x, y, dist = got
        snapped[name] = (x, y, round(x / cell, 2), round(y / cell, 2), dist)

    sx, sy = snapped["startCell"][0], snapped["startCell"][1]

    print(f"  {'actor':22s} {'cell':>14s} -> {'snapped':>14s}  {'moved':>7s}  reachable")
    bad = 0
    for name, (x, y, cx, cy, dist) in snapped.items():
        ok = bool(seen[y, x])
        bad += (not ok) or dist > 1.5 * cell
        orig = dict(items)[name]
        print(f"  {name:22s} {f'[{orig[0]},{orig[1]}]':>14s} -> {f'[{cx},{cy}]':>14s}  "
              f"{dist/cell:6.2f}c  {'yes' if ok else 'NO'}")
    for f in fails:
        print("   ", f)
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
