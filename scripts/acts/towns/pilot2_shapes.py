"""Pilot-2 hand-authored shapes, in cells (1 cell = 30 art px), traced on 1.5x gridded crops.

Each entry is (name, shape). Bases are FEET-ONLY: a building blocks from its front wall base line
northwards, a lamp/trunk/barrel only its foot. Fences/walls are continuous lines. See pilot2.py.
"""


def R(x0, y0, x1, y1):
    return ("rect", x0, y0, x1, y1)


def E(cx, cy, rx, ry=None):
    return ("ell", cx, cy, rx, ry if ry is not None else rx)


def PG(*pts):
    return ("poly", pts)


def L(w, *pts):
    """Continuous wall/fence line of width w cells (round joints, no gaps)."""
    return ("line", w, pts)

FENCE = 0.32      # fence rail / post line width (cells)

IRONKEEP = dict(
    gate=[32.25, 52.0],
    healer=[13.6, 46.4],          # house-SW door steps (12.1-15.1, 44-45.7)
    shop=[45.4, 46.1],            # in front of the forge-shop counter (base y 45.1)
    ground=[
        # T1 upper terrace: forge yard, north house, mine yard; fence on the wall top at y 17.4
        ("t1", PG((7.4, 9.3), (59.0, 9.3), (59.0, 17.4), (7.4, 17.4))),
        ("stairs-1", R(29.9, 17.0, 35.1, 21.8)),
        # T2 middle terrace: wall foot y 21.5 to the fence on the lower wall's top
        ("t2", PG((3.6, 21.5), (61.0, 21.5), (61.0, 31.1), (10.4, 31.1), (7.7, 30.3), (5.5, 28.5),
                  (3.6, 26.2))),
        ("stairs-3", R(29.8, 30.8, 35.1, 35.0)),
        ("stairs-4", R(50.0, 31.3, 53.8, 35.5)),
        # T3 lower terrace: wall foot y 34.6 to the south palisade
        ("t3", PG((5.5, 34.6), (61.0, 34.6), (61.0, 49.6), (52.1, 49.6), (43.0, 49.0), (37.6, 48.4),
                  (27.0, 48.1), (9.1, 48.1), (6.0, 45.0), (4.6, 43.0), (4.6, 42.5), (5.5, 42.5))),
        # gate passage between the pillars, then the road out to the plate edge
        ("gate", R(28.7, 47.5, 35.8, 52.3)),
        ("road", R(27.8, 52.2, 36.6, 65.0)),
    ],
    block=[
        # ---- T1
        ("forge", R(7.6, 0, 25.5, 15.0)),
        ("forge-east", R(25.5, 0, 29.0, 12.0)),
        ("trough", R(25.5, 12.3, 28.5, 14.8)),
        ("barrel-forge-a", E(27.9, 11.7, 0.55, 0.45)),
        ("barrel-forge-b", E(29.3, 12.8, 0.6, 0.45)),
        ("lamp-forge", E(29.4, 11.5, 0.33, 0.25)),
        ("fence-forge-n", L(FENCE, (29.0, 10.4), (32.4, 9.9))),
        ("brazier", E(29.65, 15.7, 0.9, 0.5)),
        ("fence-t1-w", L(FENCE, (6.5, 9.3), (6.5, 16.0), (7.8, 16.6), (13.2, 17.3))),
        ("house-n", R(32.0, 0, 42.4, 12.1)),
        ("barrel-n-a", E(32.6, 11.3, 0.55, 0.4)),
        ("barrel-n-b", E(37.15, 11.9, 0.6, 0.45)),
        ("cliff-ne", PG((42.4, 9.3), (44.3, 9.3), (44.3, 10.5), (45.5, 12.2), (48.0, 12.6), (42.4, 12.6))),
        ("fence-mine-w", L(FENCE, (44.3, 10.4), (45.5, 12.2), (47.7, 13.7))),
        ("mine-cliff", R(47.7, 0, 59.0, 12.6)),
        ("mine-crate", R(57.0, 10.2, 59.0, 12.8)),
        ("mine-barrel", E(57.5, 14.4, 0.62, 0.45)),
        ("mine-cart", R(48.8, 14.6, 51.6, 16.7)),
        ("pine-t1-a", E(55.7, 16.6, 0.35, 0.25)),
        ("pine-t1-b", E(59.4, 16.4, 0.35, 0.25)),
        ("shrubs-t1", E(41.3, 17.0, 2.2, 0.5)),
        # wall-top fence of the upper wall, both sides of the main stairs; east stair leads onto a roof
        ("fence-t1-s-w", L(FENCE, (13.0, 17.4), (29.9, 17.4))),
        ("pillar-1w", R(28.6, 17.0, 29.9, 22.0)),
        ("pillar-1e", R(35.1, 17.0, 36.3, 22.0)),
        ("fence-t1-s-e", L(FENCE, (36.3, 17.4), (59.0, 17.4))),
        # ---- T2
        ("house-w", PG((8.8, 17.6), (24.0, 17.6), (24.0, 27.1), (20.9, 27.1), (20.9, 28.4), (19.1, 28.4),
                       (19.1, 28.3), (17.0, 28.3), (17.0, 28.4), (8.8, 28.4))),
        ("bench-w", R(21.0, 27.1, 23.9, 29.0)),
        ("barrel-w-a", E(12.05, 28.5, 0.62, 0.42)),
        ("barrel-w-b", E(13.5, 29.3, 0.7, 0.48)),
        ("pot-w", E(14.65, 29.3, 0.45, 0.33)),
        ("crate-w", R(15.1, 28.6, 16.4, 29.8)),
        ("lamp-w", E(20.45, 28.85, 0.33, 0.25)),
        ("barrel-w-c", E(24.65, 26.3, 0.55, 0.4)),
        ("fence-w-yard", L(FENCE, (24.2, 26.9), (27.4, 27.0), (26.8, 24.8), (26.5, 21.2))),
        ("pine-w", E(7.3, 27.6, 0.45, 0.3)),
        ("shrub-w", E(8.3, 28.7, 0.5, 0.35)),
        ("fence-t2-w", L(FENCE, (3.6, 26.2), (5.5, 28.5), (7.7, 30.3), (10.4, 31.1), (28.1, 31.1))),
        ("pillar-3w", R(28.1, 30.4, 29.8, 34.8)),
        ("pillar-3e", R(35.1, 30.4, 36.6, 34.8)),
        ("fence-t2-e", L(FENCE, (36.6, 31.2), (48.9, 31.5))),
        ("pillar-4w", R(48.9, 31.4, 50.0, 35.8)),
        ("pillar-4e", R(53.8, 31.4, 55.0, 35.8)),
        ("fence-t2-e2", L(FENCE, (55.0, 31.5), (60.3, 31.2), (61.0, 31.1))),
        ("house-e", R(40.3, 17.6, 56.7, 29.45)),
        ("fence-e-yard", L(FENCE, (36.8, 22.8), (38.3, 24.3), (40.3, 25.6))),
        ("pine-e-a", E(38.6, 23.5, 0.4, 0.28)),
        ("crate-e", R(38.0, 27.3, 40.2, 28.8)),
        ("barrel-e", E(40.85, 29.2, 0.62, 0.45)),
        ("shrub-e", E(36.75, 27.9, 0.6, 0.42)),
        ("shrub-e-porch", E(45.9, 30.3, 1.6, 0.6)),
        ("sign-e", R(48.8, 28.6, 50.1, 29.8)),
        ("lamp-e", E(53.45, 30.55, 0.3, 0.22)),
        ("bench-e", R(55.1, 29.3, 58.3, 30.8)),
        ("pine-e-b", E(59.6, 24.6, 0.45, 0.3)),
        # ---- T3
        ("house-sw", PG((5.6, 34.6), (23.0, 34.6), (23.0, 43.9), (15.1, 43.9), (15.1, 44.0), (12.1, 44.0),
                        (12.1, 43.9), (5.6, 43.9))),
        ("fence-sw-side", L(FENCE, (22.8, 36.6), (25.4, 38.8), (26.2, 40.8))),
        ("barrel-sw", E(24.65, 41.75, 0.58, 0.45)),
        ("bench-sw", R(15.1, 43.4, 19.1, 45.1)),
        ("tub-sw", E(21.05, 44.3, 0.95, 0.65)),
        ("shrub-sw", E(9.8, 45.2, 1.2, 0.75)),
        ("well", E(32.6, 40.25, 2.0, 1.45)),
        ("shrub-mid", E(37.2, 36.0, 0.85, 0.55)),
        ("rocks-mid", E(39.4, 36.4, 1.2, 0.7)),
        ("fence-shop-w", L(FENCE, (39.6, 35.8), (39.6, 40.0))),
        ("shop", R(40.3, 34.6, 56.2, 45.1)),
        ("barrel-shop-a", E(39.5, 44.3, 0.6, 0.48)),
        ("crate-shop-a", R(41.1, 43.4, 43.0, 45.1)),
        ("crate-shop-b", R(47.1, 45.3, 48.4, 46.7)),
        ("barrel-shop-b", E(51.3, 46.6, 0.6, 0.48)),
        ("shed", R(56.1, 34.6, 62.1, 49.4)),
        ("crate-shed", R(57.0, 47.1, 59.0, 49.4)),
        ("coal-bin", R(52.1, 47.2, 57.2, 51.7)),
        ("fence-s-w", L(FENCE, (4.6, 43.0), (6.0, 45.0), (9.1, 48.1), (27.0, 48.1))),
        ("pillar-gate-w", R(27.0, 46.8, 28.7, 52.1)),
        ("pillar-gate-e", R(35.8, 46.8, 37.6, 52.1)),
        ("fence-s-e", L(FENCE, (37.6, 48.4), (43.0, 49.0), (52.1, 49.6))),
        # outer road posts
        ("post-road-w", R(26.3, 59.7, 27.75, 65.0)),
        ("post-road-e", R(36.7, 59.7, 38.0, 65.0)),
    ],
    fg=[
        ("lamp-forge-head", R(28.95, 7.4, 29.85, 10.4)),
        ("lamp-w-head", R(20.05, 25.1, 20.85, 27.7)),
        ("lamp-e-head", R(53.05, 27.4, 53.85, 29.4)),
        ("well-post", R(30.85, 36.8, 31.85, 38.7)),
        ("pine-w-crown", E(7.15, 23.9, 1.9, 3.0)),
        ("pine-e-a-crown", E(38.65, 21.9, 1.5, 1.3)),
        ("pine-e-b-crown", E(59.6, 22.4, 2.4, 2.2)),
        ("pine-t1-a-crown", E(55.7, 15.6, 0.65, 0.55)),
        ("pine-t1-b-crown", E(59.4, 15.5, 0.55, 0.5)),
        ("chimney-w", R(14.9, 16.0, 16.2, 17.5)),
    ],
    zoom={"terrace-west": (2, 9, 30, 33), "terrace-east": (34, 9, 62, 33),
          "lower-gate": (18, 33, 46, 55)},
)


def lamp(n, x, y):
    """Lamp post: small foot blocker + head cutout (top of post to ~1 cell above the foot)."""
    return [(f"lamp-{n}", E(x, y - 0.15, 0.42, 0.32))], [(f"lamp-{n}-head", R(x - 0.45, y - 3.15, x + 0.45, y - 0.95))]


def pine(n, tx, ty, cx, cy, rx, ry):
    """Tree: trunk foot blocker at (tx, ty); crown cutout ellipse."""
    return [(f"pine-{n}", E(tx, ty, 0.4, 0.28))], [(f"pine-{n}-crown", E(cx, cy, rx, ry))]


FW_LAMPS = [("n-w", 28.8, 21.9), ("n-e", 37.25, 21.9), ("m-w", 25.4, 28.1), ("m-e", 40.7, 28.1),
            ("s-w", 28.3, 43.5), ("s-e", 36.7, 43.5)]
FW_PINES = [("nw-a", 7.8, 14.5, 7.75, 11.0, 2.0, 3.0), ("nw-b", 7.6, 21.2, 7.65, 18.4, 1.65, 2.1),
            ("ne-a", 58.1, 15.2, 58.0, 10.9, 1.9, 3.6), ("ne-b", 57.9, 21.2, 57.75, 18.2, 1.65, 2.2),
            ("shed-big", 7.7, 29.5, 7.65, 25.6, 2.3, 3.5), ("shed-small", 11.0, 27.3, 10.9, 25.9, 0.95, 1.2),
            ("well", 19.2, 30.5, 19.1, 28.1, 1.3, 1.9), ("plaza-e", 42.2, 36.2, 42.4, 33.6, 1.5, 2.2),
            ("pond-n", 57.4, 29.3, 57.3, 26.3, 1.9, 2.6), ("pond-s", 57.6, 36.0, 57.55, 33.3, 1.45, 2.3),
            ("gate-w", 26.4, 50.2, 26.4, 47.6, 1.5, 2.3), ("gate-e", 37.7, 49.8, 37.7, 48.4, 1.1, 1.1),
            ("se-a", 42.6, 52.8, 42.6, 50.3, 1.6, 2.3), ("se-b", 55.4, 52.7, 55.45, 50.6, 1.55, 2.0),
            ("se-c", 58.2, 51.3, 58.25, 48.6, 1.45, 2.5), ("sw", 6.8, 51.75, 6.65, 49.2, 1.35, 2.4)]
_fb, _ff = [], []
for _l in FW_LAMPS:
    b, f = lamp(*_l); _fb += b; _ff += f
for _p in FW_PINES:
    b, f = pine(*_p); _fb += b; _ff += f

FROSTWATCH = dict(
    gate=[32.55, 55.0],
    healer=[11.0, 52.6],          # healer door (10.1-11.8), front base y 52.0
    shop=[46.0, 19.9],            # in front of the market counter (base y 19.1)
    ground=[
        ("inside-walls", R(5.2, 10.0, 59.5, 53.2)),     # wall inner faces: W 5.2, E 59.5, N 10.0, S 53.2
        ("gate-passage", R(30.8, 53.0, 34.3, 61.6)),
        ("road-out", R(30.5, 61.4, 34.8, 65.0)),
    ],
    block=_fb + [
        # north side
        ("tower-n", R(28.9, 0, 36.1, 13.0)),
        ("barrel-nw-wall", E(6.75, 11.4, 0.6, 0.45)),
        ("barracks-nw", R(8.4, 0, 28.6, 18.7)),
        ("barrel-nw-a", E(13.8, 18.6, 0.6, 0.45)),
        ("crate-nw", R(17.1, 18.3, 18.1, 19.1)),
        ("barrel-nw-b", E(22.0, 19.0, 0.65, 0.45)),
        ("barrel-nw-c", E(23.9, 19.0, 0.65, 0.45)),
        ("barrels-nw-e", R(24.9, 17.4, 28.6, 19.1)),
        ("crates-ne-tower", R(36.1, 8.7, 37.8, 10.8)),
        ("barrel-ne-a", E(37.2, 13.0, 0.7, 0.5)),
        ("barrel-ne-b", E(38.6, 11.4, 0.55, 0.4)),
        ("shop-ne", R(38.1, 0, 55.0, 19.1)),
        ("barrel-shop-a", E(55.6, 15.0, 0.6, 0.45)),
        ("barrel-shop-b", E(55.2, 18.3, 0.65, 0.45)),
        ("crate-shop", R(55.0, 11.6, 56.3, 13.8)),
        # plaza
        ("fountain", E(32.85, 29.2, 2.1, 1.45)),
        ("shrub-plaza-w", E(23.0, 29.4, 0.9, 0.55)),
        # west quarter
        ("shed", R(6.9, 27.3, 13.7, 31.0)),
        ("rocks-w-a", E(15.55, 26.8, 1.15, 0.5)),
        ("rocks-w-b", E(16.7, 28.6, 1.1, 0.5)),
        ("well", E(18.05, 30.25, 0.85, 0.55)),
        ("cottage-a", R(7.6, 32.3, 17.1, 39.8)),
        ("porch-a", R(5.2, 33.9, 7.6, 38.0)),
        ("barrel-a-porch", E(6.85, 39.3, 0.55, 0.45)),
        ("crate-a-1", R(9.1, 39.2, 10.2, 40.1)),
        ("crate-a-2", R(14.3, 39.3, 15.6, 40.6)),
        ("barrel-a-1", E(16.9, 40.0, 0.65, 0.5)),
        ("fence-a-side", L(FENCE, (17.3, 33.0), (18.6, 33.4), (18.6, 37.0))),
        ("barrel-a-2", E(17.75, 37.8, 0.6, 0.45)),
        ("cottage-b", R(19.2, 32.0, 27.0, 41.0)),
        ("fence-b-side", L(FENCE, (27.0, 33.9), (28.3, 34.2), (28.3, 37.9))),
        ("tub-b", E(27.65, 39.3, 0.65, 0.5)),
        # east quarter
        ("pond", PG((43.0, 29.5), (44.0, 27.7), (46.5, 26.3), (49.0, 25.8), (51.0, 26.2), (53.0, 27.3),
                    (54.7, 28.6), (55.2, 30.2), (54.6, 31.9), (52.5, 32.8), (49.5, 33.3), (46.5, 33.2),
                    (44.5, 32.4), (43.2, 31.2))),
        ("shrub-pond-nw", E(45.0, 26.1, 0.7, 0.45)),
        ("shrub-pond-ne", E(53.7, 26.5, 0.9, 0.5)),
        ("shrub-pond-s1", E(47.0, 34.9, 0.9, 0.5)),
        ("shrub-pond-s2", E(51.0, 34.8, 1.1, 0.55)),
        ("shrub-pond-s3", E(45.45, 35.6, 0.45, 0.3)),
        ("rock-e", E(58.2, 29.9, 0.8, 0.45)),
        ("sign-e", R(36.6, 36.9, 38.2, 37.7)),
        ("fence-e-sign", L(FENCE, (37.2, 34.0), (37.2, 37.4))),
        ("fence-e-sign-rail", L(FENCE, (37.2, 35.4), (39.4, 35.6))),
        ("barracks-e", R(39.4, 37.6, 57.9, 45.2)),
        ("barracks-e-front", R(39.4, 45.2, 50.6, 46.6)),
        ("fence-e-porch", L(FENCE, (38.0, 39.0), (38.0, 43.2))),
        ("barrels-e-front", R(38.1, 45.0, 42.3, 47.7)),
        ("barrel-e-b", E(52.1, 47.4, 0.7, 0.5)),
        ("crate-e", R(53.1, 45.2, 55.7, 48.0)),
        ("fence-e-yard", L(FENCE, (53.8, 35.6), (55.9, 36.1), (58.6, 36.9), (58.6, 38.8))),
        ("fence-e-post", L(FENCE, (58.1, 40.3), (58.1, 43.0))),
        # south
        ("healer", R(8.1, 44.0, 21.7, 52.0)),
        ("fence-healer", L(FENCE, (21.5, 45.0), (23.9, 45.0), (23.9, 47.4))),
        ("barrel-h-1", E(9.3, 51.8, 0.35, 0.3)),
        ("barrel-h-2", E(14.4, 51.75, 0.6, 0.42)),
        ("tub-h", E(19.15, 51.65, 0.85, 0.5)),
        ("barrel-h-3", E(21.25, 51.75, 0.5, 0.38)),
        ("rocks-se-a", E(51.5, 51.6, 1.2, 0.7)),
        ("rocks-se-b", E(45.9, 52.8, 0.9, 0.45)),
        ("tower-gate-w", R(25.1, 49.6, 30.8, 65.0)),
        ("tower-gate-e", R(34.3, 49.6, 40.1, 65.0)),
    ],
    fg=_ff + [
        ("fountain-spire", R(32.35, 25.9, 33.35, 28.0)),
        # eaves: roofs whose back edge borders walkable ground
        ("shed-roof", R(6.9, 25.9, 13.7, 28.6)),
        ("cottage-a-roof", R(7.6, 31.1, 17.1, 33.6)),
        ("cottage-b-roof", R(19.1, 30.5, 27.1, 33.3)),
        ("barracks-e-roof", R(39.2, 35.4, 58.0, 38.9)),
        ("healer-roof", R(8.0, 42.8, 21.8, 45.3)),
    ],
    zoom={"well-shed": (4, 21, 26, 42), "plaza-lamps": (21, 16, 45, 33),
          "pond-trees": (40, 21, 60, 40), "south-gate": (20, 40, 60, 57)},
)

TOWNS = {"ironkeep": IRONKEEP, "frostwatch": FROSTWATCH}
