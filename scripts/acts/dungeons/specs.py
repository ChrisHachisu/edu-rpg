"""Acts 2-5 dungeon specs, in the shape `scripts/build_dungeon_semantic.py` DUNGEONS uses.

FLOOR COUNTS AND BOSS IDS ARE THE SHIPPED BUNDLE'S, not src/data/maps.ts. The checked-in TS is
older than the game (AGENTS.md rule 1) and disagrees on 15 of 20 dungeons, e.g. ironMine is
`floors: 4, bossId: "oreColossus"` in dist/assets/index-BhoGQRaA.js against 3 / ironGolem in
maps.ts. Extracted 2026-10-28 from runtime/baselines/v1.17.1-ipad-hud-walk/assets/index-BhoGQRaA.js
(`python3 scripts/acts/dungeons/bundle_dungeons.py` re-derives the table and fails on drift).

`base` sizes are a PROPOSAL (Act 1's curve was owner-locked; Acts 2-5 have no locked curve yet).
They continue Act 1's growth: Act 1 floor-1 bases ran 32x28 .. 62x54.
`joints` were nudged by tune_specs.py until EVERY floor passes validate() (Act 1 was hand-
tuned the same way).
`theme` keys the material set (materials.py) and the TARGET/WATER grade (render_floors.py).
"""

# act, id, name, floors(bundle), base, joints, pattern, floorPatterns, theme, boss(bundle), extra
SPECS = [
    # ── Act 2 ──
    dict(act=2, id="ironMine", name="Iron Mine", floors=4, base=(50, 44), joints=(3, 91),
         pattern="network", built=True, theme="timbered iron mine", boss="oreColossus"),
    dict(act=2, id="stormNest", name="Storm Nest", floors=5, base=(44, 40), joints=(38, 142),
         pattern="spongework", theme="storm-swept sky crag", boss="stormHarpy",
         mechanic="wind"),
    dict(act=2, id="hauntedForest", name="Haunted Forest", floors=5, base=(48, 42),
         joints=(22, 76, 131), pattern="anastomotic", braid=1.8,
         theme="haunted root hollow", boss="phantomStag", mechanic="forest-maze"),
    dict(act=2, id="frozenLake", name="Frozen Lake", floors=5, base=(48, 42), joints=(14, 104),
         pattern="ramiform", theme="frozen lake ice cave", boss="iceWyrm", mechanic="ice"),
    dict(act=2, id="shadowCave", name="Shadow Cave", floors=5, base=(52, 44), joints=(28, 112),
         pattern="branchwork",
         floorPatterns={2: "spongework", 3: "network", 4: "anastomotic", 5: "loop"},
         theme="shadow-veined cave", boss="dragon", mechanic="darkness-pulse"),
    # ── Act 3 ──
    dict(act=3, id="oasisDepths", name="Oasis Depths", floors=5, base=(50, 42),
         joints=(19, 91, 153), pattern="anastomotic", braid=2.0,
         theme="oasis water cave", boss="sandSerpentQueen"),
    dict(act=3, id="desertTomb", name="Desert Tomb", floors=5, base=(50, 44), joints=(3, 93),
         pattern="network", built=True, theme="sandstone tomb", boss="sandGolem",
         mechanic="sand-trap"),
    dict(act=3, id="banditHideout", name="Bandit Hideout", floors=5, base=(50, 42),
         joints=(35, 121), pattern="spongework", built=True,
         theme="bandit hideout cave", boss="banditLord"),
    dict(act=3, id="scorchedRuins", name="Scorched Ruins", floors=5, base=(52, 44),
         joints=(10, 100), pattern="ramiform", built=True,
         theme="scorched ruins", boss="ashenGuardian"),
    # ── Act 4 ──
    dict(act=4, id="emberMines", name="Ember Mines", floors=5, base=(52, 44), joints=(1, 89),
         pattern="network", built=True, theme="ember mine", boss="magmaBeetleKing"),
    dict(act=4, id="magmaTunnels", name="Magma Tunnels", floors=5, base=(54, 46),
         joints=(18, 64, 154), pattern="anastomotic", braid=2.2,
         theme="magma tunnel", boss="lavaWyrm", mechanic="lava-course"),
    dict(act=4, id="obsidianCavern", name="Obsidian Cavern", floors=5, base=(54, 46),
         joints=(47, 139), pattern="spongework", theme="obsidian cavern",
         boss="crystalHydra"),
    dict(act=4, id="volcanicForge", name="Volcanic Forge", floors=7, base=(56, 48),
         joints=(15, 105), pattern="branchwork",
         floorPatterns={2: "anastomotic", 3: "network", 4: "spongework", 5: "ramiform",
                        6: "anastomotic", 7: "loop"},
         built=True, theme="volcanic forge", boss="flameTitan", mechanic="lava-course"),
    # ── Act 5 ──
    dict(act=5, id="demonBarracks", name="Demon Barracks", floors=6, base=(56, 48),
         joints=(-3, 87), pattern="network", built=True, theme="demon barracks",
         boss="warGeneralMalachar"),
    dict(act=5, id="voidRift", name="Void Rift", floors=6, base=(56, 48),
         joints=(30, 84, 148), pattern="spongework", theme="void rift", boss="nullDevourer"),
    dict(act=5, id="demonCastle", name="Demon Castle", floors=9, base=(58, 50), joints=(15, 105),
         pattern="branchwork",
         floorPatterns={2: "network", 3: "ramiform", 4: "spongework", 5: "anastomotic",
                        6: "network", 7: "ramiform", 8: "anastomotic", 9: "loop"},
         built=True, theme="demon castle", boss="demonKing", mechanic="mirror"),
    # ── Act 5 portal lands (each portal-overworld has one dungeon) ──
    dict(act=5, id="stormreachSpire", name="Stormreach Spire", floors=6, base=(52, 46),
         joints=(20, 110), pattern="ramiform", built=True, theme="sky spire",
         boss="stormSentinel", mechanic="wind-tower"),
    dict(act=5, id="frostfallCavern", name="Frostfall Cavern", floors=6, base=(52, 46),
         joints=(30, 118), pattern="branchwork", theme="frostfall ice cavern",
         boss="frostMonarch", mechanic="ice"),
    dict(act=5, id="sunkenTempleDungeon", name="Sunken Temple", floors=6, base=(52, 46),
         joints=(-3, 87), pattern="network", built=True, theme="sunken temple",
         boss="swordWraith", mechanic="maze-hunter"),
    dict(act=5, id="twilightDungeon", name="Twilight Realm", floors=6, base=(52, 46),
         joints=(18, 64, 140), pattern="anastomotic", braid=1.6, theme="twilight realm",
         boss="celestialGuardian", mechanic="shadow-portal"),
]

BY_ID = {s["id"]: s for s in SPECS}
