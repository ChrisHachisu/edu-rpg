#!/usr/bin/env python3
"""Hydrate and verify the preserved Quest of Knowledge shipped runtime.

This deliberately copies a reviewed static baseline. It never imports or invokes
Vite, TypeScript, npm, or the stale source build.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROFILE = "v1.17.1-ipad-hud-walk"
BASELINE = ROOT / "runtime" / "baselines" / PROFILE
MANIFEST = ROOT / "runtime" / "manifests" / f"{PROFILE}.json"
CANDIDATES = ROOT / "public" / "assets" / "monsters"
CANDIDATE_MANIFEST = ROOT / "runtime" / "manifests" / "regular-monster-candidates-v1.17.1.json"
BUNDLE = "assets/index-BhoGQRaA.js"
BUNDLE_SIZE = 4_987_581
BUNDLE_SHA256 = "a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381"
EXPECTED_FILE_COUNT = 257
EXPECTED_TOTAL_BYTES = 42_683_025
ACT1_OVERLAY_FILES = {
    # 2026-08-03, owner: "make the game controllable with the keypad ... use the joy stick type
    # keypad on the port sapphire screen". The 4-way d-pad held exactly ONE arrow key at a time
    # (setDir released the previous), so a diagonal was impossible and a corner boundary could
    # never be probed -- which is what the owner needs in order to test the three layers.
    # Replaced with the town overlay's analog stick: the knob follows the finger and the vector
    # engages each axis past 0.38 deflection, so it can hold two arrows at once.
    # 2026-08-05: the stick now also PUBLISHES its raw vector on window.__DQ_STICK__ beside the
    # arrow keys it already synthesises. The Act 1 dungeon floors move continuously against a
    # collision shape derived from the art, and four arrow keys can only express eight headings.
    # The key events are unchanged, so the overworld and the towns -- which read Phaser cursors --
    # are untouched; only dq-tiles.js, and only where it holds a mask, reads the extra channel.
    "index.html": (15094, "0f3dd23c7bce7b2f9d9ec41f09d280be3d3c623f0e747e49d9cbd8301f1df46f"),
    # 2026-08-01, owner-authorised: dq-tiles.js now splats AI-generated terrain MATERIALS through
    # its existing continuous-world-pixel drawTerrain, plus a ridged mountain height field,
    # varied shore character and landmark sites derived from mapData. Fallback-safe -- until the
    # textures decode, and permanently if they 404, it renders the original palette ramps.
    # Method: docs/MATERIAL-RENDERER-METHOD.md
    # 2026-08-03, owner-authorised: dq-tiles.js additionally overrides scene.mapData for the three
    # Act-1 dungeons whose generated floor count matches the bundle (coastalReef, sunkenCellar,
    # whisperingWoodsCave) and blits the matching pre-rendered floor art in place of the procedural
    # dungeon draw. mapData is the engine's collision seam -- canMove() indexes it directly -- so
    # layout and collision move together. Fallback-safe: no JSON, no override; no floor art, the
    # procedural draw still runs. mistyGrotto and crystalCave are deliberately out of scope.
    # 2026-08-06, owner: mistyGrotto ("Darkfang Grotto", the Act 1 boss dungeon) JOINS that scope
    # with its first three floors. It is the first entry whose generated count does NOT match the
    # bundle -- 3 authored against `floors: 5` -- which is what had held it back; B4F and B5F keep
    # the procedural map they already have, because a1dFloorFor() and a1dArtFor() are both gated on
    # the per-floor lookup. crystalCave stays out (6 against a declared 5, plus "never modify
    # Crystal Cave"). Rationale in full on A1D_MAPS in public/dq-tiles.js.
    # Same day, follow-up: the override now also replays persisted progress (looted chest 4->8,
    # defeated boss 7->10/12) onto the swapped map. The engine does that replay inside loadMap and
    # our swap lands after it, so without this a looted chest returned closed on every re-entry.
    # 2026-08-04, owner direction ("this needs to be baked in the game now"): inside the Act 1
    # plate dq-tiles.js no longer SPLATS terrain at all -- it blits the owner-locked baked chunks
    # 1:1 (48 px/cell == TILE, the same relationship a1dBlit has with the dungeon floors), lifts
    # their canopy mask above the hero, and draws the nine shipped landmark sprites on their
    # MEASURED ground anchors from act1-hifi/landmarks/landmarks.json instead of the old flat
    # OW_PROP houses. Chunk bases were verified pixel-equivalent to act1-material-map.png before
    # the cutover. Every asset it reads was already registered; only this file's identity moves.
    # 2026-08-05, owner direction (having played Sunken Cellar B3F: "the player does not walk
    # smoothly and the user blockers are not synced with the visual design ... if the dungeon is
    # fundamentally build on square design and engine, this is a major problem"): inside the three
    # Act 1 dungeon floors that ship a mask, dq-tiles.js replaces the engine's 48 px step tween
    # with CONTINUOUS movement against `<floor>-walk.png` -- the renderer's own floor field at its
    # own 0.5 threshold, so the blocker and the visible edge cannot disagree. It wraps
    # sys.sceneUpdate (Phaser captures scene.update at create(), so a scene.update wrapper is never
    # called) and neutralises the engine's step by forcing its own `isMoving` around the inner
    # call. heroTileX/heroTileY are re-derived every frame, so encounters, checkTransition, the
    # compass, the minimap and the save format are untouched. Fallback-safe: no mask, no change.
    # 2026-08-05 (same day, owner on device: "the player seems like they are walking above the red
    # rim. is there some overlap?"): that mover collided at hero.x/hero.y, which is the CENTRE of a
    # setOrigin(.5) sprite -- about her waist -- so with rock to the south she stopped with her feet
    # ~19 px inside it and with rock to the north she stopped a visible gap short. It now collides
    # at her GROUND CONTACT POINT, (hero.x, hero.y + footDy), where footDy is MEASURED off the walk
    # sheet at runtime (bottom-most opaque row of frame 0 relative to the frame centre, times the
    # sprite's runtime scale: 64 px frame, sole row 62, scale 1.0125 -> 30.88 px) rather than
    # hardcoded, because that sheet has already been re-cut once. Foot radius, substep, sliding and
    # speed are unchanged, and heroTileX/heroTileY still come from the sprite centre so the CELL
    # save format round-trips to itself (measured: 742 of 754 reportable cells reload unchanged, the
    # other 12 settle one cell north once; largest rescue nudge 28 px against a 96 px bound).
    "dq-tiles.js": (
        238451, "8ae92d4698361c204db0dd203b120a6e4f499ee82566eb85577197f0b3893e7f"),
    # 2026-08-03, owner direction ("please redo the collision setting based on what i created (my
    # paint)"): the Act-1 collision plate is now generated from the OWNER'S PAINTED TERRAIN
    # (owner-terrain.json acts.1 + continent-macro-g3/land-mask.npy) instead of the generated
    # semantic map the owner rejected on 29 Jul, so collision matches the art it had drifted 46.9%
    # away from. The eight destination doors moved to the owner's placement, and the override now
    # also patches checkTransition + getCompassTarget so the bundle's frozen connection and compass
    # tables follow them. Source: scripts/act1_owner_paint_plate.mjs.
    # It also reinstates itself: leaving a town hands the overworld a NEW mapData array under the
    # same reskin key, so the plate was never re-applied and every door reverted (found in-game).
    # 2026-08-03, owner: "use the canonical g3 as the default and stop using anything else."
    # Three different characters were shipping at once -- the tile runtime (overworld + every
    # dungeon) drew the closed-helm knight while the act1-hifi town overlay drew the g3 heroine,
    # so leaving Port Sapphire swapped your protagonist. hero-override.js now carries a single
    # VARIANTS entry, which is what makes the swap total: a stale localStorage hero-variant or an
    # old save's heroVariant fails the guard and falls through to g3 instead of resurrecting the
    # old sheet. The 48px sheet is a RE-CUT of the canonical 64px g3 asset, not new art --
    # scripts/build_hero_g3_walk.py, soles aligned to the shipped sheet's measured baseline so the
    # hero does not float. The two retired sheets stay on disk: they are baseline runtime files.
    "hero-override.js": (8336, "c8454a9e168289469bf9403011faa35e66ee75a703895ca320cd4086d435ce75"),
    # Re-pinned 2026-08-06: the g3 source sheet's NORTH row (row 4) was damaged art -- drawn
    # ~15% oversize, so the crown was sheared flat off the top of the cell -- and walking north
    # is the one direction the tile runtime draws from it. Replaced with generated pixels;
    # scripts/bake_hero_north_row.py carries the provenance and the eight reverted attempts.
    "assets/hero/hero-g3-walk.png": (59447, "070a8a452c3dda775bd6c8593a66d57a5a13d97b9fb33378ea5b2bb0e1fded3c"),
    "act1-world-map.js": (
        47_908, "e5713be14ece51788798893c09a057d601d486671f97254dfb1825077ffe26b4"),
}
# The four tiling terrain materials the renderer above samples. New runtime paths as of
# 2026-08-01; pinned by hash rather than merely tolerated, because they are shipped art and a
# silent swap would change every frame of the overworld.
ACT1_MATERIAL_FILES = {
    "materials/mat-forest.png": (
        603_397, "e2bd92984bf2b0f927b039bbf3047419ddafb764f2ea822ae9c039c5ca38a71a"),
    "materials/mat-grass.png": (
        660_235, "9fa43b08867a4344ebc36dd581e806bf2d833ee4ca924f1ce7f517a57ca3fb76"),
    "materials/mat-rock.png": (
        674_501, "e2573d08fb2eac036b0888795f1e6a1787e35d9acd7f44cbff80fb5e6e7518ae"),
    "materials/mat-water.png": (
        451_430, "78b08a4cfda57d9a7d763e95c461ad5d2c0bbe442b4135e9df95cdaf8339dcc7"),
}
# The semantic floor data the dungeon override reads, plus the baked floor renders it blits. Pinned
# by hash for the same reason as the terrain materials above: these ARE the shipped dungeon layouts
# and art, and a silent swap would change both what the player sees AND where the walls are. Only
# floors that have a render appear here; every other floor falls back to the procedural draw until
# it is rendered and pinned. New runtime paths as of 2026-08-03.
ACT1_DUNGEON_FILES = {
    "act1-dungeon-floors.json": (
        54654, "705b72dbf2de2c5f5529933a54b8edbba2cd79c422d5e55d35e9285c757ea3d8"),
    "act1-dungeon-art/sunkenCellar-f1-props.png": (
        2946580, "fc240d107d80828ef79b2f7bfc94a7786934d2fa60b7cb268ed68b442ffd6f48"),
    "act1-dungeon-art/sunkenCellar-f2-props.png": (
        3741822, "8c20ba9a180e82c334a55431a72ac64cced57fda6cf027521ae1056719babc66"),
    "act1-dungeon-art/sunkenCellar-f3-props.png": (
        4223531, "64784d156ef3e47f9450a75b2c7f555e898f61a1808722de234c0d2c5583b86f"),
    # 2026-08-05: THE COLLISION SHAPE, and therefore as much a shipped authority as the picture it
    # comes from. Each is `fw` -- the renderer's own floor field -- thresholded at the same 0.5
    # that decides every pixel of the matching *-props.png, emitted at that render's own
    # 48 px/cell by `render_dungeon_material_map.py --emit-mask` through the SHARED floor_field().
    # A 1-bit PNG, 5.5-8.8 kB a floor. Pinned by hash for the reason the floors above are: a
    # silent swap would move the walls. The three renders were re-baked at the same time and came
    # back byte-identical, so extracting floor_field() provably did not touch a rendered pixel
    # (docs/DUNGEON-EDGE-STYLE-LOCK.md).
    "act1-dungeon-art/sunkenCellar-f1-walk.png": (
        5528, "f74829777ba3835c04808a711e47e9f2ac66ba52de5eae4915352c29e77888b9"),
    "act1-dungeon-art/sunkenCellar-f2-walk.png": (
        7389, "aac585dbea7af54f07052f3690ba05da0a69e8c9c1fcd35507d1047b87017c41"),
    "act1-dungeon-art/sunkenCellar-f3-walk.png": (
        8892, "81ebb3d48a3b581d703bb47ee4b11be7a9fb1ebbf7a46bffb06925b8ddfa1b09"),
    # 2026-08-06, owner: DARKFANG GROTTO (mistyGrotto), the Act 1 boss dungeon, shipped no baked
    # art at all and paid the full procedural cost on every entry. Its first three floors are now
    # baked at the locked 0.95 wall face; B4F and B5F have no authored layout (the bundle declares
    # `floors: 5`) and keep the procedural map, which a1dFloorFor()/a1dArtFor() handle per floor.
    # These are the largest floors in Act 1 -- 46x40 cells on f3 -- so they are also the heaviest
    # art the runtime carries.
    "act1-dungeon-art/mistyGrotto-f1-props.png": (
        6303192, "25abb89e5886fce4f709fb6326927d0903b66d10842ddf024308c468e8a7d9de"),
    "act1-dungeon-art/mistyGrotto-f2-props.png": (
        7750562, "4ae7c8a04c93177f46257b0d73c36b6915d36ff541fa108d05ce69ba234c70d1"),
    "act1-dungeon-art/mistyGrotto-f3-props.png": (
        9109701, "ca962cdc86ff48600f7e5331630606727a74dfa7c615d726263ade87eba64ed5"),
    "act1-dungeon-art/mistyGrotto-f1-walk.png": (
        13946, "9d7fed7ffe630e138d0804dcbbc630c6330527746da294e54c3ce4327836c41b"),
    "act1-dungeon-art/mistyGrotto-f2-walk.png": (
        16414, "d81992fb0afb1202c6c667ee35ebb86106d7324e023323334226aeae04fae80d"),
    "act1-dungeon-art/mistyGrotto-f3-walk.png": (
        19187, "fe38023f0fb93d2a0b5d37ed58964de51101b91a42858d941f997b0c5a5a0a9a"),
    # 2026-08-06: coastalReef and whisperingWoodsCave were already in A1D_MAPS scope but had NO
    # art -- they took the generated floor layout and then drew it procedurally. Both now ship the
    # same baked look as the cellar. That completes every Act 1 dungeon except crystalCave, which
    # is deliberately untouched.
    "act1-dungeon-art/coastalReef-f1-props.png": (
        13137148, "0003c87be562375615f1b50233732ae37774bf088a43218e17ddd151cc22b5c3"),
    "act1-dungeon-art/coastalReef-f2-props.png": (
        9976103, "5fadcc55c6451c7b3982cc76536be009a9c3c4990380c9c1b2566263772e1700"),
    "act1-dungeon-art/coastalReef-f3-props.png": (
        13793971, "23ced05050b27be229f9599ee20cbcacae25ea795a8c7764df6252eadd551903"),
    "act1-dungeon-art/coastalReef-f1-walk.png": (
        17629, "12065cd25f9117234cd2f5f5b34d7336f315b7ffd8cf3be784117e459e284479"),
    "act1-dungeon-art/coastalReef-f2-walk.png": (
        17938, "d3501fb536228df206cfd700743b00e66552012fef9965d16a07598a66951963"),
    "act1-dungeon-art/coastalReef-f3-walk.png": (
        23165, "d7f6467ca90715d156c6dac1f0d556d36aeaccf3aad18750c3193afb302330f1"),
    "act1-dungeon-art/whisperingWoodsCave-f1-props.png": (
        4984943, "e7be4df8953b86db2826dbed0526874de1c88ac325c65f48c75c232c4b28c3ab"),
    "act1-dungeon-art/whisperingWoodsCave-f2-props.png": (
        5860889, "31d6c254e5d7b0ae5e50e91942ab390319513bfc6f2dd9235dfe62c373cd6994"),
    "act1-dungeon-art/whisperingWoodsCave-f3-props.png": (
        6869610, "c9c1a54bb599ce1cac68329d194b239256266d47b5e1354e19df7a9ba2ba341a"),
    "act1-dungeon-art/whisperingWoodsCave-f1-walk.png": (
        10588, "779ac2b711e22ea396725d48c49ed4d06a6414ce9d2f0557008bcb6a5024088a"),
    "act1-dungeon-art/whisperingWoodsCave-f2-walk.png": (
        12793, "33b71b2bcc058d6b9fa03229d1e18b6c817102e97019d5e67c0c58521e63fd4f"),
    "act1-dungeon-art/whisperingWoodsCave-f3-walk.png": (
        13859, "92fc8af5bad87721733c4d0e5fed42efeef62405fe0b749789b45b3256218dd3"),
}
# 2026-08-03, owner-authorised: the Port Sapphire town screen. `adapter.js` is gated to TOWNS
# ONLY, so this surface is what the overlay actually raises; the overworld stays on the shipped
# tile runtime. Pinned by hash for the same reason as the dungeon floors above -- the walkable
# JSON IS the collision, so a silent swap moves the walls, and the screen PNG is the ground the
# collision was derived from. town.html carries the touch interact route and the safe-area
# insets without which none of shop / healer / save is reachable on a phone.
# `verify/seed.html` is a verification helper, not game content: it writes localStorage
# ['edu-rpg-save'] so a tester can reach a map without walking. It ships because the web build
# has no other way to seed; on iOS use scripts/seed_ios_save.py instead (the in-app WebView has
# no URL bar). Pinned so it cannot quietly grow into something that mutates real save data.
ACT1_TOWN_FILES = {
    "act1-hifi/town.html": (
        19_205, "1ba9fe933f71d1139c65eb182ff875d7441b03db996a7a9c4d0043fb3f6d14da"),
    "act1-hifi/town/portSapphire-town.json": (
        2_748, "51b45860151b23a983220b79409a9f04ab9f962988ea9725971bfa316b3a0b19"),
    "act1-hifi/town/portSapphire-walkable.json": (
        31259, "07a743f4328c744d17b4b7292cfda13e28bf18e1cebdf83507c255311b5ebdf0"),
    "act1-hifi/town/portSapphire-screen.png": (
        6_973_000, "87a04490428c6ae26ed238a50949646b64c0cf11770dd06336a0075e07b4dc4c"),
    "act1-hifi/town/npc/portSapphire-drake-4x3-64.png": (
        51_557, "9a5ec1a3fc1f7e7077f9d30f89f6e044878211cf45b370a41e0c224500af4af3"),
    "act1-hifi/town/npc/portSapphire-healer-4x3-64.png": (
        50_519, "93e7edb092c0aab3cc9a922bd2397af4232caeced15270074a356377bbf3b3f4"),
    "act1-hifi/town/npc/portSapphire-sailor-4x3-64.png": (
        44_604, "585a14be6724a84dac872b82325bfaf70237974134693ceb549bb34873b6a90b"),
    "act1-hifi/town/npc/portSapphire-wisewoman-4x3-64.png": (
        46_937, "390c12022a813f8cd0c6894988b18e7bebab8d7facee63c9c5d67575b8615c0b"),
    "act1-hifi/verify/seed.html": (
        1_807, "2981408c66159992d66cee9f02a1963a0eb3c79ba4718c4b58497dcd5f4ac5c6"),
}
# 2026-08-03, owner-authorised ("hi-fi needs to be finished and used as the final act 1
# overworld design"): the Act 1 landmark sprites, for RUNTIME compositing.
# CODEX-ART-BRIEF-V7 is explicit -- "landmarks are composited at runtime as sprites (owner
# decision 2026-07-30); bases carry only the site: a bare packed-earth pad" -- so the
# landmark-FREE r26 terrain bake is correct and always was. What was missing is this half:
# the sprites existed since 30 Jul and nothing ever shipped or drew them, so the hi-fi
# overworld rendered bare earth where every town and dungeon should stand.
# Pinned by hash because these ARE the shipped landmarks: a silent swap changes what the
# player navigates by. landmarks.json carries each sprite's MEASURED ground anchor (the
# widest band of its silhouette, i.e. the base ellipse) rather than a guessed percentage --
# the owner caught that failure directly: "the assets don't look like they are floating and
# the patch underneath the town is in the wrong place".
# Generated by scripts/build_act1_landmark_runtime.py.
ACT1_LANDMARK_FILES = {
    "act1-hifi/landmarks/coastal-reef.png": (
        25_614, "a5f32a2b3761f29b3a13aa80b74b3f762e9793ee83dbba7a1e6b2a6fdd2e2c41"),
    "act1-hifi/landmarks/crystal-cave.png": (
        28_179, "a39bfdfa82cd36dbca0d9bcd11b029f23cfc2b288f7657b4e9723531ea93bfa2"),
    "act1-hifi/landmarks/darkfang.png": (
        30_673, "41e3e7f9fac3a7ab8f53402c2bc1c312ecf9b854f33062cf8e04765d0aeaa279"),
    "act1-hifi/landmarks/greenhollow.png": (
        65_028, "958b6bc727cceb8d88c16939ce9d01245d7b4781c4c3b1f64c208edc39c09573"),
    "act1-hifi/landmarks/landmarks.json": (
        3_138, "103c00eca55272f6a4ca83c749060d6d822c721043494c15b306aefce1e22e44"),
    "act1-hifi/landmarks/millbrook.png": (
        69_617, "05d648fbca6ec6bf5753ee86d149ac433c9f93ec0d44471ae900084836efb0b0"),
    "act1-hifi/landmarks/misty-grotto.png": (
        23_421, "bd8e2af135c398ea17138ce0c390b76ac2bc186ec174f20578550de48b50928e"),
    "act1-hifi/landmarks/port-sapphire.png": (
        78_566, "7834c4217d1678dd7791830725f6471fb122a2449490373ad84fe5bd4b4f74cd"),
    "act1-hifi/landmarks/sunken-cellar.png": (
        19_878, "91cc4479b28edb9c335cc027e79ccee3dd3aa34235ccda037f5b694fae2c69e9"),
    "act1-hifi/landmarks/whispering-woods.png": (
        24_652, "d9181e19428d46e750edf02f39d6f5a1980fef72f4ed225c5606f52f8b9bb099"),
}
ACT1_HIFI_RUNTIME = (
    ROOT / "design" / "review" / "overworld-art-blueprint" / "act-by-act" / "act1" / "runtime-v2"
)
ACT1_R26_RUNTIME = ACT1_HIFI_RUNTIME / "act1-final-art-geometry-r26" / "runtime"
# 2026-08-03, owner-authorised ("bank the art now"): the r26 chunk art was re-baked at 48 px/tile
# from the MATERIAL renderer -- i.e. from the owner's painted terrain -- replacing the 16 px/tile
# chunks derived from candidate-art.png, the painterly plate the owner rejected on 29 Jul. Three
# consequences are pinned here:
#   * base is WebP, not PNG;
#   * the `occlusion` layer is gone, replaced by `canopy`, an ALPHA-ONLY mask (23 kB for all 30
#     chunks against 7.9 MB) that the runtime cuts out of the base it already holds;
#   * `source` names scripts/render_material_map.py instead of candidate-art.png.
# Total payload 18.0 MB against 19 MB, at three times the linear resolution.
# NOTE: scripts/promote_act1_r26_runtime.py is SUPERSEDED by this and must not be run -- it
# regenerates the 16 px chunks from candidate-art.png and would overwrite the bake.
ACT1_HIFI_MANIFEST_SHA256 = "0c773b18de2956450d7bb7b4716dc66d39fd196bb0c133b15d977da7db2e5988"
# The chunk layers the shipped tree must carry, read out of the locked manifest above. `occlusion`
# was retired with the 48 px bake; a stale entry here would make the gate demand a file that no
# longer exists and reject the one that replaced it.
ACT1_HIFI_CHUNK_LAYERS = ("base", "water", "canopy")

BACKGROUND_KEYS = {
    "boss_celestial_guardian",
    "boss_demon_king",
    "boss_frost_monarch",
    "boss_storm_sentinel",
    "boss_sword_wraith",
    "canyon",
    "cave_misty",
    "coast",
    "demon_castle",
    "desert",
    "forest",
    "frozen",
    "grass_plains",
    "haunted_wood",
    "magma",
    "mountains",
    "obsidian",
    "storm_peak",
    "tomb_ruins",
    "void",
}
OVERWORLD_PROPS = {
    "owprop-village-48.png",
    "owprop-cave-48.png",
    "owprop-castle-48.png",
    "owprop-portal-48.png",
    "owprop-shadow-cave-128.png",
    "owprop-signpost-48.png",
    "owprop-storm-nest-48.png",
    "owprop-crystal-cave-128.png",
    "owprop-ice-cave-128.png",
    "owprop-desert-tomb-128.png",
    "owprop-desert-signpost-48.png",
}
DUNGEON_PROPS = {
    "dqprop-boss-marker-128.png",
    "dqprop-chest-closed-128.png",
    "dqprop-chest-open-128.png",
    "dqprop-locked-door-left-128.png",
    "dqprop-locked-door-right-128.png",
    "dqprop-portal-128.png",
    "dqprop-save-point-128.png",
    "dqprop-stairs-down-128.png",
    "dqprop-stairs-up-128.png",
    "dqprop-wind-barrier-128.png",
}
REQUIRED_ROOT_FILES = {
    "index.html",
    "dq-tiles.js",
    "hero-override.js",
    "ui-overhaul.js",
    "ui-overhaul.css",
}


class BaselineError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def files_under(root: Path) -> dict[str, Path]:
    if not root.is_dir():
        raise BaselineError(f"runtime directory does not exist: {root}")
    if any(path.is_symlink() for path in root.rglob("*")):
        raise BaselineError(f"runtime directory contains a symlink: {root}")
    return {
        path.relative_to(root).as_posix(): path
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def category(relative_path: str) -> str:
    if relative_path == BUNDLE:
        return "opaque-bundle"
    if relative_path in REQUIRED_ROOT_FILES:
        return "shell-or-override"
    if relative_path.startswith("assets/monsters/"):
        return "shipped-regular-monster"
    if relative_path.startswith("assets/monsters-hd/"):
        return "hd-monster"
    if relative_path.startswith("assets/item-icons/"):
        return "item-icon"
    if relative_path.startswith("assets/backgrounds/"):
        return "battle-background"
    if relative_path.startswith("assets/hero/"):
        return "hero-walk-sheet"
    if relative_path.startswith("owprops/"):
        return "overworld-prop"
    if relative_path.startswith("props/"):
        return "dungeon-prop"
    raise BaselineError(f"unclassified runtime file: {relative_path}")


def manifest_for(source: Path) -> dict[str, object]:
    found = files_under(source)
    entries = []
    for relative_path, path in found.items():
        entries.append(
            {
                "path": relative_path,
                "category": category(relative_path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
        )
    return {
        "schema": 1,
        "profile": PROFILE,
        "provenance": {
            "source": "preserved local shipped runtime",
            "baseBundle": "v1.17.0-first-fixes.js",
            "profileRelease": "v1.17.1-ipad-hud-walk",
            "deployment": "local baseline only; gh-pages and TestFlight unchanged",
        },
        "saveCompatibility": {
            "manualKey": "edu-rpg-save",
            "autosaveKey": "edu-rpg-autosave",
            "schemaVersion": 4,
            "migrationChain": ["v1-to-v2 floor", "v2-to-v3 sound", "v3-to-v4 quests"],
        },
        "fileCount": len(entries),
        "totalBytes": sum(entry["bytes"] for entry in entries),
        "files": entries,
    }


def load_manifest() -> dict[str, object]:
    if not MANIFEST.is_file():
        raise BaselineError(f"manifest does not exist: {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schema") != 1 or manifest.get("profile") != PROFILE:
        raise BaselineError("runtime manifest schema or profile mismatch")
    return manifest


def semantic_checks(root: Path, found: dict[str, Path]) -> None:
    regular = {
        Path(path).stem.removeprefix("monster-")
        for path in found
        if path.startswith("assets/monsters/") and path.endswith(".png")
    }
    hd = {
        Path(path).stem.removeprefix("monster-")
        for path in found
        if path.startswith("assets/monsters-hd/") and path.endswith(".webp")
    }
    items = {path for path in found if path.startswith("assets/item-icons/")}
    backgrounds = {
        Path(path).stem.removeprefix("bg-")
        for path in found
        if path.startswith("assets/backgrounds/")
    }
    overworld_props = {Path(path).name for path in found if path.startswith("owprops/")}
    dungeon_props = {Path(path).name for path in found if path.startswith("props/")}

    if len(regular) != 75:
        raise BaselineError(f"expected 75 regular monsters, found {len(regular)}")
    if hd != regular:
        raise BaselineError("HD and regular monster basename sets differ")
    if len(items) != 58:
        raise BaselineError(f"expected 58 item icons, found {len(items)}")
    if backgrounds != BACKGROUND_KEYS:
        raise BaselineError("battle-background allowlist mismatch")
    if overworld_props != OVERWORLD_PROPS:
        raise BaselineError("overworld-prop allowlist mismatch")
    if dungeon_props != DUNGEON_PROPS:
        raise BaselineError("dungeon-prop allowlist mismatch")

    bundle_path = root / BUNDLE
    if bundle_path.stat().st_size != BUNDLE_SIZE or sha256(bundle_path) != BUNDLE_SHA256:
        raise BaselineError("protected 4.99 MB bundle identity mismatch")
    bundle = bundle_path.read_bytes()
    for monster in regular:
        if monster.encode("utf-8") not in bundle:
            raise BaselineError(f"monster is absent from bundle preload registry: {monster}")
    for marker in (b"edu-rpg-save", b"edu-rpg-autosave"):
        if marker not in bundle:
            raise BaselineError(f"save compatibility marker missing: {marker.decode()}")

    html = (root / "index.html").read_text(encoding="utf-8")
    for reference in (
        "assets/index-BhoGQRaA.js",
        "ui-overhaul.css",
        "ui-overhaul.js",
        "dq-tiles.js",
        "hero-override.js",
    ):
        if reference not in html:
            raise BaselineError(f"shipped shell reference missing: {reference}")
    if "/src/main.ts" in html:
        raise BaselineError("shipped shell points at the stale TypeScript entrypoint")


def verify(root: Path, allowed_extra: frozenset[str] = frozenset()) -> None:
    manifest = load_manifest()
    expected_entries = {entry["path"]: entry for entry in manifest["files"]}
    all_found = files_under(root)
    missing = sorted(set(expected_entries) - set(all_found))
    extra = sorted(set(all_found) - set(expected_entries))
    if missing or not set(extra).issubset(allowed_extra):
        raise BaselineError(f"runtime path set mismatch; missing={missing}, extra={extra}")
    found = {path: all_found[path] for path in expected_entries}
    for relative_path, expected in expected_entries.items():
        path = found[relative_path]
        if path.stat().st_size != expected["bytes"]:
            raise BaselineError(f"size mismatch: {relative_path}")
        if sha256(path) != expected["sha256"]:
            raise BaselineError(f"hash mismatch: {relative_path}")
    if manifest["fileCount"] != EXPECTED_FILE_COUNT or len(found) != EXPECTED_FILE_COUNT:
        raise BaselineError("runtime file-count guard failed")
    total = sum(path.stat().st_size for path in found.values())
    if manifest["totalBytes"] != EXPECTED_TOTAL_BYTES or total != EXPECTED_TOTAL_BYTES:
        raise BaselineError("runtime byte-total guard failed")
    semantic_checks(root, found)


def verify_act1_overlay(root: Path, allowed_extra: frozenset[str] = frozenset()) -> None:
    """Verify the immutable runtime plus the three reviewed Act 1 additive changes."""
    manifest = load_manifest()
    expected_entries = {entry["path"]: entry for entry in manifest["files"]}
    all_found = files_under(root)
    hifi_manifest_path = ACT1_R26_RUNTIME / "manifest.json"
    if sha256(hifi_manifest_path) != ACT1_HIFI_MANIFEST_SHA256:
        raise BaselineError("locked Act 1 high-fidelity manifest identity changed")
    hifi_manifest = json.loads(hifi_manifest_path.read_text(encoding="utf-8"))
    if hifi_manifest.get("revision") != 11:
        raise BaselineError("locked Act 1 high-fidelity manifest revision changed")
    hifi_files = {
        "index.html": "runtime.html",
        "manifest.json": "manifest.json",
        "walkable-regions-r26.json": "walkable-regions-v1.json",
        "walkable-polygons.js": "walkable-polygons.js",
        "walkable-route-state.js": "walkable-route-state.js",
        "path-corridor.js": "path-corridor.js",
        "hero-g3/hero-act1-female-walk-8x3-64-g3.png":
            "hero-g3/hero-act1-female-walk-8x3-64-g3.png",
    }
    for chunk in hifi_manifest["chunks"]:
        for key in ACT1_HIFI_CHUNK_LAYERS:
            hifi_files[chunk[key]] = chunk[key]
    expected_hifi_paths = {f"act1-hifi/{target}" for target in hifi_files.values()}
    expected_hifi_paths.add("act1-hifi/adapter.js")
    expected_paths = (set(expected_entries) | {"act1-world-map.js"} | expected_hifi_paths
                      | set(ACT1_MATERIAL_FILES) | set(ACT1_DUNGEON_FILES)
                      | set(ACT1_TOWN_FILES) | set(ACT1_LANDMARK_FILES)
                      # ACT1_OVERLAY_FILES began as pure OVERRIDES of paths the baseline
                      # manifest already carried, so it was never part of this union. It can
                      # now also ADD a runtime file (hero-g3-walk.png), which the manifest by
                      # definition does not know about, so it has to be unioned in too.
                      | set(ACT1_OVERLAY_FILES))
    extra_paths = set(all_found) - expected_paths
    if expected_paths - set(all_found) or not extra_paths.issubset(allowed_extra):
        missing = sorted(expected_paths - set(all_found))
        extra = sorted(set(all_found) - expected_paths)
        raise BaselineError(f"Act 1 runtime path set mismatch; missing={missing}, extra={extra}")

    for relative_path, expected in expected_entries.items():
        if relative_path in ACT1_OVERLAY_FILES:
            expected_size, expected_hash = ACT1_OVERLAY_FILES[relative_path]
        else:
            expected_size, expected_hash = expected["bytes"], expected["sha256"]
        path = all_found[relative_path]
        if path.stat().st_size != expected_size or sha256(path) != expected_hash:
            raise BaselineError(f"Act 1 runtime identity mismatch: {relative_path}")

    for relative_path, (mat_size, mat_hash) in ACT1_MATERIAL_FILES.items():
        mat = all_found[relative_path]
        if mat.stat().st_size != mat_size or sha256(mat) != mat_hash:
            raise BaselineError(f"Act 1 terrain material identity mismatch: {relative_path}")
        public_mat = ROOT / "public" / relative_path
        if not public_mat.is_file() or public_mat.read_bytes() != mat.read_bytes():
            raise BaselineError(f"public/dist material twins differ: {relative_path}")

    for relative_path, (dng_size, dng_hash) in ACT1_DUNGEON_FILES.items():
        dng = all_found[relative_path]
        if dng.stat().st_size != dng_size or sha256(dng) != dng_hash:
            raise BaselineError(f"Act 1 dungeon identity mismatch: {relative_path}")
        public_dng = ROOT / "public" / relative_path
        if not public_dng.is_file() or public_dng.read_bytes() != dng.read_bytes():
            raise BaselineError(f"public/dist dungeon twins differ: {relative_path}")

    for relative_path, (town_size, town_hash) in ACT1_TOWN_FILES.items():
        town = all_found[relative_path]
        if town.stat().st_size != town_size or sha256(town) != town_hash:
            raise BaselineError(f"Act 1 town identity mismatch: {relative_path}")
        public_town = ROOT / "public" / relative_path
        if not public_town.is_file() or public_town.read_bytes() != town.read_bytes():
            raise BaselineError(f"public/dist town twins differ: {relative_path}")

    # Overlay files the baseline manifest does NOT carry are additions, so the manifest loop
    # above never checked them. Verify their identity here or they would ship unpinned.
    for relative_path, (ov_size, ov_hash) in ACT1_OVERLAY_FILES.items():
        if relative_path in expected_entries:
            continue                                    # already covered by the manifest loop
        ov = all_found[relative_path]
        if ov.stat().st_size != ov_size or sha256(ov) != ov_hash:
            raise BaselineError(f"Act 1 overlay addition identity mismatch: {relative_path}")
        public_ov = ROOT / "public" / relative_path
        if not public_ov.is_file() or public_ov.read_bytes() != ov.read_bytes():
            raise BaselineError(f"public/dist overlay twins differ: {relative_path}")

    for relative_path, (lm_size, lm_hash) in ACT1_LANDMARK_FILES.items():
        lm = all_found[relative_path]
        if lm.stat().st_size != lm_size or sha256(lm) != lm_hash:
            raise BaselineError(f"Act 1 landmark identity mismatch: {relative_path}")
        public_lm = ROOT / "public" / relative_path
        if not public_lm.is_file() or public_lm.read_bytes() != lm.read_bytes():
            raise BaselineError(f"public/dist landmark twins differ: {relative_path}")

    overlay_path = all_found["act1-world-map.js"]
    overlay_size, overlay_hash = ACT1_OVERLAY_FILES["act1-world-map.js"]
    if overlay_path.stat().st_size != overlay_size or sha256(overlay_path) != overlay_hash:
        raise BaselineError("Act 1 runtime identity mismatch: act1-world-map.js")

    for source_relative, target_relative in hifi_files.items():
        source_root = ACT1_R26_RUNTIME if (
            source_relative in {"manifest.json", "walkable-regions-r26.json"}
            or source_relative.startswith("chunks/")
        ) else ACT1_HIFI_RUNTIME
        source = source_root / source_relative
        target = all_found[f"act1-hifi/{target_relative}"]
        if source.read_bytes() != target.read_bytes():
            raise BaselineError(f"Act 1 high-fidelity runtime identity mismatch: {target_relative}")
    public_adapter = ROOT / "public" / "act1-hifi" / "adapter.js"
    dist_adapter = all_found["act1-hifi/adapter.js"]
    if not public_adapter.is_file() or public_adapter.read_bytes() != dist_adapter.read_bytes():
        raise BaselineError("public/dist Act 1 high-fidelity adapter twins differ")

    semantic_checks(root, all_found)
    html = all_found["index.html"].read_text(encoding="utf-8")
    if "act1-world-map.js" not in html or html.index("act1-world-map.js") > html.index("dq-tiles.js"):
        raise BaselineError("Act 1 override must load before dq-tiles.js")
    if "act1-hifi/adapter.js" not in html or html.index("act1-hifi/adapter.js") < html.index("hero-override.js"):
        raise BaselineError("Act 1 high-fidelity adapter must load after preserved overrides")
    public_overlay = ROOT / "public" / "act1-world-map.js"
    public_dq = ROOT / "public" / "dq-tiles.js"
    if not public_overlay.is_file() or public_overlay.read_bytes() != overlay_path.read_bytes():
        raise BaselineError("public/dist Act 1 override twins differ")
    if not public_dq.is_file() or public_dq.read_bytes() != all_found["dq-tiles.js"].read_bytes():
        raise BaselineError("public/dist dq-tiles twins differ")


def hydrate(output: Path) -> None:
    verify(BASELINE)
    if output.exists() or output.is_symlink():
        raise BaselineError(f"refusing to overwrite existing output: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copytree(BASELINE, output)
        verify(output)
    except Exception:
        if output.exists():
            shutil.rmtree(output)
        raise
    print(f"HYDRATE PASS: {PROFILE} -> {output}")


def write_manifest(confirm_profile: str) -> None:
    if confirm_profile != PROFILE:
        raise BaselineError(f"rebaseline confirmation must be exactly: {PROFILE}")
    data = manifest_for(BASELINE)
    if data["fileCount"] != EXPECTED_FILE_COUNT or data["totalBytes"] != EXPECTED_TOTAL_BYTES:
        raise BaselineError("refusing to write manifest for an unexpected runtime closure")
    semantic_checks(BASELINE, files_under(BASELINE))
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"MANIFEST WRITTEN: {MANIFEST}")


def candidate_manifest_for() -> dict[str, object]:
    shipped = files_under(BASELINE / "assets" / "monsters")
    candidates = files_under(CANDIDATES)
    if set(shipped) != set(candidates) or len(candidates) != 75:
        raise BaselineError("regular-monster candidate and shipped filename sets differ")
    entries = []
    for name, path in candidates.items():
        candidate_hash = sha256(path)
        shipped_hash = sha256(shipped[name])
        if candidate_hash == shipped_hash:
            raise BaselineError(f"candidate unexpectedly matches shipped runtime: {name}")
        entries.append(
            {
                "path": f"public/assets/monsters/{name}",
                "bytes": path.stat().st_size,
                "sha256": candidate_hash,
                "shippedSha256": shipped_hash,
                "status": "unapproved-candidate",
            }
        )
    return {
        "schema": 1,
        "family": "regular-monsters",
        "runtimeBaseline": False,
        "disposition": "preserved candidates; never hydrate without individual owner approval",
        "fileCount": len(entries),
        "files": entries,
    }


def load_candidate_manifest() -> dict[str, object]:
    if not CANDIDATE_MANIFEST.is_file():
        raise BaselineError(f"candidate manifest does not exist: {CANDIDATE_MANIFEST}")
    manifest = json.loads(CANDIDATE_MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schema") != 1 or manifest.get("family") != "regular-monsters":
        raise BaselineError("candidate manifest schema or family mismatch")
    return manifest


def verify_candidates() -> None:
    expected = load_candidate_manifest()
    actual = candidate_manifest_for()
    if actual != expected:
        raise BaselineError("regular-monster candidate manifest mismatch")


def write_candidate_manifest(confirm: str) -> None:
    if confirm != "unapproved-candidates":
        raise BaselineError("candidate confirmation must be exactly: unapproved-candidates")
    data = candidate_manifest_for()
    CANDIDATE_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    CANDIDATE_MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"CANDIDATE MANIFEST WRITTEN: {CANDIDATE_MANIFEST}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    hydrate_parser = subparsers.add_parser("hydrate", help="copy the verified baseline to a new directory")
    hydrate_parser.add_argument("--output", type=Path, default=ROOT / "dist")
    verify_parser = subparsers.add_parser("verify", help="verify a baseline or hydrated directory")
    verify_parser.add_argument("--input", type=Path, default=BASELINE)
    verify_parser.add_argument(
        "--allow-capacitor-glue",
        action="store_true",
        help="allow only Capacitor's generated cordova.js and cordova_plugins.js extras",
    )
    verify_act1_parser = subparsers.add_parser(
        "verify-act1", help="verify the preserved runtime plus the locked Act 1 additive overlay"
    )
    verify_act1_parser.add_argument("--input", type=Path, default=ROOT / "dist")
    verify_act1_parser.add_argument(
        "--allow-capacitor-glue",
        action="store_true",
        help="allow only Capacitor's generated cordova.js and cordova_plugins.js extras",
    )
    manifest_parser = subparsers.add_parser("write-manifest", help="lead-only explicit baseline promotion")
    manifest_parser.add_argument("--confirm-profile", required=True)
    subparsers.add_parser("verify-candidates", help="verify the preserved unapproved monster candidates")
    candidate_parser = subparsers.add_parser(
        "write-candidate-manifest", help="lead-only candidate snapshot refresh"
    )
    candidate_parser.add_argument("--confirm", required=True)
    subparsers.add_parser("blocked-build", help="explain why the stale build is disabled")
    args = parser.parse_args()

    try:
        if args.command == "hydrate":
            hydrate(args.output.resolve())
        elif args.command == "verify":
            allowed_extra = (
                frozenset({"cordova.js", "cordova_plugins.js"})
                if args.allow_capacitor_glue
                else frozenset()
            )
            verify(args.input.resolve(), allowed_extra)
            print(f"VERIFY PASS: {args.input.resolve()}")
        elif args.command == "verify-act1":
            allowed_extra = frozenset({"cordova.js", "cordova_plugins.js"}) if args.allow_capacitor_glue else frozenset()
            verify_act1_overlay(args.input.resolve(), allowed_extra)
            print(f"ACT 1 OVERLAY VERIFY PASS: {args.input.resolve()}")
        elif args.command == "write-manifest":
            write_manifest(args.confirm_profile)
        elif args.command == "verify-candidates":
            verify_candidates()
            print(f"CANDIDATE VERIFY PASS: {CANDIDATE_MANIFEST}")
        elif args.command == "write-candidate-manifest":
            write_candidate_manifest(args.confirm)
        else:
            raise BaselineError(
                "The stale Vite/TypeScript build is quarantined because it does not reproduce "
                "the shipped 4.99 MB game. Use `npm run hydrate` and `npm run verify:runtime`."
            )
    except BaselineError as error:
        print(f"RUNTIME BASELINE ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
