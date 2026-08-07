# SMOOTH round 4 — the terrain art is asked for one window-step before it is needed

One atomic change: **the Act 1 chunk cache is filled for the ring one window-step out, not for the
window the camera is standing on.** The procedural splat that covered the wait is gone — from the
walk and from the load — because there is no longer a wait to cover.

Compared against `main` @ `0c3769e` (the commit that retracted round 3's correctness claim),
measured interleaved A/B in one sequence, so both sides carry the same machine.

| | |
|---|---|
| Round | 4 |
| Measured | 2026-08-08 |
| Before | `main` @ `0c3769e` |
| After | this branch |
| Changed | `public/dq-tiles.js` only, plus the four sha pins it forces |
| Bundle | `dist/assets/index-BhoGQRaA.js` md5 `60d90b63607b6e6980eb170aeeed445e` — unchanged, both sides |
| Trees | both `dist/` built with `./scripts/build-dist.sh`; `diff -rq` reports **exactly one differing file**, `dist/dq-tiles.js` |
| Probe | `scripts/perf_probe.cjs --compare`, **8 runs per side**, interleaved A/B/A/B/… |
| Probe sha | `0a429d62f3606dfca41cd7dfd9d2c37a0f88a4fa066bbb3fa51ed4d3e9338eae` — unchanged; `git diff` empty after all measurement |
| Viewport | 960x720, dpr 1, canvas 960x644, coarse-pointer touch emulation ON |
| Renderer | `ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)` — real GPU, both sides |
| 1-min load at each run start | base 2.05 / 2.95 / 2.76 / 2.95 / 2.56 / 2.37 / 2.53 / 2.53 · fix 2.21 / 2.36 / 2.33 / 2.54 / 3.81 / 3.20 / 2.96 / 3.32 |
| Runs voided | **none** (ceiling 10; highest reading 3.81) |
| Page errors | **0** across all 16 runs, and 0 in every diagnostic run |

---

## 1. The diagnosis: it is neither fetch nor decode

The brief asked which. Measured from outside the game (a `HTMLImageElement.prototype.src` wrapper
for request time, `PerformanceResourceTiming` for the network share, and a `drawImage` wrapper to
catch Chrome's deferred webp decode), on the base build, in the run that produced the walk splat:

| chunk layer (walk splat, window `48_228_44_38`) | src → onload | network `responseEnd − startTime` | first `drawImage` (decode) |
|---|---|---|---|
| `base/c2-r0.webp` | 988.1 ms | **7.1 ms** | 0.0 ms |
| `canopy/c2-r0.webp` | 988.0 ms | **6.6 ms** | 0.0 ms |
| `water/c2-r0.png` | 988.0 ms | **6.5 ms** | 0.0 ms |
| `base/c2-r1.webp` | 988.0 ms | **11.4 ms** | 0.1 ms |
| `canopy/c2-r1.webp` | 988.0 ms | **10.6 ms** | 0.0 ms |
| `water/c2-r1.png` | 988.0 ms | **9.4 ms** | 0.0 ms |

**The bytes are on the machine in 7–11 ms and the decode is free.** The 988 ms `src → onload` is
the load event sitting behind the splat's own per-pixel loop: the splat is what manufactures the
wait it exists to cover. The same shape appears at load — `base/c0-r0.webp` reports 2308.5 ms
src→onload against **10.4 ms** of network, with two 970 ms splats in between.

So the whole cost is **scheduling**, exactly as the brief framed it. Nothing needed to be made
faster; something needed to be asked for earlier.

### The two places the request was late

1. **The walk.** The render window steps in `MARGIN` = 12-cell jumps. Stepping from `36_228` to
   `48_228` needs chunk column `c2`, which `a1aRects` requests *on that frame*.
2. **The door, feeding the walk.** Round 1's retention trims the cache to `A1A.win` on leaving the
   overworld. `A1A.win` was the bare window, so walking into Greenhollow **evicted `c2-r0` and
   `c2-r1` — precisely the chunks the walk out stepped into twelve cells later.** They had been
   fetched at parse time, thrown away at the door, and re-requested during the walk. The
   re-request is visible in the instrumentation as a second `src` set for the same URL.
3. **The load.** `a1aPrefetchStart` derives its guessed window origin from the hero *cell*, but the
   real `windowStart` derives it from the *camera*, which sits half a viewport west. It guessed
   `X0 = 48` where the first real window was `X0 = 36`, so it prefetched `c1`/`c2` and the first
   window needed `c0`. That is the 2 splats before terrain.

All three are one defect — the chunk is asked for on the frame it is first needed — and one
mechanism fixes all three.

## 2. The change

`a1aRects` now touches the chunks intersecting the window **padded by `MARGIN` on all four sides**
before it touches the window's own, and `A1A.win` (what survives the door) is that ring rather than
the bare window.

**The ring is free.** Over every snapped window origin on this plate and every window size the
camera produces, the window alone straddles at most **9** chunks and the window padded by `MARGIN`
straddles at most **9** as well — a 68x62-cell rect against the window's 44x38. `A1A_MAX_CHUNKS`
stays at 10 and keeps its headroom. (Padding by `2*MARGIN` would reach 16, which is why the ring is
one step and not two.) Measured memory cost, all Chrome processes RSS: 1837.8 → 1846.4 MB on the
settled overworld, 1849.9 → 1858.5 MB in town. **~9 MB, 0.5%.**

**How far ahead it now schedules.** The hero crosses a window boundary every ~2.1–3.2 s of walking
(measured: 12 cells at 173–268 ms/cell). A chunk layer loads in 4–27 ms. The lead is therefore
about **two orders of magnitude more than the job needs**, which is why one step is enough and a
heading predictor is not required — the ring covers all four directions at no cost.

## 3. The numbers — 8 runs per side, interleaved, medians and full spreads

`p` is a two-sided Mann-Whitney U with tie correction over the 8+8 per-run values; at n=8 per side
it floors at ~0.001.

| metric | base median (spread, n) | fix median (spread, n) | overlap | p |
|---|---|---|---|---|
| **SMOOTH-1 continue-rel** | **2584.8 (2457.2–2714.9, 8)** | **614.1 (371–630.8, 8)** | NO OVERLAP | 0.001 |
| S1 first real terrain | 2417.3 (2393.8–2453, 8) | 1304.3 (1285.2–1326.3, 8) | NO OVERLAP | 0.001 |
| SMOOTH-2 median fps | 59.9 (59.9–59.9, 8) | 59.9 (59.9–59.9, 8) | **OVERLAP** | 1.000 |
| S2 mean fps | 53.6 (52.7–53.8, 8) | 59.2 (59–59.4, 8) | NO OVERLAP | 0.001 |
| SMOOTH-3 p99 | 18.8 (18.7–19, 8) | 18.8 (18.7–18.9, 8) | **OVERLAP** | 0.242 |
| **S3 worst frame** | **988.5 (978.4–1130, 8)** | **141.9 (138.3–153.4, 8)** | NO OVERLAP | 0.001 |
| **S3 frames >100 ms** | **2 (2–2, 8)** | **1 (1–1, 8)** | NO OVERLAP | 0.000 |
| **SMOOTH-4 longest block** | **985 (975.8–1115.8, 8)** | **131.6 (125–138.9, 8)** | NO OVERLAP | 0.001 |
| S4 LoAF blocking | 934.5 (922.4–1073.6, 8) | 88.3 (82.9–96.6, 8) | NO OVERLAP | 0.001 |
| S4 watchdog drift | 985 (975.8–1115.8, 8) | 131.6 (125–138.9, 8) | NO OVERLAP | 0.001 |
| **SMOOTH-5 worst swap** | **147 (142.2–150.2, 8)** | **146.3 (138.9–158.6, 8)** | **OVERLAP** | 0.875 |
| S5 into town | 16.1 (15.6–141.3, 8) | 74.3 (14.7–135.8, 8) | **OVERLAP** | 0.875 |
| S5 town → overworld | 147 (142.2–150.2, 8) | 146.3 (138.9–158.6, 8) | **OVERLAP** | 0.875 |
| SMOOTH-6 worst tap | 52.1 (49.8–89.2, 8) | 52.7 (32.8–85, 8) | **OVERLAP** | 0.875 |
| S6 battle command | 16.4 (13.3–16.8, 8) | 16.3 (12.9–16.6, 8) | **OVERLAP** | 0.751 |
| **splats before terrain** | **1 (1–1, 8)** | **0 (0–0, 8)** | NO OVERLAP | 0.000 |

**Required sentence, where it applies:** for SMOOTH-2 median fps, SMOOTH-3 p99, SMOOTH-5 (and both
its legs), SMOOTH-6 worst tap and S6 battle command, **the spreads overlap, so this is not
established.** For SMOOTH-5 that is the intended result: the round-3 green must not move, and it
did not.

### Verdict per target

| ID | Target | Base | Fix | Verdict |
|---|---|---|---|---|
| SMOOTH-1 | ≤ 1500 ms | 2584.8 | **614.1** | **RED → GREEN** |
| SMOOTH-2 | ≥ 55 fps | 59.9 | 59.9 | GREEN (held) |
| SMOOTH-3 | worst ≤ 100 ms **and** zero frames > 100 ms | 988.5 / 2 | **141.9 / 1** | **RED** (−86%, not green) |
| SMOOTH-4 | ≤ 100 ms | 985 | **131.6** | **RED** (−87%, not green) |
| SMOOTH-5 | ≤ 500 ms | 147 | 146.3 | GREEN (not regressed) |
| SMOOTH-6 | ≤ 100 ms | 52.1 | 52.7 | GREEN (held) |

**SMOOTH-4 is not green and this round does not claim it is.** 985 → 131.6 ms is the largest single
move any round has produced, and it still sits 31.6 ms over the bar.

## 4. Splat count, before and after

| phase | base | fix |
|---|---|---|
| during the load | 2 | **0** |
| **during the 10 s walk** | **1** | **0** |
| total per session | 3 | **0** |

Reproduced in the profiler run (`splatsByPhase`: base `{load: 2, walk: 1}`, fix `{}`) and in the
probe's own `splatsBeforeTerrain` diagnostic (1 → 0, 8/8 runs each side). The splat is **removed,
not deferred**: there is no later phase in which it reappears, and the walk covers *more* ground on
the fix (5 window steps against 3) because the hero is not stalled.

## 5. Walk and return-leg CPU profile

CDP profiler, 100 µs sampling, identical 10 s walk and identical driven return leg.

| self time | base | fix |
|---|---|---|
| **walk, main-thread busy** | **1667.3 ms** | **613.6 ms** |
| walk, idle | 8389.9 ms | 9431.0 ms |
| `vnoise @dq-tiles.js:72` | 302.1 ms | **absent** |
| `waterField @dq-tiles.js:555` | 162.1 ms | **absent** |
| `matShade @dq-tiles.js:136` | 131.8 ms | **absent** |
| `drawTerrain @dq-tiles.js:670` | 95.6 ms | **absent** |
| `fieldAt @dq-tiles.js:548` | 52.8 ms | **absent** |
| `mountainField @dq-tiles.js:559` | 50.1 ms | **absent** |
| `siteOver @dq-tiles.js:201` | 45.0 ms | **absent** |
| `getImageData` | 43.6 ms | **absent** |
| `drawImage` (the blit that replaces it) | 109.8 ms | 110.8 ms |
| `(program)` | 215.2 ms | 170.9 ms |
| **return leg, main-thread busy** | **398.7 ms** | **412.8 ms** |
| `consolidateMapData @dq-tiles.js:334` | 14.7 ms | 13.8 ms |

**~883 ms of per-pixel field evaluation leaves the walk and nothing replaces it** — `drawImage` is
flat at ~110 ms because the blit was already happening on every other window. The return leg is
unchanged within noise, which is the SMOOTH-5 non-regression seen from the other instrument.

Largest LoAF block after the first playable frame, same runs: base **960.8 ms** (the walk splat, at
`t = 10410` against a splat logged at `t = 10413`); fix **77.3 ms**, during the map swap.

## 6. Visual identity — re-derived, not re-read

Live canvas textures hashed with FNV-1a over every byte of `getImageData`, from four seeded cold
entries at the four Act 1 landmark exit cells, and again after driving the real door.

| state | window | `dqterrain` | `dqcanopy` | base = fix |
|---|---|---|---|---|
| overworld @ (69,256) cold | `36_228` | `cd80bafa@2112x1824` | `cb7f1dc5@2112x1824` | **YES** |
| overworld @ (39,345) cold | `12_324` | `f73a5f2a@2112x1824` | `717f097c@2112x1824` | **YES** |
| overworld @ (133,348) cold | `108_324` | `f40be8af@2112x1824` | `8c347972@2112x1824` | **YES** |
| overworld @ (30,275) cold | `0_252` | `21db5531@2112x1824` | `cf6dcdc6@2112x1824` | **YES** |
| after a Greenhollow round trip | `36_228` | `cd80bafa` | `cb7f1dc5` | **YES** |
| after a Millbrook round trip | `12_324` | `f73a5f2a` | `717f097c` | **YES** |

**Zero mismatches**, and every value equals the one the round-3 refutation recorded, so the terrain
has not moved across four rounds. Cold and post-round-trip are identical *within* each build too.

| lattice | base | fix |
|---|---|---|
| overworld `canMove` / blocked, cold | `317b8b0a` / **78,711** | `317b8b0a` / **78,711** |
| overworld `canMove` / blocked, after return | `317b8b0a` / **78,711** | `317b8b0a` / **78,711** |
| overworld `mapData`, cold and after return | `45756f2a` | `45756f2a` |

**Doors driven, through the real door, on both builds:**

| door | entered | inside `mapId` | objects | inside `canMove` | base = fix |
|---|---|---|---|---|---|
| Greenhollow (town) | yes | `greenhollow` | 256 | `3db83013` / 100 | **YES** |
| Millbrook (town) | yes | `millbrook` | 256 | `5f1abbd5` / 98 | **YES** |
| **Port Sapphire (town)** | **yes** | `portSapphire` | 256 | `5f1abbd5` / 98 | **YES** |
| **Sunken Cellar (dungeon)** | **yes** | `sunkenCellar` | 840 | `395eb6f4` / 633 | **YES** |

Three towns and a dungeon, all entered. **Port Sapphire had been undriven for three rounds** and is
driven here by seeding at its published exit cell `(133,348)` and stepping *south* — its exit lies
north of its door, which is why a mover that only walks north never reached it. Its exit, and the
dungeon exits, are still not drivable on **either** build; that hole is pre-existing and unchanged.

**Anti-gaming.** The splat is removed, not deferred (§4). No quality, resolution, draw distance or
map size was traded — the splat was the *lower*-fidelity stand-in and the blit that replaces it is
the owner-locked art. At the exact frame SMOOTH-1 stops the clock, both builds report the identical
terrain texture `8049de2a@2112x1872` with **3,953,664 of 3,953,664 pixels opaque**, and both settle
to `cd80bafa` — the gate is not being opened over a less complete window. Screenshots at that frame
show the full village, hero, HUD and minimap on both. Absolute milliseconds are reported throughout.

## 7. Non-regression gates, on the committed tree

```
$ npm run test:map-engine
MAP ENGINE TEST PASS / ACT 1 OVERWORLD TEST PASS / MAP ENGINE SHELL TEST PASS /
RETAINED LATER GATE TEST PASS / SHIPPED OVERWORLD DQ REPLAY PASS /
ACT 1 RUNTIME SNAPSHOT CHECK PASS: 148x182 205dbe88d80f31260044b466c5a4cab59aa828377010d9e834223267e6cec434
ACT 1 OVERWORLD WALK CHECK PASS: 4578 blocks, far=255, provenance 42af2d0884f99d05
ACT 1 RUNTIME OVERRIDE CHECK PASS / ACT 1 RUNTIME OVERRIDE TEST PASS: revision 6

$ ./scripts/ship-gate.sh .
STATIC SHELL CHECK PASS  ·  PINS CHECK PASS: all 74 pins match  ·  both ACT 1 OVERLAY VERIFY PASS
SHIP GATE PASS

$ md5 dist/assets/index-BhoGQRaA.js  -> 60d90b63607b6e6980eb170aeeed445e
```

Act 1 plate sha `205dbe88…` unchanged — world generation did not move.

## 8. Doubts I am flagging myself

1. **The two SMOOTH-4 instruments now disagree materially, and the probe's header says that must be
   said out loud.** LoAF blocking reports **88.3 ms (green)**; the 8 ms watchdog reports **131.6 ms
   (red)**. They agreed to within 2.5% at round 0 and are 49% apart here. The probe scores SMOOTH-4
   on the higher, so this document reports **RED**, which is the unflattering reading and the one I
   am standing behind. But a verifier should decide which instrument is right before round 5 treats
   131.6 ms as the number to beat — if LoAF is correct, SMOOTH-4 is already green and round 5 has a
   different target.
2. **This round moves SMOOTH-1 as well as SMOOTH-3/4, which weakens single-round attribution.** It
   is one mechanism and one hunk, but it lands on three metrics, so "one item per round" is
   satisfied in the code and only arguably satisfied in the measurement. The splat counts in §4 are
   what I would use to separate them: 2 load splats and 1 walk splat, removed independently.
3. **The 9-chunk ceiling is empirical over this plate's geometry, not structural.** I enumerated
   every snapped window origin for four window sizes and the maximum is 9 in all of them, but a
   re-bake at a different `chunkSize`, or a camera that produces a window wider than ~68 cells,
   could push the ring past `A1A_MAX_CHUNKS`. The trim is written so it can never evict a chunk the
   current window touched (`Math.max(A1A_MAX_CHUNKS, keep.length)`), so the failure mode would be
   memory growth, not thrash — but it is worth a guard if the art is ever re-cut.
4. **`A1A.win` now retains ~9 chunks across a door instead of ~4.** Measured cost is ~9 MB of RSS,
   far below the ~19 MB/chunk the file's own comment budgets, because Chrome discards decoded
   frames for images it is not drawing and keeps only the encoded bytes. That measurement is from
   this Mac's Chrome; a memory-constrained phone may account for it differently, and no simulator
   was booted this round.
5. **SMOOTH-3 still has exactly one frame over 100 ms** (141.9 ms), during the walk. From the
   profile it is a window-step blit: `drawImage` is 110.8 ms across the walk and `a1aCanopy`
   composites each chunk three times (base onto scratch, canopy mask, scratch onto target). That is
   the honest round-5 target, and it is real work rather than a scheduling miss.
6. **Browser numbers only.** No simulator was booted, per the brief. The device verdict is now
   outstanding for all four rounds.
