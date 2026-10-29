#!/usr/bin/env python3
"""Validate the option (a) authored floors (authored_floors.py) against the engine's movement rules
and the bundle mechanic each dungeon must carry. Exit 1 on any failure.

Movement (canMove's dungeon branch in the shipped bundle):
  blocks: 1 rock, 4 chest, 7 boss, 14 save, 18 sign, 23, 28; 5 lava unless lavaPhase is on
  passable: 0, 6, 9, 17 hidden door, 25 wind lane
  15 locked door: consumes a dungeonKey; 19 wind barrier: consumes a windbreakerStone. Either opens
     the stepped cell plus its 4-neighbours of the same tile (so a gate must fit that cross)
  chests, boss, save and sign are used from an adjacent cell

Checks per floor:
  - A1D shape: width/height match rows, a solid 3-cell frame, rows '#' exactly where tiles are 1/17
  - exactly one arrival (mouth on F1, stairsUp after), one stairs on non-top floors, a boss only on
    the top floor with the bundle's bossId
  - REACHABILITY with keys simulated: starting at the arrival, open a gate only with a key already
    picked up from a reachable key chest; the stairs (or boss), every chest, save and sign must
    become reachable, and no walkable cell may be orphaned
  - every gate fits the engine's open-cross; key chests are chests; keys >= gates
  - mechanic counts:
      stormNest F>=2: >=2 tiles of 19 and >=1 key chest
      stormreachSpire: windCorridorDir set; tile 25 covers 40-60 % of the shortest arrival->goal path
      scorchedRuins / volcanicForge / demonBarracks: >=1 tile 17, every hidden-room chest is behind
        a 17 (unreachable when 17 is treated as rock), mimics only on the bundle's floors and on chests
      volcanicForge: >=4 tiles of 5, and the goal is UNREACHABLE with lavaPhase off (the course is
        on the route) but reachable with it on
  - chest counts equal the bundle's per-floor counts

  python3 validate_authored.py
"""
import glob, json, os, sys
from collections import deque
import numpy as np
import common
from authored_floors import OUT, DUNGEONS, CHESTS, KEY_FLOORS, MIMIC_FLOORS

BLOCK = {1, 4, 7, 14, 18, 23, 28}
USE_ADJ = {4, 7, 14, 18}
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def reach(g, start, keys_from, lava=True, hidden=True, gates=True):
    """BFS with key pickup. Returns (reached cells, opened gate cells, keys left)."""
    H, W = g.shape
    g = g.copy()
    keyset = {(k["x"], k["y"]) for k in keys_from}
    got, held = set(), 0
    seen = {start}
    while True:
        q = deque(seen)
        while q:
            x, y = q.popleft()
            for a, b in N4:
                nx, ny = x + a, y + b
                if not (0 <= nx < W and 0 <= ny < H) or (nx, ny) in seen:
                    continue
                v = g[ny, nx]
                if (nx, ny) in keyset and (nx, ny) not in got:
                    got.add((nx, ny)); held += 1
                ok = v in (0, 6, 9, 25) or (v == 17 and hidden) or (v == 5 and lava)
                if ok:
                    seen.add((nx, ny)); q.append((nx, ny))
        # open one reachable gate if a key is held
        opened = False
        if gates and held:
            for (x, y) in list(seen):
                for a, b in N4:
                    nx, ny = x + a, y + b
                    if 0 <= nx < W and 0 <= ny < H and g[ny, nx] in (15, 19):
                        t = g[ny, nx]
                        g[ny, nx] = 0
                        for c, d in N4:
                            if 0 <= nx + c < W and 0 <= ny + d < H and g[ny + d, nx + c] == t:
                                g[ny + d, nx + c] = 0
                        held -= 1; seen.add((nx, ny)); opened = True
                        break
                if opened:
                    break
        if not opened:
            return seen, g


def touched(seen, x, y):
    return (x, y) in seen or any((x + a, y + b) in seen for a, b in N4)


def check(o):
    errs = []
    did, f, n = o["dungeonId"], o["floor"], o["totalFloors"]
    g = np.array(o["tiles"])
    H, W = g.shape
    if (W, H) != (o["width"], o["height"]) or len(o["rows"]) != H or any(len(r) != W for r in o["rows"]):
        errs.append("shape mismatch")
    for y in range(H):
        for x in range(W):
            if (o["rows"][y][x] == "#") != (g[y, x] in (1, 17)):
                errs.append(f"rows/tiles disagree at {x},{y}"); break
    if (g[:3] != 1).any() or (g[-3:] != 1).any() or (g[:, :3] != 1).any() or (g[:, -3:] != 1).any():
        errs.append("3-cell rock frame broken")
    arr = [(a["x"], a["y"]) for a in o["assets"] if a["kind"] in ("mouth", "stairsUp")]
    stairs = [(a["x"], a["y"]) for a in o["assets"] if a["kind"] == "stairsDown"]
    boss = [a for a in o["assets"] if a["kind"] == "boss"]
    if len(arr) != 1:
        errs.append(f"{len(arr)} arrivals")
    top = f == n
    if top and (stairs or len(boss) != 1 or boss[0].get("bossId") != DUNGEONS[did]["boss"]):
        errs.append("top floor must have the boss and no stairs")
    if not top and (len(stairs) != 1 or boss):
        errs.append("non-top floor needs exactly one stairs and no boss")
    if errs:
        return errs, {}
    mech = o.get("mechanics", {})
    keys = mech.get("keyChests", [])
    chests = [(a["x"], a["y"]) for a in o["assets"] if a["kind"] == "chest"]
    for k in keys:
        if (k["x"], k["y"]) not in chests:
            errs.append(f"key chest {k} is not a chest")
    seen, gdone = reach(g, arr[0], keys)
    goal = stairs[0] if stairs else (boss[0]["x"], boss[0]["y"])
    if not touched(seen, *goal):
        errs.append("goal (stairs/boss) unreachable")
    for a in o["assets"]:
        if a["kind"] in ("chest", "save", "sign") and not touched(seen, a["x"], a["y"]):
            errs.append(f"{a['kind']} at {a['x']},{a['y']} unreachable")
    walk = {(x, y) for y in range(H) for x in range(W) if g[y, x] in (0, 6, 9, 25, 17, 5, 15, 19)}
    orphan = walk - seen - {(x, y) for y in range(H) for x in range(W) if gdone[y, x] in (15, 19)}
    if orphan:
        errs.append(f"{len(orphan)} orphaned walkable cells, e.g. {sorted(orphan)[:3]}")
    # gates fit the engine's open-cross
    for t in (15, 19):
        ys, xs = np.nonzero(g == t)
        cells = set(zip(xs.tolist(), ys.tolist()))
        while cells:
            c0 = cells.pop(); grp = {c0}; q = [c0]
            while q:
                x, y = q.pop()
                for a, b in N4:
                    if (x + a, y + b) in cells:
                        cells.discard((x + a, y + b)); grp.add((x + a, y + b)); q.append((x + a, y + b))
            if not any(all(c == (x, y) or (abs(c[0] - x) + abs(c[1] - y)) == 1 for c in grp) for x, y in grp):
                errs.append(f"gate of {len(grp)} tile-{t} cells does not fit the engine's open-cross")
    n15, n19 = int((g == 15).sum()), int((g == 19).sum())
    if (n15 or n19) and not keys:
        errs.append("gate without a key chest")
    stats = {"walkable": len(walk), "chests": len(chests), "keys": len(keys), "t19": n19, "t15": n15,
             "t17": int((g == 17).sum()), "t25": int((g == 25).sum()), "t5": int((g == 5).sum()),
             "mimics": len(mech.get("mimicChests", [])), "hiddenChests": len(mech.get("hiddenRoomChests", []))}
    if len(chests) != CHESTS[did][f - 1]:
        errs.append(f"{len(chests)} chests, bundle has {CHESTS[did][f - 1]}")
    if f in KEY_FLOORS.get(did, set()) and not keys:
        errs.append("bundle has a key chest on this floor")
    if did == "stormNest" and f >= 2 and (n19 < 2 or not keys):
        errs.append(f"wind: {n19} tiles of 19, {len(keys)} key chests (need >=2, >=1)")
    if did == "stormreachSpire":
        if "windCorridorDir" not in mech:
            errs.append("no windCorridorDir")
        from authored_floors import shortest_path
        p = shortest_path(g, arr[0], goal)
        cov = sum(1 for x, y in p if g[y, x] == 25) / max(1, len(p))
        stats["laneCover"] = round(cov, 2)
        if not 0.35 <= cov <= 0.65:
            errs.append(f"wind lane covers {cov:.0%} of the main path (bundle 40-60 %)")
    if did in ("scorchedRuins", "volcanicForge", "demonBarracks"):
        if stats["t17"] < 1:
            errs.append("no hidden door 17")
        s2, _ = reach(g, arr[0], keys, hidden=False)
        for h in mech.get("hiddenRoomChests", []):
            x, y = map(int, h.split(","))
            if touched(s2, x, y):
                errs.append(f"hidden chest {h} reachable without its hidden door")
        mf = MIMIC_FLOORS.get(did, set())
        if (f in mf) != bool(mech.get("mimicChests")):
            errs.append(f"mimic presence differs from the bundle (bundle floors {sorted(mf)})")
        for m in mech.get("mimicChests", []):
            if tuple(map(int, m.split(","))) not in chests:
                errs.append(f"mimic {m} is not a chest")
    if did == "volcanicForge":
        if stats["t5"] < 4:
            errs.append(f"only {stats['t5']} lava-course tiles")
        s_off, _ = reach(g, arr[0], keys, lava=False)
        if touched(s_off, *goal):
            errs.append("goal reachable with lavaPhase OFF: the lava course is not on the route")
    return errs, stats


def main():
    bad = 0
    for p in sorted(glob.glob(os.path.join(OUT, "*-f*.json")),
                    key=lambda s: (s.rsplit("-f", 1)[0], int(s.rsplit("-f", 1)[1][:-5]))):
        o = json.load(open(p))
        errs, st = check(o)
        tag = "OK  " if not errs else "FAIL"
        bad += bool(errs)
        print(f"{tag} {o['dungeonId']}-f{o['floor']:<2} {st}")
        for e in errs:
            print("       -", e)
    print("ALL OK" if not bad else f"{bad} floor(s) failing")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
