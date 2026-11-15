#!/usr/bin/env python3
"""Plans + rendered art -> the runtime files of the authored Acts 2-5 dungeons.

  export_runtime.py emberMines obsidianCavern [--smoke ironMine:1] [--enable id,...] [--fresh] [--check-only]

Writes public/acts-dungeons/:
  manifest.json                 schema qok-dungeons2-v1: `dungeons` (facts, enabled, files, bytes) and
                                `floors` (the Act 1 floor format + land / terrain / mechanic / over)
  <dungeon>/<floor>-material.webp, -walk.png, -over.webp
and, for the probes only, <work>/nav/<floor>.json (a 12 px standable grid + targets).

The manifest is updated in place: dungeons not named on the command line keep their entries
(`--fresh` starts from an empty manifest). `modules` is always rebuilt from
public/acts-dungeons/modules/*.js (sorted, same-origin paths), so a mechanic track only has to add
its file.

Enabled: a dungeon with no mechanic is exported `enabled:true`; a mechanic dungeon is exported
`enabled:false` (smoke only: localStorage['qok-dungeons2-smoke']='1' or ?d2smoke=1) until the
integrator flips it with `--enable id` (or by hand; a flipped entry stays flipped on re-export).
`--smoke id:N[,N]` exports just those floors of a dungeon, always disabled, and reports what a
partial floor set cannot reach as notes instead of failures.

Mechanic reachability: ground that she only reaches THROUGH the mechanic is not a failure when the
dungeon table declares how (d2common `links`: plan characters closed in the mask that the mechanic
carries her across; `pair_links`: asset kinds that teleport between cells of one pair). The areas
on either side of a declared link are joined and reported as "via mechanic".

Every floor is CHECKED against its own mask before it is written (the runtime's sole-point model:
soles 31 px under the sprite centre, 16 px clear of anything painted solid). Exit 1 on failure:
  * every arrival spot (mouth, second mouth, both staircases, crystal warp) is standable;
  * stairs, mouth cells, chests, crystals and the boss are reachable from the arrival spot;
  * no standable pixel lies in a cell the plan calls solid and that touches no walkable cell (a leak);
  * every cell of the plan's route keeps standable ground.
"""
import argparse, hashlib, json, os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage
import d2common as C

FOOT_DY = 31          # hero centre -> soles (dq-tiles.js a1mFootDy: 64 px frame, sole row 62, scale 1.0125)
NEED = 17             # A1M_FOOT 12 + A1M_LEAN 4, +1: stricter than the runtime, never looser
KIND = {"stairsPrev": "stairsUp", "stairsNext": "stairsDown"}
PROPS = {"chest", "save", "boss", "sign"}                      # tile-blocked objects
DIRS = {(0, 1): 0, (-1, 0): 1, (1, 0): 2, (0, -1): 3}          # heroDir: 0 down 1 left 2 right 3 up
NAV = 12
LINK_REACH = 40       # px from a link cell's box to the ground it serves (under one cell, so never through a wall)


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


class Floor:
    def __init__(self, fid):
        self.fid = fid
        self.plan = p = C.load_plan(fid)
        self.W, self.H = p["width"], p["height"]
        self.art = json.load(open(os.path.join(C.ART, f"{fid}.art.json")))
        assert not self.art.get("crop"), f"{fid}: art is a crop render"
        assert self.art["planSha"] == sha(C.plan_path(fid))[:16], f"{fid}: art is older than the plan; re-render"
        m = np.asarray(Image.open(os.path.join(C.ART, f"{fid}-walk.png")).convert("L")) > 127
        assert m.shape == (self.H * C.CELL, self.W * C.CELL), (fid, m.shape)
        self.mask = m
        did = p["dungeonId"]
        cfg = C.DUNGEONS[did]
        opench = C.open_chars(did)
        self.walk = np.array([[c in opench for c in r] for r in p["rows"]], bool)
        self.linkc = np.array([[c in C.link_chars(did) for c in r] for r in p["rows"]], bool)
        self.pairs = {}                                          # (kind, pair id) -> cells
        self.assets, self.mech = [], []
        self.special = {}                                        # cell -> kind (anything that is not plain floor)
        second = p["floor"] > 1
        for a in p["assets"]:
            k = KIND.get(a["kind"], a["kind"])
            if k in cfg.get("pair_links", {}):
                self.pairs.setdefault((k, a.get(cfg["pair_links"][k])), []).append((a["x"], a["y"]))
            if k == "mouth":
                # the first mouth of floor 1 is THE mouth; any other (deeper, sealed, or a second
                # one on the same floor) is a second mouth: tile 10, leaves by the last connection
                kind = "mouth2" if (second or a.get("sealedUntil") or "mouth" in self.special.values()) else "mouth"
                cells, _, d = C.mouth_cells(p, a)
                for i, (x, y) in enumerate(cells):
                    e = dict(a, kind=kind, x=x, y=y)
                    if i:
                        e["extra"] = True
                    self.assets.append(e); self.special[(x, y)] = kind
                    self.walk[y, x] = True
            elif k in ("stairsUp", "stairsDown", "chest", "boss", "save", "sign"):
                self.assets.append(dict(a, kind=k)); self.special[(a["x"], a["y"])] = k
            else:
                self.mech.append(a)                              # a mechanic module's own objects
        prop = np.zeros_like(m)
        for (x, y), k in self.special.items():
            if k in PROPS:
                prop[y * C.CELL:(y + 1) * C.CELL, x * C.CELL:(x + 1) * C.CELL] = True
        dist = ndimage.distance_transform_edt(m)
        self.stand = (dist >= NEED) & ~prop                      # where her SOLES may be
        self.stand[:1, :] = self.stand[-1:, :] = False; self.stand[:, :1] = self.stand[:, -1:] = False
        self.lab, self.ncomp = ndimage.label(self.stand, np.ones((3, 3), bool))
        # declared mechanic links: every area with ground within LINK_REACH px of one connected
        # group of link cells (or of the cells of one asset pair) is one area for the checks
        par = list(range(self.ncomp + 1))

        def find(i):
            while par[i] != i:
                par[i] = par[par[i]]; i = par[i]
            return i
        self.links = []                                          # [(what, [comp ids])]
        groups = []
        if self.linkc.any():
            gl, gn = ndimage.label(self.linkc, np.ones((3, 3), bool))
            for g in range(1, gn + 1):
                ys, xs = np.nonzero(gl == g)
                groups.append((f"'{p['rows'][ys[0]][xs[0]]}' x{len(ys)} at {(int(xs[0]), int(ys[0]))}", list(zip(xs.tolist(), ys.tolist()))))
        for (k, pid), cells in sorted(self.pairs.items(), key=str):
            groups.append((f"{k} {pid}", cells))
        for what, cells in groups:
            comps = set()
            for (x, y) in cells:
                y0, y1 = max(0, y * C.CELL - LINK_REACH), (y + 1) * C.CELL + LINK_REACH
                x0, x1 = max(0, x * C.CELL - LINK_REACH), (x + 1) * C.CELL + LINK_REACH
                comps |= set(np.unique(self.lab[y0:y1, x0:x1]).tolist())
            comps.discard(0)
            comps = sorted(comps)
            for c in comps[1:]:
                par[find(c)] = find(comps[0])
            self.links.append((what, comps))
        self.cls = np.array([find(i) for i in range(self.ncomp + 1)], np.int32)
        self.reach = self.direct = None

    def start_from(self, comp):
        """`direct`: ground she walks to from the arrival spot; `reach`: plus what the declared links add."""
        self.direct = self.lab == comp
        self.reach = (self.cls[self.lab] == self.cls[comp]) & (self.lab > 0)

    # a hero CENTRE at (px,py) stands if her soles do
    def ok(self, px, py):
        sx, sy = int(px), int(py + FOOT_DY)
        return 0 <= sx < self.mask.shape[1] and 0 <= sy < self.mask.shape[0] and bool(self.stand[sy, sx])

    def spot(self, cells, face=None):
        """First cell (in order) whose centre is a legal place to appear: not a trigger or prop
        cell, soles standable. Falls back to nudging up to 20 px inside the cell."""
        for (x, y) in cells:
            if not (0 <= x < self.W and 0 <= y < self.H) or (x, y) in self.special or not self.walk[y, x]:
                continue
            cx, cy = x * C.CELL + C.CELL // 2, y * C.CELL + C.CELL // 2
            for oy in (0, -6, -12, -18, 6, 12):
                for ox in (0, -8, 8, -16, 16):
                    px, py = cx + ox, cy + oy
                    if int(px) // C.CELL == x and int(py) // C.CELL == y and self.ok(px, py):
                        s = {"x": x, "y": y, "dir": face((x, y)) if face else 0}
                        if ox or oy:
                            s["px"], s["py"] = px, py
                        return s
        return None

    def comp_at(self, s):
        px = s.get("px", s["x"] * C.CELL + C.CELL // 2); py = s.get("py", s["y"] * C.CELL + C.CELL // 2)
        return int(self.lab[int(py + FOOT_DY), int(px)])

    def near(self, cell, grow):
        """Is some reachable standable pixel within `grow` px of the cell's box?"""
        x, y = cell
        y0, y1 = max(0, y * C.CELL - grow), min(self.mask.shape[0], (y + 1) * C.CELL + grow)
        x0, x1 = max(0, x * C.CELL - grow), min(self.mask.shape[1], (x + 1) * C.CELL + grow)
        return bool(self.reach[y0:y1, x0:x1].any())

    def enters(self, cell):
        """Can her CENTRE come to lie in this cell (that is what fires stairs and mouths)?"""
        x, y = cell
        y0, y1 = y * C.CELL + FOOT_DY, min(self.mask.shape[0], (y + 1) * C.CELL + FOOT_DY)
        return bool(self.reach[y0:y1, x * C.CELL:(x + 1) * C.CELL].any())


def ring(c, order=((0, 1), (-1, 0), (1, 0), (0, -1), (-1, 1), (1, 1), (-1, -1), (1, -1),
                   (0, 2), (-2, 0), (2, 0), (0, -2), (-1, 2), (1, 2), (-2, 1), (2, 1))):
    return [(c[0] + dx, c[1] + dy) for dx, dy in order]


def away(src):
    def f(c):
        dx, dy = c[0] - src[0], c[1] - src[1]
        if abs(dx) > abs(dy):
            return DIRS[(1 if dx > 0 else -1, 0)]
        return DIRS[(0, 1 if dy > 0 else -1)]
    return f


def build(fid, problems):
    F = Floor(fid); p = F.plan
    land = {}
    first = lambda k: next((a for a in F.assets if a["kind"] == k and not a.get("extra")), None)
    for kind in ("mouth", "mouth2"):
        m = first(kind)
        if not m:
            continue
        dx, dy = C.SIDE.get(m.get("side", "down"), (0, 1))
        inward = [(m["x"] - dx * k, m["y"] - dy * k) for k in (2, 3, 1)]
        s = F.spot(inward + ring((m["x"] - dx * 2, m["y"] - dy * 2)), lambda c: DIRS[(-dx, -dy)])
        if s:
            land[kind] = s
        else:
            problems.append(f"{fid}: no standable landing inside the {kind}")
    up, down = first("stairsUp"), first("stairsDown")
    if up:
        land["fromPrev"] = F.spot(ring((up["x"], up["y"])), away((up["x"], up["y"])))
        if not land["fromPrev"]:
            problems.append(f"{fid}: no standable landing beside the stairs back"); del land["fromPrev"]
    if down:
        land["fromNext"] = F.spot(ring((down["x"], down["y"])), away((down["x"], down["y"])))
        if not land["fromNext"]:
            problems.append(f"{fid}: no standable landing beside the stairs on"); del land["fromNext"]
    saves = [a for a in F.assets if a["kind"] == "save"]
    if p["floor"] == 1:
        s = None
        if saves:
            c = (saves[0]["x"], saves[0]["y"])
            s = F.spot([(c[0], c[1] + 1)] + ring(c), lambda _: 3)
        s = s or land.get("mouth")
        if s:
            land["entrance"] = {"x": s["x"], "y": s["y"]}
    start = land.get("mouth") or land.get("fromPrev") or land.get("mouth2")
    if not start:
        problems.append(f"{fid}: nowhere to arrive"); return None, None
    comp = F.comp_at(start)
    F.start_from(comp)
    for k, s in land.items():
        if k != "entrance" and F.cls[F.comp_at(s)] != F.cls[comp]:
            problems.append(f"{fid}: landing {k} is cut off from the arrival spot")
    warn = []
    for a in F.assets:
        c = (a["x"], a["y"]); k = a["kind"]
        if k in ("stairsUp", "stairsDown", "mouth", "mouth2"):
            if not F.enters(c) and not a.get("extra"):
                problems.append(f"{fid}: {k} at {c} cannot be stepped on")
        elif not F.near(c, 14):
            problems.append(f"{fid}: {k} at {c} cannot be reached")
        if k == "save":                                  # the engine's crystal warp lands one row south of it
            below = (c[0], c[1] + 1)
            if not F.ok(below[0] * C.CELL + 24, below[1] * C.CELL + 24):
                warn.append(f"crystal {c}: the cell south of it is not standable (a warp there is nudged by the rescue)")
    # leaks and lost ground, cell by cell
    cells = np.zeros((F.H, F.W), bool)
    sy, sx = np.nonzero(F.reach)
    cells[sy // C.CELL, sx // C.CELL] = True
    dcells = np.zeros((F.H, F.W), bool)
    sy, sx = np.nonzero(F.direct)
    dcells[sy // C.CELL, sx // C.CELL] = True
    del sy, sx
    touch = ndimage.binary_dilation(F.walk, np.ones((3, 3), bool))
    leak = np.argwhere(cells & ~touch)
    if len(leak):
        problems.append(f"{fid}: {len(leak)} standable cell(s) inside solid ground, e.g. {leak[:4].tolist()}")
    lost = [(int(x), int(y)) for y, x in np.argwhere(F.walk & ~cells)]
    route_lost = [c for c in p.get("route", []) if tuple(c) in set(lost)]
    if route_lost:
        problems.append(f"{fid}: route cells without standable ground: {route_lost[:6]}")
    over = F.art.get("over") or []
    fl = {"width": F.W, "height": F.H, "totalFloors": p["totalFloors"], "title": p["title"],
          "rows": ["".join("." if F.walk[y, x] else "#" for x in range(F.W)) for y in range(F.H)],
          "assets": [{k: v for k, v in a.items() if k not in ("side",) or True} for a in F.assets],
          "land": land, "mechanic": p.get("mechanic") or {"id": "none"}}
    mid = fl["mechanic"].get("id", "none")
    if mid != "none":
        fl["terrain"] = p["rows"]; fl["mech"] = F.mech; fl["zones"] = p.get("zones", [])
    extra = "".join(sorted(C.open_chars(p["dungeonId"]) - C.WALKABLE))
    if extra:
        fl["open"] = extra                                       # plan chars this dungeon's mask opens beyond . = g t z q h
    if F.art.get("seal"):
        fl["seal"] = F.art["seal"]                               # rock plugs of sealed second mouths (<floor>-seal.webp)
    if over:
        fl["over"] = over
    # probe-only navigation grid: 12 px cells, 1 where her soles may stand (main component only)
    g = F.reach
    hh, ww = g.shape[0] // NAV, g.shape[1] // NAV
    nav = g[:hh * NAV, :ww * NAV].reshape(hh, NAV, ww, NAV)[:, NAV // 2, :, NAV // 2]
    navj = {"cell": NAV, "footDy": FOOT_DY, "rows": ["".join("1" if v else "0" for v in r) for r in nav],
            "route": p.get("route", []), "assets": F.assets, "land": land, "lost": lost}
    used = [(w, c) for w, c in F.links if len(c) > 1 and F.cls[c[0]] == F.cls[comp]]
    idle = [w for w, c in F.links if len(c) < 2]
    stats = {"walkable": int(F.walk.sum()), "standableCells": int(cells.sum()), "lost": len(lost), "warn": warn,
             "components": int(F.ncomp), "viaMechanic": int((cells & ~dcells).sum()),
             "links": [w for w, _ in used], "idleLinks": idle}
    return (fl, navj), stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dungeons", nargs="*")
    ap.add_argument("--smoke", action="append", default=[])
    ap.add_argument("--enable", default="", help="comma list: export these mechanic dungeons enabled")
    ap.add_argument("--fresh", action="store_true", help="forget manifest entries of dungeons not named")
    ap.add_argument("--check-only", action="store_true")
    a = ap.parse_args()
    jobs = [(d, C.floors_of(d), True) for d in a.dungeons]
    for s in a.smoke:
        did, fl = s.split(":")
        jobs.append((did, [f"{did}-f{n}" for n in fl.split(",")], False))
    man_p = os.path.join(C.PUBLIC, "manifest.json")
    man = {"schema": "qok-dungeons2-v1", "cellPx": C.CELL, "modules": [], "dungeons": {}, "floors": {}}
    old = {}
    if os.path.exists(man_p):
        old = json.load(open(man_p))
        assert old.get("schema") == man["schema"], "manifest.json has another schema"
    named = {j[0] for j in jobs}
    if not a.fresh:                                             # everything not named keeps its entry
        for did, d in old.get("dungeons", {}).items():
            if did not in named:
                man["dungeons"][did] = d
                man["floors"].update({k: v for k, v in old.get("floors", {}).items() if k.rsplit("-f", 1)[0] == did})
    md = os.path.join(C.PUBLIC, "modules")
    man["modules"] = sorted(f"acts-dungeons/modules/{f}" for f in os.listdir(md) if f.endswith(".js")) if os.path.isdir(md) else []
    force_on = {x for x in a.enable.split(",") if x}
    problems, notes, report = [], [], []
    os.makedirs(os.path.join(C.WORK, "nav"), exist_ok=True)
    for did, fids, full in jobs:
        p1 = C.load_plan(f"{did}-f1")
        mech = (p1.get("mechanic") or {}).get("id", "none")
        was = old.get("dungeons", {}).get(did, {})
        was_on = bool(was.get("enabled")) and len(was.get("authoredFloors", [])) == p1["totalFloors"]
        enabled = full and (mech == "none" or did in force_on or was_on)
        boss = None
        for n in range(1, p1["totalFloors"] + 1):
            for x in C.load_plan(f"{did}-f{n}")["assets"]:
                if x["kind"] == "boss":
                    boss = x.get("id")
        files, total = {}, 0
        for fid in fids:
            # a floor that ships disabled and waits for its mechanic may be unfinishable on foot: notes, not failures
            res, st = build(fid, problems if (full or mech == "none") else notes)
            if not res:
                continue
            fl, nav = res
            man["floors"][fid] = fl
            json.dump(nav, open(os.path.join(C.WORK, "nav", f"{fid}.json"), "w"))
            for suf in ("-material.webp", "-walk.png", "-over.webp"):
                src = os.path.join(C.ART, fid + suf)
                if not os.path.exists(src):
                    continue
                files[fid + suf] = os.path.getsize(src); total += files[fid + suf]
                if not a.check_only:
                    od = os.path.join(C.PUBLIC, did); os.makedirs(od, exist_ok=True)
                    shutil.copyfile(src, os.path.join(od, fid + suf))
            for suf in ("-seal.webp",):
                src = os.path.join(C.ART, fid + suf)
                if os.path.exists(src) and res[0].get("seal"):
                    files[fid + suf] = os.path.getsize(src); total += files[fid + suf]
                    if not a.check_only:
                        shutil.copyfile(src, os.path.join(C.PUBLIC, did, fid + suf))
            report.append((fid, st, sum(v for k, v in files.items() if k.startswith(fid + "-"))))
        man["dungeons"][did] = {"act": C.DUNGEONS[did]["act"], "name": p1["name"], "floors": p1["totalFloors"],
                                "authoredFloors": [int(f.rsplit("-f", 1)[1]) for f in fids], "bossId": boss,
                                "mechanic": mech, "enabled": enabled,
                                "bytes": total, "files": files}
        if not a.check_only:                                    # drop files of floors no longer exported
            od = os.path.join(C.PUBLIC, did)
            for f in os.listdir(od) if os.path.isdir(od) else []:
                if f not in files:
                    os.remove(os.path.join(od, f))
    for fid, st, by in report:
        print(f"{fid:22} {by / 1e6:5.2f} MB  walkable {st['walkable']:4}  standable cells {st['standableCells']:4}  "
              f"lost {st['lost']:3}  comps {st['components']:3}"
              + (f"  via mechanic {st['viaMechanic']} cells by {len(st['links'])} link(s)" if st["links"] else "")
              + ("  WARN " + "; ".join(st["warn"]) if st["warn"] else ""))
        for w in st["links"]:
            print(f"      declared link used: {w}")
        for w in st["idleLinks"]:
            print(f"      declared link joins nothing: {w}")
    print(f"modules: {man['modules']}")
    for did, d in man["dungeons"].items():
        print(("" if did in named else "(kept) ") + f"{did}: {d['bytes'] / 1e6:.2f} MB, floors {d['authoredFloors']} of {d['floors']}, boss {d['bossId']}, "
              f"mechanic {d['mechanic']}, enabled {d['enabled']}")
    if notes:
        print("NOTE (smoke floors of a mechanic dungeon; a partial floor set may be unfinishable)"); [print("  " + x) for x in notes]
    if problems:
        print("FAIL"); [print("  " + x) for x in problems]; sys.exit(1)
    if not a.check_only:
        os.makedirs(C.PUBLIC, exist_ok=True)
        json.dump(man, open(man_p, "w"), separators=(",", ":"))
        print(f"wrote {man_p} ({os.path.getsize(man_p) / 1e3:.0f} KB, {sum(d['bytes'] for d in man['dungeons'].values()) / 1e6:.1f} MB of art in {len(man['floors'])} floors)")
    print("PASS")


if __name__ == "__main__":
    main()
