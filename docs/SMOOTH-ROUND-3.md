# SMOOTH round 3 — the map swap stops synthesising terrain it has already baked

One atomic change: **the overworld's collision field is no longer derived from scratch on a map
swap.** Both procedural evaluations that ran on the town-to-overworld return leg are removed —
one because nobody was ever going to read its answer, the other because the map it was reading
had not finished being set up yet.

Compared against `main` @ `c325049` (the commit that recorded round 2's verification),
re-measured interleaved A/B in one sequence, so both sides carry the same machine.

| | |
|---|---|
| Round | 3 |
| Measured | 2026-08-08 |
| Before | `main` @ `c325049` |
| After | this branch |
| Changed | `public/dq-tiles.js` only, plus the three sha pins it forces |
| Bundle | `dist/assets/index-BhoGQRaA.js` md5 `60d90b63607b6e6980eb170aeeed445e` — unchanged |
| Probe | `scripts/perf_probe.cjs --compare`, **8 runs per side**, interleaved A/B/A/B/… |
| Probe sha | `0a429d62f3606dfca41cd7dfd9d2c37a0f88a4fa066bbb3fa51ed4d3e9338eae` — identical to `main`'s copy, `git diff` empty after all measurement |
| Viewport | 960x720, dpr 1, canvas 960x644, coarse-pointer touch emulation ON (shipped controls visible) |
| Renderer | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)` — real GPU, not SwiftShader, both sides |
| `uptime` before / after | 1.28 1.64 1.95 / 2.52 2.50 2.29 |
| 1-min load at each run start | base 1.28 / 1.73 / 2.67 / 2.67 / 2.66 / 2.29 / 2.52 / 2.48 · fix 1.59 / 2.43 / 2.72 / 2.45 / 2.69 / 2.42 / 2.10 / 2.43 |
| Runs voided | **none** (ceiling 10; highest reading 2.72) |
| Page errors | **0** across all 16 runs |

The two served trees differ in **exactly one file** (`diff -rq`): `dist/dq-tiles.js`. Both were
built by `./scripts/build-dist.sh` in this worktree, the base tree snapshotted before the edit.
That is what makes the comparison attributable.

## Why the field evaluation was on the critical path

Round 2 attributed the residual ~1.25 s block to "the dq-tiles procedural field evaluation" and
named the functions — `waterField`, `et`, `fieldAt`, `vnoise`, `mountainField`, `owmBuild`. It did
not say **which caller** was running them, and that turned out to be the whole answer.

It is not `drawTerrain`. On the return leg `drawTerrain` never runs its per-pixel loop at all —
round 1's chunk retention already sees to that, and the probe's own splat counter confirms zero
full-viewport `createImageData` calls between walking out of Greenhollow and the overworld being
playable. The caller is **`owmFor` → `owmBuild`**, the overworld's *collision* field: the same
`waterField`/`mountainField` evaluated at the same 0.50 iso-line the terrain is painted with, over
the same window, so that what blocks the hero is what she can see.

`owmFor` is reached from the mover's per-frame `sceneUpdate` wrapper. It ran **twice** on every
return, and both runs were avoidable for different reasons. Instrumented on the committed base
tree (browser, 960x720, hero walking out of Greenhollow at (69,256)):

```
10534ms  loadMap -> overworld (from greenhollow)   camScroll=[0,124]     wv=[0,124,960,644]
10623ms  loadMap returns                           camScroll=[2856,11990] wv=[0,124,960,644]   <- worldView STALE
11038ms  OWM analytic  413.4ms  key=0_0_44_38      3.85Mpx [W-]   hero=[69,257]
11586ms  OWM analytic  604.0ms  key=36_228_44_38   3.85Mpx [WM]   hero=[69,257]
```

**Build 1 — 413 ms for a window the hero is 250 cells away from.** Phaser recomputes
`cam.worldView` in its own preRender. On the frames immediately after `loadMap()` the camera's
*scroll* has already jumped to the hero while `worldView` still holds the map she left — here the
town's `[0,124]`. `windowStart` clamps that to the map's origin corner, so `owmFor` asks for
window `0_0_44_38`. That rectangle is outside the Act 1 plate (`semanticBounds` y 218–399), so
`owmAssemble` cannot serve it from the bake and `owmBuild` synthesises 3.85 M pixels of
`waterField`/`mountainField` for it. One frame later the real window replaces it. Nothing ever
read it. **This is the `0_0_33_39` window the smooth skill lists as "analytic in both builds" —
it is not a hole in the bake's coverage, it is a window nobody asked for.**

**Build 2 — 604 ms because the map was not finished.** `act1-overworld-walk.bin`'s header hash is
taken over the *fully set-up* map: generator output, plus `consolidateMapData`'s mountain
clustering, plus the owner's Act 1 plate. `owmBakeFor` compares `owmMapHash(map)` against it. But
that setup lived inline in `tick()`, which runs on an 80 ms `setInterval`, while `owmFor` runs
from `sceneUpdate` **every frame** — so on a return it reached the new `mapData` array first and
hashed a map that was only partly set up (observed hash `8577ea0b`; the bake wants `b88fc7dc`).
A hash miss does not degrade gracefully: it falls straight through to the per-pixel path. The
same window `36_228_44_38` costs **2.1 ms** assembled from the bake and **488–604 ms** built
analytically.

That second one was also **wrong, not merely slow**. The field it built describes an
unconsolidated coastline, and `owmState` caches it against the array identity — which the plate
then mutates in place — so the hero walked on a collision field the painting disagreed with until
the window next moved, about 12 cells later.

So the answer to the round's framing question is: **neither a cacheable result nor a coverage
hole.** One evaluation was for a window that did not exist, and the other was a race against the
game's own map setup. Both are removals, not caches.

## What changed

`public/dq-tiles.js`, three edits, no new state and no new cache:

1. **`owEnsureMapSetup(scene)`** — `tick()`'s inline overworld map-setup block (consolidate → Act 1
   plate → minimap redraw) extracted verbatim into a function, still guarded on the `mapData`
   array identity so it runs exactly once per array. `tick()` calls it where the block used to be.
2. **`owmFor` calls it before deciding anything.** Whoever reaches a new array first does the
   setup; the bake hash then matches and the assemble path is taken. `owSetupPending` carries the
   "tiles moved" signal back to `tick()` so its `owFresh`/`a1fresh` window invalidation is
   unchanged.
3. **`owmFor` tests that the hero is inside the window before building it.** The identical test
   already existed four lines lower, against the built field's own `ox/oy/W/H` — which are exactly
   `X0*N`, `Y0*N`, `winW*N`, `winH*N`, all known before the build. Same question, same answer; the
   only difference is that a window she is not standing in no longer costs a field to reject. The
   post-build test is kept as a cheap backstop.

**What invalidates any cache: nothing new was cached.** The one cache involved, `owmState`, keeps
its existing key (`mapData` array identity + `X0_Y0_winW_winH`) untouched. The change makes that
cache *less* likely to hold a stale value, because the field is now derived from a settled map
rather than a half-set-up one. `owEnsureMapSetup` is invalidated by array identity, exactly as the
block it was extracted from was — a new `mapData` array (which is what a town exit hands over) is
the only thing that re-arms it.

## The numbers — 8 runs per side, interleaved

Medians with the full spread and an explicit overlap statement. `p` is a two-sided
Mann-Whitney U with tie correction over the 8+8 per-run values.

| metric | base median (spread, n) | fix median (spread, n) | overlap | p (MWU) |
|---|---|---|---|---|
| SMOOTH-1 continue-rel | 2600.2 (2460.7–2730.3, 8) | 2682.1 (2462.3–2700.1, 8) | **OVERLAP** | 0.793 |
| S1 first real terrain | 2429.1 (2405.8–2450.5, 8) | 2421.2 (2403.0–2438.7, 8) | **OVERLAP** | 0.318 |
| SMOOTH-2 median fps | 59.9 (59.9–59.9, 8) | 59.9 (59.9–59.9, 8) | **OVERLAP** | 1.000 |
| S2 mean fps | 52.2 (51.8–52.9, 8) | 53.5 (53.4–53.7, 8) | NO OVERLAP | <0.001 |
| SMOOTH-3 p99 | 18.9 (18.7–19.0, 8) | 18.8 (18.7–18.9, 8) | **OVERLAP** | 0.473 |
| **S3 worst frame** | **1238.2 (1134.4–1271.6, 8)** | **995.4 (987.0–1010.8, 8)** | NO OVERLAP | <0.001 |
| S3 frames >100 ms | 2 (2–2, 8) | 2 (2–2, 8) | **OVERLAP** | 1.000 |
| **SMOOTH-4 longest block** | **1226.2 (1116.6–1254.8, 8)** | **988.1 (975.0–996.6, 8)** | NO OVERLAP | <0.001 |
| S4 LoAF blocking | 1183.6 (1074.1–1212.4, 8) | 944.2 (932.5–952.7, 8) | NO OVERLAP | <0.001 |
| S4 watchdog drift | 1226.2 (1116.6–1254.8, 8) | 988.1 (975.0–996.6, 8) | NO OVERLAP | <0.001 |
| **SMOOTH-5 worst swap** | **1094.1 (542.3–1157.8, 8)** | **146.4 (137.3–154.6, 8)** | NO OVERLAP | <0.001 |
| S5 into town | 16.3 (15.5–135.5, 8) | 15.2 (13.8–135.2, 8) | **OVERLAP** | 0.371 |
| S5 town → overworld | 1094.1 (542.3–1157.8, 8) | 146.4 (137.3–154.6, 8) | NO OVERLAP | <0.001 |
| SMOOTH-6 worst tap | 50.8 (32.6–87.3, 8) | 53.0 (50.4–84.7, 8) | **OVERLAP** | 0.462 |
| S6 battle command | 16.4 (14.6–16.8, 8) | 16.9 (14.6–18.1, 8) | **OVERLAP** | 0.126 |
| splats before terrain | 1 (1–1, 8) | 1 (1–1, 8) | **OVERLAP** | 1.000 |
| tileLayer objects | 0 | 0 | — | — |

**Rows whose spreads overlap are NOT established.** That is stated explicitly for SMOOTH-1,
SMOOTH-2, SMOOTH-3 p99, frames >100 ms, SMOOTH-6, S5-into-town and the splat count: this round
did not move any of them, and no claim is made that it did.

### Green/red against the targets

| ID | Target | Base | Fix | Verdict |
|---|---|---|---|---|
| SMOOTH-1 | ≤ 1500 ms | 2600.2 ms | 2682.1 ms | **RED**, unchanged (spreads overlap) |
| SMOOTH-2 | ≥ 55 fps | 59.9 fps | 59.9 fps | GREEN |
| SMOOTH-3 | worst ≤ 100 ms AND zero over 100 ms | 1238.2 ms / 2 | 995.4 ms / 2 | **RED**, improved −242.8 ms |
| SMOOTH-4 | ≤ 100 ms | 1226.2 ms | 988.1 ms | **RED**, improved −238.1 ms (19.4%) |
| SMOOTH-5 | ≤ 500 ms | 1094.1 ms | 146.4 ms | **GREEN**, −947.7 ms |
| SMOOTH-6 | ≤ 100 ms | 50.8 ms | 53.0 ms | GREEN |

**SMOOTH-5 goes green. SMOOTH-4 does not, and it is now a different event.** Round 2 wrote that
"SMOOTH-4 and SMOOTH-5 are the same event"; that was true then, and this round is exactly what
ends it. The LoAF top-5 shows why, and it does so in all 8 runs:

| | base run 1 | fix run 1 |
|---|---|---|
| 1st | 1074.3 ms @ 13291.8 | **936.4 ms @ 12410.1** |
| 2nd | **444.3 ms @ 10571.2** | 71.9 ms @ 10527.5 |
| 3rd | **439.9 ms @ 11080.9** | 67.5 ms @ 9127.0 |
| 4th | 78.3 ms @ 9204.8 | 64.7 ms @ 13444.6 |

The two bolded base entries at ~10.5 s and ~11.1 s are the two `owmBuild` runs. They are **gone**
on every fix run — the next-largest block after the leader drops from ~440–556 ms to ~64–75 ms.
What remains at the top is a block ~12.4 s in, during the **walk**, not the swap; it is the same
event SMOOTH-3's worst frame reports (995.4 ms worst frame vs 988.1 ms longest block).

## Post-change CPU profile of the return leg

CDP profile, 100 us sampling, 3 legs per build, profiler started as the hero begins walking south
out of Greenhollow and stopped once the overworld has settled — the same form as round 2's
residual-attribution table.

| self time | base (3 legs) | fix (3 legs) |
|---|---|---|
| `waterField @dq-tiles.js:555` | 373.2 / 379.8 / 408.6 ms | **absent** |
| `et @dq-tiles.js:263` | 320.9 / 338.0 / 342.6 ms | **absent** |
| `owmBuild @dq-tiles.js:2580` | 66.8 / 150.4 / 182.5 ms | **absent** |
| `vnoise @dq-tiles.js:72` | 81.3 / 82.1 / 89.0 ms | **absent** |
| `fieldAt @dq-tiles.js:548` | 55.2 / 57.8 / 91.8 ms | **absent** |
| `mountainField @dq-tiles.js:559` | 6.1 / 8.7 / 32.6 ms | **absent** |
| `owmAssemble @dq-tiles.js:2716` | absent | 3.4 / 3.9 ms |
| `consolidateMapData @dq-tiles.js:334` | 8.5 / 12.8 / 17.1 ms | 8.2 / 13.5 / 16.3 ms |
| `Ep @bundle:73278` (overworld map regen) | 8.1 / 8.7 / 8.7 ms | 8.7 / 9.2 / 9.9 ms |
| **field group total** | **1001.4 / 1020.0 / 1046.0 ms** | **0.0 / 0.0 / 0.0 ms** |
| **main-thread busy** | **1437.7 / 1477.9 / 1514.0 ms** | **384.2 / 402.9 / 439.3 ms** |
| `__DQ_OWM__` published | `analytic 655.2 / 662.3 / 682.1 ms` | `baked 3.1 / 6.1 / 11.7 ms` |

Round 2's figures are reproduced on base to within noise (it recorded `waterField` 375–413, `et`
325–341, `owmBuild` 63–178, `vnoise` 82–94, `Ep` ~10). `Ep` is unchanged, confirming again that it
was never the residual. `consolidateMapData` is unchanged, confirming that moving the setup earlier
is a reordering and not extra work.

## Visual identity — the acceptance bar

Live canvas **textures** re-hashed with FNV-1a over every byte of `getImageData` — not
screenshots, so the hero's animation frame and the HUD can neither mask nor manufacture a
difference. Nine states, five distinct overworld window origins, cold and after one and two town
round trips, both builds.

| state | window | `dqterrain` | `dqcanopy` | identical |
|---|---|---|---|---|
| overworld @ (69,256) cold | `36_228` | `cd80bafa@2112x1824` | `cb7f1dc5@2112x1824` | **YES** |
| overworld after Greenhollow round trip | `36_228` | `cd80bafa` | `cb7f1dc5` | **YES** |
| overworld after **2nd** Greenhollow round trip | `36_228` | `cd80bafa` | `cb7f1dc5` | **YES** |
| overworld @ (39,346) cold | `12_324` | `f73a5f2a` | `717f097c` | **YES** |
| overworld after Millbrook round trip | `12_324` | `f73a5f2a` | `717f097c` | **YES** |
| overworld @ (133,348) cold | `108_324` | `f40be8af` | `8c347972` | **YES** |
| overworld @ (30,275) cold | `0_252` | `21db5531` | `cf6dcdc6` | **YES** |
| inside Greenhollow / Millbrook / Port Sapphire | — | `dqtownskin 5fb48986@768x768` | — | **YES** |
| inside Sunken Cellar (dungeon) | `0_252` | `21db5531` | `cf6dcdc6` | **YES**, 840 objects both |

**Zero mismatches** across every texture hash, window origin, `mapData` hash, hero cell and
display-object count. `dqterrain cd80bafa` / `dqcanopy cb7f1dc5` and `mapData 45756f2a` are the
same values rounds 1 and 2's refutations recorded, so the terrain has not moved across three
rounds.

Non-regression, both builds, re-derived rather than re-read:

- Overworld `canMove` hash **`317b8b0a`**, **78,711 blocked**, cold **and** after a town round
  trip — identical to round 2's figure.
- **Three towns enterable through the real door**: Greenhollow, Millbrook, Port Sapphire.
- **A dungeon enterable**: Sunken Cellar, 840 objects, `mapData 66f6cfb2`, identical both sides.
- Zero page errors on either build in any of the nine states.

The `owm` log is the change in one place, per session (two Greenhollow round trips):

```
base:  baked 8.1  baked 2.1   analytic 415.1 [0_0_44_38]  analytic 606.9 [36_228_44_38]
                              analytic 408.7 [0_0_44_38]  analytic 628.8 [36_228_44_38]
fix:   baked 7.3  baked 2.0   baked   5.3 [36_228_44_38]  baked    11.0 [36_228_44_38]
```

The `0_0_44_38` window never appears on the fix at all, and the real window is served from the
bake instead of being synthesised.

## Non-regression gates, run on this tree

```
$ npm run test:map-engine
MAP ENGINE TEST PASS: Act 1 topology, determinism, collision, natural landmark thresholds, progression gates, and minimap derivation
ACT 1 OVERWORLD TEST PASS: 15008 source-land cells; meadow 32.00%; trail 8.00%; forest 46.99%; mountain 13.00%
MAP ENGINE SHELL TEST PASS: movement, retained census/adapter, re-entry planning, chunks, camera, culling, minimap, save relocation, and feature flags
RETAINED LATER GATE TEST PASS: entry, exit, floor, flags, reverse traversal, arrival, and rollback
SHIPPED OVERWORLD DQ REPLAY PASS: state-dependent whole maps and invariant final corridor windows
ACT 1 RUNTIME SNAPSHOT CHECK PASS: 148x182 205dbe88d80f31260044b466c5a4cab59aa828377010d9e834223267e6cec434
ACT 1 OVERWORLD WALK CHECK PASS: 4578 blocks, far=255, provenance 42af2d0884f99d05
ACT 1 RUNTIME OVERRIDE CHECK PASS: e5713be14ece51788798893c09a057d601d486671f97254dfb1825077ffe26b4 (8 owner-placed landmarks, 9376-cell single walkable region)
ACT 1 RUNTIME OVERRIDE TEST PASS: revision 6; 8 owner-placed doors, all firing; 9376 walkable cells in one region; plate abdcab018d5be3bd07576c97b411de373dea7241c88140da71918242552ea560

$ ./scripts/ship-gate.sh .
STATIC SHELL CHECK PASS: dist/index.html matches the tracked shell  23956 B  22d992023a24854d
PINS CHECK PASS: all 74 pins match the files on disk
ACT 1 OVERLAY VERIFY PASS: <worktree>/dist
ACT 1 OVERLAY VERIFY PASS: <worktree>/ios/App/App/public
SHIP GATE PASS: protected runtime verified; canonical overrides and iOS payload synchronized

$ md5 dist/assets/index-BhoGQRaA.js
MD5 (dist/assets/index-BhoGQRaA.js) = 60d90b63607b6e6980eb170aeeed445e
```

The Act 1 plate sha is `205dbe88d80f31260044b466c5a4cab59aa828377010d9e834223267e6cec434`, unchanged
from round 2 — world generation did not move.

The pin chain was run as prescribed: `build-dist.sh` → `extract_act1_runtime_snapshot.mjs` →
`regenerate_pins.py` → `build-dist.sh` → gates, with the two shas the generator cannot reach
hand-edited (`scripts/extract_act1_runtime_snapshot.mjs:15` and
`src/map-engine/shippedOverworldBaselineDqReplay.mjs:8`). `public/dq-tiles.js` is now
`d62f14c371044d3847db818b1321e7b9b8b8a87e7e613c984b09919340d0097d`, 295,936 B.
`scripts/perf_probe.cjs` was never edited: `git diff` on it is empty and its sha is still
`0a429d62f3606dfca41cd7dfd9d2c37a0f88a4fa066bbb3fa51ed4d3e9338eae`.

## What is still in the way — round 4's target, with evidence

SMOOTH-4's remaining ~988 ms and SMOOTH-3's ~995 ms worst frame are **one event**, and it is not
this round's target: it is `drawTerrain`'s per-pixel procedural splat, fired **during the walk**
when the render window steps to a chunk set that has not decoded yet. Instrumented directly on
both builds, same session shape:

```
base:  SPLAT 2112x1824 (3.85 Mpx)  loop=1062.6 ms  win=48_228   (hero walking east)
fix:   SPLAT 2112x1824 (3.85 Mpx)  loop= 929.7 ms  win=48_228
```

It is present on both sides and has been there since round 0 (baseline: "worst single frame
1236.8 ms"). The mechanism is a **coverage hole in time, not in space**: chunk `48_228` exists,
it is simply requested on the frame it is first needed, `a1aRects` cannot report full coverage
until it decodes, so `a1aBlit` returns false and `drawTerrain` synthesises 3.85 M pixels to cover
the wait. `a1aPrefetchStart` prefetches only the **first** window of a session; there is no
equivalent of `a1dPrefetchAdjacent` for the overworld's next window. That is a runtime fix
needing no art regenerated, and it is the single item standing between SMOOTH-3/SMOOTH-4 and
their targets.

SMOOTH-1 is a separate, third thing: its ~2.6 s is two full-window procedural splats at boot
(~970 ms each, both at window `36_228`) while the chunks decode, plus the boot cover's own gates.
It did not move and no claim is made about it.

## Doubts, stated

1. **SMOOTH-3's worst frame and SMOOTH-4 fell ~240 ms more than I can account for.** The two
   `owmBuild` blocks are unambiguously removed (LoAF top-5, 8/8 runs), but they sat at ~10.5 s and
   ~11.1 s, while the *leading* block at ~12.4 s also shrank, from 1074–1212 ms to 932–953 ms. I
   have no mechanism for that last ~240 ms. It moves in the improving direction on two independent
   instruments (worst frame and LoAF) with no spread overlap, and the fix fits ~15 more frames into
   the same fixed 10 s window (533–536 vs 517–528), so it is real — but "real and unexplained" is
   what it is. A plausible-but-untested candidate: on base the hero walks that leg on the
   *analytic, unconsolidated* collision field, so both her path and the allocation profile
   (Uint16Array 7.7 MB vs the bake's Uint8Array 3.85 MB) differ. I did not verify it and am not
   claiming it.
2. **SMOOTH-1's median is 82 ms higher on the fix.** Spreads overlap heavily (p = 0.793) and both
   sides are bimodal at ~2470 / ~2700, with the fix drawing the high mode 5 of 8 and base 4 of 8.
   `S1 first real terrain` is flat (2429.1 → 2421.2). I read this as sampling of the boot cover's
   mode rather than a regression, but 8 runs cannot separate the two and it should be watched.
3. **The `owmFor` → `owEnsureMapSetup` call moves `consolidateMapData`, the Act 1 plate write and
   `renderMinimap()` from a `setInterval` into the mover's `sceneUpdate` wrapper**, about one frame
   earlier. Nothing in the measured evidence objects — zero page errors across 16 probe runs and 18
   driven door transitions, identical textures and `canMove` — but it is a call-site change to code
   that mutates map data in place, and it deserves an adversarial read rather than my own.
4. **Browser numbers only. No simulator was booted** (the brief forbids it). Per the smooth skill, a
   browser number is a hypothesis about the device, never a substitute for it.
5. **A dungeon EXIT is still undriven.** The harness enters Sunken Cellar and verifies it, but
   walking back out was not attempted. Round 2's refutation flagged the same gap.
6. **`owmState` can now hold a field built before `owEnsureMapSetup` on paths `owmFor` does not
   reach** — e.g. `__DQ_OW_CONTINUOUS__ === false`, or a frame where `scene.hero` is not yet
   attached. On those paths behaviour is exactly base's, which is the intent, but it means the
   guarantee "the field is always derived from a settled map" holds for the mover path only.
