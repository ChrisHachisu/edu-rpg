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
import struct
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROFILE = "v1.17.1-ipad-hud-walk"
BASELINE = ROOT / "runtime" / "baselines" / PROFILE
MANIFEST = ROOT / "runtime" / "manifests" / f"{PROFILE}.json"
CANDIDATES = ROOT / "public" / "assets" / "monsters"
CANDIDATE_MANIFEST = ROOT / "runtime" / "manifests" / "regular-monster-candidates-v1.17.1.json"
BUNDLE = "assets/index-BhoGQRaA.js"
# IF YOU ARE ABOUT TO MOVE THESE TWO CONSTANTS, READ docs/MUSIC-INTEGRATION-READY.md FIRST.
# There is a prepared, verified, owner-approved change WAITING for the next bundle edit: swapping the
# procedural Tone.js BGM for orchestral .m4a loops, which needs 54 bytes added to the bundle's own
# window.__QOK literal. The owner declined to re-stamp the provenance chain for a soundtrack ALONE
# (2026-08-17, verbatim: "Wait and bundle it with the next edit"), so its trigger is precisely this
# moment -- someone editing the bundle for an unrelated reason. Installing it in the SAME pass
# re-stamps the pins once instead of twice. Its licence gate is CLEARED, so this edit is the only
# thing it is waiting for -- nothing else needs asking.
# The note lives HERE rather than only in that doc because whoever needs it arrives from the pin
# side, not the music side.
BUNDLE_SIZE = 4_987_635
BUNDLE_SHA256 = "ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456"
EXPECTED_FILE_COUNT = 257
# 2026-08-25, owner-authorised: +54 bytes. The orchestral BGM's one-line hook into the bundle's
# existing __QOK literal (audio: Jt), per docs/MUSIC-INTEGRATION-READY.md. The bundle is frozen
# and hand-edited, so this constant, BUNDLE_SIZE/BUNDLE_SHA256, the manifest, the preserved
# baseline COPY of the bundle, repin.sh's md5 tripwire and eight other provenance points all
# move together -- they are one identity chain, not independent numbers.
EXPECTED_TOTAL_BYTES = 42_683_079
ACT1_OVERLAY_FILES = {
    # 2026-09-21: additive loss/retry guard. It restores the live player after
    # defeat without changing the frozen bundle and polls until its hooks exist.
    "battle-recovery.js": (
        7024, "b653552259676ee4061bb2c10663e88c799ea6f150290fd59108d00f2b4a6c4e"),
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
    # 2026-08-11: the diagnostic panel gains one attribution line (sp/cv/tx2/pl) fed by
    # __DQ_TILES__.cost(). Sign-off + reasoning: EXPECTED_STATIC_INDEX_SHA in
    # scripts/build_static_index.mjs. Both copies of this hash must move together.
    # 2026-08-17: the panel gains the RENDER CHAIN and the debug default is ON for this build only,
    # so the owner's phone can answer whether the fuzziness is a global upscale. Same sign-off:
    # EXPECTED_STATIC_INDEX_SHA in scripts/build_static_index.mjs.
    # 2026-09-23 owner-approved startup WebGL retry: exact derived shell only; authored root
    # index.html SHA 5156ba054806578d670dfcf8303957e770ac3e7458c50f73154d8ab6590b686a ->
    # 656eeacf9d29d7c9d350e16b390f8f96cac3f8a039c96b78e87c5cdea35a16bd. Shell 125052 B /
    # 52a058593efb1b901a42203bfd7ad591024946eb9f6db513a86c3a9babe69e25 -> 129636 B /
    # 3de643bdde7c7dc15ce602d4a3e0529e74df54db21899269a4b1a385d48fc0fe. Frozen game bundle,
    # art, source maps and all other pinned runtime entries remain unchanged.
    "index.html": (130411, "735d33eebc2bbff798262c5800bd410f83b747cf936ff2e33c18a3b8e1ee099e"),
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
    # Updated 2026-10-03 for the approved scoped forest+mountain visible-terrain union.
    "dq-tiles.js": (
        603596, "ea2fbe9387c350867cffba1d8ff605f48351a1633e73060f606f6601e1542ea8"),
    # 2026-08-07: THE OVERWORLD'S COLLISION SHAPE, baked -- the overworld's answer to the dungeons'
    # `<floor>-walk.png` above, and as much a shipped authority as they are. Deriving it at runtime
    # was correct and unaffordable: owmBuild() evaluated waterField/mountainField per pixel over a
    # 1584x1872 window and chamfered the result, measured on device at 434-492 ms (mean ~470 ms,
    # six samples over two launches) against a 40 ms budget, once every 2.2 s of walking. This is
    # the same field, evaluated once at build time over the whole Act 1 plate and stored as a
    # clamped chamfer distance, sparse by map cell -- 4,578 cells carry pixels, the other 40,710
    # are one of two sentinels. The runtime assembles a window out of it with a fill or a copy per
    # cell instead of 2.965 M field evaluations plus two sweeps.
    # A RAW BUFFER, not a PNG, deliberately: the dungeon masks are thresholded at >127 and so are
    # immune to what a canvas does to their pixels, while this carries EXACT distances and
    # drawImage/getImageData is not a documented byte-preserving path on iOS. Pinned by hash for
    # the reason the dungeon masks are -- a silent swap would move the coastline the hero stops at.
    # Reproducible: scripts/bake_act1_overworld_walk.mjs, whose --check verifies the digest of its
    # three inputs (the frozen bundle's generator, dq-tiles.js's consolidator, dq-tiles.js's own
    # field functions, which the bake SLICES rather than re-implements so the two cannot drift).
    "act1-overworld-walk.bin": (
        9688672, "00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6"),
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
    "hero-override.js": (13069, "20d00157c4f4fff92bf89ce5d66d87d48ba624f1d6a402ec9dcead92b8f9744b"),
    # Re-pinned 2026-08-06: the g3 source sheet's NORTH row (row 4) was damaged art -- drawn
    # ~15% oversize, so the crown was sheared flat off the top of the cell -- and walking north
    # is the one direction the tile runtime draws from it. Replaced with generated pixels;
    # scripts/bake_hero_north_row.py carries the provenance and the eight reverted attempts.
    "assets/hero/hero-g3-walk.png": (59447, "070a8a452c3dda775bd6c8593a66d57a5a13d97b9fb33378ea5b2bb0e1fded3c"),
    # The male counterpart, added 2026-08-17 when the owner restored the character-create "Look"
    # picker as a real choice. Cut from its own 192x512 source by the same
    # scripts/build_hero_g3_walk.py --variant male, so both heroes share one row map and one sole
    # baseline. IT MUST BE PINNED HERE OR IT NEVER REACHES dist/ -- a tracked-but-unstaged asset
    # has silently killed a boss animation and the town foreground layer before, with every gate
    # still green, because staging and git are two different lists.
    "assets/hero/hero-male-walk.png": (59032, "88cbed8f9d707b216ada01e108eedd5822c6bcfc69c8dd22af2457f231dc0976"),
    "act1-world-map.js": (
        55792, "fb466fc6dbe7e05ccbb209c70867cacf4f903d55837ea69ca716e81f7196c96f"),
    # 2026-08-06, from device: the Port Sapphire movement stick was anchored bottom-LEFT and its
    # lower half sat behind the field tab bar, where the overworld and every dungeon put the same
    # control bottom-right and fully visible. The town runs in a same-origin IFRAME
    # (act1-hifi/town.html), and `env(safe-area-inset-*)` inside one is not the root scroller's
    # inset -- it reads 0 -- so the town pad's own clearance calc had been adding nothing. The
    # parent already probes the true insets here in measureSafeArea(); this entry is that
    # measurement being published as window.__QOK_SAFE__ so act1-hifi/adapter.js can post it, and
    # the control-orientation setting, into the frame. First override of this file since the
    # v1.17.1 baseline was frozen, which is why it had no entry before.
    "ui-overhaul.js": (
        202286, "569336baf507260efd4abbd27176d215d3c7d8644a7280fd0e250300eef4d05d"),
    # 2026-08-06, owner pick: "Charcoal & Gold Leaf" (direction 4 of
    # design/ui-overhaul/chic-style-board.html). The same gold as before -- the pixel art, the
    # dungeon plates and the town screens were all approved against it -- spent differently:
    # charcoal panels, 1px hairlines instead of 2px frames, no 5px hard drop-shadow under every
    # button, and gold FILLED on exactly one element per screen, whichever is selected.
    # This entry also carries the @font-face pair. See UI_ASSET_FILES below for why the typeface is
    # bundled rather than fetched; the short version is that it never reached the phone at all.
    # Like ui-overhaul.js above, first override of this file since the baseline was frozen.
    "ui-overhaul.css": (
        58872, "a4cfcf4b1ccee6b8a30562a3f2aeb5e861376ea72d461b1eaffb9412c0d51939"),
}
# 2026-08-06, owner-picked ("Charcoal & Gold Leaf", direction 4 of
# design/ui-overhaul/chic-style-board.html): the chrome the theme needs on disk rather than
# over the network -- the UI typeface, and the generated tab-bar glyph sheet below it.
#
# The font the game asked for had never reached the phone. ui-overhaul.css @imported M PLUS
# Rounded 1c from fonts.googleapis.com, dist/fonts/ did not exist, and the Capacitor app has no
# network -- so every menu, battle and title screen rendered in system-ui on device while the
# field HUD, hard-coded to -apple-system, rendered in a third face. Bundling it is the fix; it
# was listed as an open item on 2026-06-29 and stayed open.
#
# Two files, not Google's 244. The css2 endpoint splits a Japanese family into 122 unicode-range
# subsets PER WEIGHT, and every file under dist/ is a registered runtime file here, so that route
# meant registering ~250 assets to ship one typeface. scripts/build_ui_font.py subsets the OFL
# originals to 7,382 glyphs -- the 753 kanji and 145 kana measured out of the shipped text, plus
# the font's own CJK coverage so a player-typed name does not fall back mid-word.
#
# OFL.txt ships because OFL-1.1 requires the licence to travel with the fonts. It is not loaded
# at runtime; it is registered so it cannot be dropped by a sync that only knows about .woff2.
UI_ASSET_FILES = {
    "fonts/zen-maru-gothic-500.woff2": (
        1_536_444, "24ff5c102895e312ab53cd5d012b9f45dfc712963c544b02247005414aa6cbb5"),
    "fonts/zen-maru-gothic-700.woff2": (
        1_566_980, "10112760e5a48c0e8d22659ad0676b7dd7cbba3f36e68b18bda2692d63e98b37"),
    "fonts/OFL.txt": (
        4_402, "2a20cf7ce1909d8ee1e949095d340f7d7656705f7c810a2d6faf56800ad0cb3d"),
    # 2026-08-06, owner: "have codex generate better bottom tab icons ... the current ones look a
    # bit wonky". The worst was equip -- a FILLED sword rotated 42 degrees, which at 22px reads as
    # a lopsided X rather than a blade. Replaced by a generated four-glyph family (person, pouch,
    # upright sword, gear) drawn to one stroke weight.
    #
    # It is one sheet and it is an ALPHA MASK, not a picture: four 128px cells stamped out of
    # currentColor, so both tab bars keep their own active/inactive tinting and a palette change
    # needs no re-export. Recovered from the generator's output by scripts/build_tab_icons.py --
    # the model was asked for a transparent canvas and returned an OPAQUE one with the
    # transparency chequerboard painted into it as pixels, which is silent unless you check
    # hasAlpha, and would have shipped a grey chequer behind every icon.
    "ui-icons/tab-icons.png": (
        16813, "3fa2ce1db739431c32daa4c3e02afa7ff8df3f1ec7e2e0846891df07555b8332"),
    # 2026-08-07, owner, on the battle command mockups: "A looks the best ... have codex generate
    # new and better icons for that screen". Variant A drops the coloured button blocks, so a
    # command's colour survives ONLY in its glyph tint -- which is why this is the same kind of
    # asset as the tab sheet above and not a picture: four 128px cells stamped out of
    # currentColor. Order: attack, defend, item, flee. It replaces four hand-written <symbol>s,
    # one of which (qok-shieldw) hardcoded fill="#fff" and could not be tinted at all.
    #
    # ART SWAPPED 2026-08-07, same day, same mechanism: owner on the solid-icon round, "for the
    # icons i like the Struck Relief" -- candidate B, filled bodies with the interior detail
    # knocked out. Geometry is unchanged (512x128, four cells, white on transparent), so this is a
    # drop-in and nothing in ui-overhaul.{js,css} moved. The pin changed because the ART changed.
    #
    # Its raw source came back on a GREEN SCREEN rather than the near-black the brief asked for,
    # and a luminance key cannot see that: pure green sits mid-ramp, so the shipped keyer would
    # have rendered the whole background at 75% opacity -- a slab that reads as bad art, not as a
    # keying bug. build_battle_icons.py detects the background from the corners instead.
    # Recovered from the generator's output by scripts/build_battle_icons.py.
    "ui-icons/battle-icons.png": (
        13974, "02e54ad33746deee6f7f8ba4f417b33a74c08dc05e16fab91e0d1e9fd529bcdc"),
    # 2026-08-07, owner pick on design/mockups/overworld-minimap-semantic.html: variant B,
    # "Relief" -- flat land, no road network, "tells you where you are, not where to go".
    #
    # The whole 320x400 overworld terrain, baked once at 6 px/cell, so the minimap draws with one
    # drawImage window blit instead of the 6,402 fillRect calls it issued up to 4.5 times a second
    # on the main thread. 6 px/cell is the DEVICE number, not a round one: 402x702 CSS at dpr 3
    # puts ~450 device px across the 80-tile window, i.e. 5.6 px/tile, so 6 covers dpr 3 without
    # upscaling.
    #
    # It is an INDEXED png with a 23-colour palette, and that is load-bearing twice over. As
    # 24-bit with smooth shelf and canopy ramps the same image is 567 KB, because a continuous
    # gradient defeats PNG's row filters; and the flat banding is what "Relief" is for.
    #
    # Generated by scripts/bake_overworld_minimap.py from generateOverworldMap(320,400) with the
    # Act 1 snapshot overrides applied -- the map the game actually collides with. That script
    # refuses to write unless all 128,000 cell centres carry the grid's own class, so this file
    # cannot ship disagreeing with collision.
    "ui-map/overworld-relief.png": (
        130031, "3dfc6903cf0dc4b357aba8a71a1e79cea6ec30c030f2435066a1237cd468d9d0"),
    # 2026-08-25, owner-authorised: the ORCHESTRAL BGM (docs/MUSIC-INTEGRATION-READY.md).
    # Nine .m4a loops plus the player that swaps them in through the bundle's existing __QOK audio
    # hook. Deferred since 2026-08-17 to ride along with "the next bundle edit"; the owner took it
    # as its own edit on 2026-08-25 after noticing the music was still unchanged on build 60 --
    # the bundle is frozen, so the edit it was waiting for was never going to arrive on its own.
    # Pinned by hash like every other shipped asset: a silent swap of a music file is exactly as
    # invisible as a silent swap of art, and the override FAILS SOFT (it keeps the chiptune) so a
    # missing or corrupt track would not announce itself at runtime.
    "music-override.js": (23398, "c2caf8474172b280bd0a3264e49f529b8c053c69a9025cb8a62b044125df5476"),
    "audio/battle.m4a": (366808, "ec61f086099d4c9ea687563597198bdf17a9360e9861eb64d02ee9dbb6b8aa00"),
    "audio/bossBattle.m4a": (366492, "4fe64bc355274c1193a695c343a5cb39152e3d62709ecf26cb1bf71cfeaee254"),
    "audio/dungeon.m4a": (366236, "6ae4b9707338920f2c3bf410495217db9985ed65f55a1dd623aea091ee6ed029"),
    "audio/finalBoss.m4a": (366262, "7566985d95213c882255f529fe70c5577eab0eef736035e372cc3e33bd54c022"),
    "audio/gameOver.m4a": (183513, "55fcc4ab89b0b7e217a59faf286be2cde1dedfdfa8f1c153a2ac65dbbdc93cbd"),
    "audio/overworld.m4a": (366566, "0a2eb04e1aa904ff5ab5aa729c8a29aa0b1e7ec10896964231fa9ed2a134552a"),
    "audio/title.m4a": (366326, "f27f874ab003b43c11284a4ef0b49febf477536fe8ba4c67d406218242d8acd0"),
    "audio/town.m4a": (366307, "b04c35ba53b5add18f353d6d6b08395a8630291bafa3c4b34c7135a258366647"),
    "audio/victory.m4a": (147043, "89da12fead02cc8aa47884a9eb6f3ba3c8e5a89a4eb116bffec8769f2d7fb773"),
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
        60541, "6c0dff6bd43ce3cc22757000fc488986a4240a8a0787034c68317a8352a50f28"),
    # 2026-08-15, item 4 (boss defeat animation): the ONLY file under act1-dungeon-art/assets/
    # this staging list carries. That whole directory was a review/design-eval asset library for
    # the 'material' layer fallback (window.__A1_DNG_LAYER__='material', never the shipped
    # default) and none of it was ever enumerated here -- present in public/, tracked in git, and
    # silently absent from dist/ and the iOS payload, exactly the trap this file's own module
    # docstring warns about. a1dBossVanish (public/dq-tiles.js) is the first NORMAL-play caller of
    # a1dAssetTex('boss'), so it is the first thing that would have silently lost its animation
    # (the dark mask still draws; the sprite never would have) without this entry.
    "act1-dungeon-art/assets/asset-boss.png": (
        2949, "e15a52c9fef74427e9ac6324ac7a2fa6271593313ca090e78a7b4c5557c69a92"),
    # 2026-08-18: THE OVERHEAD LAYER, one per floor-1 cave mouth. Owner, build 48: "something that
    # the player walks under needs to be on a completely separate layer." These carry the arch's
    # crown WITH ALPHA so the hero shows through the archway opening and the floor, which a crop of
    # the opaque props plate could never do. Pinned for the same reason the walk masks are: a silent
    # swap changes what the player can see herself behind.
    # THEY ARE PINNED **BECAUSE** THE GATE CANNOT SEE THEM OTHERWISE. Baked into public/ and copied
    # to dist/ by hand, they passed every gate while reaching NEITHER dist/ nor the iOS payload --
    # build-dist.sh assembles from this enumeration, so an unpinned new file is silently dropped from
    # the shipped app and the ship gate still says PASS. Caught by counting the files on disk.
    "act1-dungeon-art/coastalReef-f1-overhead.png": (
        17483675, "10f3d9e40cea686ba4c0e612380cae087f11edfd015a4a11927dc5615b18165d"),
    "act1-dungeon-art/mistyGrotto-f1-overhead.png": (
        7782376, "06caa62a423d66ab0be66824dfed07966ed360b7ab1fc64a73ab6e05bbc0d25d"),
    "act1-dungeon-art/sunkenCellar-f1-overhead.png": (
        3858171, "489c96d550b2651fb991cf518324fe0e448bc58d4eac6b03dd3e5368f7980f88"),
    "act1-dungeon-art/whisperingWoodsCave-f1-overhead.png": (
        6351577, "1b033b907bd88b0d36c9ca691d7b2d72c8ae0ef30af47dd7b578a8aea582a570"),
    "act1-dungeon-art/sunkenCellar-f1-props.png": (
        3523624, "5d49e92a14975a7ea1d2414bbf41d9a8d854289f26e10f2707ff789b5adde2fa"),
    "act1-dungeon-art/sunkenCellar-f2-props.png": (
        4450607, "d554a6f6dc9a1cdaa6f906f3628ed49f913e07514379a4435e36e7bd600975e6"),
    "act1-dungeon-art/sunkenCellar-f3-props.png": (
        4919097, "f24b6f62b9cfe6b29aea93b761a5fdc3a1cde9686c2bf9b5bd721b0710ac3b85"),
    # 2026-08-05: THE COLLISION SHAPE, and therefore as much a shipped authority as the picture it
    # comes from. Each is `fw` -- the renderer's own floor field -- thresholded at the same 0.5
    # that decides every pixel of the matching *-props.png, emitted at that render's own
    # 48 px/cell by `render_dungeon_material_map.py --emit-mask` through the SHARED floor_field().
    # A 1-bit PNG, 5.5-8.8 kB a floor. Pinned by hash for the reason the floors above are: a
    # silent swap would move the walls. The three renders were re-baked at the same time and came
    # back byte-identical, so extracting floor_field() provably did not touch a rendered pixel
    # (docs/DUNGEON-EDGE-STYLE-LOCK.md).
    "act1-dungeon-art/sunkenCellar-f1-walk.png": (
        6380, "b3cd2f2560ca1de0c9a4aa9b373c422acadbbfcffb5fefff87ce901f3da0a7d4"),
    "act1-dungeon-art/sunkenCellar-f2-walk.png": (
        6975, "b22ccd7a8e74917db5bd5f745f87fab6f77cbab438c4a76b9153518cd11f300f"),
    "act1-dungeon-art/sunkenCellar-f3-walk.png": (
        9381, "62f4a54de3dd7ac552cec0dd56bde9a5a4cf57e568c38e6fb6de195b6553a378"),
    # 2026-08-06, owner: DARKFANG GROTTO (mistyGrotto), the Act 1 boss dungeon, shipped no baked
    # art at all and paid the full procedural cost on every entry. Its first three floors are now
    # baked at the locked 0.95 wall face; B4F and B5F have no authored layout (the bundle declares
    # `floors: 5`) and keep the procedural map, which a1dFloorFor()/a1dArtFor() handle per floor.
    # These are the largest floors in Act 1 -- 46x40 cells on f3 -- so they are also the heaviest
    # art the runtime carries.
    "act1-dungeon-art/mistyGrotto-f1-props.png": (
        7195792, "e8d426db42349e334eed41f6de9f45cabfa678a0bf240589bfef81b0043b4ad9"),
    "act1-dungeon-art/mistyGrotto-f2-props.png": (
        8729746, "ca773c0d752d074890ded0cde6794d5fd1d243aef473840bdf03c85449e5e578"),
    "act1-dungeon-art/mistyGrotto-f3-props.png": (
        10368229, "7e3361ca906950b2ea49220a3542cd6dba9b5c381132b035c5de0c786171103e"),
    "act1-dungeon-art/mistyGrotto-f1-walk.png": (
        14969, "a10d33bc97432dc232c909cbe64990f493b5eee0935679a058a6566acd2288e7"),
    "act1-dungeon-art/mistyGrotto-f2-walk.png": (
        15692, "e9e708e18ef7a1d3113b4f2672dd74e8bd2014bfa5d012b5fff06f3f18b8f9b4"),
    "act1-dungeon-art/mistyGrotto-f3-walk.png": (
        18383, "a8601e0b048fdac07b82557c01a39e92c277cfa8f879bba4a9059e92d30d3507"),
    # 2026-08-06: coastalReef and whisperingWoodsCave were already in A1D_MAPS scope but had NO
    # art -- they took the generated floor layout and then drew it procedurally. Both now ship the
    # same baked look as the cellar. That completes every Act 1 dungeon except crystalCave, which
    # is deliberately untouched.
    "act1-dungeon-art/coastalReef-f1-props.png": (
        15879377, "ce5762e8d54d7a6d9469524d9a0967969279344948356fece4ca5bdb4d8fd0e0"),
    "act1-dungeon-art/coastalReef-f2-props.png": (
        12186036, "5e1d342eed3cc211640385542dfc29fcfdb66d79c027c0cea2cfc064df1a0d36"),
    "act1-dungeon-art/coastalReef-f3-props.png": (
        16643525, "d200ad48956873f5a02cc8b3bda2f3892c39da73e6712bd76e9be14b86e6ee86"),
    "act1-dungeon-art/coastalReef-f1-walk.png": (
        19181, "0f3f2e5bad80b086afe42f94b821afcb15b4da9070d496eecacf8ffa607896a3"),
    "act1-dungeon-art/coastalReef-f2-walk.png": (
        15886, "d87ab060c071c2147bcd0e0d09c0f059719cda0b3247bdf890c3297c96da4cb2"),
    "act1-dungeon-art/coastalReef-f3-walk.png": (
        21392, "fae098891c34f6740c9dc5fad0261f344f088e039c59543d5eeea0d51c72a4c5"),
    "act1-dungeon-art/whisperingWoodsCave-f1-props.png": (
        5778362, "00fb45c180dc4789491229295b660206e572783f067aaf04cab3f9c8665f1ea6"),
    "act1-dungeon-art/whisperingWoodsCave-f2-props.png": (
        6704619, "27c77958f625a222eebd4406989a762790abcbddcd7bb65e8c09f63929ab14d0"),
    "act1-dungeon-art/whisperingWoodsCave-f3-props.png": (
        7821244, "4bf599345f1356d9792bf14900056a5af0c5c6d226ad1d1c417a138bb5653028"),
    "act1-dungeon-art/whisperingWoodsCave-f1-walk.png": (
        11259, "3ba320b23af5d9da3eb5195b498904978f2d93ab386895c2b5ab62fb5ee8a6da"),
    "act1-dungeon-art/whisperingWoodsCave-f2-walk.png": (
        11928, "e573eb74b554ba4fdb79a4c7cde420ca124b6a8e091ce5b34e19a723bcea8559"),
    "act1-dungeon-art/whisperingWoodsCave-f3-walk.png": (
        12791, "6e32e58e3250185ed9ac3b23c85531ad104a9dba5b80b0f2cdc7128557c6117d"),
    # 2026-08-16, THE ENTRANCE CRYSTAL (owner, build 35): "the entrance portal crystal is still
    # not in the game ... a crystal of an activated and inactivated state that lives next to the
    # plaque on the wall." act1-dungeon-floors.json's f1 "assets" now carries a `kind:"save"` entry
    # for each of the four A1D_MAPS dungeons; a1dEntranceCrystalTick (public/dq-tiles.js) is the
    # first normal-play caller of these two textures, so -- exactly the asset-boss.png precedent
    # two entries above -- they would have silently shipped with no picture without an entry here.
    # Placeholder zeros below; `./scripts/repin.sh` fills in the real size/sha256 from the files
    # Codex wrote to public/act1-dungeon-art/assets/.
    "act1-dungeon-art/assets/asset-entrance-crystal-dormant.png": (
        22838, "bf95939767876c62e3ec8cf0993154e9bf78d2e729c421bfb4d3b2d5b89f6b77"),
    "act1-dungeon-art/assets/asset-entrance-crystal-lit.png": (
        23951, "f881b791c89f3ff57651f52261f5fed6d1e2479c8b9e24d8850f6064a6aa6ba2"),
    # 2026-08-07: THE OPEN-CHEST STATE. Owner, playing: "the treasure chest open state is not
    # baked in the game". It could not be -- *-props.png has the chest composited in CLOSED, so
    # looting one changed the tile (4->8, persisted, replayed on re-entry) and nothing else.
    #
    # A sprite on top cannot hide the baked chest: the silhouettes do not nest, and at the
    # authored 1.0 cell 19.1% of the closed chest still shows. So each floor ships a STRIP of
    # opaque 3x3-cell patches -- the chest's own neighbourhood, cut from the SAME render with the
    # chest swapped -- which the runtime blits back onto the rect it came from. Exact by
    # construction, and it leaves the approved *-props.png untouched.
    #
    # Pinned by hash like the floors they are cut from, and for the same reason: the patch IS the
    # floor there, so a silent swap paints something else into the picture. One strip per baked
    # floor; the frames are in that floor's own chest order, which is the runtime's only index.
    # Built by scripts/make_dungeon_chest_patches.py.
    "act1-dungeon-art/coastalReef-f1-chests.png": (
        266513, "5557873df37b75c464d332ec93e830c328ee03285053abbdf6f6c4dc0e8b93f2"),
    "act1-dungeon-art/coastalReef-f2-chests.png": (
        259557, "0c6915939b44c69b0c60af7b4ff5c5c2bd7bbaecd014a5dda74ac475b81860c0"),
    "act1-dungeon-art/coastalReef-f3-chests.png": (
        258552, "d58333878eca31e576e8eca5a9917c81bc2da896821ff275837ec31921a52e9c"),
    "act1-dungeon-art/mistyGrotto-f1-chests.png": (
        121043, "2ce54b94119f3c067f1b28be110ee6db03f772d09b243e8d37f8b8e059c658b9"),
    "act1-dungeon-art/mistyGrotto-f2-chests.png": (
        188346, "3778065199fa68449b2f841efc7871e9ee5f88430ba932bb1131d09ac78b7659"),
    "act1-dungeon-art/mistyGrotto-f3-chests.png": (
        187811, "59ef669b41251cf71a165ca7ed95f427be541de5f60d8c57c2614876aad8f58d"),
    "act1-dungeon-art/sunkenCellar-f1-chests.png": (
        97523, "f678fb69c74b3c9265a3e373684b53e293ac97dfa2948bc36a6d83e87ccf687d"),
    "act1-dungeon-art/sunkenCellar-f2-chests.png": (
        57256, "ef942f715845533f576ba0445c83ca29123749fefae61beaf81cdb7e5165066a"),
    "act1-dungeon-art/sunkenCellar-f3-chests.png": (
        105251, "03099b17aa8d14b4c00765b36f1ce1c007b9941c8e9220a5e45754879025479f"),
    "act1-dungeon-art/whisperingWoodsCave-f1-chests.png": (
        108468, "c38ac76c02968bd2d08d3858468fc04d3f7e88dc17cb880d81ac874e0a0049a7"),
    "act1-dungeon-art/whisperingWoodsCave-f2-chests.png": (
        167434, "8b667b49ebe5899fc2a06b8dd17c65837be564309e75936dc63fb0158ee6fcd0"),
    "act1-dungeon-art/whisperingWoodsCave-f3-chests.png": (
        169334, "34e7cde8843d61942f360b514ea4c8537701f0855c6a6a6b9bd270eb2e59dc41"),
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
    "act1-hifi/town/greenhollow-foreground.png": (17426, "871ebe24b325a11fb0ba5be0343d8474194c558de06bbb556e294c056badb743"),
    "act1-hifi/town/greenhollow-foreground.json": (67, "d41d39ced921a0034c10222028397e42eb7eebd503f23b8be7f40a7530632aca"),
    # Selected male town protagonist, using the existing approved sheet.
    "act1-hifi/hero-g3/hero-act1-male-walk-8x3-64-g3.png": (124618, "b1e03de47337d8d2aca8d89e80c1c524c95ac2cc2cf88ed1ebd2b37b86424b2e"),
    "act1-hifi/town.html": (
        55388, "8a3ccc2400c6ce701e4720a47c5bd7fc4d41d56cc2d55e3be36238c17614434e"),
    "act1-hifi/town/portSapphire-town.json": (
        11831, "28373d5e26fd19990b7f3acd6cc77559e0c279aa73b65b2c0bcfc2985d69b33a"),
    "act1-hifi/town/portSapphire-walkable.json": (
        26439, "5bffa523782a65736de9ac4ce70a6047385f9ce69f10c48e175ecba5593bf590"),
    "act1-hifi/town/portSapphire-screen.png": (
        8721920, "d883904e7cd7301af82099dc04cb968bf6e30017948f8f62de04902bbe91e4f9"),
    # 2026-08-14, owner-authorised ("draw over the hero AND be passable"): the overhead-prop
    # foreground layer -- mast, demijohn, rooftop chimney -- re-extracted from the SAME locked
    # painting by scripts/derive_town_foreground.py and drawn by town.html AFTER the hero/NPC
    # sort. Placeholder zeros; `npm run repin` fills the real size/hash in.
    # The cropped foreground layer is useless without its offset: town.html SKIPS the layer
    # entirely when this is missing rather than drawing it displaced, so an unstaged offset
    # is a silent loss of the whole feature -- which is exactly how it first shipped.
    "act1-hifi/town/npc/portSapphire-drake-4x3-64.png": (
        72410, "693c0fd79544d69495a80daea400e2bdca1c0af926abfe770497eacf8ddb16fd"),
    "act1-hifi/town/npc/portSapphire-healer-4x3-64.png": (
        80027, "411a6af72e29c9747fadf4177c83939af8be8f0c46fcd37181b87676937fb31a"),
    "act1-hifi/town/npc/portSapphire-sailor-4x3-64.png": (
        63030, "ef4dcc7cb9cf51492dda19714c6e92d1d89f32b4f799ccd5594e829109a99c98"),
    "act1-hifi/town/npc/portSapphire-wisewoman-4x3-64.png": (
        63681, "4808577fcb242387d1b5015703ec96c5dd64d17bed11954b18ed8d91c4316d80"),
    # GREENHOLLOW, the starting village. Same shape as Port Sapphire minus the foreground layer,
    # which town.html treats as optional and this town does not have.
    #
    # THE WALKABLE JSON IS PINNED HERE FOR A REASON THAT IS EASY TO MISS. It was committed with the
    # authored-collision-first work and nothing pinned it, so `expected_paths` never contained it,
    # build-dist.sh never copied it into dist/, and the iOS payload never carried it -- while every
    # local gate stayed green, because a file no dict names is a file no gate looks for. town.html
    # fetches `town.walkable` before it draws anything, so on the device that is not a degraded
    # town, it is a town that throws on load.
    #
    # `act1-hifi/town/greenhollow-screen.png` was DELIBERATELY NOT PINNED between 2026-08-19 and
    # 2026-08-21, because the plate did not exist: the four-tile bake ran out of image-model quota
    # partway through. The plate landed 2026-08-21 and is pinned below. The warning it carried is
    # still live and still true for the NEXT town: a pin key naming a file that is not on disk is
    # not a harmless placeholder -- regenerate_pins.py REFUSES TO WRITE while any pin is
    # unresolved, and build-dist.sh then stops with "gate wants ... but public/ does not have it",
    # so it breaks the build for every worktree rather than only for that town. Put the file on
    # disk first, add the key with placeholder zeros second, then `npm run repin`.
    #
    # AND THE PLACEHOLDER MUST BE 64 LITERAL ZEROS, not `"0" * 64`. regenerate_pins.py finds pins
    # with a regex wanting [0-9a-f]{64} inside the quotes, so an expression is not a placeholder it
    # can see: it reports "0 updated", leaves the zeros in place, and the very next step fails with
    # "Act 1 town identity mismatch" pointing at the file you just added. Cost 2026-08-21.
    "act1-hifi/town/greenhollow-town.json": (
        14994, "528d6685fc8737b55386d6c2377d8dbd8c296313411dc678ce87d406052cbc61"),
    "act1-hifi/town/greenhollow-walkable.json": (
        37034, "2a5fcb42919627e99d1de21972c895452584b4181b781398d300822c6a4a16cb"),
    "act1-hifi/town/npc/greenhollow-elder-4x3-64.png": (
        83896, "93b763cebc3c419e5ef7d8e3368507bf604445133e4bcd37b6106881561293f7"),
    "act1-hifi/town/npc/greenhollow-fisherman-4x3-64.png": (
        69584, "9582ebb57dbad3bb7e81c334d8d3d8095d725184dd33a1cf35c4f67f0da6beb9"),
    "act1-hifi/town/npc/greenhollow-healer-4x3-64.png": (
        80027, "411a6af72e29c9747fadf4177c83939af8be8f0c46fcd37181b87676937fb31a"),
    "act1-hifi/town/npc/greenhollow-kiki-4x3-64.png": (
        76317, "50f15a525160d6598f4911d653c09894632beefbf0fdbdc67eccdcf5c22ce3a7"),
    "act1-hifi/town/npc/greenhollow-villager1-4x3-64.png": (
        71160, "44fb8263696ac3f1529d332053969f2cbd8b3de6dd4e7a4e24152d6c3eaa2480"),
    "act1-hifi/town/npc/greenhollow-villager2-4x3-64.png": (
        71056, "672c5519e512f2b0215786e1b2d880e73ee69896ee2770b9b828dec3364f4c4e"),
    # The shopkeeper, added 2026-08-22. Owner: "i cannot find the shopkeeper and the shopkeeper
    # needs to be in a shop." One recurring character, the same bytes in all three towns, standing
    # inside each market stall. Placeholder zeros here and `npm run repin` fills them -- and the
    # FILES ARE ON DISK BEFORE THESE KEYS EXIST, because regenerate_pins.py refuses to write while
    # any pin is unresolved and build-dist.sh then breaks every worktree, not just this town.
    "act1-hifi/town/npc/greenhollow-shopkeeper-4x3-64.png": (
        75201, "2dd2ec57d6ea8583d575eb2deba476075eb69381d9f367da9501b7ac5df696aa"),
    "act1-hifi/town/npc/millbrook-shopkeeper-4x3-64.png": (
        75201, "2dd2ec57d6ea8583d575eb2deba476075eb69381d9f367da9501b7ac5df696aa"),
    "act1-hifi/town/npc/portSapphire-shopkeeper-4x3-64.png": (
        75201, "2dd2ec57d6ea8583d575eb2deba476075eb69381d9f367da9501b7ac5df696aa"),
    "act1-hifi/town/npc/millbrook-healer-4x3-64.png": (
        80027, "411a6af72e29c9747fadf4177c83939af8be8f0c46fcd37181b87676937fb31a"),
    "act1-hifi/town/npc/millbrook-herbalist-4x3-64.png": (
        67396, "73bf3f4b8dcd488dbee121db5eaec14b1dc3985534b0789e18315d36d0359d9f"),
    "act1-hifi/town/npc/millbrook-miller-4x3-64.png": (
        86994, "3ddb795ae3e97f52c507a916ccce46b1b653924799d9ac37aff6921b1d251055"),
    "act1-hifi/town/npc/millbrook-sage-4x3-64.png": (
        75065, "84d718b211333b17a09859dcace6c58d8ae4b7645a4c0504e4ab3c34066b49d8"),
    "act1-hifi/town/greenhollow-walkable.json": (
        37034, "2a5fcb42919627e99d1de21972c895452584b4181b781398d300822c6a4a16cb"),
    "act1-hifi/town/millbrook-walkable.json": (
        39256, "7e43d448441c4d19fe36eed22d55970f65a29a9a98f51237812e9623473aab53"),
    "act1-hifi/town/millbrook-town.json": (
        11645, "b9e15c20b3f3b1ced504175f0e83179b6c8421a0105da07c3db1bddedac65238"),
    # 2026-08-21: the two plates the note above was waiting for. Both are the four-tile bake,
    # exposure-matched per tile and quilted on a minimum-error cut by scripts/stitch_plate.py.
    # Placeholder zeros; `npm run repin` fills the real size/hash in -- and the FILES ARE ON DISK
    # BEFORE THESE KEYS EXIST, which is the whole point of the warning above.
    "act1-hifi/town/millbrook-screen.png": (
        8064226, "a206e48240e409bf3460326cfaef82ee9b625ca6ec63c05506048ecd23a76943"),
    "act1-hifi/town/greenhollow-screen.png": (
        8432646, "6b393ccfa8f24abf4a0b52d88b2958f9e5bd31780dd58d12efd1bfac39110cee"),
    "act1-hifi/verify/seed.html": (
        2089, "6f34401b6845582f223abdc80dd191c3a1392bc7808aee81d11eb89313b80c14"),
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
        42673, "a96daa94ee31de8ec605c90f671c76db33366d648469fb46314542bed7d9ade3"),
    "act1-hifi/landmarks/crystal-cave.png": (
        30289, "45fb2c0b7cf1ad2e63ee9a28bbf0ad66e3d4d9ca9258beaf7a68566e04692b55"),
    "act1-hifi/landmarks/darkfang.png": (
        42937, "69ddb0f09c8021f9e81215bf6e100c9e287a007941926195e6973024322d4c76"),
    "act1-hifi/landmarks/greenhollow.png": (
        73527, "f619d3166d68edbc9fdb55e735e767abde444b6d055b1ba60612d6a075e4997b"),
    "act1-hifi/landmarks/landmarks.json": (
        3138, "0b7e43f7ba532dd7079c2d90a1203bb7c9341a43b041993a3d9a0bcf24bc9437"),
    "act1-hifi/landmarks/millbrook.png": (
        67703, "38a1fc9e28477909c71cd3c20df6f8f80c81a8b2eb55befbfc426f17e2dab1ca"),
    "act1-hifi/landmarks/misty-grotto.png": (
        25411, "db70e0cb5ab15e88ced85a1979e72fbbb1a61f7f13386b3cc40e6555f618140e"),
    "act1-hifi/landmarks/port-sapphire.png": (
        70695, "9708ba46eb3f3e065cae1ea2d044ece8e07d23e84531b441747da69b55eb8799"),
    "act1-hifi/landmarks/sunken-cellar.png": (
        23994, "b3edec4762e910c249a8d6b6a7d8d6072186422e4f03e826208584ca9dab4f2a"),
    "act1-hifi/landmarks/whispering-woods.png": (
        34534, "a06eea6ab98c7c630119db1488dfea912a40bc69150ac16e387b4e696aa5f047"),
}
ACT1_HIFI_RUNTIME = (
    ROOT / "design" / "review" / "overworld-art-blueprint" / "act-by-act" / "act1" / "runtime-v2"
)
ACT1_R26_RUNTIME = ACT1_HIFI_RUNTIME / "act1-final-art-geometry-r26" / "runtime"
ACT1_PAINT_RUNTIME = (
    ROOT / "design" / "review" / "overworld-art-blueprint" / "act-by-act" / "act1"
    / "runtime-v9" / "act1-painted-overworld-r9" / "runtime"
)
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
# 2026-08-14 SIGN-OFF: 0c773b18... -> 376296f5..., chunkSize 512 -> 256, 30 chunks -> 120. The Act 1
# plate was RE-TILED, not re-rendered: a 32-cell chunk against a ~9-cell camera meant most of every
# loaded chunk was never on screen, and that -- not the eviction policy -- is what kept losing the
# owner's WebGL context. The new grid is CROPPED from the existing baked raster, and identity is
# proven over the FULL set (base, canopy and water reassembled from both grids) at max abs diff 0,
# with base and canopy re-encoded as lossless WebP so the comparison is exact. This pin is the
# locked-art gate, so it is updated here deliberately and only on that proof.
# 2026-09-02 SIGN-OFF: 376296f5... -> 5a5d17cd..., same grid, same pixels' geometry, the base layer
# SHARPENED in place (scripts/sharpen_act1_chunks.py: unsharp radius 0.9 / 130% / threshold 2 -- the 220% first cut "hurts my eyes", owner 2026-09-02;
# re-encoded lossless) and the 9 landmark sprites likewise. Owner, on the image-quality options:
# "Sharper the better". The renderer was measured first (93.6% uniform 3x3 device-px blocks): the
# softness was the paint, not the drawing. A re-bake from the material renderer was not possible on
# this machine (its materials are gitignored design files), so this is a post-process of the locked
# bake. manifest.source.sharpen records the parameters; the script refuses to run twice.
# 2026-09-27: reviewed r3 selected-source-core mountain correction. It keeps the r2
# runtime immutable, changes only 41 declared base files in a new r3 mirror, and records
# the frozen layer, private integration, and independent-review identities in manifest.source.
# 2026-09-16: owner-approved bright/natural frontend repaint; 120 fixed base footprints.
# Independent decoded review and full bake prove unchanged geometry and 289 preserved files.
# Exact replay/encoding; all 218 edges and 99 corners meet the declared one-level tolerance.
ACT1_R26_MANIFEST_SHA256 = "7306e81411a230d3d83d8c179c9a55de5d0a234f26757654872b1b2c264210a4"
ACT1_PAINT_MANIFEST_SHA256 = "83fd77795f670ca6fa5911c87c05f57f67f651dbc516dadbd8c7b8139c97f0de"
ACT1_PAINT_UNDERPAINT = {
    "src": "underpaint/act1-plate.png",
    "pixelWidth": 888,
    "pixelHeight": 1092,
    "pixelsPerCell": 6,
    "sha256": "e80bdea1d4fbd338a142795c20b12bb8f8da2bc2a1694d0cd5e4b4f1faa1e312",
}
ACT1_PAINT_UNDERPAINT_SHA256 = "e80bdea1d4fbd338a142795c20b12bb8f8da2bc2a1694d0cd5e4b4f1faa1e312"
ACT1_PAINT_FOREST_UNDERPAINT = {
    "src": "underpaint/forest-rgba.png",
    "width": 888,
    "height": 1092,
    "pixelsPerCell": 6,
    "bounds": [16, 218, 163, 399],
}
ACT1_PAINT_FOREST_UNDERPAINT_SHA256 = "d19e2fc42288c6b898b9e9b94553329c33a665e02dc38c0ffb49bfab2d2b5799"
ACT1_PAINT_COLLISION = {'artifact': 'forest-collision.bin',
 'dimensionsPx32': [4736, 5824],
 'sha256': '766c0deb37abc682c8a18ef0f5e087b8ef9bfa76ba7dbce3b074bea002d16f53',
 'sourceArtifact': 'ACT1 forest QOK OR corrected visible whole-mountain alpha',
 'sourceSha256': '42097dbf9e271caa0bbf9c8c69a58e97e6ad41b4311b35c13425ffcdb493de67',
 'format': 'qok-forest-bitset-v1',
 'version': 1,
 'bounds': [16, 218, 163, 399],
 'pixelsPerCell': 32,
 'alphaThreshold': 16,
 'bytes': 3447872,
 'treeDilationSourcePixels': 0,
 'geometryManifestSha256': '3b932bdcd019b36ef16318333537c3f5553754a1cfded4ad33149269b5a49e3a',
 'sourceInputs': [{'label': 'forest-filled-collision',
                   'sha256': '59b021239c220a094bb0bd87c5af6d76b78c693e3fe197b394fd8471b30ae34d',
                   'threshold': 16,
                   'bitOrder': 'little-within-byte'},
                  {'label': 'mountain-visible-alpha',
                   'sha256': '19b821e5813bfdf74e42cb0237fe97b18e07799300db97bcefdea9cf4341a51c',
                   'threshold': 128,
                   'bitOrder': 'little-within-byte'}],
 'composition': 'bytewise OR of unchanged forest QOK bits and staged visible approved mountain '
                'alpha; little-within-byte',
 'compositionDigest': 'sha256(UTF8("edu-rpg-act1-visible-terrain-union-v1\\0") || '
                      'rawSHA256(forest-filled-collision) || rawSHA256(mountain-visible-alpha))'}
ACT1_BUILD83_SOURCE_MANIFEST_SHA256 = "26c756464730885d0ea766330edcde43e875a2a5887df1ef403b435040626e78"
ACT1_BUILD83_SOURCE_COLLISION_SHA256 = "2b541cecb97712a6f18c6ae19bfabf519255999f2165d7d8ec4edea6cb9e4644"
ACT1_BUILD83_OCT4_RECEIPT_SHA256 = "472dbc0688fe338e1e5db22e33dec55229c7021977c2c189f30f53932308dfeb"
ACT1_BUILD83_OCT4_STAGE_SHA256 = "cb135794567cca47e4262ec7abea0349201664de86b7535bbb3b50c66c9737cd"
ACT1_BUILD83_CORRECTION_RECEIPT_SHA256 = "5639b38e26c5e7a4d2a222828fd4cdcb5c3b33475a483177afde5cd0d637ad91"
ACT1_BUILD83_CORRECTION_RECEIPT_PATH = "source/build83-paint-correction-v1/correction-receipt.json"
ACT1_BUILD83_CORRECTION_AFFECTED_CHUNKS = frozenset(('c0-r2', 'c0-r3', 'c0-r4', 'c0-r7', 'c0-r8', 'c1-r0', 'c1-r2', 'c1-r3', 'c1-r4', 'c1-r6', 'c1-r8', 'c2-r1', 'c2-r2', 'c2-r3', 'c2-r6', 'c2-r8', 'c2-r9', 'c3-r0', 'c3-r1', 'c3-r10', 'c3-r3', 'c3-r4', 'c3-r5', 'c3-r6', 'c3-r7', 'c3-r8', 'c3-r9', 'c4-r0', 'c4-r10', 'c4-r2', 'c4-r3', 'c4-r4', 'c4-r5', 'c4-r6', 'c4-r8', 'c5-r0', 'c5-r1', 'c5-r10', 'c5-r4', 'c5-r7', 'c5-r8', 'c6-r0', 'c6-r1', 'c6-r10', 'c6-r3', 'c6-r4', 'c6-r5', 'c6-r6', 'c6-r7', 'c6-r8', 'c6-r9', 'c7-r3', 'c7-r4', 'c7-r5', 'c7-r6', 'c7-r8', 'c7-r9', 'c8-r3', 'c8-r4', 'c8-r6', 'c8-r7', 'c8-r8', 'c8-r9'))
ACT1_R9_SOURCE_COLLISION_SHA256 = "def3a8acc8a80aaf55816ed464b1f2b49b90cfd0865f0e5cdbe95db14383ad54"
ACT1_R9_SOURCE_ALPHA_SHA256 = "2cab1366c803a315d5e12f005b43d7d54740524a9a88c426dbc69e2118a967f0"
# The chunk layers the shipped tree must carry, read out of the locked manifest above. `occlusion`
# was retired with the 48 px bake; a stale entry here would make the gate demand a file that no
# longer exists and reject the one that replaced it.
ACT1_HIFI_CHUNK_LAYERS = ("base", "water", "canopy", "forest")

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
    "battle-recovery.js",
    "ui-overhaul.js",
    "ui-overhaul.css",
    # 2026-08-25, owner-authorised: the orchestral BGM. Swaps the procedural Tone.js composer for
    # nine .m4a loops through the bundle's existing __QOK audio hook. See
    # docs/MUSIC-INTEGRATION-READY.md -- this is the "next bundle edit" that release was waiting on,
    # taken as its own edit because the bundle is frozen and no unrelated edit was ever going to come.
    "music-override.js",
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
    if relative_path.startswith("audio/"):
        # 2026-08-25: the orchestral BGM loops. category() RAISES on an unclassified file rather
        # than dropping it, so omitting this branch fails build-dist.sh loudly -- which is the
        # behaviour we want, but it still has to be answered here.
        return "bgm-track"
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



def validate_build83_correction_record(receipt: dict, actual_receipt_sha256: str,
        paint_source: dict, paint_manifest: dict, expected_source_base_hashes: dict, expected_source_authorities: dict,
        expected_receipt_sha256: str, expected_affected_chunks: frozenset[str],
        expected_predecessor_manifest_sha256: str, expected_predecessor_collision_sha256: str,
        expected_oct4_receipt_sha256: str, expected_oct4_stage_sha256: str,
        expected_underpaint_sha256: str, expected_collision_sha256: str,
        expected_collision_source_sha256: str) -> dict[str, str]:
    """Fail closed on any Build 83 correction provenance, allowlist, or output drift."""
    if actual_receipt_sha256 != expected_receipt_sha256:
        raise BaselineError("Build 83 correction receipt hash mismatch")
    if receipt.get("kind") != "act1-build83-paint-correction-receipt-v1" or receipt.get("revision") != 1:
        raise BaselineError("Build 83 correction receipt schema mismatch")
    pred=receipt.get("predecessor", {})
    if (pred.get("candidateManifestSha256") != expected_predecessor_manifest_sha256
            or pred.get("candidateCombinedCollisionSha256") != expected_predecessor_collision_sha256
            or pred.get("oct4PromotionReceiptSha256") != expected_oct4_receipt_sha256
            or pred.get("oct4ProductionStageSha256") != expected_oct4_stage_sha256
            or pred.get("oct4BaseChunkCount") != 41):
        raise BaselineError("Build 83 correction predecessor identity mismatch")
    declared=set(paint_source.get("build83PaintCorrectionAffectedChunks", []))
    records=receipt.get("correctedBaseChunks")
    if not isinstance(records,list) or len(records)!=63:
        raise BaselineError("Build 83 correction receipt must contain exactly 63 base outputs")
    ids=[x.get("id") for x in records]
    if (len(set(ids))!=63 or set(ids)!=set(expected_affected_chunks)
            or declared!=set(expected_affected_chunks)
            or paint_source.get("build83PaintCorrectionRevision")!=1
            or paint_source.get("build83PaintCorrectionReceiptPath")!=ACT1_BUILD83_CORRECTION_RECEIPT_PATH
            or paint_source.get("build83PaintCorrectionReceiptSha256")!=expected_receipt_sha256):
        raise BaselineError("Build 83 correction affected-chunk allowlist drift")
    correction=receipt.get("correction", {})
    if paint_source.get("build83PaintCorrection") != correction.get("manifestSourceRecord"):
        raise BaselineError("Build 83 correction manifest source record differs from its receipt")
    under=receipt.get("underpaint", {})
    coll=receipt.get("combinedCollision", {})
    if (under.get("sha256")!=expected_underpaint_sha256
            or paint_manifest.get("underpaint", {}).get("sha256")!=expected_underpaint_sha256):
        raise BaselineError("Build 83 correction underpaint pin drift")
    if (coll.get("sha256")!=expected_collision_sha256
            or coll.get("sourceSha256")!=expected_collision_source_sha256
            or paint_manifest.get("collision", {}).get("sha256")!=expected_collision_sha256
            or paint_manifest.get("collision", {}).get("sourceSha256")!=expected_collision_source_sha256
            or coll.get("exactForestOrMountain") is not True):
        raise BaselineError("Build 83 correction combined-collision pin drift")
    chunks={c.get("id"):c for c in paint_manifest.get("chunks", [])}
    outputs={}
    for item in records:
        cid=item["id"]
        if (cid not in expected_source_base_hashes
                or item.get("sourceBaseSha256")!=expected_source_base_hashes[cid]
                or item.get("sourceBaseAuthority")!=expected_source_authorities.get(cid)):
            raise BaselineError(f"Build 83 {cid} predecessor base authority/hash mismatch")
        if item.get("basePath")!=chunks.get(cid, {}).get("base"):
            raise BaselineError(f"Build 83 {cid} base path differs from pinned manifest")
        output=item.get("correctedBaseSha256")
        if (not isinstance(output,str) or len(output)!=64
                or chunks.get(cid, {}).get("baseSha256")!=output):
            raise BaselineError(f"Build 83 {cid} corrected base output hash mismatch")
        outputs[cid]=output
    return outputs

def verify_act1_overlay(root: Path, allowed_extra: frozenset[str] = frozenset()) -> None:
    """Verify the immutable runtime plus the reviewed Act 1 paint overlay."""
    manifest = load_manifest()
    expected_entries = {entry["path"]: entry for entry in manifest["files"]}
    all_found = files_under(root)
    geometry_manifest_path = ACT1_R26_RUNTIME / "manifest.json"
    # The R9 directory remains the immutable provenance source. This candidate's explicitly
    # approved terrain-union overlay is the active paint authority until it is promoted into a
    # versioned runtime after review.
    paint_manifest_path = ROOT / "public" / "act1-hifi" / "manifest.json"
    if sha256(geometry_manifest_path) != ACT1_R26_MANIFEST_SHA256:
        raise BaselineError("historical Act 1 r26 geometry manifest identity changed")
    if sha256(paint_manifest_path) != ACT1_PAINT_MANIFEST_SHA256:
        raise BaselineError("approved Act 1 paint manifest identity changed")
    geometry_manifest = json.loads(geometry_manifest_path.read_text(encoding="utf-8"))
    paint_manifest = json.loads(paint_manifest_path.read_text(encoding="utf-8"))
    if geometry_manifest.get("revision") != 12 or paint_manifest.get("revision") != 12:
        raise BaselineError("Act 1 geometry/paint manifest revision mismatch")
    if paint_manifest.get("underpaint") != ACT1_PAINT_UNDERPAINT:
        raise BaselineError("approved Act 1 manifest must declare the required underpaint")

    # The new manifest is an art profile layered over r26 geometry. Keep every top-level field
    # byte-for-value equal except the explicit provenance, status, chunk raster declarations and
    # required underpaint. This makes new/changed navigation fields fail closed.
    art_fields = {"source", "status", "chunks", "underpaint", "forestMode", "forestUnderpaint", "collision"}
    live_authority_fields = {"safeCells", "startCell", "legacyFallback", "liveLandmarkExits", "liveValidApproaches", "pathConstraints"}
    expected_paint_fields = ((set(geometry_manifest) - {"pathConstraints"})
                             | {"underpaint", "forestMode", "forestUnderpaint", "collision", "legacyFallback", "liveLandmarkExits", "liveValidApproaches"})
    if expected_paint_fields != set(paint_manifest) or "pathConstraints" in paint_manifest:
        raise BaselineError("Act 1 paint manifest added or removed an unreviewed top-level field")
    for key in set(geometry_manifest) - art_fields - live_authority_fields:
        if paint_manifest.get(key) != geometry_manifest.get(key):
            raise BaselineError(f"Act 1 paint manifest changed locked geometry field: {key}")
    if geometry_manifest.get("source", {}).get("mask") != paint_manifest.get("source", {}).get("mask"):
        raise BaselineError("Act 1 paint manifest changed the semantic source mask")
    geometry_source = geometry_manifest.get("source", {})
    paint_source = paint_manifest.get("source", {})
    paint_source_additions = {
        "maskSha256", "paintSource", "paintSourceSha256", "paintSeed",
        "pilotPixelsPerCell", "pilotChunks", "stage",
        # Reviewed r3 selected-source-core mountain compositor provenance. The
        # manifest itself is pinned above; these explicit keys prevent arbitrary
        # source metadata from entering a shipped art revision.
        "mountainLayerRevision", "mountainLayerProofSha256",
        "mountainIntegrationProofSha256", "mountainIndependentReviewSha256",
        "mountainLayerAffectedChunks",
        # R5 wrap-safe native-detail material, bound to the exact reviewed source
        # asset and its focused field/protected-pixel evidence.
        "mountainNativeDetailComposerSha256", "mountainNativeDetailSourcePath",
        "mountainNativeDetailSourceSha256", "mountainNativeDetailStaticGuardSha256",
        "mountainNativeDetailFocusedProofSha256", "mountainNativeDetailPhoneProxySha256",
        "mountainNativeDetailSampling",
        # Reviewed R8 forest closures and full-range R8/R03 mountain transition.
        "forestAssemblyScriptSha256", "forestAssemblySourcePath",
        "forestGlobalRendererSha256", "forestLayerRevision",
        "forestPlacementManifestSha256", "forestR8AssemblyScriptSha256",
        "forestR8InputStageInventorySha256", "forestR8PlacementManifestSha256",
        "forestR8PlanSha256", "forestR8RendererSourceSha256",
        "forestR8SpriteHelperSha256", "forestSourceScriptSha256", "forestSourceSha256",
        "privateMountainTransition",
        "forestOriginalPlacementManifestSha256", "forestFinalPlacementManifestSha256",
        "forestPlacementDeltaSha256", "forestRouteClearanceProofSha256",
        "forestOriginalPlacementManifestPath", "forestFinalPlacementManifestPath",
        "forestPlacementDeltaPath", "forestRouteClearanceProofPath",
        "forestVisibleAlphaSourcePath", "forestVisibleAlphaSourceSha256",
        "forestImmutableR6SourceClosureSha256", "forestPortableRouteSourceClosurePath",
        "forestPortableRouteSourceClosureSha256", "forestPortableRouteSourceInventorySha256",
        "forestPortableReplayScriptSha256", "forestPortableEmitterScriptSha256",
        # R9 terrain-specific immutable generator, emission, source-closure and lossless WebP identities.
        "forestR9SourceClosurePath", "forestR9SourceClosureSha256",
        "forestR9TerrainManifestPath", "forestR9TerrainManifestSha256",
        "forestR9WebpConversionPath", "forestR9WebpConversionSha256",
        "forestR9EmissionManifestSha256", "forestR9GeneratorSha256",
        "forestR9AlphaRule", "forestR9SizeBand",
        "forestR9VersionedClosurePath", "forestR9VersionedClosureSha256",
        # Approved ACT1 visible-terrain union and scoped underpainted distance field.
        "act1TerrainUnionRevision", "act1TerrainUnionForestManifestSha256",
        "act1TerrainUnionMountainReportSha256", "act1TerrainUnionSourceSha256",
        "act1TerrainUnionA1OWScope", "act1TerrainUnionBaseUnderpaintSha256",
        "act1TerrainUnionMountainGroundMaskSha256", "act1TerrainUnionEvidence",
        "act1TerrainUnionA1OWSha256", "act1TerrainUnionA1OWVersion",
        "act1TerrainUnionA1OWHeaderBytes", "act1TerrainUnionA1OWProfileId",
        "act1TerrainUnionA1OWSupportSchema", "act1TerrainUnionA1OWSupportFNV32",
        "act1TerrainUnionA1OWSemanticsSha256", "act1TerrainUnionA1OWSupportSha256",
        "act1TerrainUnionA1OWPayloadSha256", "act1TerrainUnionA1OWBlockCount",
        "act1TerrainUnionA1OWBakerPath", "act1TerrainUnionA1OWBakerSha256",
        "act1TerrainUnionLiveWorldRevision", "act1TerrainUnionLiveWorldSourceSha256",
        "act1TerrainUnionSafeCellCount",
        "build83PaintCorrection", "build83PaintCorrectionRevision",
        "build83PaintCorrectionReceiptPath", "build83PaintCorrectionReceiptSha256",
        "build83PaintCorrectionAffectedChunks",
    }
    if set(paint_source) != set(geometry_source) | paint_source_additions:
        raise BaselineError("Act 1 paint manifest changed unreviewed source metadata fields")
    if paint_source.get("renderer") != "scripts/act1-paint-r4/render_material_map_r4.py::Act1PaintRenderer":
        raise BaselineError("Act 1 paint manifest renderer provenance changed")
    for key, value in geometry_source.items():
        if key != "renderer" and paint_source.get(key) != value:
            raise BaselineError(f"Act 1 paint manifest changed locked source field: {key}")
    if paint_manifest.get("forestMode") != "whole-object-v8":
        raise BaselineError("Act 1 paint manifest must opt in to whole-object V8 forest layers")
    if paint_manifest.get("forestUnderpaint") != ACT1_PAINT_FOREST_UNDERPAINT:
        raise BaselineError("Act 1 V8 forest underpaint path/dimensions/bounds changed")
    if paint_manifest.get("collision") != ACT1_PAINT_COLLISION:
        raise BaselineError("Act 1 V8 forest collision authority changed from the reviewed pack")
    expected_start = {"x": 69, "y": 256}
    expected_fallback = {"x": 130, "y": 290}
    expected_exits = [
        ("greenhollow", 69, 256), ("millbrook", 39, 345), ("portSapphire", 133, 348),
        ("sunkenCellar", 30, 275), ("whisperingWoodsCave", 101, 232),
        ("coastalReef", 145, 372), ("mistyGrotto", 96, 360), ("crystalCave", 149, 279),
    ]
    expected_approaches = [
        ("whisperingWoodsCave", 101, 232), ("greenhollow", 69, 256), ("sunkenCellar", 30, 275),
        ("crystalCave", 149, 277), ("crystalCave", 148, 278), ("crystalCave", 150, 278),
        ("crystalCave", 149, 279), ("millbrook", 39, 345), ("portSapphire", 133, 348),
        ("mistyGrotto", 96, 360), ("coastalReef", 145, 372),
    ]
    exits = [(x.get("id"), x.get("x"), x.get("y")) for x in paint_manifest.get("liveLandmarkExits", [])]
    approaches = [(x.get("landmarkId"), x.get("x"), x.get("y")) for x in paint_manifest.get("liveValidApproaches", [])]
    if (paint_manifest.get("startCell") != expected_start
            or paint_manifest.get("legacyFallback") != expected_fallback
            or exits != expected_exits or approaches != expected_approaches
            or len(paint_manifest.get("safeCells", [])) != 149
            or paint_source.get("act1TerrainUnionLiveWorldRevision") != 7
            or paint_source.get("act1TerrainUnionLiveWorldSourceSha256") != "f1ea99546b799b50cec7d6fd40b1fae2ad53669fae22afaebe3760f225d12cad"
            or paint_source.get("act1TerrainUnionSafeCellCount") != 149):
        raise BaselineError("Act 1 recovery/start/landmark authority differs from the frozen live world map")
    a1ow_path = ROOT / "public" / "act1-overworld-walk.bin"
    a1ow_data = a1ow_path.read_bytes()
    if len(a1ow_data) < 96 or a1ow_data[:4] != b"A1OW":
        raise BaselineError("Act 1 A1OW v2 magic/header is invalid")
    (a1ow_version, a1ow_ppc, a1ow_width, a1ow_height, a1ow_far,
     a1ow_header_bytes, a1ow_blocks, a1ow_support_fnv) = struct.unpack_from("<HHHHHHII", a1ow_data, 4)
    a1ow_reserved = struct.unpack_from("<II", a1ow_data, 24)
    a1ow_semantics = a1ow_data[32:64].hex()
    a1ow_support = a1ow_data[64:96].hex()
    a1ow_payload = hashlib.sha256(a1ow_data[96:]).hexdigest()
    a1ow_scope = "water only inside semantic bounds [16,218,163,399]; mountain remains analytic outside and in the 40-cell bake padding"
    if (len(a1ow_data) != 9688672 or sha256(a1ow_path) != paint_source.get("act1TerrainUnionA1OWSha256")
            or (a1ow_version, a1ow_ppc, a1ow_width, a1ow_height, a1ow_far, a1ow_header_bytes)
               != (2, 48, 320, 400, 255, 96)
            or (a1ow_blocks, a1ow_support_fnv, *a1ow_reserved) != (4094, 4271507709, 0, 0)
            or a1ow_semantics != "a6e6e7f228d040381539618d99f03e774a16dd7cadbaf8cc76a115934d324f67"
            or a1ow_support != "eeaf65c08cda239ea8755a3af0026ed0ca61e19a2683cafc10610b5c4027914a"
            or a1ow_payload != "05be9638d04a692668c3a1c8b4bd3d809216bcede2e090a74a0712cb5467498c"
            or paint_source.get("act1TerrainUnionA1OWVersion") != a1ow_version
            or paint_source.get("act1TerrainUnionA1OWHeaderBytes") != a1ow_header_bytes
            or paint_source.get("act1TerrainUnionA1OWProfileId") != "act1-forward-20261007-v1"
            or paint_source.get("act1TerrainUnionA1OWBakerPath") != "scripts/bake_act1_overworld_walk.mjs"
            or paint_source.get("act1TerrainUnionA1OWBakerSha256") != "8f172f77de9ccddebafd0d742a13fdc22d5258c652eacf5df5b0ba5d25c9eb2b"
            or paint_source.get("act1TerrainUnionA1OWSupportSchema") != "a1ow-effective-support-v1"
            or paint_source.get("act1TerrainUnionA1OWSupportFNV32") != a1ow_support_fnv
            or paint_source.get("act1TerrainUnionA1OWSemanticsSha256") != a1ow_semantics
            or paint_source.get("act1TerrainUnionA1OWSupportSha256") != a1ow_support
            or paint_source.get("act1TerrainUnionA1OWPayloadSha256") != a1ow_payload
            or paint_source.get("act1TerrainUnionA1OWBlockCount") != a1ow_blocks
            or paint_source.get("act1TerrainUnionA1OWScope") != a1ow_scope):
        raise BaselineError("Act 1 A1OW v2 support identity, unchanged payload, or mountain-preserving scope differs from the reviewed contract")

    # Preserve and verify the copied R8 route source as historical lineage. Its proof remains
    # bound to the R8 collision pack; it must not be presented as evidence for the R9 pack.
    route_source = ACT1_PAINT_RUNTIME.parent / "source" / "route-clearance-v2"
    closure_path = route_source / "SOURCE-CLOSURE-MANIFEST.json"
    closure = json.loads(closure_path.read_text(encoding="utf-8"))
    closure_files = closure.get("files")
    if not isinstance(closure_files, list) or closure.get("kind") != "act1-r8-route-clearance-v2-source-closure":
        raise BaselineError("R8 route-clearance source closure schema is invalid")
    listed = set()
    inventory_lines = []
    for entry in closure_files:
        rel = entry.get("path")
        if not isinstance(rel, str) or rel in listed or Path(rel).is_absolute() or ".." in Path(rel).parts:
            raise BaselineError("R8 route source closure has unsafe/duplicate paths")
        listed.add(rel)
        source_file = route_source / rel
        if not source_file.is_file() or source_file.stat().st_size != entry.get("size") or sha256(source_file) != entry.get("sha256"):
            raise BaselineError(f"R8 route source closure identity mismatch: {rel}")
        if b"/private/tmp" in source_file.read_bytes():
            raise BaselineError(f"R8 route source contains an ephemeral path: {rel}")
        inventory_lines.append(f"{rel}\t{entry['sha256']}\n")
    actual = {p.relative_to(route_source).as_posix() for p in route_source.rglob("*") if p.is_file() and p != closure_path}
    if actual != listed:
        raise BaselineError("R8 route source closure does not cover the exact candidate file set")
    inventory = hashlib.sha256("".join(sorted(inventory_lines)).encode("utf-8")).hexdigest()
    if inventory != closure.get("inventorySha256"):
        raise BaselineError("R8 route source closure inventory digest mismatch")
    r8_audit = json.loads((route_source / "actual-production-stencil-route-audit-v2.json").read_text(encoding="utf-8"))
    if (not r8_audit.get("allClear")
            or r8_audit.get("heroSha256") != "070a8a452c3dda775bd6c8593a66d57a5a13d97b9fb33378ea5b2bb0e1fded3c"
            or r8_audit.get("heroDisplayPx") != 64.8 or r8_audit.get("heroScale") != 1.0125
            or r8_audit.get("packSha256") != "daff54b3f517fda53374f7d02d10a53e34738c48a80394914e744512515be173"):
        raise BaselineError("preserved R8 route proof no longer matches its historical collision pack")
    r8_delta = json.loads((route_source / "placement-delta-v2.json").read_text(encoding="utf-8"))
    r8_final = json.loads((route_source / "final-placement-authority-v2.json").read_text(encoding="utf-8"))
    if r8_delta.get("immutableInputSha256") != "926c7c10f663f9a62aefbbb0f56ab9cc8553f9905e7637c47f3ce2893f210f55" or len(r8_final.get("placements", [])) != 611:
        raise BaselineError("preserved R8 placement authority lineage changed")
    original_path = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v6/act1-painted-overworld-r6/source/original/forest-assembly-r8/mountain-handoff/R8-CLEAN-OVERLAY-PLACEMENTS-614.json"
    if sha256(original_path) != r8_delta["immutableInputSha256"]:
        raise BaselineError("R6 immutable forest placement input hash changed")

    # R9's own complete source bundle and route audit are the active authority for this profile.
    r9_source = ACT1_PAINT_RUNTIME.parent / "source" / "terrain-r9"
    r9_closure_path = r9_source / "SOURCE-CLOSURE-MANIFEST.json"
    r9_closure = json.loads(r9_closure_path.read_text(encoding="utf-8"))
    if r9_closure.get("kind") != "act1-r9-versioned-source-closure-v1":
        raise BaselineError("R9 versioned source closure schema is invalid")
    r9_files = r9_closure.get("files")
    if not isinstance(r9_files, list):
        raise BaselineError("R9 versioned source closure file list is missing")
    r9_listed = set()
    r9_inventory_lines = []
    for entry in r9_files:
        rel = entry.get("path")
        if not isinstance(rel, str) or rel in r9_listed or Path(rel).is_absolute() or ".." in Path(rel).parts:
            raise BaselineError("R9 source closure has unsafe/duplicate paths")
        r9_listed.add(rel)
        source_file = r9_source / rel
        if not source_file.is_file() or source_file.stat().st_size != entry.get("size") or sha256(source_file) != entry.get("sha256"):
            raise BaselineError(f"R9 source closure identity mismatch: {rel}")
        if b"/private/tmp" in source_file.read_bytes():
            raise BaselineError(f"R9 source closure contains an ephemeral path: {rel}")
        r9_inventory_lines.append(f"{rel}\t{entry['sha256']}\n")
    r9_actual = {p.relative_to(r9_source).as_posix() for p in r9_source.rglob("*") if p.is_file() and p != r9_closure_path}
    if r9_actual != r9_listed:
        raise BaselineError("R9 source closure does not cover the exact versioned source file set")
    r9_inventory = hashlib.sha256("".join(sorted(r9_inventory_lines)).encode("utf-8")).hexdigest()
    if r9_inventory != r9_closure.get("inventorySha256"):
        raise BaselineError("R9 source closure inventory digest mismatch")

    def checked_r9_source_path(value: object, label: str) -> Path:
        if not isinstance(value, str) or Path(value).is_absolute() or ".." in Path(value).parts:
            raise BaselineError(f"R9 {label} path is unsafe")
        path = r9_source / value
        if not path.is_file():
            raise BaselineError(f"R9 {label} is missing: {value}")
        return path

    r9_manifest_path = checked_r9_source_path("act1-r9-terrain-manifest.json", "terrain manifest")
    r9_source_closure_path = checked_r9_source_path("manifest/source-closure-r9.json", "input closure")
    r9_conversion_path = checked_r9_source_path("manifest/base-webp-conversion-r9.json", "WebP conversion map")
    r9_emission_path = checked_r9_source_path("evidence/emission-manifest-r9.json", "emission manifest")
    r9_route_path = checked_r9_source_path("evidence/actual-production-stencil-route-audit-v2.json", "route audit")
    if (sha256(r9_closure_path) != paint_source.get("forestR9VersionedClosureSha256")
            or paint_source.get("forestR9VersionedClosurePath") != "source/terrain-r9/SOURCE-CLOSURE-MANIFEST.json"
            or sha256(r9_manifest_path) != paint_source.get("forestR9TerrainManifestSha256")
            or sha256(r9_source_closure_path) != paint_source.get("forestR9SourceClosureSha256")
            or sha256(r9_conversion_path) != paint_source.get("forestR9WebpConversionSha256")
            or sha256(r9_emission_path) != paint_source.get("forestR9EmissionManifestSha256")
            or sha256(r9_route_path) != paint_source.get("forestRouteClearanceProofSha256")):
        raise BaselineError("R9 manifest source provenance hashes do not match the versioned source bundle")
    r9_manifest = json.loads(r9_manifest_path.read_text(encoding="utf-8"))
    r9_input_closure = json.loads(r9_source_closure_path.read_text(encoding="utf-8"))
    r9_conversion = json.loads(r9_conversion_path.read_text(encoding="utf-8"))
    path_relocation_path = checked_r9_source_path("path-relocation-receipt.json", "source path relocation receipt")
    path_relocation = json.loads(path_relocation_path.read_text(encoding="utf-8"))
    r9_route = json.loads(r9_route_path.read_text(encoding="utf-8"))
    if (r9_closure.get("terrainManifestSha256") != sha256(r9_manifest_path)
            or r9_closure.get("generatorOriginalSha256") != paint_source.get("forestR9GeneratorSha256")
            or r9_closure.get("generatorPath") != "build_r9_terrain.py"
            or r9_closure.get("generatorPortableSha256") != sha256(r9_source / "build_r9_terrain.py")
            or r9_closure.get("generatorPortableSha256") != next((x.get("sha256") for x in r9_files if x.get("path") == "build_r9_terrain.py"), None)
            or r9_closure.get("generatorOriginalSha256") != r9_input_closure.get("generatorSha256")
            or r9_closure.get("payloadEmissionSha256") != sha256(r9_emission_path)
            or r9_closure.get("pathRelocationReceiptSha256") != sha256(path_relocation_path)
            or path_relocation.get("kind") != "r9-source-path-relocation-v1"
            or r9_closure.get("routeProofSha256") != sha256(r9_route_path)
            or r9_closure.get("webpConversionSha256") != sha256(r9_conversion_path)
            or r9_closure.get("collisionPackSha256") != ACT1_R9_SOURCE_COLLISION_SHA256
            or r9_closure.get("visibleAlphaSha256") != ACT1_R9_SOURCE_ALPHA_SHA256):
        raise BaselineError("R9 source closure summary identities disagree with its payload")
    if (r9_input_closure.get("kind") != "r9-terrain-source-closure-v1"
            or r9_input_closure.get("generatorPath") != "build_r9_terrain.py"
            or r9_input_closure.get("generatorSha256") != paint_source.get("forestR9GeneratorSha256")
            or r9_input_closure.get("sourceCommit") != "246dfd1d6000b6f84ac80639698b15bc14185622"
            or r9_input_closure.get("sourceManifestSha256") != "0a595440eb501d952623645171c5ba183d742e188e78d0216de850003d7213be"
            or r9_input_closure.get("r3ManifestSha256") != "366b4c85120140910f2bc16a541c5699b732cfd6cb749509d6f46ed6f15b7e9a"
            or r9_input_closure.get("r26ManifestSha256") != ACT1_R26_MANIFEST_SHA256):
        raise BaselineError("R9 input closure is not bound to the reviewed source commit/R3/R26 inputs")
    relocation_files = path_relocation.get("files")
    if not isinstance(relocation_files, list) or len(relocation_files) != 6:
        raise BaselineError("R9 portable source relocation receipt is incomplete")
    for relocation in relocation_files:
        rel = relocation.get("path")
        if (not isinstance(rel, str) or Path(rel).is_absolute() or ".." in Path(rel).parts
                or not (r9_source / rel).is_file()
                or sha256(r9_source / rel) != relocation.get("versionedPortableSha256")):
            raise BaselineError(f"R9 portable source relocation hash mismatch: {rel}")
    generator_relocation = next((x for x in relocation_files if x.get("path") == "build_r9_terrain.py"), None)
    if (not generator_relocation or generator_relocation.get("sourceArtifactSha256") != r9_input_closure.get("generatorSha256")
            or generator_relocation.get("versionedPortableSha256") != r9_closure.get("generatorPortableSha256")):
        raise BaselineError("R9 executed generator and versioned portable generator identities disagree")
    r9_source_chunks = r9_input_closure.get("sourceChunks")
    r8_paint_root = ROOT / "design/review/overworld-art-blueprint/act-by-act/act1/runtime-v8/act1-painted-overworld-r8/runtime"
    r8_chunks = {c.get("id"): c for c in json.loads((r8_paint_root / "manifest.json").read_text(encoding="utf-8")).get("chunks", [])}
    if not isinstance(r9_source_chunks, list) or len(r9_source_chunks) != 120:
        raise BaselineError("R9 source closure must cover all 120 original terrain chunks")
    for item in r9_source_chunks:
        cid = item.get("id")
        original = r8_chunks.get(cid)
        if (not original or item.get("base") != original.get("base") or item.get("forest") != original.get("forest")
                or item.get("baseSha256") != original.get("baseSha256") or item.get("forestSha256") != original.get("forestSha256")
                or sha256(r8_paint_root / item["base"]) != item.get("baseSha256")
                or sha256(r8_paint_root / item["forest"]) != item.get("forestSha256")):
            raise BaselineError(f"R9 source closure original chunk input changed: {cid}")
    for field, expected_sha in (("r3Manifest", "366b4c85120140910f2bc16a541c5699b732cfd6cb749509d6f46ed6f15b7e9a"),
                                ("r26Manifest", ACT1_R26_MANIFEST_SHA256),
                                ("renderer", "8a2f8f7d9cd3a24c8a20e45630e8a181c820082bcdb2b5b3876d15429cbb98a2"),
                                ("paintConfig", "e98f6dc03f98ff9f13b1b32d1df2e5017b88a7a71319c364b9807481ee09399f"),
                                ("semanticMask", "97f1a64fe6bfec7b40af16fef05f70caa80bdd076a8c4c3806474b848c975068")):
        rel = r9_input_closure.get(field)
        path = ROOT / rel if isinstance(rel, str) and not Path(rel).is_absolute() and ".." not in Path(rel).parts else None
        if path is None or not path.is_file() or sha256(path) != expected_sha:
            raise BaselineError(f"R9 source closure {field} input identity mismatch")
    r9_final_path = checked_r9_source_path("manifest/final-placement-authority-r9.json", "final placement authority")
    r9_delta_path = checked_r9_source_path("manifest/placement-delta-r9.json", "placement delta")
    if (sha256(r9_final_path) != paint_source.get("forestFinalPlacementManifestSha256")
            or sha256(r9_delta_path) != paint_source.get("forestPlacementDeltaSha256")
            or r9_manifest.get("source", {}).get("forestFinalPlacementManifestSha256") != sha256(r9_final_path)
            or r9_manifest.get("source", {}).get("forestPlacementDeltaSha256") != sha256(r9_delta_path)):
        raise BaselineError("R9 final placement authority/delta identity mismatch")
    r9_placements = json.loads(r9_final_path.read_text(encoding="utf-8"))
    if len(r9_placements.get("placements", [])) != r9_manifest.get("source", {}).get("placementCount"):
        raise BaselineError("R9 final placement authority count does not match its manifest")
    # The bundled R9 route report is retained only as historical source lineage. Its generic SAFE
    # probes and old COMPASS corridors are not active terrain keepouts or current acceptance proof.
    if (r9_conversion.get("kind") != "act1-r9-lossless-base-webp-conversion"
            or r9_conversion.get("sourceManifestSha256") != sha256(r9_manifest_path)
            or r9_conversion.get("collisionPackSha256") != ACT1_R9_SOURCE_COLLISION_SHA256
            or r9_conversion.get("chunkCount") != 120):
        raise BaselineError("R9 lossless base WebP conversion provenance mismatch")
    converted = {x.get("id"): x for x in r9_conversion.get("chunks", [])}
    r9_chunks = {x.get("id"): x for x in r9_manifest.get("chunks", [])}
    if set(converted) != set(r9_chunks):
        raise BaselineError("R9 lossless base WebP map does not cover exactly the 120 chunks")
    mountain_affected = set(paint_source.get("mountainLayerAffectedChunks", []))
    if len(mountain_affected) != 41:
        raise BaselineError("approved mountain junction overlay must affect exactly its 41 declared base chunks")
    correction_root = ACT1_PAINT_RUNTIME.parent / "source" / "build83-paint-correction-v1"
    correction_path = correction_root / "correction-receipt.json"
    oct4_receipt_path = correction_root / "oct4-promotion-receipt.json"
    oct4_stage_path = correction_root / "oct4-production-stage.json"
    if (not correction_path.is_file() or not oct4_receipt_path.is_file() or not oct4_stage_path.is_file()
            or sha256(oct4_receipt_path) != ACT1_BUILD83_OCT4_RECEIPT_SHA256
            or sha256(oct4_stage_path) != ACT1_BUILD83_OCT4_STAGE_SHA256):
        raise BaselineError("Build 83 correction predecessor receipts are missing or changed")
    oct4_receipt = json.loads(oct4_receipt_path.read_text(encoding="utf-8"))
    oct4_stage = json.loads(oct4_stage_path.read_text(encoding="utf-8"))
    if (oct4_receipt.get("candidateManifestSha256") != ACT1_BUILD83_SOURCE_MANIFEST_SHA256
            or oct4_receipt.get("combinedCollisionSha256") != ACT1_BUILD83_SOURCE_COLLISION_SHA256
            or set(oct4_stage.get("baseChunkHashes", {})) != mountain_affected
            or oct4_receipt.get("baseChunkCount") != 41):
        raise BaselineError("Build 83 correction no longer follows the reviewed Oct 4 41-chunk stage")
    expected_source_bases = {cid: digest["webpSha256"] for cid, digest in converted.items()}
    expected_source_bases.update(oct4_stage.get("baseChunkHashes", {}))
    expected_source_authorities = {cid: "r9-lossless-webp-conversion" for cid in converted}
    expected_source_authorities.update({cid: "oct4-final-stage" for cid in oct4_stage.get("baseChunkHashes", {})})
    correction_receipt = json.loads(correction_path.read_text(encoding="utf-8"))
    correction_outputs = validate_build83_correction_record(
        correction_receipt, sha256(correction_path), paint_source, paint_manifest, expected_source_bases, expected_source_authorities,
        ACT1_BUILD83_CORRECTION_RECEIPT_SHA256, ACT1_BUILD83_CORRECTION_AFFECTED_CHUNKS,
        ACT1_BUILD83_SOURCE_MANIFEST_SHA256, ACT1_BUILD83_SOURCE_COLLISION_SHA256,
        ACT1_BUILD83_OCT4_RECEIPT_SHA256, ACT1_BUILD83_OCT4_STAGE_SHA256,
        ACT1_PAINT_UNDERPAINT_SHA256, ACT1_PAINT_COLLISION["sha256"], ACT1_PAINT_COLLISION["sourceSha256"])
    for chunk in paint_manifest.get("chunks", []):
        cid = chunk["id"]
        rec = converted[cid]
        generated = r9_chunks[cid]
        png_path = checked_r9_source_path(rec.get("sourcePng"), f"{cid} generated base PNG")
        webp_path = checked_r9_source_path(rec.get("webp"), f"{cid} converted base WebP")
        forest_path = checked_r9_source_path(generated.get("forest"), f"{cid} generated forest layer")
        if (rec.get("pixelIdentical") is not True or sha256(png_path) != rec.get("sourcePngSha256")
                or sha256(webp_path) != rec.get("webpSha256") or sha256(forest_path) != generated.get("forestSha256")
                or (cid not in mountain_affected and cid not in correction_outputs
                    and chunk.get("baseSha256") != rec.get("webpSha256"))
                or (cid in correction_outputs and chunk.get("baseSha256") != correction_outputs[cid])):
            raise BaselineError(f"R9 {cid} base/forest manifest hash or lossless conversion proof mismatch")
    if (r9_manifest.get("forestMode") != "whole-object-v8"
            or r9_manifest.get("collision", {}).get("sha256") != ACT1_R9_SOURCE_COLLISION_SHA256
            or sha256(checked_r9_source_path("collision/forest-alpha-visible.bin", "visible alpha source")) != ACT1_R9_SOURCE_ALPHA_SHA256
            or sha256(checked_r9_source_path("collision/forest-collision.bin", "collision pack")) != ACT1_R9_SOURCE_COLLISION_SHA256):
        raise BaselineError("R9 forest mode/collision source identity mismatch")

    geometry_chunks = geometry_manifest.get("chunks")
    paint_chunks = paint_manifest.get("chunks")
    if not isinstance(geometry_chunks, list) or not isinstance(paint_chunks, list):
        raise BaselineError("Act 1 geometry/paint chunk declarations are missing")
    if len(geometry_chunks) != 120 or len(paint_chunks) != len(geometry_chunks):
        raise BaselineError("Act 1 paint manifest must preserve all 120 r26 chunks")
    for geometry_chunk, paint_chunk in zip(geometry_chunks, paint_chunks):
        if geometry_chunk.get("id") != paint_chunk.get("id"):
            raise BaselineError("Act 1 paint manifest changed chunk ordering or IDs")
        for key in ("id", "x", "y", "width", "height"):
            if geometry_chunk.get(key) != paint_chunk.get(key):
                raise BaselineError(
                    f"Act 1 paint manifest changed {geometry_chunk.get('id')} geometry at {key}")
        if set(paint_chunk) != set(geometry_chunk) | {"basePixelsPerCell", "forest", "forestSha256"}:
            raise BaselineError(f"{paint_chunk['id']}: unexpected paint chunk metadata")
        if paint_chunk.get("basePixelsPerCell") != 32:
            raise BaselineError(f"{paint_chunk['id']}: painted base must declare 32 pixels per cell")
        for layer in ACT1_HIFI_CHUNK_LAYERS:
            if layer != "forest" and paint_chunk.get(layer) != geometry_chunk.get(layer):
                raise BaselineError(f"{paint_chunk['id']}: paint profile changed {layer} resource path")
            extension = "png" if layer in {"water", "forest"} else "webp"
            if paint_chunk[layer] != f"chunks/{layer}/{paint_chunk['id']}.{extension}":
                raise BaselineError(f"{paint_chunk['id']}: unexpected {layer} resource path")
        for layer in ("water",):
            if paint_chunk.get(f"{layer}Sha256") != geometry_chunk.get(f"{layer}Sha256"):
                raise BaselineError(f"{paint_chunk['id']}: paint profile changed locked {layer} hash")

    hifi_files = {
        "index.html": "runtime.html",
        "walkable-regions-r26.json": "walkable-regions-v1.json",
        "walkable-polygons.js": "walkable-polygons.js",
        "walkable-route-state.js": "walkable-route-state.js",
        "path-corridor.js": "path-corridor.js",
        "hero-g3/hero-act1-female-walk-8x3-64-g3.png":
            "hero-g3/hero-act1-female-walk-8x3-64-g3.png",
    }
    hifi_files["manifest.json"] = "manifest.json"
    hifi_files[ACT1_PAINT_FOREST_UNDERPAINT["src"]] = ACT1_PAINT_FOREST_UNDERPAINT["src"]
    hifi_files[ACT1_PAINT_COLLISION["artifact"]] = ACT1_PAINT_COLLISION["artifact"]
    paint_resources: dict[str, str] = {}
    for chunk in paint_chunks:
        for layer in ACT1_HIFI_CHUNK_LAYERS:
            resource = chunk.get(layer)
            declared_hash = chunk.get(f"{layer}Sha256")
            if (not isinstance(resource, str) or not resource or Path(resource).is_absolute()
                    or ".." in Path(resource).parts or not isinstance(declared_hash, str)
                    or len(declared_hash) != 64):
                raise BaselineError(f"{chunk['id']}: invalid {layer} resource declaration")
            paint_resources[resource] = declared_hash
            hifi_files[resource] = resource
    underpaint_path = ACT1_PAINT_UNDERPAINT["src"]
    paint_resources[underpaint_path] = ACT1_PAINT_UNDERPAINT_SHA256
    hifi_files[underpaint_path] = underpaint_path
    paint_resources[ACT1_PAINT_FOREST_UNDERPAINT["src"]] = ACT1_PAINT_FOREST_UNDERPAINT_SHA256
    paint_resources[ACT1_PAINT_COLLISION["artifact"]] = ACT1_PAINT_COLLISION["sha256"]
    if len(paint_resources) != 483:
        raise BaselineError("Act 1 R7 resource closure must contain 480 chunk files, two underpaints, and collision authority")
    bounds = paint_manifest["semanticBounds"]
    expected_underpaint_size = ((bounds[2] - bounds[0] + 1) * ACT1_PAINT_UNDERPAINT["pixelsPerCell"],
                                (bounds[3] - bounds[1] + 1) * ACT1_PAINT_UNDERPAINT["pixelsPerCell"])
    if expected_underpaint_size != (ACT1_PAINT_UNDERPAINT["pixelWidth"],
                                    ACT1_PAINT_UNDERPAINT["pixelHeight"]):
        raise BaselineError("Act 1 underpaint dimensions do not match inclusive semantic bounds")
    forest_bounds = ACT1_PAINT_FOREST_UNDERPAINT["bounds"]
    forest_size = ((forest_bounds[2] - forest_bounds[0] + 1) * ACT1_PAINT_FOREST_UNDERPAINT["pixelsPerCell"],
                   (forest_bounds[3] - forest_bounds[1] + 1) * ACT1_PAINT_FOREST_UNDERPAINT["pixelsPerCell"])
    if forest_size != (ACT1_PAINT_FOREST_UNDERPAINT["width"], ACT1_PAINT_FOREST_UNDERPAINT["height"]):
        raise BaselineError("Act 1 forest underpaint dimensions do not match inclusive semantic bounds")
    expected_hifi_paths = {f"act1-hifi/{target}" for target in hifi_files.values()}
    expected_hifi_paths.add("act1-hifi/adapter.js")
    expected_paths = (set(expected_entries) | {"act1-world-map.js"} | expected_hifi_paths
                      | set(ACT1_MATERIAL_FILES) | set(ACT1_DUNGEON_FILES)
                      | set(ACT1_TOWN_FILES) | set(ACT1_LANDMARK_FILES) | set(UI_ASSET_FILES)
                      # ACT1_OVERLAY_FILES began as pure OVERRIDES of paths the baseline
                      # manifest already carried, so it was never part of this union. It can
                      # now also ADD a runtime file (hero-g3-walk.png), which the manifest by
                      # definition does not know about, so it has to be unioned in too.
                      | set(ACT1_OVERLAY_FILES))
    # Active terrain-union assets are pinned above and validated against the active public
    # manifest. The adjacent R9 runtime remains immutable historical lineage, not a second
    # collision authority for this candidate.
    public_hifi_files = files_under(ROOT / "public" / "act1-hifi")
    # This historical walkable JSON is a source-only input used by a town asset
    # derivation script. The served town uses town/portSapphire-walkable.json;
    # keep the source input accounted for without promoting it into runtime closure.
    source_only_town_input = "portSapphire-walkable-v1.json"
    source_only_path = ROOT / "public" / "act1-hifi" / source_only_town_input
    if (not source_only_path.is_file() or source_only_path.stat().st_size != 30318
            or sha256(source_only_path) != "87e7ff272a4da3304ed798584a69077ffdf0c0c1d4481758cfb7d623a55b5eaf"):
        raise BaselineError("source-only Port Sapphire walkable input identity changed")
    public_hifi_files.pop(source_only_town_input, None)
    expected_public_hifi_paths = {
        path.removeprefix("act1-hifi/")
        for path in expected_paths
        if path.startswith("act1-hifi/")
    }
    if set(public_hifi_files) != expected_public_hifi_paths:
        raise BaselineError("active Act 1 public file inventory differs from its pinned manifest closure")
    if not (expected_paths - set(all_found)):
        dist_hifi_files = {
            path.removeprefix("act1-hifi/"): file_path
            for path, file_path in all_found.items()
            if path.startswith("act1-hifi/")
        }
        shipped_hifi_paths = {
            path.removeprefix("act1-hifi/")
            for path in expected_paths
            if path.startswith("act1-hifi/")
        }
        if shipped_hifi_paths != set(dist_hifi_files):
            raise BaselineError(
                "Act 1 shipped source/dist runtime file sets differ; "
                f"missing={sorted(shipped_hifi_paths - set(dist_hifi_files))}, "
                f"extra={sorted(set(dist_hifi_files) - shipped_hifi_paths)}")
        if any(public_hifi_files[path].read_bytes() != dist_hifi_files[path].read_bytes()
               for path in shipped_hifi_paths):
            raise BaselineError("versioned Act 1 paint source/dist runtime bytes differ")
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
            raise BaselineError(
                f"Act 1 runtime identity mismatch: {relative_path}\n"
                f"  This file's bytes no longer match its pinned SHA. If you EDITED it on purpose,\n"
                f"  that is expected and the fix is one command:  ./scripts/repin.sh\n"
                f"  If you did NOT edit it, stop: something changed a protected runtime file."
            )

    for relative_path, (mat_size, mat_hash) in ACT1_MATERIAL_FILES.items():
        mat = all_found[relative_path]
        if mat.stat().st_size != mat_size or sha256(mat) != mat_hash:
            raise BaselineError(f"Act 1 terrain material identity mismatch: {relative_path}")
        public_mat = ROOT / "public" / relative_path
        if not public_mat.is_file() or public_mat.read_bytes() != mat.read_bytes():
            raise BaselineError(f"public/dist material twins differ: {relative_path}")

    for relative_path, (font_size, font_hash) in UI_ASSET_FILES.items():
        fnt = all_found[relative_path]
        if fnt.stat().st_size != font_size or sha256(fnt) != font_hash:
            raise BaselineError(f"UI asset identity mismatch: {relative_path}")
        public_font = ROOT / "public" / relative_path
        if not public_font.is_file() or public_font.read_bytes() != fnt.read_bytes():
            raise BaselineError(f"public/dist UI asset twins differ: {relative_path}")

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
        if source_relative == "manifest.json":
            source_root = ROOT / "public" / "act1-hifi"
        elif source_relative in {"walkable-regions-r26.json"}:
            source_root = ACT1_R26_RUNTIME
        elif source_relative.startswith("chunks/") or source_relative.startswith("underpaint/") or source_relative == ACT1_PAINT_COLLISION["artifact"]:
            source_root = ACT1_R26_RUNTIME if "/water/" in source_relative else ROOT / "public" / "act1-hifi"
        else:
            source_root = ACT1_HIFI_RUNTIME
        source = source_root / source_relative
        target = all_found[f"act1-hifi/{target_relative}"]
        if source.read_bytes() != target.read_bytes():
            raise BaselineError(f"Act 1 high-fidelity runtime identity mismatch: {target_relative}")
        public_source = ROOT / "public" / "act1-hifi" / target_relative
        if not public_source.is_file() or public_source.read_bytes() != source.read_bytes():
            raise BaselineError(f"public/source Act 1 high-fidelity twins differ: {target_relative}")
        if source_relative in paint_resources and sha256(source) != paint_resources[source_relative]:
            raise BaselineError(f"Act 1 paint resource hash mismatch: {source_relative}")
        if source_relative == underpaint_path:
            header = source.read_bytes()[:24]
            if (len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n"
                    or struct.unpack(">II", header[16:24]) != expected_underpaint_size):
                raise BaselineError("Act 1 underpaint PNG dimensions/signature do not match its manifest")
    public_adapter = ROOT / "public" / "act1-hifi" / "adapter.js"
    dist_adapter = all_found["act1-hifi/adapter.js"]
    if not public_adapter.is_file() or public_adapter.read_bytes() != dist_adapter.read_bytes():
        raise BaselineError("public/dist Act 1 high-fidelity adapter twins differ")

    semantic_checks(root, all_found)
    html = all_found["index.html"].read_text(encoding="utf-8")
    if "act1-world-map.js" not in html or html.index("act1-world-map.js") > html.index("dq-tiles.js"):
        raise BaselineError("Act 1 override must load before dq-tiles.js")
    if ("battle-recovery.js" not in html
            or html.index("battle-recovery.js") < html.index("assets/index-BhoGQRaA.js")
            or html.index("battle-recovery.js") < html.index("hero-override.js")):
        raise BaselineError("battle recovery must load after the frozen module declaration and sibling overrides")
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
    verify_act1_parser.add_argument(
        "--terrain-profile",
        choices=("historical", "act1-forward-20261007-v1"),
        default="historical",
        help="explicitly select the forward terrain profile; the historical profile remains default",
    )
    verify_act1_parser.add_argument(
        "--qa-preparation",
        action="store_true",
        help="validate static closure for a nonshippable QA candidate; never proves release eligibility",
    )
    manifest_parser = subparsers.add_parser("write-manifest", help="lead-only explicit baseline promotion")
    manifest_parser.add_argument("--confirm-profile", required=True)
    subparsers.add_parser("verify-candidates", help="verify the preserved unapproved monster candidates")
    candidate_parser = subparsers.add_parser(
        "write-candidate-manifest", help="lead-only candidate snapshot refresh"
    )
    candidate_parser.add_argument("--confirm", required=True)
    subparsers.add_parser(
        "verify-forward-terrain-source",
        help="validate independently pinned forward-profile inputs/proofs before build mutation",
    )
    subparsers.add_parser(
        "verify-forward-terrain-preparation",
        help="validate static closure for the explicit nonshippable QA-preparation stage",
    )
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
            if args.qa_preparation and args.terrain_profile != "act1-forward-20261007-v1":
                raise BaselineError("--qa-preparation is only valid with the explicit forward terrain profile")
            if args.terrain_profile == "historical":
                verify_act1_overlay(args.input.resolve(), allowed_extra)
                print(f"ACT 1 OVERLAY VERIFY PASS [historical]: {args.input.resolve()}")
            else:
                from terrain_current_profile import ProfileError, validate_runtime
                try:
                    stage = "preparation" if args.qa_preparation else "release"
                    descriptor_digest, output_digest = validate_runtime(ROOT, args.input.resolve(), allowed_extra, sys.modules[__name__], stage=stage)
                except ProfileError as error:
                    raise BaselineError(str(error)) from error
                if args.qa_preparation:
                    from terrain_current_profile import PENDING_DYNAMIC_CHECKS, PENDING_PROOF_ASSERTIONS
                    print(f"QA_PREPARATION_PASS releaseEligible=false [{args.terrain_profile}]: {args.input.resolve()} descriptor={descriptor_digest} outputs={output_digest} pendingGroups={','.join(PENDING_DYNAMIC_CHECKS)} pendingAssertions={','.join(PENDING_PROOF_ASSERTIONS)}")
                else:
                    print(f"ACT 1 OVERLAY VERIFY PASS [{args.terrain_profile}]: {args.input.resolve()} descriptor={descriptor_digest} outputs={output_digest}")
        elif args.command == "write-manifest":
            write_manifest(args.confirm_profile)
        elif args.command == "verify-candidates":
            verify_candidates()
            print(f"CANDIDATE VERIFY PASS: {CANDIDATE_MANIFEST}")
        elif args.command == "write-candidate-manifest":
            write_candidate_manifest(args.confirm)
        elif args.command == "verify-forward-terrain-source":
            from terrain_current_profile import ProfileError, validate_source_inventory
            try:
                validate_source_inventory(ROOT)
            except ProfileError as error:
                raise BaselineError(str(error)) from error
            print("FORWARD TERRAIN SOURCE PASS: independently pinned full-world descriptor validated")
        elif args.command == "verify-forward-terrain-preparation":
            from terrain_current_profile import ProfileError, PENDING_DYNAMIC_CHECKS, PENDING_PROOF_ASSERTIONS, validate_source_inventory
            try:
                descriptor_digest, output_digest = validate_source_inventory(ROOT, stage="preparation")
            except ProfileError as error:
                raise BaselineError(str(error)) from error
            print(f"QA_PREPARATION_PASS releaseEligible=false descriptor={descriptor_digest} outputs={output_digest} pendingGroups={','.join(PENDING_DYNAMIC_CHECKS)} pendingAssertions={','.join(PENDING_PROOF_ASSERTIONS)}")
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
