"""Town layouts for Acts 2-5, in 65x65 town CELLS. Round 2: one plan per town.

Every town has its own silhouette and street plan; what they share is only the gameplay anchors.
Anchors come from src/data/maps.ts: a 16x16 coord (x, y) maps to cell (v + 0.5) * 65/16:

    (3,5)  -> (14.2, 22.3)    (12,5) -> (50.8, 22.3)    (8,3) -> (34.5, 14.2)
    (12,3) -> (50.8, 14.2)    (9,3)  -> (38.6, 14.2)    (3,12) healer -> (14.2, 50.8)
    (7,10) -> (30.5, 42.7)    (10,13)-> (42.7, 54.8)    (8,8) -> (34.5, 34.5)
    (6,12) -> (26.4, 50.8)    save (8,10) -> (34.5, 42.7)      exit fromX 8 -> x 34.5, south edge

A building's `at` is the bottom-centre of its authored Act 1 footprint (its front line), so an NPC
standing at y has its building at about y - 1.6. Lanes are polylines with a width, in cells.
Feature keys (features.py): walls, towers, terraces, water (ellipse or poly), channels, bridges;
compose.py: ringPoly (town silhouette), plazas, dig, voidPoly, props, buildings.
"""

K = 65 / 16.0


def c16(x, y):
    return [round((x + 0.5) * K, 2), round((y + 0.5) * K, 2)]


PINES = ["pine-0", "pine-1", "pine-2"]
PALMS = ["palm-0", "palm-1", "palm-2"]
DEAD = ["deadtree-0", "deadtree-1"]


def graves(x0, y0, cols=3, rows=2, dx=2.6, dy=2.8, jitter=0.0):
    out = []
    for j in range(rows):
        for i in range(cols):
            jx = ((i * 7 + j * 3) % 5 - 2) * jitter
            jy = ((i * 3 + j * 5) % 5 - 2) * jitter
            out.append({"kit": f"grave-{(i * 3 + j) % 4}", "at": [x0 + i * dx + (j % 2) * 0.6 + jx, y0 + j * dy + jy]})
    return out


def fence_row(x0, x1, y, flip=False):
    """fence-c is ~26 cells long; tile it along a row."""
    out, x = [], x0
    while x < x1 - 4:
        out.append({"kit": "fence-c", "at": [min(x + 13, x1 - 13), y], "flip": flip})
        x += 26
    return out


TOWNS = {
    # =================================================================== ACT 2: snowy highlands
    # IRONKEEP -- a terraced mining town climbing a mountain wall. Three tiers joined by stone
    # stairs; the forge and the mine mouth sit on the top ledge against the cliff, the smelter
    # and the shop down by the gate. No round plaza: a forge-yard with a brazier holds the save.
    "ironkeep": {
        "title": "Ironkeep", "act": 2, "biome": "snow", "variant": "forge", "seed": 21,
        "border": "cliff", "treeDensity": 0.18, "borderTrees": PINES,
        "ringPoly": [[3, 62], [4, 40], [6, 26], [9, 15], [15, 7], [24, 4.5], [34, 3.5], [45, 4.5],
                     [53, 6.5], [58.5, 11], [61, 20], [62, 34], [61.5, 48], [62, 62], [65, 66], [0, 66]],
        "terraces": [
            {"pts": [[5, 18.2], [14, 17.6], [24, 18.4], [33, 17.8], [42, 18.4], [52, 17.6], [61, 18.2]],
             "h": 2.1, "stairs": [[32.2, 36.8]]},
            {"pts": [[4, 30.6], [12, 30.0], [22, 30.8], [30, 30.2], [40, 30.9], [50, 30.1], [62, 30.7]],
             "h": 2.1, "stairs": [[32.4, 37.0], [52.5, 56.5]]},
        ],
        "lanes": [
            {"pts": [[34.5, 66], [34.5, 58], [35.6, 51], [34.6, 44], [34.6, 37], [34.7, 30], [34.4, 25], [34.5, 17], [34.5, 14.6]], "w": 4.2},
            {"pts": [[20, 15.2], [28, 14.6], [34.5, 14.8], [42, 14.4], [48.5, 13.4]], "w": 3.4},
            {"pts": [[8, 24.2], [14.2, 23.9], [24, 24.4], [34.5, 24.0], [44, 24.4], [50.8, 23.9], [58, 24.2]], "w": 3.4},
            {"pts": [[54.5, 24.2], [54.5, 34], [52, 40.2], [46, 44.2], [36, 44.4]], "w": 3.3},
            {"pts": [[34.5, 46], [26, 47], [20, 51.8], [12, 52.6], [7, 52.2]], "w": 3.4},
        ],
        "plazas": [{"poly": [[29, 40.6], [40, 40.2], [41, 46.2], [28.5, 46.6]]}],
        "buildings": [
            {"kit": "mi-terracotta", "at": [27.0, 13.0], "role": "forge"},
            {"kit": "po-red-roof-w", "at": [14.6, 22.0]},
            {"kit": "po-slate-cottage-e", "at": [50.6, 22.0]},
            {"kit": "po-market-stall", "at": [47.0, 42.6], "role": "shop"},
            {"kit": "po-herb-shop-e", "at": [14.2, 49.3], "role": "healer"},
            {"kit": "po-net-loft", "at": [51.5, 58.5], "role": "smelter"},
            {"kit": "gr-brown-cottage-se", "at": [22.0, 41.6]},
        ],
        "props": [
            {"kit": "mine-0", "at": [48.5, 12.4]},
            {"kit": "brazier-0", "at": [30.4, 40.6]}, {"kit": "anvil-0", "at": [33.0, 14.0]},
            {"kit": "brazier-0", "at": [39.4, 13.6]},
            {"kit": "rocks", "at": [8.0, 36.5]}, {"kit": "rock-s", "at": [44.5, 35.5]},
            {"kit": "pine-0", "at": [41.0, 28.6]}, {"kit": "pine-1", "at": [26.0, 28.4]},
            {"kit": "pine-2", "at": [8.5, 27.5]}, {"kit": "lamp-0", "at": [38.0, 56.0]},
            {"kit": "rock-s2", "at": [25.5, 60.5]},
        ],
        "fx": [{"glow": [27.0, 11.5], "r": 3.0, "col": [255, 140, 50], "a": 0.5},
               {"glow": [48.5, 11.0], "r": 2.2, "col": [255, 170, 80], "a": 0.4},
               {"smoke": [29.6, 3.2], "col": [120, 116, 122]}],
        "dressKinds": ["pine-0", "pine-1", "rock-s", "rock-s2"], "dress": 10,
    },
    # FROSTWATCH -- a walled watch-post: a square stone curtain wall with a gatehouse, a tall
    # watchtower at the north, a parade ground in the middle, barracks rows. Pines outside.
    "frostwatch": {
        "title": "Frostwatch", "act": 2, "biome": "snow", "variant": "watch", "seed": 22,
        "border": "cliff", "treeDensity": 0.55, "borderTrees": PINES,
        "ringPoly": [[1.5, 64], [1.5, 6], [6, 1.5], [59, 1.5], [63.5, 6], [63.5, 64], [65, 66], [0, 66]],
        "walls": [{"pts": [[31.5, 61.5], [9, 61.5], [5.5, 58], [5.5, 9], [9, 5.5], [56, 5.5], [59.5, 9],
                           [59.5, 58], [56, 61.5], [37.5, 61.5]], "t": 1.7, "h": 1.6}],
        "towers": [{"at": [34.5, 12.2], "w": 5.0, "h": 4.0, "d": 3.4},
                   {"at": [29.6, 63.6], "w": 3.4, "h": 2.2, "d": 2.4, "door": False},
                   {"at": [39.4, 63.6], "w": 3.4, "h": 2.2, "d": 2.4, "door": False}],
        "exitGap": 2.6,
        "lanes": [
            {"pts": [[34.5, 66], [34.5, 56], [34.5, 46], [34.5, 38], [34.5, 26], [34.5, 13.4]], "w": 4.0},
            {"pts": [[9, 24.2], [20, 24.2], [34.5, 24.2], [48, 24.2], [56, 24.2]], "w": 3.2},
            {"pts": [[9, 52.6], [20, 52.6], [30, 52.6], [34.5, 52.6], [44, 56.0], [50, 56.2]], "w": 3.2},
        ],
        "plazas": [{"poly": [[25, 31], [44, 31], [44, 44.6], [25, 44.6]]}],
        "water": [{"c": [48.6, 33.2], "rx": 5.2, "ry": 2.7}],
        "buildings": [
            {"kit": "mi-thatch", "at": [15.0, 20.8]},
            {"kit": "po-market-stall", "at": [50.6, 21.6], "role": "shop"},
            {"kit": "mi-purple", "at": [14.2, 49.3], "role": "healer"},
            {"kit": "gr-green-cottage-s", "at": [26.4, 49.2]},
            {"kit": "po-warehouse-s", "at": [50.5, 51.4], "role": "barracks"},
        ],
        "props": [
            {"kit": "lamp-0", "at": [24.6, 31.2]}, {"kit": "lamp-0", "at": [44.4, 31.2]},
            {"kit": "lamp-0", "at": [31.4, 58.6]}, {"kit": "lamp-0", "at": [37.6, 58.6]},
            {"kit": "brazier-0", "at": [38.6, 41.2]},
            {"kit": "pine-0", "at": [9.5, 33.5]}, {"kit": "pine-2", "at": [12.5, 37.5]},
            {"kit": "pine-1", "at": [57.0, 32.0]}, {"kit": "rock-s", "at": [22.5, 36.0]},
        ],
        "fx": [{"smoke": [17.6, 8.6], "col": [176, 180, 196]}],
        "dressKinds": ["pine-0", "pine-1", "rock-s"], "dress": 6,
    },
    # RAVENHOLLOW -- a crooked village in a black-pine forest: lanes that never run straight, houses
    # set at odd offsets, a fenced graveyard full of dead trees on the east, lanterns, fog.
    "hauntedVillage": {
        "title": "Ravenhollow", "act": 2, "biome": "haunted", "seed": 23,
        "border": "forest", "borderTrees": PINES + PINES + ["deadtree-0"],
        "ringPoly": [[4, 62], [3, 44], [6, 30], [4, 18], [10, 8], [21, 5], [30, 7.5], [41, 4], [53, 6],
                     [60, 13], [61.5, 27], [59, 40], [62, 52], [58, 62], [65, 66], [0, 66]],
        "lanes": [
            {"pts": [[34.5, 66], [33.2, 58], [36.6, 52], [33.4, 46], [35.6, 40], [33.0, 34.6], [36.4, 28],
                     [33.6, 21], [35.0, 15.6]], "w": 3.6},
            {"pts": [[7, 26], [14.2, 24.2], [21, 26.6], [27, 24.8], [33.6, 24.6]], "w": 3.2},
            {"pts": [[35.6, 40], [41, 37.6], [45, 33.2], [44.2, 26.5], [48, 22.2], [53, 20.8]], "w": 3.0},
            {"pts": [[33.4, 46], [27, 49.4], [21, 52.6], [13, 52.0], [8, 54]], "w": 3.2},
            {"pts": [[36.6, 52], [42.7, 56.6], [48, 58.0]], "w": 3.0},
        ],
        "buildings": [
            {"kit": "mi-teal", "at": [33.5, 13.6]},
            {"kit": "po-slate-cottage-e", "at": [14.0, 22.4]},
            {"kit": "gr-market-stall", "at": [52.6, 19.4], "role": "shop"},
            {"kit": "gr-herb-shop-e", "at": [13.8, 49.6], "role": "healer"},
            {"kit": "mi-olive", "at": [48.6, 55.8], "flip": True},
            {"kit": "po-terracotta-nw", "at": [23.0, 39.8], "flip": True},
        ],
        "props": [{"kit": "lamp-0", "at": [31.0, 41.4]}, {"kit": "lamp-0", "at": [37.4, 25.6]},
                  {"kit": "lamp-0", "at": [31.6, 57.6]}, {"kit": "lamp-0", "at": [19.0, 26.8]},
                  {"kit": "deadtree-0", "at": [38.6, 33.6]},
                  {"kit": "deadtree-1", "at": [42.0, 47.0]},
                  {"kit": "deadtree-0", "at": [56.6, 31.0]}, {"kit": "deadtree-1", "at": [50.4, 44.0]},
                  {"kit": "deadtree-1", "at": [55.6, 40.6]},
                  {"kit": "pine-1", "at": [27.0, 31.0]}, {"kit": "pine-0", "at": [8.5, 38.0]}]
                 + graves(46.6, 29.0, cols=4, rows=4, dx=2.5, dy=3.0, jitter=0.25)
                 + [{"kit": "fence-c", "at": [52.0, 41.8]}],
        "fx": [{"fog": True}],
        "dressKinds": ["pine-0", "pine-2", "deadtree-0", "rock-s2"], "dress": 8,
    },
    # =================================================================== ACT 3: desert / oasis
    # OASIS HAVEN -- a bazaar around a big palm-ringed pond: one loop road circles the water, stalls
    # face it from both sides, houses sit back against the dunes.
    "oasisHaven": {
        "title": "Oasis Haven", "act": 3, "biome": "desert", "variant": "oasis", "seed": 31,
        "border": "cliff", "treeDensity": 0.32, "borderTrees": PALMS,
        "ringPoly": [[3, 60], [2.5, 38], [5, 22], [12, 10], [24, 4], [36, 3], [48, 4.5], [57, 10],
                     [62.5, 24], [63, 42], [61, 60], [65, 66], [0, 66]],
        "lanes": [
            {"pts": [[34.5, 66], [34.5, 56], [34.5, 45]], "w": 4.2},
            # the loop round the pond
            {"pts": [[34.5, 44.6], [24, 43.0], [18.5, 37], [18.5, 29], [23, 22.6], [34.5, 20.6], [46, 22.6],
                     [50.5, 29], [50.5, 37], [45, 43.0], [34.5, 44.6]], "w": 3.6},
            {"pts": [[34.5, 20.6], [34.5, 15.6]], "w": 3.2},
            {"pts": [[46, 22.6], [50.8, 15.8]], "w": 3.0},
            {"pts": [[18.5, 29], [11, 24.6], [8, 24.2]], "w": 3.0},
            {"pts": [[24, 43.0], [17, 51.8], [9, 52.4]], "w": 3.2},
        ],
        "water": [{"poly": [[24, 31], [27, 26.4], [34.5, 25.2], [42, 26.4], [45.4, 31], [44, 36.4],
                            [38, 39.2], [31, 39.2], [25.4, 36.6]]}],
        "buildings": [
            {"kit": "po-red-roof-w", "at": [34.5, 12.6]},
            {"kit": "po-terracotta-nw", "at": [50.8, 12.4]},
            {"kit": "mi-thatch", "at": [12.6, 22.0]},
            {"kit": "gr-market-stall", "at": [57.0, 36.6], "role": "shop"},
            {"kit": "po-market-stall", "at": [11.6, 35.2], "role": "bazaar"},
            {"kit": "mi-purple", "at": [14.2, 49.4], "role": "healer"},
            {"kit": "po-blue-cottage-sw", "at": [52.6, 56.6]},
        ],
        "props": [
            {"kit": "palm-0", "at": [24.6, 29.6]}, {"kit": "palm-1", "at": [45.2, 29.2]},
            {"kit": "palm-2", "at": [28.0, 26.4]}, {"kit": "palm-1", "at": [41.4, 26.0]},
            {"kit": "palm-0", "at": [36.6, 25.4]}, {"kit": "palm-2", "at": [26.6, 37.6]},
            {"kit": "palm-1", "at": [43.0, 37.4]},
            {"kit": "tent-0", "at": [26.0, 50.6]}, {"kit": "tent-0", "at": [43.6, 50.8]},
            {"kit": "palm-0", "at": [8.0, 44.0]}, {"kit": "palm-2", "at": [59.5, 46.0]},
        ],
        "dressKinds": ["palm-0", "palm-1", "rock-s", "rock-s2"], "dress": 10,
    },
    # RUINS CAMP -- an excavation in a canyon: a sunken dig pit ringed by broken columns, a
    # colonnade lining the old processional way, explorers' tents, the dig office up north.
    "ruinsCamp": {
        "title": "Ruins Camp", "act": 3, "biome": "desert", "variant": "ruins", "seed": 32,
        "border": "cliff",
        "ringPoly": [[6, 64], [5, 46], [8, 30], [5, 16], [11, 6], [24, 3.5], [33, 6], [45, 3.5], [56, 6],
                     [61, 18], [58, 32], [61.5, 46], [59, 64], [65, 66], [0, 66]],
        "dig": [{"c": [20.0, 30.0], "rx": 9.6, "ry": 6.2}],
        # ruined foundations: low dressed-stone courses, broken
        "walls": [{"pts": [[44.5, 27.0], [44.5, 34.0]], "t": 0.9, "h": 0.7, "low": True},
                  {"pts": [[47.5, 27.0], [56.0, 27.0]], "t": 0.9, "h": 0.7, "low": True},
                  {"pts": [[8.5, 41.0], [16.0, 41.0], [16.0, 39.0]], "t": 0.9, "h": 0.7, "low": True},
                  {"pts": [[22.5, 8.6], [30.0, 8.6]], "t": 0.9, "h": 0.7, "low": True},
                  {"pts": [[11.0, 12.0], [11.0, 16.0]], "t": 0.9, "h": 0.7, "low": True},
                  {"pts": [[40.0, 58.0], [40.0, 62.0], [44.0, 62.0]], "t": 0.9, "h": 0.7, "low": True}],
        "lanes": [
            {"pts": [[34.5, 66], [34.5, 54], [34.5, 44], [35.6, 34], [37.4, 24], [38.6, 15.6]], "w": 4.4},
            {"pts": [[37.4, 24], [44, 24.2], [50.8, 24.0], [55, 24.4]], "w": 3.2},
            {"pts": [[34.5, 46], [25, 47.8], [18, 52.4], [9, 52.6]], "w": 3.2},
            {"pts": [[34.5, 42], [42, 40.6], [48, 41.2]], "w": 3.2},
            {"pts": [[9.2, 20.4], [14, 20.6], [22, 20.6], [30, 21.4], [37.0, 21.8]], "w": 2.6},
        ],
        "buildings": [
            {"kit": "po-net-loft", "at": [38.6, 12.8], "role": "dig-office"},
            {"kit": "mi-terracotta", "at": [51.0, 22.6], "role": "store"},
            {"kit": "po-market-stall", "at": [52.6, 39.6], "role": "shop"},
            {"kit": "po-herb-shop-e", "at": [14.2, 49.4], "role": "healer"},
        ],
        "props": ([{"kit": f"column-{i % 3}", "at": [31.0, 26.0 + 5.6 * i]} for i in range(4)]
                  + [{"kit": f"column-{(i + 1) % 3}", "at": [41.6, 28.0 + 5.6 * i]} for i in range(4)]
                  + [{"kit": "column-0", "at": [10.0, 24.2]}, {"kit": "column-2", "at": [13.4, 36.8]},
                     {"kit": "column-1", "at": [27.2, 36.6]}, {"kit": "column-1", "at": [28.0, 23.6]},
                     {"kit": "rocks", "at": [14.0, 33.6]}, {"kit": "rock-s", "at": [22.6, 33.0]},
                     {"kit": "tent-0", "at": [47.6, 50.0]}, {"kit": "tent-0", "at": [53.0, 54.6]},
                     {"kit": "tent-0", "at": [22.8, 58.4]}, {"kit": "tent-0", "at": [45.0, 58.8]},
                     {"kit": "brazier-0", "at": [37.6, 44.0]}, {"kit": "rock-s2", "at": [56.0, 30.6]},
                     {"kit": "palm-1", "at": [8.5, 40.0]}]),
        "dressKinds": ["rock-s", "rock-s2", "column-1"], "dress": 8,
    },
    # =================================================================== ACT 4: volcanic ash
    # EMBER'S REST -- basalt-and-timber in a crater: a lava river crosses the town behind a rock
    # rim, two plank bridges carry the streets over it, the forge stands on the hot bank.
    "embersRest": {
        "title": "Ember's Rest", "act": 4, "biome": "ash", "variant": "forge", "seed": 41,
        "border": "cliff", "treeDensity": 0.15, "borderTrees": DEAD,
        "ringPoly": [[5, 62], [3, 46], [5, 30], [4, 16], [12, 6], [26, 3], [40, 5], [52, 3.5], [60, 11],
                     [62, 26], [60.5, 42], [62.5, 60], [65, 66], [0, 66]],
        "channels": [{"pts": [[-1, 33.5], [8, 32.2], [16, 34.2], [24, 32.6], [31, 31.4], [38, 32.8],
                              [46, 34.6], [52, 31.6], [57, 27], [66, 25.5]], "w": 2.4}],
        "bridges": [{"at": [34.6, 32.0], "w": 4.2, "len": 5.4, "dir": "v"},
                    {"at": [13.4, 33.4], "w": 3.2, "len": 5.0, "dir": "v"}],
        "lanes": [
            {"pts": [[34.5, 66], [34.5, 56], [34.6, 46], [34.6, 38], [34.6, 26], [34.6, 18]], "w": 4.2},
            {"pts": [[13.4, 24.4], [13.4, 30], [13.4, 37], [16, 41], [22, 43.4], [34.6, 44.4]], "w": 3.2},
            {"pts": [[8, 24.4], [14.2, 24.2], [24, 23.8], [34.6, 23.8], [44, 24.0], [50.8, 24.2]], "w": 3.4},
            {"pts": [[34.6, 44.4], [44, 45.2], [52, 46.0]], "w": 3.4},
            {"pts": [[22, 43.4], [16, 52.4], [9, 52.6]], "w": 3.0},
        ],
        "buildings": [
            {"kit": "mi-terracotta", "at": [14.4, 22.4], "role": "forge"},
            {"kit": "po-slate-cottage-e", "at": [50.8, 22.4]},
            {"kit": "po-red-roof-w", "at": [32.0, 16.4]},
            {"kit": "mi-market", "at": [52.4, 43.8], "role": "shop"},
            {"kit": "mi-purple", "at": [14.2, 49.4], "role": "healer"},
            {"kit": "gr-brown-cottage-se", "at": [52.0, 61.0]},
        ],
        "props": [
            {"kit": "brazier-0", "at": [31.0, 41.6]}, {"kit": "brazier-0", "at": [38.2, 41.6]},
            {"kit": "brazier-0", "at": [20.0, 23.4]}, {"kit": "anvil-0", "at": [22.4, 25.6]},
            {"kit": "rocks", "at": [45.0, 38.0]}, {"kit": "deadtree-0", "at": [26.0, 39.0]},
            {"kit": "deadtree-1", "at": [44.0, 18.0]}, {"kit": "rock-s", "at": [25.0, 58.0]},
            {"kit": "lamp-0", "at": [38.0, 56.0]},
        ],
        "fx": [{"glow": [14.4, 20.6], "r": 3.2, "col": [255, 120, 30], "a": 0.55},
               {"smoke": [17.2, 9.6], "col": [90, 80, 80]}, {"smoke": [35.0, 4.6], "col": [90, 80, 80]}],
        "dressKinds": ["rock-s", "rock-s2", "deadtree-0"], "dress": 10,
    },
    # CINDERWATCH -- a basalt watch-post on a lava moat: a half-ring stone wall with a tall tower
    # on the north side, a lava moat across the south crossed by one bridge at the gate.
    "cinderwatch": {
        "title": "Cinderwatch", "act": 4, "biome": "ash", "variant": "watch", "seed": 42,
        "proposal": True, "border": "cliff", "treeDensity": 0.12, "borderTrees": DEAD,
        "ringPoly": [[2, 64], [2, 36], [6, 16], [16, 5], [34.5, 2], [53, 5], [63, 16], [63, 36], [63, 64],
                     [65, 66], [0, 66]],
        "walls": [{"pts": [[6.5, 40], [7.5, 22], [13, 12], [22, 7], [34.5, 5.4], [47, 7], [56, 12],
                           [61.5, 22], [62, 40]], "t": 1.6, "h": 1.6}],
        "towers": [{"at": [34.5, 12.4], "w": 5.4, "h": 4.4, "d": 3.6},
                   {"at": [7.5, 41.6], "w": 3.2, "h": 2.0, "d": 2.2, "door": False},
                   {"at": [62.0, 41.6], "w": 3.2, "h": 2.0, "d": 2.2, "door": False}],
        "channels": [{"pts": [[-1, 58.2], [10, 57.0], [22, 58.6], [34.5, 57.6], [46, 58.8], [56, 57.2],
                              [66, 58.0]], "w": 2.2}],
        "bridges": [{"at": [34.5, 57.7], "w": 4.2, "len": 5.0, "dir": "v"}],
        "lanes": [
            {"pts": [[34.5, 66], [34.5, 54], [34.5, 44], [34.5, 30], [34.5, 14.0]], "w": 4.2},
            {"pts": [[10, 24.2], [20, 24.0], [34.5, 23.8], [49, 24.0], [58, 24.2]], "w": 3.2},
            {"pts": [[9, 52.4], [20, 52.6], [34.5, 50.4], [46, 50.6], [56, 50.8]], "w": 3.2},
        ],
        "plazas": [{"c": [34.5, 37.6], "rx": 7.0, "ry": 5.0}],
        "buildings": [
            {"kit": "gr-brown-cottage-se", "at": [14.2, 22.2]},
            {"kit": "po-warehouse-s", "at": [50.8, 22.0]},
            {"kit": "gr-market-stall", "at": [51.4, 46.8], "role": "shop"},
            {"kit": "gr-herb-shop-e", "at": [14.0, 49.6], "role": "healer"},
            {"kit": "po-red-roof-w", "at": [21.0, 37.0]},
        ],
        "props": [
            {"kit": "brazier-0", "at": [30.4, 34.0]}, {"kit": "brazier-0", "at": [38.6, 34.0]},
            {"kit": "lamp-0", "at": [31.0, 55.0]}, {"kit": "lamp-0", "at": [38.0, 55.0]},
            {"kit": "rocks", "at": [46.0, 36.0]}, {"kit": "deadtree-1", "at": [27.0, 29.6]},
        ],
        "fx": [{"smoke": [38.0, 1.6], "col": [90, 80, 80]}],
        "dressKinds": ["rock-s", "rock-s2", "deadtree-1"], "dress": 8,
    },
    # =================================================================== ACT 5: dark barren
    # LAST BASTION -- a real fortress ring: an octagonal curtain wall with corner towers and a
    # gatehouse of two towers at the south, an inner keep, a straight muster road lit by braziers.
    "lastBastion": {
        "title": "Last Bastion", "act": 5, "biome": "barren", "variant": "fort", "seed": 51,
        "border": "cliff", "treeDensity": 0.1, "borderTrees": DEAD,
        "ringPoly": [[1, 64], [1, 1], [64, 1], [64, 64], [65, 66], [0, 66]],
        "walls": [{"pts": [[31.6, 60.6], [16, 60.6], [5, 50], [5, 16], [16, 5.2], [53, 5.2], [60, 16],
                           [60, 50], [53, 60.6], [37.4, 60.6]], "t": 2.0, "h": 2.0}],
        "towers": [{"at": [29.4, 63.8], "w": 4.4, "h": 2.6, "d": 3.0, "door": False},
                   {"at": [39.6, 63.8], "w": 4.4, "h": 2.6, "d": 3.0, "door": False},
                   {"at": [6.8, 18.4], "w": 4.2, "h": 2.4, "d": 3.0, "door": False},
                   {"at": [58.2, 18.4], "w": 4.2, "h": 2.4, "d": 3.0, "door": False},
                   {"at": [6.8, 53.0], "w": 4.2, "h": 2.4, "d": 3.0, "door": False},
                   {"at": [58.2, 53.0], "w": 4.2, "h": 2.4, "d": 3.0, "door": False},
                   {"at": [34.5, 15.0], "w": 8.0, "h": 4.4, "d": 4.4}],
        "exitGap": 2.8,
        "lanes": [
            {"pts": [[34.5, 66], [34.5, 50], [34.5, 30], [34.5, 16.6]], "w": 4.6},
            {"pts": [[10, 24.0], [22, 24.0], [34.5, 24.0], [47, 24.0], [56, 24.0]], "w": 3.4},
            {"pts": [[10, 52.6], [22, 52.6], [34.5, 52.6], [47, 52.6], [56, 52.6]], "w": 3.4},
        ],
        "plazas": [{"poly": [[27, 36], [42, 36], [42, 46], [27, 46]]}],
        "buildings": [
            {"kit": "po-red-roof-w", "at": [14.4, 22.4], "role": "barracks"},
            {"kit": "po-slate-cottage-e", "at": [50.8, 22.4]},
            {"kit": "po-market-stall", "at": [50.6, 40.0], "role": "shop"},
            {"kit": "po-herb-shop-e", "at": [14.2, 49.4], "role": "healer"},
            {"kit": "po-net-loft", "at": [50.6, 56.8], "role": "armoury"},
            {"kit": "gr-brown-cottage-se", "at": [17.0, 40.4]},
        ],
        "props": ([{"kit": "brazier-0", "at": [31.4, 18.0 + 8 * i]} for i in range(5)]
                  + [{"kit": "brazier-0", "at": [37.6, 18.0 + 8 * i]} for i in range(5)]
                  + [{"kit": "rock-s", "at": [25.0, 30.0]}, {"kit": "deadtree-0", "at": [44.0, 31.0]}]),
        "dressKinds": ["rock-s", "rock-s2"], "dress": 6,
    },
    # HAVEN'S EDGE -- a hamlet on the last ledge of the world: the north-east falls away into a
    # starlit void, the houses cling to the south-west, a lookout lamp on the promontory.
    "havensEdge": {
        "title": "Haven's Edge", "act": 5, "biome": "barren", "variant": "edge", "seed": 52,
        "border": "cliff", "treeDensity": 0.18, "borderTrees": DEAD,
        "ringPoly": [[3, 62], [3, 30], [6, 12], [14, 5], [28, 6], [34, 8], [40, 6.5], [50, 12],
                     [57, 18], [60, 30], [62, 46], [62, 62], [65, 66], [0, 66]],
        "voidPoly": [[0, -1], [66, -1], [66, 52], [60.5, 40], [58, 30], [56, 26.5], [53, 18], [46, 10],
                     [39, 8.2], [30, 9.2], [22, 6], [12, 4.5], [6, 8], [2, 14], [-1, 16]],
        "lanes": [
            {"pts": [[34.5, 66], [33.6, 56], [34.5, 46], [33.0, 36], [33.8, 26], [34.5, 16.0]], "w": 3.8},
            {"pts": [[7, 24.6], [14.2, 24.2], [24, 25.6], [33.8, 26], [42, 25.0], [50.8, 24.0]], "w": 3.2},
            {"pts": [[34.5, 46], [26, 49.2], [16, 52.6], [8, 52.4]], "w": 3.2},
            {"pts": [[33.0, 36], [42, 38.6], [50, 42.6]], "w": 3.0},
        ],
        "buildings": [
            {"kit": "po-terracotta-nw", "at": [34.4, 12.6]},
            {"kit": "mi-olive", "at": [14.4, 22.4]},
            {"kit": "mi-market", "at": [49.6, 40.6], "role": "shop"},
            {"kit": "mi-purple", "at": [14.2, 49.4], "role": "healer"},
            {"kit": "gr-green-cottage-s", "at": [47.0, 58.4]},
            {"kit": "mi-thatch", "at": [22.0, 39.4]},
        ],
        "props": [
            {"kit": "lamp-0", "at": [53.6, 22.6]}, {"kit": "lamp-0", "at": [31.4, 42.0]},
            {"kit": "lamp-0", "at": [37.2, 24.0]}, {"kit": "lamp-0", "at": [18.8, 22.8]},
            {"kit": "lamp-0", "at": [43.2, 58.6]},
            {"kit": "grave-0", "at": [8.0, 33.0]}, {"kit": "grave-2", "at": [10.6, 34.0]},
            {"kit": "grave-1", "at": [8.8, 36.6]},
            {"kit": "deadtree-1", "at": [43.0, 31.0]}, {"kit": "rocks", "at": [56.0, 50.0]},
            {"kit": "deadtree-0", "at": [26.0, 58.0]},
        ],
        "dressKinds": ["rock-s", "rock-s2", "deadtree-0"], "dress": 8,
    },
}
