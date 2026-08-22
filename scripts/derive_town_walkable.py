#!/usr/bin/env python3
"""Derive Port Sapphire's walkable geometry FROM the painting, the way the overworld does it.

The rule this obeys
-------------------
Towns are art-first. `design/LANDMARK-SPRITE-CONTRACT.md` and the Act 1 handoff both lock it:
the painting is authored first and the collision geometry is DERIVED from it. A grid is never an
input. The first Port Sapphire pass generated a semantic grid and painted into it, and the owner
scrapped it outright.

So this reads the finished town screen and emits polygons in the same schema the overworld uses,
`act1-art-fit-polygon-authority-v2` (`public/act1-hifi/walkable-regions-v1.json`), which is
validated by `public/act1-hifi/walkable-polygons.js` -- the file named as
`designLocks.collisionOwner = "r26-polygon-authority"`.

What counts as walkable, and why it is the paving alone
------------------------------------------------------
The v5 brief demanded "lanes are 3-4 cells of open, uncluttered ground" and "ground clutter
belongs against walls, never in the middle of a lane or square". The painting delivered that, so
the pale stone paving IS the walkable network -- square, lanes, quay, and the three edge trails,
all one connected surface. Taking paving alone is conservative and needs no guess about whether a
given fenced garden is enterable.

Two consequences worth stating rather than discovering later:

  * **Grass is excluded.** The cottage gardens are fenced and read as private ground. If the
    owner wants them walkable they become additional regions, not a change to this rule.
  * **The moored trader's deck is excluded by CONNECTIVITY, not by colour.** Its pale planks
    classify as paving exactly like the quay does -- that already fooled a naive check during NPC
    placement. Keeping only the largest connected component drops it, because the gunwale and the
    water separate it from the quay. Standing on the captain's own deck was never intended.

Everything is measured at world-pixel scale (the schema's units), derived from the art scale
rather than hardcoded: 65 cells over 1885 art px is 29 art px/cell, against 16 world px/cell.

Usage:
    derive_town_walkable.py [--screen ...] [--out ...] [--proof ...] [--epsilon 2.5]
"""
from __future__ import annotations

import argparse
import json
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEMIDX = os.path.join(ROOT, "design/continent-terrain-class-method/owner-terrain/"
                            "owner-semantic-index.json")


def paving_mask(art: np.ndarray) -> np.ndarray:
    """Pale, low-saturation stone: bright, red and green close together, blue present but not
    dominant. Blue-dominant excludes the sea; the red/green spread excludes grass, which runs
    clearly green, and terracotta, which runs clearly warm."""
    r, g, b = art[..., 0], art[..., 1], art[..., 2]
    return (r > 95) & (np.abs(r - g) < 42) & (b > r * 0.5) & (b < r * 1.25)


def _shift_and(mask, dy, dx):
    out = np.zeros_like(mask)
    h, w = mask.shape
    ys, ye = max(0, dy), min(h, h + dy)
    xs, xe = max(0, dx), min(w, w + dx)
    out[ys:ye, xs:xe] = mask[ys - dy:ye - dy, xs - dx:xe - dx]
    return out


def erode(mask, r=1):
    out = mask.copy()
    for _ in range(r):
        acc = out.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc &= _shift_and(out, dy, dx)
        out = acc
    return out


def dilate(mask, r=1):
    out = mask.copy()
    for _ in range(r):
        acc = out.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc |= _shift_and(out, dy, dx)
        out = acc
    return out


def components(mask):
    """4-connected labelling. Written out rather than imported because this repo has no scipy."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    cur = 0
    for sy in range(h):
        row = mask[sy]
        for sx in range(w):
            if not row[sx] or lab[sy, sx]:
                continue
            cur += 1
            q = deque([(sy, sx)])
            lab[sy, sx] = cur
            while q:
                y, x = q.popleft()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = cur
                        q.append((ny, nx))
    return lab, cur


def trace(mask, start):
    """Moore-neighbour boundary trace, clockwise, returning lattice corner points.

    Walking pixel CENTRES produces a ring that touches itself at 1px necks and then fails the
    authority's self-intersection check. Walking the pixel-corner lattice cannot, so that is what
    this returns."""
    h, w = mask.shape
    nbrs = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]

    def solid(y, x):
        return 0 <= y < h and 0 <= x < w and mask[y, x]

    ring = []
    y, x = start
    d = 0
    first = None
    for _ in range(8 * mask.sum() + 16):
        ring.append((y, x))
        found = False
        for k in range(8):
            nd = (d + 6 + k) % 8          # start looking from "left of where we came"
            dy, dx = nbrs[nd]
            if solid(y + dy, x + dx):
                y, x, d = y + dy, x + dx, nd
                found = True
                break
        if not found:
            break
        if first is None:
            first = (ring[0], (y, x))
        elif (ring[0], (y, x)) == first and len(ring) > 2:
            break
    return ring


def rdp(points, eps):
    """Ramer-Douglas-Peucker. The authority's own note is that curves are 'fitted once to visible
    walkable ground' and the mask is evidence only -- so the output is a simplified curve, not a
    per-pixel staircase."""
    if len(points) < 3:
        return list(points)
    a, b = np.array(points[0], float), np.array(points[-1], float)
    ab = b - a
    n = np.hypot(*ab)
    pts = np.array(points, float)
    if n < 1e-9:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(np.cross(np.tile(ab, (len(pts), 1)), pts - a)) / n
    i = int(d.argmax())
    if d[i] > eps:
        return rdp(points[:i + 1], eps)[:-1] + rdp(points[i:], eps)
    return [points[0], points[-1]]


def dedupe(ring):
    """RDP joins its two halves at a shared vertex, and the trace can revisit a lattice corner at
    a 1-sample neck, so a raw ring carries repeats. The authority rejects them outright
    ("outer repeats a vertex"), which is the right call -- a repeated vertex is a degenerate edge.
    Also drops collinear midpoints, which are pure vertex count with no shape."""
    out = []
    for pt in ring:
        if not out or pt != out[-1]:
            out.append(pt)
    while len(out) > 1 and out[0] == out[-1]:
        out.pop()
    seen, uniq = set(), []
    for pt in out:                      # a lattice corner may recur non-adjacently at a neck
        if pt in seen:
            continue
        seen.add(pt)
        uniq.append(pt)
    slim = []
    for i, pt in enumerate(uniq):
        a, b = uniq[i - 1], uniq[(i + 1) % len(uniq)]
        cross = (pt[0] - a[0]) * (b[1] - a[1]) - (pt[1] - a[1]) * (b[0] - a[0])
        if abs(cross) > 1e-9:
            slim.append(pt)
    return slim if len(slim) >= 3 else uniq


def self_intersects(ring):
    """The authority rejects a self-intersecting ring, and RDP will produce one: simplifying a
    600-point boundary pulls a chord across a thin neck between two lanes. Cheaper to detect and
    back off the tolerance than to hand-tune epsilon per town."""
    n = len(ring)
    if n < 4:
        return False
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    def hit(p1, p2, p3, p4):
        d1, d2 = cross(p3, p4, p1), cross(p3, p4, p2)
        d3, d4 = cross(p1, p2, p3), cross(p1, p2, p4)
        return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))
    for i in range(n):
        a1, a2 = ring[i], ring[(i+1) % n]
        for j in range(i+2, n):
            if i == 0 and j == n-1:
                continue
            if hit(a1, a2, ring[j], ring[(j+1) % n]):
                return True
    return False


def simplify(points, eps):
    """RDP, backing the tolerance off until the ring is simple. Never gives up on validity."""
    while eps > 0.05:
        ring = dedupe(rdp(points, eps))
        if len(ring) >= 3 and not self_intersects(ring):
            return ring, eps
        eps /= 2.0
    return dedupe(points), 0.0


def ring_area(ring):
    p = np.array(ring, float)
    return 0.5 * float(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1]))


def stamp_exemptions(body, authored_path, s):
    """Punch each authored OVERHEAD exemption directly into the already-SELECTED body mask, in
    mask-sample space, before holes are traced from it.

    This exists because the exemption merge lower in this file only ever drops a matching
    STATIC OBSTACLE (derived or authored) by centroid -- it has never touched `regions[].holes`.
    The demijohn sits inside `hole` #2 (a large enclosed background pocket, most likely the
    warehouse this quay backs onto), not in `staticObstacles`, so that merge silently did
    nothing for it: the owner reported "blocked at the bottle itself" with a passed collision
    check, because the check only ever looked at obstacles.

    Run this AFTER `body` is fixed to the single selected/opened component (never before) so it
    can only ever ADD area to a shape whose identity is already locked in -- it cannot bridge two
    otherwise-disconnected components (e.g. reconnect the moored ship's excluded deck to the
    quay), because which raw component was "largest" was already decided upstream. A circle that
    does not touch `body` at all (true today of the mast, which lands entirely outside the outer
    ring already, over the ship's own deck) has zero effect: it cannot be reached by the single
    boundary trace and is not part of `bg` either, so nothing changes -- safe by construction.

    Also stamp the AUTHORED anti-obstacle bands (the inverse case: art the derivation wrongly
    reads as paving, such as a sunlit roof-ridge cap) as NOT walkable, by clearing the mask
    instead of setting it, using the same authored file so both directions share one source."""
    if not os.path.exists(authored_path):
        return body, []
    spec = json.load(open(authored_path))
    h, w = body.shape
    yy, xx = np.mgrid[0:h, 0:w]
    hit_ids = []
    for e in spec.get("exemptions", []):
        cx, cy = e["centerArt"][0] / s, e["centerArt"][1] / s
        r = e["radiusArt"] / s
        disk = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
        if disk.any():
            hit_ids.append(e["id"])
        body = body | disk
    return body, hit_ids


def stamp_roof_bands(mask, authored_path, s, art_to_world):
    """Clear AUTHORED roof/ridge bands from the walkable mask before the surface is even traced.

    The paving classifier cannot tell a sunlit ridge-cap tile from sunlit cobble by colour --
    they measure the same, the same way the well's rim does -- so a band the player is not meant
    to stand on (a roof) can pass the same per-pixel and local-density tests real paving does.
    Colour cannot fix this any more than it could fix the well; the band is authored against the
    painting instead, exactly like the well's radius is."""
    if not os.path.exists(authored_path):
        return mask
    spec = json.load(open(authored_path))
    h, w = mask.shape
    yy, xx = np.mgrid[0:h, 0:w]
    for band in spec.get("nonWalkableBands", []):
        x0, y0, x1, y1 = [v / s for v in band["bboxArt"]]
        clear = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
        mask = mask & ~clear
    return mask


def main() -> None:
    ap = argparse.ArgumentParser()
    # THE DEFAULT MUST BE THE SHIPPED PAINTING, because portSapphire-authored-obstacles.json is
    # measured in that painting's own pixels and says so in its `artSpace` block. It moved from the
    # 1885 v5 painting to the 1950 tiled rebake on 2026-08-18; pointing this at the old image while
    # the authored file holds 1950 coordinates would misplace every authored circle by ~3.4%.
    #
    # RE-RUNNING THIS AGAINST THE REBAKE IS NOT YET SAFE, MEASURED 2026-08-18. The output is a
    # WORSE network than the one shipped: walkable ground 14.07% -> 10.89% of the frame, IoU 0.729
    # against the shipped region with 25.19% of previously-walkable area lost, and
    # check_town_finish.py's LAYOUT band moving the wrong way (55.7% -> 63.5% paved-but-not-walkable
    # against a 55% ceiling). The rebake draws its cobble differently from the painting paving_mask
    # was tuned on, so the CLASSIFIER has to be retuned before the authority is rebuilt from the new
    # art. Until that is done the shipped portSapphire-walkable.json stands and this script is a
    # measuring instrument, not a build step.
    ap.add_argument("--screen", default=os.path.join(
        ROOT, "public/act1-hifi/town/portSapphire-screen.png"))
    ap.add_argument("--cells", type=int, default=65)
    ap.add_argument("--sample", type=int, default=4,
                    help="art px per mask sample; 4 keeps the mask ~471px and the trace fast")
    ap.add_argument("--epsilon", type=float, default=2.5,
                    help="RDP tolerance in MASK samples")
    ap.add_argument("--density-window", type=int, default=3,
                    help="half-width, in mask samples, of the local paving-fraction window "
                         "(3 = 7x7 samples = 28 art px, about one cell)")
    ap.add_argument("--density-min", type=float, default=0.70,
                    help="minimum local paving fraction to count as walkable ground. Open cobble "
                         "measures 83-100%%; the well rim, crate stacks and nets never exceed "
                         "about half. 0 disables.")
    ap.add_argument("--prop-open", type=int, default=2,
                    help="morphological opening, in mask samples, that removes the paving-coloured "
                         "lit tops of props (well rim, barrel lids). 2 = 8 art px.")
    ap.add_argument("--leak-close", type=int, default=3,
                    help="samples to close the leak audit by, merging a prop's fragmented arcs "
                         "into one body before it is traced (3 = 12 art px)")
    ap.add_argument("--min-obstacle", type=int, default=4,
                    help="smallest leak blob promoted to a staticObstacle, in mask samples. 4 is "
                         "~8x8 art px: above cobble-grout noise, below a barrel.")
    ap.add_argument("--min-hole", type=int, default=8,
                    help="drop enclosed holes smaller than this many mask samples. 8, not 40: at "
                         "4 art px/sample a quayside barrel is ~24 samples and a crate ~30, so 40 "
                         "made every loose prop walkable -- which is what the owner flagged.")
    ap.add_argument("--water-clearance", type=float, default=0.6,
                    help="cells removed back from the waterline. 0.6: enough to delete the sea-wall "
                         "parapet, the rock revetment and the breakwater arm, while leaving the "
                         "3-4 cell quay usable. At 1.0 the quay lost its depth. Deletes the "
                         "sea-wall parapet, the rock revetment and the breakwater arm, none of "
                         "which colour can distinguish from paving.")
    ap.add_argument("--wall-clearance", type=float, default=0.0,
                    help="extra pull-back from non-floor edges. DEFAULT 0: the runtime already applies "
                         "actorFootRadius, and pre-eroding here also deletes the prop obstacles "
                         "by disconnecting their pockets from the hole set (78 -> 2).")
    ap.add_argument("--out", default=os.path.join(
        ROOT, "public/act1-hifi/portSapphire-walkable-v1.json"))
    # --authored DEFAULTED TO PORT SAPPHIRE'S FILE FOR EVERY TOWN, which is a silent
    # cross-contamination bug the moment a second town is derived: running this for millbrook
    # without remembering the flag would merge PORT SAPPHIRE's well and roof-chimney circles into
    # MILLBROOK's collision, at Port Sapphire's coordinates, and nothing would say so -- the file
    # exists, so the "no authored file, skipping" branch never fires. The default is now derived
    # from the screen's own filename, and a town with no such file simply has none.
    ap.add_argument("--authored", default=None,
                    help="authored obstacles for THIS town; defaults to "
                         "design/act1-towns/<town>-authored-obstacles.json, inferred from --screen")
    ap.add_argument("--proof", default=os.path.join(
        ROOT, "design/act1-towns/portSapphire-walkable-proof.png"))
    args = ap.parse_args()

    if args.authored is None:
        stem = os.path.basename(args.screen).replace("-screen.png", "").replace(".png", "")
        args.authored = os.path.join(ROOT, f"design/act1-towns/{stem}-authored-obstacles.json")
    print(f"authored obstacles: {os.path.relpath(args.authored, ROOT)}"
          f"{'' if os.path.exists(args.authored) else '  (absent -- none merged)'}")

    img = Image.open(args.screen).convert("RGB")
    art = np.asarray(img).astype(np.float32)
    art_px_per_cell = img.width / args.cells
    # SEMIDX IS GITIGNORED AND IS NOT IN EVERY WORKTREE, so reading it unconditionally made this
    # script uncallable rather than merely unconfigured: `design/continent-terrain-class-method/
    # owner-terrain/*` is ignored at .gitignore:83, so a fresh clone or worktree has no copy and
    # every invocation died on FileNotFoundError before doing any work. Measured 2026-08-22, which
    # is when stage 3 needed it. The one value read from it is Act 1's world px per cell, and that
    # is not a free parameter: 16 is what every town manifest carries (`worldPxPerCell`) and what
    # this file's own docstring states, so the fallback restates a constant rather than guessing.
    world_px_per_cell = (json.load(open(SEMIDX))["act1"]["pxPerCell"]
                         if os.path.exists(SEMIDX) else 16)
    world_w = args.cells * world_px_per_cell
    art_to_world = world_px_per_cell / art_px_per_cell
    s = args.sample
    px_per_cell = art_px_per_cell / s          # mask samples per world cell
    mask = paving_mask(art)[::s, ::s]

    # Close the cobble grout ONLY. The first pass closed at radius 2, which is ~16 art px, and
    # that swallowed exactly the props this has to keep -- a barrel is ~22 art px across.
    mask = erode(dilate(mask, 1), 1)

    # ---- the waterline rim is not floor -------------------------------------------------------
    # Measured, and this is why colour cannot do it: the rock revetment reads L62, the sea-wall
    # parapet L63, the breakwater arm L42, against cobble at L154-160 in sun and L46 in shadow.
    # Paving and not-paving overlap completely in luminance, saturation and texture, so any
    # threshold that keeps the shaded quay also keeps the rocks.
    #
    # What separates them is not colour but POSITION: the parapet, the revetment and the mole are
    # all the rim where land meets sea. Pushing the walkable surface back from the water by a
    # clearance removes the whole rim at once, and deletes the breakwater arm outright because a
    # thin finger cannot survive the erosion. The quay is 3-4 cells deep, so it keeps 2-3.
    r, g, b = art[..., 0], art[..., 1], art[..., 2]
    water = ((b > r * 1.3) & (b > g * 1.15) & (b > 55))[::s, ::s]
    water = dilate(erode(water, 1), 1)
    clearance = max(1, int(round(args.water_clearance * px_per_cell)))
    mask &= ~dilate(water, clearance)

    # ---- walkable ground is LOCALLY DENSE paving, not any paving pixel ------------------------
    # Measured radially out from the well's centre, paving coverage runs
    #   r=0: 0%   r=9: 33%   r=18: 17%   r=27: 36%   r=33: 49%   r=42: 83%
    # -- no clean shadow ring anywhere. The well's rim is a SPECKLE of paving-coloured stone and
    # dark mortar, roughly 30-50% either way, which every per-pixel rule admits and every
    # morphological close then bridges into the surrounding cobble. That is why the well kept
    # coming back as a walkable ring around a small angular hole.
    #
    # Open cobble is 83-100% paving over any window; a prop, a rim, a net, a stack of crates is
    # never more than about half. So threshold the local FRACTION instead of the pixel: it
    # removes speckled prop bodies whole, and it needs no per-prop special case.
    if args.density_min > 0:
        k = args.density_window
        f = mask.astype(np.float32)
        pad = np.pad(f, k, mode="edge")
        acc = np.zeros_like(f)
        for dy in range(-k, k + 1):
            for dx in range(-k, k + 1):
                acc += pad[k + dy:k + dy + f.shape[0], k + dx:k + dx + f.shape[1]]
        mask = (acc / float((2 * k + 1) ** 2)) >= args.density_min

    # ---- a prop's own lit top is paving-coloured; open it away --------------------------------
    # The well's stone RIM and the barrels' sunlit LIDS classify as paving exactly like the ground
    # does, so the earlier passes blocked only each prop's dark interior and left a walkable ring
    # around it -- the owner could stand on the well. Each of those lit tops is an ISLAND of
    # paving cut off from the real ground by the prop's own shadow, so a morphological opening
    # deletes them while leaving the ground untouched: lanes are 3-4 cells and an opening at
    # `--prop-open` samples only removes paving thinner than twice that (16 art px at r=2, about
    # half a cell).
    if args.prop_open > 0:
        mask = dilate(erode(mask, args.prop_open), args.prop_open)

    # ---- NO pre-erosion for the actor's foot, deliberately ------------------------------------
    # An earlier pass eroded the surface by a foot radius before tracing. That was wrong twice
    # over. The schema already carries `actorFootRadius` and its collision rule is "actor center
    # must remain inside at least one walkable polygon WITH ACTOR-FOOT CLEARANCE", so the runtime
    # applies it -- pre-eroding charges it a second time.
    #
    # Worse, it silently destroyed the prop obstacles. Eroding the surface widens the background,
    # which reconnects every little pocket around a barrel or a crate to the outside; those
    # pockets then stop being ENCLOSED and vanish from the hole set. Measured: 78 prop-sized
    # pockets before the erosion, 2 after. That is precisely the "places that should not be
    # walkable are walkable" the owner flagged.
    if args.wall_clearance > 0:
        mask = dilate(erode(mask, max(1, int(round(args.wall_clearance * px_per_cell)))), 0)

    # ---- authored roof/ridge bands: clear BEFORE tracing, not after ---------------------------
    # Same reasoning as the exemptions stamped into `body` below, run in the opposite direction
    # and at the opposite time: this is subtractive (roof art the classifier wrongly reads as
    # paving), and it has to happen before component selection so a wrongly-attached roof patch
    # cannot pull in whatever it touches as part of the "largest component" choice.
    mask = stamp_roof_bands(mask, args.authored, s, art_to_world)

    lab, n = components(mask)
    if n == 0:
        raise SystemExit("no walkable surface found -- has the paving classifier drifted?")
    sizes = [(int((lab == i).sum()), i) for i in range(1, n + 1)]
    sizes.sort(reverse=True)
    main_size, main_id = sizes[0]
    body = lab == main_id
    # Open by one sample before tracing. A boundary walk cannot return a SIMPLE ring through a
    # one-sample neck or a diagonal touch -- it revisits the same lattice corner and the ring
    # crosses itself, which the authority rejects and which no RDP tolerance can undo (it fails
    # even at epsilon 0). Opening deletes exactly those necks and nothing the player could have
    # used: a one-sample passage is 4 art px, a quarter of the actor's own foot.
    body = dilate(erode(body, 1), 1) & (lab == main_id)
    lab2, n2 = components(body)
    if n2 > 1:
        keep = max(range(1, n2 + 1), key=lambda i: int((lab2 == i).sum()))
        body = lab2 == keep

    # ---- authored OVERHEAD exemptions: stamped into the SELECTED body, not into staticObstacles
    # See stamp_exemptions()'s docstring. This is what actually fixes "blocked at the demijohn
    # itself" -- the exemption merge far below only ever dropped a matching staticObstacle, and
    # the demijohn's blocker was never one; it was hole #2, an enclosed background pocket.
    body, exemption_hits = stamp_exemptions(body, args.authored, s)
    if os.path.exists(args.authored):
        spec = json.load(open(args.authored))
        want = {e["id"] for e in spec.get("exemptions", [])}
        missed = want - set(exemption_hits)
        if missed:
            print(f"  NOTE: exemption(s) {sorted(missed)} touched no body pixel -- they land "
                  f"entirely outside the derived surface (e.g. over the ship's own excluded "
                  f"deck), so stamping them was a no-op, same as before this fix")

    dropped = [sz for sz, _ in sizes[1:] if sz > args.min_hole]
    print(f"screen {img.size}  mask {mask.shape[1]}x{mask.shape[0]} @ {s} art px/sample")
    print(f"paving components {n}; keeping the largest ({main_size} samples, "
          f"{100*main_size/mask.size:.1f}% of frame)")
    print(f"  dropped {len(sizes)-1} disconnected patches "
          f"(largest few: {dropped[:5]}) -- the ship's deck is among these by design")

    ys, xs = np.where(body)
    start = (int(ys.min()), int(xs[ys == ys.min()].min()))
    outer_px = trace(body, start)
    outer, eps_used = simplify([(x, y) for y, x in outer_px], args.epsilon)
    if eps_used != args.epsilon:
        print(f'  outer ring needed epsilon {eps_used} (from {args.epsilon}) to stay simple')

    # holes = background pockets fully enclosed by the body (buildings, the well, planted beds)
    bg = ~body
    blab, bn = components(bg)
    border = set(np.unique(np.concatenate([blab[0], blab[-1], blab[:, 0], blab[:, -1]])))
    holes = []
    for i in range(1, bn + 1):
        if i in border:
            continue
        m = blab == i
        if int(m.sum()) < args.min_hole:
            continue
        hy, hx = np.where(m)
        hstart = (int(hy.min()), int(hx[hy == hy.min()].min()))
        ring, _ = simplify([(x, y) for y, x in trace(m, hstart)], args.epsilon)
        if len(ring) >= 3 and abs(ring_area(ring)) > 1.0:
            holes.append(ring)
    print(f"enclosed holes kept: {len(holes)} (>= {args.min_hole} samples)")

    # ---- measure this script's OWN error, and encode it ---------------------------------------
    # An enclosed pocket becomes a hole, but a barrel sitting AGAINST a wall or at the quay edge
    # has its pocket open to the exterior, so it is never enclosed -- the outer ring is supposed
    # to indent around it, and RDP then smooths the indent away. Both the well rim and a barrel by
    # the port survived that way, which is what the owner spotted.
    #
    # Rather than chase it with a smaller epsilon (which costs vertices and reintroduces
    # self-intersection), rasterise the finished polygon and difference it against the paving.
    # Whatever the polygon claims is walkable but the painting says is not, IS an obstacle, and
    # the schema has `staticObstacles` for exactly this. The derivation therefore checks itself.
    def rasterize(outer_ring, hole_rings):
        im = Image.new("1", (mask.shape[1], mask.shape[0]), 0)
        dr = ImageDraw.Draw(im)
        dr.polygon([tuple(p) for p in outer_ring], fill=1)
        for h in hole_rings:
            dr.polygon([tuple(p) for p in h], fill=0)
        return np.asarray(im).astype(bool)

    leak = rasterize(outer, holes) & ~mask

    # A prop does not leak as one blob. The well leaks as a broken ANNULUS -- its rim is a
    # speckle of paving-coloured stone and dark mortar, so the audit sees a scatter of arcs and
    # emits a scatter of little obstacles, leaving the gaps between them walkable. That is why
    # the well kept reading as a ring you could stand on with a patch in the middle.
    #
    # Closing the leak merges each prop's fragments into one body, and filling the result's
    # enclosed pockets turns an annulus into a disc -- so the obstacle covers the whole well
    # rather than its darkest arcs. Tightening the density threshold instead was measured and
    # rejected: it buys well coverage by eroding open square, which is the wrong trade.
    leak = erode(dilate(leak, args.leak_close), args.leak_close)
    hlab, hn = components(~leak)
    edge_ids = set(np.unique(np.concatenate([hlab[0], hlab[-1], hlab[:, 0], hlab[:, -1]])))
    for i in range(1, hn + 1):
        if i not in edge_ids:
            leak |= (hlab == i)

    llab, ln = components(leak)
    obstacles = []
    for i in range(1, ln + 1):
        blob = llab == i
        n_s = int(blob.sum())
        if n_s < args.min_obstacle:
            continue
        by, bx = np.where(blob)
        ring, _ = simplify([(x, y) for y, x in trace(blob, (int(by.min()),
                                                           int(bx[by == by.min()].min())))],
                           args.epsilon)
        # A blob a few samples across can trace to a degenerate ring that no tolerance makes
        # simple. Its bounding box is always simple and, for a barrel or a crate, is the right
        # shape anyway -- so fall back rather than drop the obstacle and let the prop stay
        # walkable, which is the failure this whole pass exists to remove.
        if len(ring) < 3 or abs(ring_area(ring)) < 1.0 or self_intersects(ring):
            x0, x1 = int(bx.min()), int(bx.max()) + 1
            y0, y1 = int(by.min()), int(by.max()) + 1
            ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        if ring_area(ring) < 0:
            ring = ring[::-1]
        obstacles.append({"id": f"prop-{len(obstacles):03d}", "kind": "town-prop",
                          "polygon": ring, "samples": n_s})
    print(f"leak audit: {int(leak.sum())} samples the polygon wrongly claimed; "
          f"{len(obstacles)} encoded as staticObstacles (>= {args.min_obstacle} samples)")

    def to_world(ring):
        return [{"x": round(x * s * art_to_world, 1), "y": round(y * s * art_to_world, 1)}
                for x, y in ring]

    # the authority requires outer rings counter-clockwise and holes the other way
    if ring_area(outer) < 0:
        outer = outer[::-1]
    holes = [h if ring_area(h) > 0 else h[::-1] for h in holes]

    data = {
        "schema": "act1-art-fit-polygon-authority-v2",
        "revision": 1,
        "status": "derived-from-painting-owner-review-pending",
        "authority": ("Derived from design/act1-towns/portSapphire-screen-v5-graded.png by "
                      "scripts/derive_town_walkable.py. The painting is the source; this geometry "
                      "is fitted to its visible paving. A grid was never an input."),
        "coordinateSpace": {
            "id": "portSapphire-town-art", "width": world_w, "height": world_w,
            "units": "world-pixels", "origin": "top-left",
            "xPositive": "right", "yPositive": "down",
        },
        "width": world_w, "height": world_w,
        "actorFootRadius": 4, "maxSubstep": 2,
        # 260, not 52: matches public/dq-tiles.js A1M_SPEED, the dungeon's owner-validated
        # continuous-movement pace. All three Act 1 hi-fi surfaces share cameraWorldWidth=208 and
        # heroWorldHeight=36 (manifest.json designLocks), so world-px/second is directly
        # comparable across them. 52 was an untuned placeholder; the owner reported town movement
        # as "much slower, which feels weird" against the overworld/dungeon (2026-08-13/14).
        "movement": {"movementSpeed": 260,
                     "collisionRule": ("actor center must remain inside at least one walkable "
                                       "polygon with actor-foot clearance")},
        "designDecisions": {
            "geometrySource": "paving of the v5 town painting, largest connected component",
            "grassRule": ("cottage gardens are fenced and excluded; make them regions if the "
                          "owner wants them enterable"),
            "shipDeckRule": ("the moored trader's planks classify as paving and are excluded by "
                             "CONNECTIVITY, not colour -- they are a separate component"),
            "curveRule": f"Ramer-Douglas-Peucker at {args.epsilon} mask samples",
        },
        "regions": [{"id": "port-sapphire-streets", "component": "port-sapphire",
                     "role": "town-ground", "outer": to_world(outer),
                     "holes": [to_world(h) for h in holes], "joins": []}],
        "staticObstacles": [{"id": o["id"], "kind": o["kind"],
                             "polygon": to_world(o["polygon"])} for o in obstacles],
        "dynamicBlockers": [], "landmarkAnchors": [],
        "semanticRoutes": [], "streamingAffinity": [],
    }
    # ---- authored obstacles, merged last ------------------------------------------------------
    # Some props cannot be derived at all. The well's rim is real cobble in real sunlight with
    # open cobble all around it, so colour, texture and local density all agree it is ground --
    # correctly, because it IS the same stone. The derivation reached 74% of the well and stalled,
    # and tightening it further bought the rest only by eroding open square. So the last few are
    # authored against the painting, which is precisely what walkable-regions-v1.json records for
    # the overworld: "curves were fitted once to visible walkable ground; the derived mask is
    # evidence only".
    authored = []
    if os.path.exists(args.authored):
        spec = json.load(open(args.authored))
        for o in spec.get("obstacles", []):
            if o.get("shape") == "circle":
                cx, cy = o["centerArt"]
                rr = o["radiusArt"]
                ring = [{"x": round((cx + rr * np.cos(t)) * art_to_world, 1),
                         "y": round((cy + rr * np.sin(t)) * art_to_world, 1)}
                        for t in np.linspace(0, 2 * np.pi, 20, endpoint=False)]
            else:
                ring = [{"x": round(px * art_to_world, 1), "y": round(py * art_to_world, 1)}
                        for px, py in o["polygonArt"]]
            authored.append({"id": o["id"], "kind": o["kind"], "polygon": ring})
        print(f"authored obstacles merged: {len(authored)} from "
              f"{os.path.basename(args.authored)}")
    # ---- authored OVERHEAD exemptions, applied after the merge --------------------------------
    # The inverse of the block above. The derivation reads a top-down painting, in which height is
    # not encoded, so anything that is not paving becomes solid at ground level -- including things
    # the player walks UNDERNEATH. Owner, 2026-08-03: "the mast of the ship should not block the
    # player's path", and the same for the demijohn hanging from the cargo davit. No local test on
    # the image can recover the missing dimension, so which props are overhead is authored, exactly
    # as the well's extent is authored.
    # Dropped by CENTROID inside an authored circle rather than by id: prop ids are positional and
    # renumber whenever the derivation shifts, so an id list would silently rot against the art.
    exemptions = []
    if os.path.exists(args.authored):
        for e in json.load(open(args.authored)).get("exemptions", []):
            cx, cy = e["centerArt"]
            exemptions.append((cx * art_to_world, cy * art_to_world,
                               e["radiusArt"] * art_to_world, e["id"]))
    kept, dropped = [], []
    for o in authored + data["staticObstacles"]:
        xs = [p["x"] for p in o["polygon"]]
        ys = [p["y"] for p in o["polygon"]]
        ox, oy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        hit = next((name for ex, ey, er, name in exemptions
                    if (ox - ex) ** 2 + (oy - ey) ** 2 <= er * er), None)
        (dropped if hit else kept).append((o, hit))
    for o, name in dropped:
        print(f"overhead exemption: dropped {o['id']} ({name}) -- player walks beneath it")
    if exemptions and not dropped:
        raise SystemExit("authored exemptions matched NOTHING -- the art or the derivation moved; "
                         "re-locate them rather than shipping a silently empty exemption list")
    data["staticObstacles"] = [o for o, _ in kept]
    data["designDecisions"]["authoredObstacles"] = (
        "the well is authored, not derived -- its rim is cobble and no local test can separate it")
    data["designDecisions"]["overheadExemptions"] = (
        f"{len(dropped)} derived obstacle(s) dropped as OVERHEAD (mast, hanging demijohn): a "
        "top-down painting cannot encode height, so props the player walks beneath read as solid")

    with open(args.out, "w") as fh:
        json.dump(data, fh, indent=1)
    print(f"wrote {args.out}  outer {len(outer)} pts, {len(holes)} holes")

    # ---- proof: the derived surface drawn back over the painting it came from ----------------
    proof = img.convert("RGBA")
    layer = Image.new("RGBA", proof.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    world_to_art = 1.0 / art_to_world
    d.polygon([(p["x"] * world_to_art, p["y"] * world_to_art) for p in data["regions"][0]["outer"]],
              fill=(60, 210, 255, 70), outline=(0, 230, 255, 255), width=4)
    for h in data["regions"][0]["holes"]:
        d.polygon([(p["x"] * world_to_art, p["y"] * world_to_art) for p in h],
                  fill=(255, 60, 90, 90), outline=(255, 90, 120, 255), width=3)
    for o in data["staticObstacles"]:
        d.polygon([(p["x"] * world_to_art, p["y"] * world_to_art) for p in o["polygon"]],
                  fill=(255, 190, 40, 140), outline=(255, 210, 60, 255), width=3)
    proof.alpha_composite(layer)
    proof.convert("RGB").save(args.proof)
    print(f"proof  {args.proof}")


if __name__ == "__main__":
    main()
