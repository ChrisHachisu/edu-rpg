"""Per-dungeon material recipes, derived ONLY from the four shipped Act 1 material sets.

Act 1 got each set from ONE image generation per theme (make_dungeon_materials.py), which is what
keeps a set self-consistent. Acts 2-5 have no generation step here (no image tool in the cloud
container), so every new set is a DERIVATION of those same 16 textures: same drawing hand, same
531 px tile, same texel scale. Each quadrant names (source dungeon, source quadrant, ops). The ops
are all periodic (wrap-mode filters, FFT noise, wrapped stamps) so a tileable source stays
tileable. Colour is then set by the renderer's own `grade()` against TARGET -- the same path Act 1
takes -- so the ops only add CHARACTER (frost, ore, veins, ash), never the base hue.

Value rule inherited from Act 1 (run_dungeon_art_batch.py, render_dungeon_material_map.TARGET):
the FLOOR is always the clearly lighter surface, the wall dark. Mood lives in the detail.
WATER is the accent pools' grade; for lava/void themes it is deliberately brighter than Act 1's
"hole in the value range" so the pool reads as glow, but it stays in the floor's value band, not
above it, so walkable floor is still the brightest large surface.
"""

SC, WW, MG, CR = "sunkenCellar", "whisperingWoodsCave", "mistyGrotto", "coastalReef"

# ops: list of (name, kwargs). See materials.py for the implementations.
T = {}

T["ironMine"] = dict(
    theme="timbered iron mine",
    floor=(WW, "floor", [("desat", {"k": 0.45})]),
    wall=(MG, "wall", [("desat", {"k": 0.6}), ("lift", {"k": 1.25}),
                       ("flecks", {"seed": 11, "n": 70, "rgb": (205, 120, 70), "r": 2.2}),
                       ("flecks", {"seed": 12, "n": 40, "rgb": (220, 222, 230), "r": 1.6})]),
    rubble=(SC, "rubble", [("desat", {"k": 0.5})]),
    accent=(SC, "accent", [("desat", {"k": 0.6})]),
    target={"floor": (118, 100, 80), "wall": (42, 33, 28)}, water=(56, 42, 34))

T["stormNest"] = dict(
    theme="storm-swept sky crag",
    floor=(SC, "floor", [("desat", {"k": 0.85})]),
    wall=(SC, "wall", [("desat", {"k": 0.7}),
                       ("veins", {"seed": 21, "rgb": (200, 225, 255), "w": 0.035, "a": 0.55})]),
    rubble=(SC, "rubble", [("desat", {"k": 0.8})]),
    accent=(CR, "accent", [("desat", {"k": 0.7})]),
    target={"floor": (120, 122, 128), "wall": (34, 40, 54)}, water=(44, 62, 86))

T["hauntedForest"] = dict(
    theme="haunted root hollow",
    floor=(WW, "floor", [("desat", {"k": 0.7})]),
    wall=(WW, "wall", [("desat", {"k": 0.55})]),
    rubble=(WW, "rubble", [("desat", {"k": 0.6})]),
    accent=(WW, "accent", [("desat", {"k": 0.4}),
                           ("flecks", {"seed": 31, "n": 26, "rgb": (190, 235, 220), "r": 1.8})]),
    target={"floor": (100, 102, 90), "wall": (28, 30, 34)}, water=(40, 54, 58))

T["frozenLake"] = dict(
    theme="frozen lake ice cave",
    floor=(SC, "floor", [("desat", {"k": 1.0}), ("smooth", {"s": 2.2, "k": 0.55}),
                         ("veins", {"seed": 41, "rgb": (255, 255, 255), "w": 0.02, "a": 0.45}),
                         ("flecks", {"seed": 42, "n": 90, "rgb": (255, 255, 255), "r": 1.2})]),
    wall=(MG, "wall", [("desat", {"k": 1.0}), ("lift", {"k": 1.45}),
                       ("flecks", {"seed": 43, "n": 120, "rgb": (235, 245, 255), "r": 1.4})]),
    rubble=(MG, "rubble", [("desat", {"k": 1.0}), ("lift", {"k": 1.5})]),
    accent=(CR, "accent", [("desat", {"k": 1.0}), ("smooth", {"s": 1.5, "k": 0.5})]),
    target={"floor": (150, 166, 182), "wall": (34, 50, 72)}, water=(70, 112, 146))

T["shadowCave"] = dict(
    theme="shadow-veined cave",
    floor=(MG, "floor", [("desat", {"k": 0.8})]),
    wall=(MG, "wall", [("desat", {"k": 0.9}),
                       ("veins", {"seed": 51, "rgb": (170, 110, 255), "w": 0.03, "a": 0.6})]),
    rubble=(MG, "rubble", [("desat", {"k": 0.8})]),
    accent=(MG, "accent", [("desat", {"k": 0.8})]),
    target={"floor": (96, 92, 108), "wall": (22, 18, 32)}, water=(44, 30, 70))

T["oasisDepths"] = dict(
    theme="oasis water cave",
    floor=(CR, "floor", [("desat", {"k": 0.9})]),
    wall=(CR, "wall", [("desat", {"k": 0.85})]),
    rubble=(CR, "rubble", [("desat", {"k": 0.8})]),
    accent=(CR, "accent", [("desat", {"k": 0.6})]),
    target={"floor": (152, 134, 100), "wall": (46, 36, 30)}, water=(30, 84, 90))

T["desertTomb"] = dict(
    theme="sandstone tomb",
    floor=(SC, "floor", [("desat", {"k": 0.7}), ("smooth", {"s": 1.2, "k": 0.3})]),
    wall=(SC, "wall", [("desat", {"k": 1.0})]),
    rubble=(SC, "rubble", [("desat", {"k": 0.9})]),
    accent=(CR, "floor", [("desat", {"k": 1.0})]),
    target={"floor": (162, 140, 102), "wall": (50, 38, 28)}, water=(110, 92, 66))

T["banditHideout"] = dict(
    theme="bandit hideout cave",
    floor=(WW, "floor", [("desat", {"k": 0.35})]),
    wall=(WW, "wall", [("desat", {"k": 0.5})]),   # v2: earth + root/timber, not tomb blocks
    rubble=(WW, "rubble", [("desat", {"k": 0.3})]),
    accent=(SC, "accent", [("desat", {"k": 0.5})]),
    target={"floor": (124, 104, 78), "wall": (38, 30, 24)}, water=(42, 46, 42))

T["scorchedRuins"] = dict(
    theme="scorched ruins",
    # v2 (after review of v1): v1 read as pale beige, not burnt. Darker soot-grey floor with ash
    # smudges, and the ember glints moved INTO the wall cracks so the ruin reads as still hot.
    floor=(SC, "floor", [("desat", {"k": 1.0}),
                         ("flecks", {"seed": 91, "n": 110, "rgb": (34, 30, 28), "r": 3.0}),
                         ("flecks", {"seed": 93, "n": 25, "rgb": (230, 110, 50), "r": 0.9})]),
    wall=(SC, "wall", [("desat", {"k": 1.0}),
                       ("veins", {"seed": 92, "rgb": (255, 110, 40), "w": 0.022, "a": 0.55})]),
    rubble=(MG, "rubble", [("desat", {"k": 1.0})]),
    accent=(MG, "accent", [("desat", {"k": 1.0})]),
    target={"floor": (96, 86, 80), "wall": (28, 22, 20)}, water=(52, 36, 30))

T["emberMines"] = dict(
    theme="ember mine",
    # v2: v1 shared ironMine's sources and read as the same mine. Dark cinder scree underfoot and
    # glowing seams in the rock make it the hot mine of Act 4, not the iron mine of Act 2.
    floor=(MG, "floor", [("desat", {"k": 1.0}), ("lift", {"k": 1.1}),
                         ("flecks", {"seed": 103, "n": 30, "rgb": (240, 120, 50), "r": 0.9})]),
    wall=(MG, "wall", [("desat", {"k": 1.0}), ("lift", {"k": 1.15}),
                       ("veins", {"seed": 104, "rgb": (255, 130, 40), "w": 0.02, "a": 0.5}),
                       ("flecks", {"seed": 101, "n": 90, "rgb": (255, 150, 50), "r": 1.8})]),
    rubble=(MG, "rubble", [("desat", {"k": 1.0})]),
    accent=(MG, "accent", [("desat", {"k": 1.0}),
                           ("veins", {"seed": 102, "rgb": (255, 170, 60), "w": 0.05, "a": 0.8})]),
    target={"floor": (116, 96, 84), "wall": (36, 24, 20)}, water=(150, 70, 30))

T["magmaTunnels"] = dict(
    theme="magma tunnel",
    floor=(MG, "floor", [("desat", {"k": 1.0}), ("lift", {"k": 1.1})]),
    wall=(MG, "wall", [("desat", {"k": 1.0}),
                       ("veins", {"seed": 111, "rgb": (255, 120, 30), "w": 0.03, "a": 0.75})]),
    rubble=(MG, "rubble", [("desat", {"k": 1.0})]),
    accent=(MG, "accent", [("desat", {"k": 1.0}),
                           ("veins", {"seed": 112, "rgb": (255, 190, 80), "w": 0.07, "a": 0.9})]),
    target={"floor": (100, 80, 70), "wall": (34, 20, 18)}, water=(220, 96, 30))   # v2: darker cinder floor, hotter pools

T["obsidianCavern"] = dict(
    theme="obsidian cavern",
    floor=(MG, "floor", [("desat", {"k": 0.9})]),
    wall=(MG, "wall", [("desat", {"k": 1.0}), ("contrast", {"k": 1.25}),
                       ("flecks", {"seed": 121, "n": 50, "rgb": (200, 160, 255), "r": 1.3})]),
    rubble=(MG, "rubble", [("desat", {"k": 1.0})]),
    accent=(MG, "accent", [("desat", {"k": 1.0})]),
    target={"floor": (104, 100, 112), "wall": (18, 16, 26)}, water=(56, 40, 86))

T["volcanicForge"] = dict(
    theme="volcanic forge",
    floor=(SC, "floor", [("desat", {"k": 1.0})]),
    wall=(SC, "wall", [("desat", {"k": 1.0}),
                       ("veins", {"seed": 131, "rgb": (255, 130, 40), "w": 0.025, "a": 0.6})]),
    rubble=(SC, "rubble", [("desat", {"k": 1.0})]),
    accent=(MG, "accent", [("desat", {"k": 1.0}),
                           ("veins", {"seed": 132, "rgb": (255, 190, 80), "w": 0.07, "a": 0.9})]),
    target={"floor": (120, 106, 96), "wall": (32, 24, 24)}, water=(180, 80, 30))

T["demonBarracks"] = dict(
    theme="demon barracks",
    floor=(WW, "floor", [("desat", {"k": 1.0})]),   # trampled drill-ground earth, not cellar silt
    wall=(SC, "wall", [("desat", {"k": 1.0})]),
    rubble=(SC, "rubble", [("desat", {"k": 1.0})]),
    accent=(SC, "accent", [("desat", {"k": 1.0})]),
    target={"floor": (110, 98, 102), "wall": (34, 20, 26)}, water=(50, 28, 52))

T["voidRift"] = dict(
    theme="void rift",
    floor=(MG, "floor", [("desat", {"k": 1.0}), ("lift", {"k": 1.05})]),
    wall=(MG, "wall", [("desat", {"k": 1.0}),
                       ("veins", {"seed": 151, "rgb": (150, 110, 255), "w": 0.03, "a": 0.7}),
                       ("flecks", {"seed": 152, "n": 80, "rgb": (230, 220, 255), "r": 1.0})]),
    rubble=(MG, "rubble", [("desat", {"k": 1.0})]),
    accent=(MG, "accent", [("desat", {"k": 1.0}),
                           ("flecks", {"seed": 153, "n": 60, "rgb": (255, 255, 255), "r": 1.0})]),
    target={"floor": (86, 84, 106), "wall": (16, 14, 32)}, water=(60, 40, 130))   # v2: v1 floor read near-white

T["demonCastle"] = dict(
    theme="demon castle",
    floor=(SC, "floor", [("desat", {"k": 1.0}), ("smooth", {"s": 1.0, "k": 0.25})]),
    wall=(SC, "wall", [("desat", {"k": 1.0}), ("contrast", {"k": 1.1})]),
    rubble=(SC, "rubble", [("desat", {"k": 1.0})]),
    accent=(SC, "accent", [("desat", {"k": 1.0})]),
    target={"floor": (112, 104, 118), "wall": (28, 22, 36)}, water=(46, 32, 64))

T["stormreachSpire"] = dict(
    theme="sky spire",
    floor=(SC, "floor", [("desat", {"k": 1.0}), ("lift", {"k": 1.05})]),
    wall=(SC, "wall", [("desat", {"k": 1.0})]),
    rubble=(SC, "rubble", [("desat", {"k": 1.0})]),
    accent=(CR, "accent", [("desat", {"k": 1.0})]),
    target={"floor": (142, 144, 152), "wall": (42, 50, 68)}, water=(62, 92, 132))

T["frostfallCavern"] = dict(
    theme="frostfall ice cavern",
    floor=(MG, "floor", [("desat", {"k": 1.0}), ("lift", {"k": 1.35}), ("smooth", {"s": 1.2, "k": 0.3}),
                         ("flecks", {"seed": 181, "n": 80, "rgb": (255, 255, 255), "r": 1.1})]),
    wall=(MG, "wall", [("desat", {"k": 1.0}), ("lift", {"k": 1.6}),
                       ("veins", {"seed": 182, "rgb": (220, 240, 255), "w": 0.03, "a": 0.55})]),
    rubble=(MG, "rubble", [("desat", {"k": 1.0}), ("lift", {"k": 1.5})]),
    accent=(CR, "accent", [("desat", {"k": 1.0}), ("smooth", {"s": 1.5, "k": 0.5})]),
    target={"floor": (156, 170, 190), "wall": (30, 46, 72)}, water=(74, 114, 152))

T["sunkenTempleDungeon"] = dict(
    theme="sunken temple",
    floor=(CR, "floor", [("desat", {"k": 0.8})]),
    wall=(SC, "wall", [("desat", {"k": 0.9})]),
    rubble=(CR, "rubble", [("desat", {"k": 0.7})]),
    accent=(CR, "accent", [("desat", {"k": 0.5})]),
    target={"floor": (122, 130, 116), "wall": (26, 40, 44)}, water=(30, 72, 82))

T["twilightDungeon"] = dict(
    theme="twilight realm",
    floor=(MG, "floor", [("desat", {"k": 1.0}), ("lift", {"k": 1.1})]),
    wall=(MG, "wall", [("desat", {"k": 1.0}),
                       ("flecks", {"seed": 201, "n": 70, "rgb": (255, 214, 140), "r": 1.3})]),
    rubble=(MG, "rubble", [("desat", {"k": 1.0})]),
    accent=(MG, "accent", [("desat", {"k": 1.0}),
                           ("flecks", {"seed": 202, "n": 50, "rgb": (255, 230, 170), "r": 1.0})]),
    target={"floor": (114, 106, 126), "wall": (26, 20, 40)}, water=(72, 52, 104))
