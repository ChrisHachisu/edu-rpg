#!/usr/bin/env python3
"""PILOT 2 (owner direction, 2026-10-28): NEW authored layouts, organic like Act 1, with the dungeon's
mechanic designed into the plan. No Ap() layouts and no reuse of any earlier dungeon design.

Pilot floors:
  ironMine-f1       organic mine: Act 1's own generator (build_dungeon_semantic.generate_floor,
                    unchanged) with a mine spec. Branchwork means a trunk adit with dead-end drifts,
                    on near-orthogonal "vein" bearings. Timber sets go along the narrow shafts as
                    decals.
  hauntedForest-f1  forest-maze: a perfect maze on a jittered grid. Paths are 2-3 cells and the
                    tree-mass walls 2-3 cells, so Act 1's renderer keeps every wall
                    (MIN_WALL_DEPTH 2, MIN_AREA 6). Dead-end glades hold the chests. The way in is
                    from the south. Three exits leave through the east edge of the canvas and one
                    is `correctExitY`, exactly what the engine's forest-maze code reads (walking off
                    the east edge on that row advances the floor; loadMap marks it tile 2). The
                    save tile is not placed, matching the bundle.
  stormNest-f1/f2   a stone tower going UP: a round outer wall (sky beyond it, window slits in it)
                    around a central stair core. Irregular hand-built rooms come from jittered
                    radial walls and one arc wall. Every wall is 2+ cells thick so the Act 1
                    renderer keeps it and gives it the Act 1 finish. One radial wall is left solid,
                    so the rooms form a chain from the way in to the stairs.
                    F2 = wind: the smallest 19-tile gate that cuts the route sits in a doorway; it
                    obeys the engine's open rule (the stepped cell plus its 4 same-tile
                    neighbours). Its windbreaker key chest (keyChests) is on the arrival side.

Output: <scratch>/pilot2/<floor>.json in the A1D floor format plus `tiles`, `mechanics`,
`decorRows` ('s' sky), `decals` and `ascending`, as authored_floors.py writes them.

  python3 pilot2.py author          # write + validate the four floors
"""
import json, math, os, random, sys, zlib
from collections import deque
import numpy as np
from PIL import Image
import common
from common import SCRATCH
import build_dungeon_semantic as B

OUT = os.path.join(SCRATCH, "pilot2")
FRAME = 3
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def tiles_to_floor(did, f, total, theme, g, extra):
    rows = ["".join("#" if v in (1, 17) else "." for v in r) for r in g]
    kind = {9: "stairsDown", 4: "chest", 7: "boss", 14: "save", 18: "sign",
            19: "windBarrier", 15: "lockedDoor", 17: "hiddenDoor", 25: "windLane", 5: "lava"}
    assets = []
    for y in range(g.shape[0]):
        for x in range(g.shape[1]):
            v = int(g[y, x])
            if v == 6:
                assets.append({"kind": "mouth" if f == 1 else "stairsUp", "x": x, "y": y})
            elif v in kind:
                assets.append({"kind": kind[v], "x": x, "y": y})
    o = {"dungeonId": did, "floor": f, "totalFloors": total, "width": g.shape[1], "height": g.shape[0],
         "theme": theme, "rows": rows, "assets": assets, "tiles": g.astype(int).tolist(),
         "walkableCells": int(sum(r.count(".") for r in rows)),
         "source": "pilot2.py (new authored layout; not Ap(), not an earlier design)"}
    o.update(extra)
    return o


def bfs(g, start, passable):
    H, W = g.shape
    seen = {start}; q = deque([start])
    while q:
        x, y = q.popleft()
        for a, b in N4:
            nx, ny = x + a, y + b
            if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and passable(int(g[ny, nx])):
                seen.add((nx, ny)); q.append((nx, ny))
    return seen


WALK = lambda v: v in (0, 6, 9, 17, 25, 5)


# ── iron mine ───────────────────────────────────────────────────────────────────────────────────
MINE = {"id": "ironMine", "name": "Iron Mine", "floors": 4, "base": (54, 46),
        "joints": (6, 94), "pattern": "branchwork", "built": True,
        "theme": "timbered iron mine", "boss": "oreColossus"}


def skel_mine(w, h, vecs, rng):
    """A MINE skeleton in Act 1's skeleton format (so generate_floor carves, polishes, places assets
    and validates it exactly as it does a cave): a straight haulage adit from the way in to the
    shaft chamber, cross-cut drifts leaving it at near right angles (the joint bearings are ~90
    degrees apart, standing in for the ore veins), each drift ending in a small stope, some with a
    second-order drift. Conduits are 2 wide (timbered drifts), chambers are small."""
    entry = B.edge_anchor(w, h, rng)
    payoff = B.far_inside(w, h, entry, rng)
    trunk = [entry] + B.waypoints(entry, payoff, int(rng.integers(2, 4)), min(w, h) * 0.10, w, h, rng) + [payoff]
    conduits, chambers, dead = [], [], []
    for i, (p, q) in enumerate(zip(trunk, trunk[1:])):
        cells = B.joint_polyline(p, q, vecs, rng, (w, h))
        conduits.append((cells, 2))
        if i == len(trunk) - 2:
            approach = cells
    chambers.append((entry, 1.8))
    for node in trunk[1:-1]:
        chambers.append((node, float(rng.uniform(1.6, 2.0))))
    chambers.append((payoff, float(rng.uniform(3.0, 3.4))))
    trunk_cells = [c for cells, _ in conduits[:-1] for c in cells]
    for k in range(int(rng.integers(9, 13))):
        if not trunk_cells:
            break
        base = trunk_cells[int(rng.integers(0, len(trunk_cells)))]
        if math.hypot(base[0] - payoff[0], base[1] - payoff[1]) < 9:
            continue
        v = vecs[int(rng.integers(0, len(vecs)))]
        sgn = 1 if rng.random() < 0.5 else -1
        length = float(rng.integers(10, 19))
        tip = (int(np.clip(round(base[0] + sgn * v[0] * length), 4, w - 5)),
               int(np.clip(round(base[1] + sgn * v[1] * length), 4, h - 5)))
        cells = B.joint_polyline(base, tip, vecs, rng, (w, h))
        if len(cells) < 5:
            continue
        conduits.append((cells, 2))
        chambers.append((cells[-1], float(rng.uniform(1.8, 2.5))))      # the stope at the drift face
        dead.append(cells[-1])
        if rng.random() < 0.45 and len(cells) > 8:
            mid = cells[len(cells) // 2]
            v2 = vecs[(vecs.index(v) + 2) % len(vecs)]
            l2 = float(rng.integers(5, 9)) * (1 if rng.random() < 0.5 else -1)
            tip2 = (int(np.clip(round(mid[0] + v2[0] * l2), 4, w - 5)),
                    int(np.clip(round(mid[1] + v2[1] * l2), 4, h - 5)))
            sub = B.joint_polyline(mid, tip2, vecs, rng, (w, h))
            if len(sub) >= 4:
                conduits.append((sub, 1))
                chambers.append((sub[-1], float(rng.uniform(1.5, 2.0))))
                dead.append(sub[-1])
    return {"entry": entry, "payoff": payoff, "approach": approach,
            "conduits": conduits, "chambers": chambers, "deadEnds": dead}


def iron_mine_f1():
    B.ACT = 2
    B.skel_branchwork = skel_mine                     # the mine pattern rides Act 1's pipeline
    for salt in range(0, 40):
        fl = B.crop_to_content(B.generate_floor(MINE, 1, zlib.crc32(b"ironMine-pilot2") + salt * 7919))
        errs = B.validate(fl)
        if not errs:
            break
    # the renderer prunes wall slivers too thin for its face band; make the layout agree with the
    # art (and so with the walk mask) by applying the same prune to the rows, then re-validate
    import render_dungeon_material_map as R
    fl["rows"], pruned = R.prune_thin_walls(fl["rows"])
    fl["prunedToMatchRenderer"] = [[x, y] for y, x in pruned]
    fl["walkableCells"] = sum(len(r) - r.count("#") for r in fl["rows"])
    fl["walkableFraction"] = round(fl["walkableCells"] / (fl["width"] * fl["height"]), 3)
    errs = B.validate(fl)
    fl["act1Validate"] = errs or ["ok"]
    fl["seedSalt"] = salt
    # tiles from rows+assets the way a1dTiles() builds them
    tile = {"mouth": 6, "stairsUp": 6, "stairsDown": 9, "chest": 4, "boss": 7, "save": 14, "sign": 18,
            "hiddenDoor": 17, "torch": 24}
    g = np.array([[1 if c == "#" else 0 for c in r] for r in fl["rows"]], np.int16)
    for a in fl["assets"]:
        if a["kind"] in tile:
            g[a["y"], a["x"]] = tile[a["kind"]]
    fl["tiles"] = g.astype(int).tolist()
    fl["dungeonId"] = "ironMine"
    fl["theme"] = "timbered iron mine"
    fl["mechanics"] = {}
    fl["decals"] = {"timber": timber_sets(fl["rows"])}
    fl["source"] = "pilot2.py -> build_dungeon_semantic.generate_floor (Act 1 generator, mine spec)"
    return fl


def timber_sets(rows, every=4):
    """Timber sets along narrow shafts: where a passage is 1-3 cells across between rock on both
    sides, every `every` cells along it: two posts against the walls and a cap beam."""
    H, W = len(rows), len(rows[0])
    rock = lambda x, y: not (0 <= x < W and 0 <= y < H) or rows[y][x] == "#"
    out, used = [], set()
    for y in range(H):
        for x in range(W):
            if rock(x, y):
                continue
            # vertical cross-section (passage runs E-W)
            if rock(x, y - 1):
                n = 0
                while not rock(x, y + n):
                    n += 1
                if 1 <= n <= 3 and not rock(x - 1, y) and not rock(x + 1, y) and (x // every * every == x):
                    k = ("h", x, y)
                    if all((("h", x - d, y) not in used) for d in range(1, every)):
                        out.append({"axis": "h", "x": x, "y0": y, "y1": y + n - 1}); used.add(k)
            if rock(x - 1, y):
                n = 0
                while not rock(x + n, y):
                    n += 1
                if 1 <= n <= 3 and not rock(x, y - 1) and not rock(x, y + 1) and (y // every * every == y):
                    out.append({"axis": "v", "y": y, "x0": x, "x1": x + n - 1})
    return out


# ── haunted forest maze ──────────────────────────────────────────────────────────────────────────
def forest_f1(nx=8, ny=7, seed=11):
    rng = random.Random(seed)
    pw = [rng.choice((2, 2, 3)) for _ in range(nx)]               # path widths per column
    ph = [rng.choice((2, 2, 3)) for _ in range(ny)]
    ww = [rng.choice((2, 3, 3)) for _ in range(nx + 1)]            # tree-wall widths
    wh = [rng.choice((2, 3, 3)) for _ in range(ny + 1)]
    ww[-1] = 2                                                      # thin east wall: exits are short
    xs, x = [], FRAME
    for i in range(nx):
        x += ww[i]; xs.append(x); x += pw[i]
    W = x + ww[-1] + FRAME                                          # exits are re-cut through this band
    ys, y = [], FRAME
    for j in range(ny):
        y += wh[j]; ys.append(y); y += ph[j]
    H = y + wh[-1] + FRAME + 1
    g = np.ones((H, W), np.int16)
    for i in range(nx):
        for j in range(ny):
            g[ys[j]:ys[j] + ph[j], xs[i]:xs[i] + pw[i]] = 0
    # perfect maze (recursive backtracker), seeded
    start = (nx // 2, ny - 1)
    seen = {start}; stack = [start]; edges = []
    while stack:
        cx, cy = stack[-1]
        nb = [(cx + a, cy + b) for a, b in N4 if 0 <= cx + a < nx and 0 <= cy + b < ny and (cx + a, cy + b) not in seen]
        if not nb:
            stack.pop(); continue
        n = rng.choice(nb); seen.add(n); stack.append(n); edges.append(((cx, cy), n))
    for (ax, ay), (bx, by) in edges:
        if ay == by:                                                # E-W link: carve the wall between
            i = max(ax, bx)
            y0 = max(ys[ay], ys[ay]); w_ = min(ph[ay], 2) if rng.random() < 0.5 else ph[ay]
            g[ys[ay]:ys[ay] + w_, xs[i] - ww[i]:xs[i]] = 0
        else:
            j = max(ay, by)
            w_ = min(pw[ax], 2) if rng.random() < 0.5 else pw[ax]
            g[ys[j] - wh[j]:ys[j], xs[ax]:xs[ax] + w_] = 0
    # dead ends -> glades (widen into a thick wall by one cell, keeping >= 2 of wall)
    deg = {}
    for a, b in edges:
        deg[a] = deg.get(a, 0) + 1; deg[b] = deg.get(b, 0) + 1
    dead = [c for c in deg if deg[c] == 1 and c != start]
    rng.shuffle(dead)
    # entrance (code 20) and three east exits (codes 21-23) are carved BEFORE bending, as marked
    # corridors, so they bend with the maze; their ends are re-cut to the canvas edge afterwards
    sx = xs[start[0]]
    g[ys[start[1]] + ph[start[1]]:H - FRAME, sx:sx + 2] = 20
    rows_e = sorted(rng.sample(range(ny), 3))
    for k, j in enumerate(rows_e):
        ey = ys[j] + (ph[j] - 1) // 2
        g[ey, xs[-1] + pw[-1]:W - FRAME] = 21 + k
    # chests: dead-end cells far from the start (not the east-column cells that carry an exit)
    chests = []
    for (cx, cy) in dead:
        if len(chests) >= 3:
            break
        if cx == nx - 1 and cy in rows_e:
            continue
        chests.append((xs[cx] + (pw[cx] - 1) // 2, ys[cy] + (ph[cy] - 1) // 2))
    for x_, y_ in chests:
        g[y_, x_] = 4
    g = bend(g, rng)
    H, W = g.shape
    repair_diagonals(g)
    ent = np.argwhere(g == 20)
    g[g == 20] = 0
    by = ent[:, 0].max(); bx = int(ent[ent[:, 0] == by][:, 1].min())
    g[by:H - FRAME, bx:bx + 2] = 0                                  # straight down through the frame band
    mouth = (bx, H - FRAME - 1)
    g[mouth[1], mouth[0]] = 6
    exits = []
    for k in range(3):
        c_ = np.argwhere(g == 21 + k)
        g[g == 21 + k] = 0
        ey = int(c_[c_[:, 1].argmax(), 0]); ex = int(c_[:, 1].max())
        g[ey, ex:W] = 0                                             # straight out through the east edge
        exits.append(ey)
    correct = exits[rng.randrange(3)]
    live = bfs(g, mouth, WALK)
    for y in range(H):
        for x in range(W):
            if g[y, x] == 0 and (x, y) not in live:
                g[y, x] = 1                                          # pockets sealed behind a chest
    meta = {"mechanic": "forest-maze",
            "mechanics": {"correctExitY": int(correct), "keyChests": []},
            "decals": {"exits": [{"y": int(e), "correct": e == correct} for e in exits]},
            "mazeCells": [nx, ny], "nextFloorArrival": "engine places the hero at (1, floor(h/2)) on F2+"}
    return g, meta


def bend(g, rng, amp=2.0, wl=(15, 21)):
    """Bend the maze grid so corridors wander instead of running ruler-straight: every row is
    translated sideways by a smooth integer offset, then every column vertically. Neighbouring
    rows differ by at most one cell, so 2-cell paths and 2-cell tree walls stay 4-connected and
    the maze topology is unchanged (checked by the caller's validator)."""
    H, W = g.shape
    P = 4
    G = np.ones((H + 2 * P, W + 2 * P), np.int16)
    G[P:P + H, P:P + W] = g
    ph1, ph2 = rng.random() * 6.28, rng.random() * 6.28
    L1, L2 = rng.uniform(*wl), rng.uniform(*wl)
    out = G.copy()
    for y in range(G.shape[0]):
        o = int(round(amp * math.sin(2 * math.pi * y / L1 + ph1)))
        out[y] = np.roll(G[y], o)
    G2 = out.copy()
    for x in range(G.shape[1]):
        o = int(round(amp * math.sin(2 * math.pi * x / L2 + ph2)))
        G2[:, x] = np.roll(out[:, x], o)
    res = G2[P:P + H, P:P + W]
    res[:FRAME] = 1; res[-FRAME:] = 1; res[:, :FRAME] = 1; res[:, -FRAME:] = 1
    return res


def repair_diagonals(g):
    """Bending can leave two pieces of one path touching only at a corner. Join each stranded
    piece to the main one through one of the two cells that share that corner."""
    H, W = g.shape
    walkable = lambda v: v != 1
    for _ in range(50):
        cells = {(x, y) for y in range(H) for x in range(W) if walkable(g[y, x])}
        if not cells:
            return
        start = max(cells, key=lambda c: c[1])                          # the entrance end
        main = bfs(g, start, lambda v: v != 1)
        rest = cells - main
        if not rest:
            return
        fixed = False
        for (x, y) in sorted(rest):
            for a, b in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
                if (x + a, y + b) in main:
                    for cx, cy in ((x + a, y), (x, y + b)):
                        if g[cy, cx] == 1:
                            g[cy, cx] = 0; fixed = True; break
                if fixed:
                    break
            if fixed:
                break
        if not fixed:
            return


def _wall_components(g):
    H, W = g.shape
    seen = np.zeros_like(g, bool); n = 0
    for y in range(H):
        for x in range(W):
            if g[y, x] == 1 and not seen[y, x]:
                n += 1; q = [(x, y)]; seen[y, x] = True
                while q:
                    cx, cy = q.pop()
                    for a, b in N4:
                        nx_, ny_ = cx + a, cy + b
                        if 0 <= nx_ < W and 0 <= ny_ < H and g[ny_, nx_] == 1 and not seen[ny_, nx_]:
                            seen[ny_, nx_] = True; q.append((nx_, ny_))
    return n


def wobble(g, rng, passes=3):
    """Organic edges for the maze without changing its topology: clustered by low-frequency noise,
    eat into thick tree walls (keeping >= 2 cells of wall behind) and grow into wide paths
    (keeping >= 2 cells of path). A carve that would close a loop is refused: in a perfect maze the
    tree walls are ONE connected mass, so a new loop shows up as a second wall component."""
    H, W = g.shape
    nz = np.asarray(Image.fromarray((np.random.default_rng(rng.randrange(1 << 30)).random((H // 3 + 2, W // 3 + 2)) * 255)
                                    .astype(np.uint8)).resize((W + 3, H + 3), Image.BICUBIC), np.float32)[:H, :W] / 255
    base_c = _wall_components(g)
    for _ in range(passes):
        for y in range(FRAME + 1, H - FRAME - 1):
            for x in range(FRAME + 1, W - FRAME - 1):
                for a, b in N4:
                    if g[y, x] == 1 and g[y + b, x + a] == 0 and nz[y, x] > 0.62:
                        if g[y - b, x - a] == 1 and g[y - 2 * b, x - 2 * a] == 1 and \
                                g[y - 3 * b, x - 3 * a] == 1:
                            g[y, x] = 0
                            if _wall_components(g) != base_c:
                                g[y, x] = 1
                            break
                    if g[y, x] == 0 and g[y + b, x + a] == 1 and nz[y, x] < 0.30:
                        if g[y - b, x - a] == 0 and g[y - 2 * b, x - 2 * a] == 0 and g[y - 3 * b, x - 3 * a] == 0:
                            g[y, x] = 1
                            break


# ── storm nest tower ────────────────────────────────────────────────────────────────────────────
def tower(f, seed):
    rng = random.Random(seed)
    Rout = 18.5 - 0.6 * (f - 1)                                    # the tower narrows as it rises
    Rin = Rout - 3.0
    core = 3.4
    S = int(math.ceil(Rout)) * 2 + 1 + 2 * FRAME
    c = (S - 1) / 2
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    dx, dy = xx - c, yy - c
    r = np.hypot(dx, dy)
    ang = (np.degrees(np.arctan2(dy, dx)) + 360) % 360           # 90 = south (screen y down)
    # hand-built irregularity: the inner face of the outer wall wanders +-0.7 cells
    wob = 0.7 * np.sin(np.radians(ang) * 3 + rng.random() * 6) + 0.4 * np.sin(np.radians(ang) * 7 + rng.random() * 6)
    g = np.ones((S, S), np.int16)
    g[(r < Rin + wob) & (r > core)] = 0
    # radial walls, jittered angles; route goes clockwise from the way in (south) to the stairs
    base = 90 + rng.uniform(-8, 8)
    nwalls = 5
    angs = [(base + 30 + k * (300 / nwalls) + rng.uniform(-10, 10)) % 360 for k in range(nwalls)]
    solid_wall = (base + rng.uniform(-6, 6)) % 360                   # just EAST of south door... see below
    walls = angs + [solid_wall]
    def on_line(a):
        t = np.radians(a)
        ux, uy = math.cos(t), math.sin(t)
        along = dx * ux + dy * uy
        perp = np.abs(-dx * uy + dy * ux)
        return (perp <= 1.05) & (along > 0)
    doors = []
    for k, a in enumerate(walls):
        m = on_line(a) & (r <= Rin + 1.5)
        g[m] = 1
        if a == solid_wall:
            continue
        rd = rng.uniform(core + 3.5, Rin - 3.0)                       # doorway radius
        t = np.radians(a)
        dm = on_line(a) & (np.abs(r - rd) <= 1.0)
        g[dm & (r < Rin + wob)] = 0
        doors.append((a, rd))
    # an arc wall splitting one sector into an inner and an outer room (a small side room)
    k = rng.randrange(1, nwalls - 1)
    a0, a1 = angs[k], angs[k + 1]
    lo, hi = sorted((a0, a1))
    mid_r = (core + Rin) / 2 + 1.0
    arc = (np.abs(r - mid_r) <= 1.0) & (ang > lo) & (ang < hi)
    g[arc] = 1
    gap_a = lo + (hi - lo) * rng.uniform(0.3, 0.7)
    g[arc & (np.abs(ang - gap_a) * np.radians(1) * mid_r <= 1.1)] = 0
    # stairs: arrival on the core face just clockwise of the solid wall, exit just counter-clockwise
    def core_cell(a):
        t = np.radians(a)
        for rr in np.arange(core + 0.6, core + 3, 0.3):
            x, y = int(round(c + rr * math.cos(t))), int(round(c + rr * math.sin(t)))
            if g[y, x] == 0:
                return x, y
        return None
    sky = r > Rout + 0.3
    if f == 1:
        # the tower door: through the outer wall at the south, out to the canvas edge
        t = np.radians(base + 26)
        x0 = int(round(c + (Rin - 1) * math.cos(t)))
        last = None
        for yy_ in range(int(round(c + (Rin - 1) * math.sin(t))), S):
            if math.hypot(x0 + 0.5 - c, yy_ - c) > Rout - 0.8:          # stop at the wall's outer face
                break
            g[yy_, x0:x0 + 2] = 0
            last = yy_
        door = (x0, last)
        g[door[1], door[0]] = 6
        arrival = door
    else:
        arrival = core_cell(solid_wall + 22)
        g[arrival[1], arrival[0]] = 6
    exit_ = core_cell(solid_wall - 22)
    g[exit_[1], exit_[0]] = 9
    return g, sky.tolist(), arrival, exit_, (c, Rout, Rin)


def tower_floor(f):
    for seed in range(200):
        g, sky, arrival, exit_, geo = tower(f, 1000 * f + seed)
        reach = bfs(g, arrival, WALK)
        if not any((exit_[0] + a, exit_[1] + b) in reach or exit_ in reach for a, b in N4):
            continue
        walk = {(x, y) for y in range(g.shape[0]) for x in range(g.shape[1]) if g[y, x] == 0}
        if walk - reach:                                              # sealed pockets: fill them
            for x, y in walk - reach:
                g[y, x] = 1
        # route length must be long (the solid wall forces the long way round)
        path = shortest(g, arrival, exit_)
        if len(path) < 45:
            continue
        break
    else:
        raise SystemExit(f"no tower seed for F{f} gave a long connected route")
    c, Rout, Rin = geo
    mech = {"keyChests": []}
    gate = None
    if f >= 2:
        gate = find_gate(g, arrival, exit_)
        for x, y in gate:
            g[y, x] = 19
    chests = place_chests(g, arrival, exit_, 3, gate, mech if f >= 2 else None)
    for x, y in chests:
        g[y, x] = 4
    if f == 1:                                                        # save crystal + plaque near the door
        ax, ay = arrival
        for x, y in ((ax + 3, ay - 3), (ax - 2, ay - 3), (ax + 3, ay - 4)):
            if g[y, x] == 0 and all(g[y + b, x + a] != 1 for a, b in N4):
                g[y, x] = 14; break
    S = g.shape[0]
    decor = [["s" if sky[y][x] else "." for x in range(S)] for y in range(S)]
    win, n = [], 0
    for y in range(1, S):
        for x in range(S):
            rr = math.hypot(x - c, y - 1 - c)
            if g[y - 1, x] == 1 and g[y, x] in (0, 4) and rr > Rin - 1.2 and y - 1 < c:
                n += 1
                if n % 3 == 1:
                    win.append([x, y - 1])
    meta = {"mechanic": "wind", "mechanics": mech if f >= 2 else {}, "ascending": True,
            "decorRows": ["".join(r) for r in decor], "decals": {"skyWindow": win},
            "tower": {"centre": c, "outerRadius": Rout, "innerRadius": Rin}}
    return g, meta


def shortest(g, a, b, walk=None):
    walk = walk or WALK
    H, W = g.shape
    prev = {a: None}; q = deque([a])
    while q:
        x, y = q.popleft()
        if (x, y) == b:
            break
        for dx, dy in N4:
            n = (x + dx, y + dy)
            if 0 <= n[0] < W and 0 <= n[1] < H and n not in prev and (walk(int(g[n[1], n[0]])) or n == b):
                prev[n] = (x, y); q.append(n)
    if b not in prev:
        return []
    p = [b]
    while prev[p[-1]] is not None:
        p.append(prev[p[-1]])
    return p[::-1]


def find_gate(g, arrival, exit_):
    """Smallest cross-shaped set of floor cells (centre + up to 2 neighbours, so the engine's
    stepped-cell+4-neighbour rule opens it whole) that disconnects the stairs from the arrival,
    preferring one inside a doorway (rock on both flanks) about halfway along the route."""
    path = shortest(g, arrival, exit_)
    best = None
    for i, (x, y) in enumerate(path[3:-3], 3):
        if g[y, x] != 0:
            continue
        for combo in (((1, 0),), ((0, 1),), ((-1, 0),), ((0, -1),), ((1, 0), (-1, 0)), ((0, 1), (0, -1)), ()):
            cells = [(x, y)] + [(x + a, y + b) for a, b in combo]
            if any(g[cy, cx] != 0 for cx, cy in cells):
                continue
            h = g.copy()
            for cx, cy in cells:
                h[cy, cx] = 1
            r = bfs(h, arrival, WALK)
            if any((exit_[0] + a, exit_[1] + b) in r for a, b in N4):
                continue
            score = abs(i - len(path) * 0.55) + 10 * len(cells)
            if best is None or score < best[0]:
                best = (score, cells)
            break
    return best[1]


def place_chests(g, arrival, exit_, n, gate, mech):
    """Chests in pockets: floor cells with rock on exactly two adjacent sides (a corner), far from
    the route; with a gate, the key chest is on the arrival side and the rest beyond it."""
    H, W = g.shape
    path = set(shortest(g, arrival, exit_, lambda v: WALK(v) or v == 19))
    h = g.copy()
    if gate:
        for x, y in gate:
            h[y, x] = 1
    before = bfs(h, arrival, WALK)
    cands = []
    for y in range(2, H - 2):
        for x in range(2, W - 2):
            if g[y, x] != 0 or (x, y) in path:
                continue
            rock = [int(g[y + b, x + a] == 1) for a, b in N4]
            if sum(rock) != 2 or (rock[0] and rock[1]) or (rock[2] and rock[3]):
                continue
            if min(abs(x - px) + abs(y - py) for px, py in path) < 3:
                continue
            nine = sum(int(g[y + b, x + a] == 1) for a in (-1, 0, 1) for b in (-1, 0, 1))
            if nine > 5:
                continue
            cands.append((x, y))
    random.Random(len(cands)).shuffle(cands)
    out = []
    def far(p):
        return all(abs(p[0] - q[0]) + abs(p[1] - q[1]) >= 8 for q in out)
    if mech is not None:
        k = next(p for p in cands if p in before and far(p))
        out.append(k); mech["keyChests"].append({"x": k[0], "y": k[1]})
        pool = [p for p in cands if p not in before]
    else:
        pool = cands
    for p in pool + cands:
        if len(out) >= n:
            break
        if far(p) and p not in out:
            out.append(p)
    return out


# ── validate ────────────────────────────────────────────────────────────────────────────────────
def check(o):
    from validate_authored import reach, touched
    errs = []
    g = np.array(o["tiles"])
    H, W = g.shape
    did = o["dungeonId"]
    arr = [(a["x"], a["y"]) for a in o["assets"] if a["kind"] in ("mouth", "stairsUp")]
    if len(arr) != 1:
        errs.append(f"{len(arr)} arrivals"); return errs, {}
    keys = o.get("mechanics", {}).get("keyChests", [])
    seen, opened = reach(g, arr[0], keys)
    st = {"walkable": int(sum(len(r) - r.count("#") for r in o["rows"]))}
    if did == "hauntedForest":
        cy = o["mechanics"]["correctExitY"]
        if (W - 1, cy) not in seen:
            errs.append("true exit row does not reach the east edge from the way in")
        for e in o["decals"]["exits"]:
            if (W - 1, e["y"]) not in seen:
                errs.append(f"exit at row {e['y']} unreachable")
        if (g == 14).any():
            errs.append("forest-maze floors carry no save tile (bundle removes it)")
        # perfect-maze check on the cell graph: route to the true exit is unique => no loops
        st["exits"] = len(o["decals"]["exits"])
    else:
        goal = [(a["x"], a["y"]) for a in o["assets"] if a["kind"] in ("stairsDown", "boss")]
        if len(goal) != 1 or not touched(seen, *goal[0]):
            errs.append("stairs/boss unreachable")
    for a in o["assets"]:
        if a["kind"] in ("chest", "save", "sign") and not touched(seen, a["x"], a["y"]):
            errs.append(f"{a['kind']} at {a['x']},{a['y']} unreachable")
    walk = {(x, y) for y in range(H) for x in range(W) if g[y, x] in (0, 6, 9, 25, 17, 5, 15, 19)}
    orphan = walk - seen - {(x, y) for y in range(H) for x in range(W) if opened[y, x] in (15, 19)}
    if orphan:
        errs.append(f"{len(orphan)} orphaned walkable cells")
    if did == "stormNest" and o["floor"] >= 2:
        n19 = int((g == 19).sum())
        st["t19"] = n19; st["keys"] = len(keys)
        if n19 < 2 or not keys:
            errs.append(f"wind gate: {n19} tiles of 19, {len(keys)} key chests")
        s_nokey, _ = reach(g, arr[0], [])
        goal = [(a["x"], a["y"]) for a in o["assets"] if a["kind"] == "stairsDown"][0]
        if touched(s_nokey, *goal):
            errs.append("stairs reachable WITHOUT the windbreaker stone: the gate gates nothing")
    # the renderer must keep every wall the game has (prune would open walls the engine blocks)
    import render_dungeon_material_map as R
    _, pruned = R.prune_thin_walls(o["rows"])
    st["prunedWalls"] = len(pruned)
    if pruned:
        errs.append(f"renderer would prune {len(pruned)} wall cells (art/collision would disagree)")
    st["chests"] = sum(1 for a in o["assets"] if a["kind"] == "chest")
    return errs, st


def author():
    os.makedirs(OUT, exist_ok=True)
    floors = {}
    fl = iron_mine_f1()
    floors["ironMine-f1"] = fl
    g, meta = forest_f1()
    floors["hauntedForest-f1"] = tiles_to_floor("hauntedForest", 1, 5, "haunted forest maze", g, meta)
    for f in (1, 2):
        g, meta = tower_floor(f)
        floors[f"stormNest-f{f}"] = tiles_to_floor("stormNest", f, 5, "storm-battered stone tower", g, meta)
    bad = 0
    for fid, o in floors.items():
        errs, st = check(o)
        o["validation"] = errs or ["ok"]
        if fid == "ironMine-f1":
            st["act1Validate"] = o["act1Validate"]
        json.dump(o, open(os.path.join(OUT, f"{fid}.json"), "w"))
        print(f"{'OK  ' if not errs else 'FAIL'} {fid} {o['width']}x{o['height']} {st}")
        for e in errs:
            print("      -", e)
        bad += bool(errs)
    return bad


if __name__ == "__main__":
    sys.exit(1 if author() else 0)
