#!/usr/bin/env python3
"""PILOT 3 layouts. Iron Mine F1 and Haunted Forest F1 carry over from pilot2 unchanged (the
owner's direction was right for both). Storm Nest is redrawn as a BUILT tower: a plan drawn as
masonry, with straight walls, square corners and rooms off a ring corridor, inside a round outer wall.

  outer wall     a true circle (innerRadius); built_field() in pilot3_render.py draws it
                 analytically
  stair core     a 5x5 masonry block in the middle. The stairs stand against its faces: exit
                 (tile 9, drawn as stairs UP) on the west face, and on F2+ the arrival (tile 6,
                 drawn as stairs DOWN, the way back) on the east face
  ring corridor  3-4 cells wide round the core, inside a square inner wall (2 thick). Blocks on
                 the S and N axes cut it into an east half and a west half
  rooms          four quadrant rooms between the inner wall and the outer wall, split by axis
                 spokes 2 cells thick (jittered off the axis). S is solid. E, N and W each have a
                 2-wide doorway at a random point. Two rooms get a stub wall (alcoves)
  route          F1: the door in the south wall leads into SE, then NE, NW, SW, the inner doorway,
                 the west ring and the stairs. The east ring is a side branch off NE.
                 F2: arrival in the east ring, then NE, NW, SW, the west ring and the stairs; SE
                 is a side branch. The wind gate (19) goes on a doorway mid-route (find_gate),
                 and its windbreaker key chest sits on the arrival side.
Every wall is 2+ cells thick, so the renderer prunes nothing and collision is the drawn wall.

  python3 pilot3.py
"""
import json, math, os, random, shutil, sys
import numpy as np
import common
from common import SCRATCH
from pilot2 import (tiles_to_floor, bfs, WALK, N4, shortest, find_gate, place_chests, check, FRAME)

P2 = os.path.join(SCRATCH, "pilot2")
P3 = os.path.join(SCRATCH, "pilot3")


def built_tower(f, seed):
    rng = random.Random(seed)
    Rin = 15.5 - 0.6 * (f - 1)
    Rout = Rin + 3.0
    S = int(math.ceil(Rout)) * 2 + 1 + 2 * FRAME
    c = S // 2
    yy, xx = np.mgrid[0:S, 0:S]
    dx, dy = xx - c, yy - c
    r = np.hypot(dx, dy)
    cheb = np.maximum(np.abs(dx), np.abs(dy))
    g = np.ones((S, S), np.int16)
    g[r < Rin] = 0
    g[cheb <= 2] = 1                                             # stair core
    h = rng.choice((6, 7))
    ring = (cheb == h) | (cheb == h + 1)
    g[ring & (r < Rin)] = 1
    off = {k: rng.randint(-2, 1) for k in "NESW"}
    # spokes: (axis cells, outside the ring) and, for S and N, the block across the ring corridor
    def spoke(k, inner=False):
        o = off[k]
        if k in "NS":
            band = (dx == o) | (dx == o + 1)
            side = (dy < 0) if k == "N" else (dy > 0)
            reach = (cheb > h + 1) if not inner else (cheb > 2) & (cheb < h)
        else:
            band = (dy == o) | (dy == o + 1)
            side = (dx > 0) if k == "E" else (dx < 0)
            reach = (cheb > h + 1) if not inner else (cheb > 2) & (cheb < h)
        return band & side & reach & (r < Rin + 1)
    for k in "NESW":
        g[spoke(k)] = 1
    g[spoke("S", True)] = 1
    g[spoke("N", True)] = 1
    # doorways in E, N, W spokes: a 2-wide gap at a random distance out from the ring
    for k in "ENW":
        o = off[k]
        d = rng.randint(h + 3, int(Rin) - 3)
        if k == "N":
            g[c - d - 1:c - d + 1, c + o:c + o + 2] = 0
        elif k == "W":
            g[c + o:c + o + 2, c - d - 1:c - d + 1] = 0
        else:
            g[c + o:c + o + 2, c + d:c + d + 2] = 0
    # inner doorways (2 wide): NE room -> east ring, SW room -> west ring
    def ring_door(side, lo, hi):
        t = rng.randint(lo, max(lo, hi))
        if side == "E":
            g[c + t:c + t + 2, c + h:c + h + 2] = 0
        elif side == "W":
            g[c + t:c + t + 2, c - h - 1:c - h + 1] = 0
        elif side == "S":
            g[c + h:c + h + 2, c + t:c + t + 2] = 0
        elif side == "N":
            g[c - h - 1:c - h + 1, c + t:c + t + 2] = 0
    ring_door("E", -h + 2, off["E"] - 3)                         # north of the E spoke
    ring_door("W", off["W"] + 3, h - 3)                          # south of the W spoke
    # stub walls (alcoves) in two rooms: from the outer wall inward, 2 thick, 4-5 long
    for q in rng.sample(["NE", "NW", "SE", "SW"], 2):
        sx = 1 if "E" in q else -1
        sy = 1 if "S" in q else -1
        ang = math.radians(rng.uniform(30, 60))
        ex, ey = c + sx * Rin * math.cos(ang), c + sy * Rin * math.sin(ang)
        L = rng.randint(4, 5)
        if rng.random() < 0.5:                                    # horizontal stub
            y0 = int(round(ey)) - (1 if sy > 0 else 0) - sy * 1
            xs = range(int(round(ex)) - sx * L, int(round(ex)) + sx * 3, sx)
            for x in xs:
                g[y0:y0 + 2, x] = 1
        else:
            x0 = int(round(ex)) - (1 if sx > 0 else 0) - sx * 1
            ys = range(int(round(ey)) - sy * L, int(round(ey)) + sy * 3, sy)
            for y in ys:
                g[y, x0:x0 + 2] = 1
        g[r >= Rin] = 1
    # stairs on the core faces
    exit_ = (c - 3, c + rng.randint(-1, 1))
    g[exit_[1], exit_[0]] = 9
    if f == 1:
        xd = c + off["S"] + 3 + rng.randint(0, 2)                # the door, in SE's south wall
        last = None
        for y in range(c, S):
            if g[y, xd] == 1 and r[y, xd] < Rin - 0.5:
                continue
            if math.hypot(xd + 0.5 - c, y - c) > Rout + 0.4:
                break
            if r[y, xd] >= Rin - 1.5:
                g[y, xd:xd + 2] = 0
                last = y
        arrival = (xd, last)
    else:
        arrival = (c + 3, c + rng.randint(-1, 1))
    g[arrival[1], arrival[0]] = 6
    sky = (r > Rout + 0.3).tolist()
    return g, sky, arrival, exit_, (c, Rout, Rin)


def tower_floor(f):
    for seed in range(400):
        g, sky, arrival, exit_, geo = built_tower(f, 7000 * f + seed)
        reach = bfs(g, arrival, WALK)
        if not any((exit_[0] + a, exit_[1] + b) in reach for a, b in N4):
            continue
        walk = {(x, y) for y in range(g.shape[0]) for x in range(g.shape[1]) if g[y, x] == 0}
        if len(walk - reach) > 6:                                 # a stub sealed off a room: reject
            continue
        for x, y in walk - reach:
            g[y, x] = 1
        import render_dungeon_material_map as R
        rows = ["".join("#" if v == 1 else "." for v in rw) for rw in g]
        if R.prune_thin_walls(rows)[1]:
            continue
        if len(shortest(g, arrival, exit_)) < 50:
            continue
        break
    else:
        raise SystemExit(f"no built tower seed for F{f}")
    c, Rout, Rin = geo
    mech = {"keyChests": []}
    gate = None
    if f >= 2:
        gate = find_gate(g, arrival, exit_)
        for x, y in gate:
            g[y, x] = 19
    for x, y in place_chests(g, arrival, exit_, 3, gate, mech if f >= 2 else None):
        g[y, x] = 4
    if f == 1:                                                    # save crystal just inside the door
        ax, ay = arrival
        for x, y in ((ax + 3, ay - 4), (ax - 2, ay - 4), (ax + 3, ay - 5), (ax + 2, ay - 6)):
            if g[y, x] == 0 and all(g[y + b, x + a] not in (1, 6) for a, b in N4):
                g[y, x] = 14; break
    S = g.shape[0]
    win, n = [], 0
    for x in range(S):
        for y in range(1, c):
            if g[y - 1, x] == 1 and g[y, x] in (0, 4) and math.hypot(x - c, y - c) > Rin - 1.6:
                n += 1
                if n % 4 == 2:
                    win.append([x, y - 1])
                break
    meta = {"mechanic": "wind", "mechanics": mech if f >= 2 else {}, "ascending": True, "built": True,
            "decorRows": ["".join("s" if sky[y][x] else "." for x in range(S)) for y in range(S)],
            "decals": {"skyWindow": win},
            "tower": {"centre": c, "outerRadius": Rout, "innerRadius": Rin},
            # what the picture draws for each asset kind (the game semantics stay as authored):
            # F1's tile 6 is the tower door, an opening in the wall and not a cave mouth
            "spriteFor": {"mouth": "door", "stairsUp": "stairsDown", "stairsDown": "stairsUp"}}
    return g, meta


def author():
    os.makedirs(P3, exist_ok=True)
    bad = 0
    for fid in ("ironMine-f1", "hauntedForest-f1"):
        shutil.copyfile(os.path.join(P2, f"{fid}.json"), os.path.join(P3, f"{fid}.json"))
    for f in (1, 2):
        g, meta = tower_floor(f)
        o = tiles_to_floor("stormNest", f, 5, "storm-battered stone tower", g, meta)
        o["source"] = "pilot3.py (built tower; new layout)"
        errs, st = check(o)
        o["validation"] = errs or ["ok"]
        json.dump(o, open(os.path.join(P3, f"stormNest-f{f}.json"), "w"))
        print(f"{'OK  ' if not errs else 'FAIL'} stormNest-f{f} {o['width']}x{o['height']} {st}")
        for e in errs:
            print("      -", e)
        print("\n".join(r.replace("#", "█") for r in o["rows"]))
        bad += bool(errs)
    return bad


if __name__ == "__main__":
    sys.exit(1 if author() else 0)
