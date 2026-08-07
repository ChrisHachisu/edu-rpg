# Round 3 refutation — independent adversarial verification

Verification of `worktree-agent-a61973bf7f9062b01` @ `39e2e74` against `main` @ `c325049`.
I did not write the change, did not modify it, and did not modify `scripts/perf_probe.cjs`
(sha `0a429d62f3606dfca41cd7dfd9d2c37a0f88a4fa066bbb3fa51ed4d3e9338eae`, `git diff` empty after all
measurement). Both `dist/` trees built in my own worktree with `./scripts/build-dist.sh`; `diff -rq`
over the two served trees reports **exactly one differing file**, `dist/dq-tiles.js`. Frozen bundle
md5 `60d90b63607b6e6980eb170aeeed445e` on both sides. No simulator was booted.

## Verdicts

| Claim | Verdict |
|---|---|
| **SMOOTH-5 win** (1094 → 146 ms, GREEN) | **CONFIRMED** — reproduced at 12 runs/side, no overlap, and fully attributable |
| **SMOOTH-4 win** (1226 → 988 ms) | **PARTIAL** — the number moved and is reproducible, but **not one millisecond of it comes from the work this change removes** |
| **"base was WRONG, not merely slow"** | **REFUTED** — 0 of 3,852,288 pixels differ, at two towns |
| **Safety of the re-ordered map setup** | **CONFIRMED, with a documented caveat** — it changes `consolidateMapData`'s inputs; the outcome is identical at every door I could drive, and the new order is the one the file's own comment specifies |

**Recommendation: MERGE WITH FOLLOW-UP.** The door win is large, real and attributable. Two
statements in the change must be corrected before round 4 builds on them — one of them lives in a
code comment, which is how round 1's error propagated.

---

## 1. My own numbers — 12 runs per side, interleaved

`scripts/perf_probe.cjs --compare`, A/B/A/B, one sequence, same machine. Viewport 960x720, dpr 1,
canvas 960x644, coarse-pointer touch emulation ON. Renderer
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)` — real GPU, both sides.

**1-min load average at every run start:** 1.77 – 3.54 (ceiling 10). **0 runs voided. 0 page errors
in 24 runs.** `tileLayer` objects 0 on both.

`p` is a two-sided Mann-Whitney U with tie correction over the 12+12 per-run values.

| metric | base median (spread, n) | fix median (spread, n) | overlap | p |
|---|---|---|---|---|
| SMOOTH-1 continue-rel | 2508.6 (2454.3–2698.3, 12) | 2474.0 (2439.8–2732.1, 12) | **OVERLAP** | 0.795 |
| S1 first real terrain | 2429.8 (2397.9–2476.2, 12) | 2412.9 (2384.4–2444.7, 12) | **OVERLAP** | 0.112 |
| SMOOTH-2 median fps | 59.9 (59.9–59.9, 12) | 59.9 (59.9–59.9, 12) | **OVERLAP** | 1.000 |
| S2 mean fps | 52.0 (46.5–53.0, 12) | 53.5 (49.2–53.9, 12) | **OVERLAP** | <0.001 |
| SMOOTH-3 p99 | 18.8 (18.7–33.4, 12) | 18.9 (18.7–34.7, 12) | **OVERLAP** | 0.231 |
| **S3 worst frame** | **1255.6 (1122.7–1277.6, 12)** | **994.5 (976.5–1004.9, 12)** | NO OVERLAP | <0.001 |
| S3 frames >100 ms | 2 (2–3, 12) | 2 (2–3, 12) | **OVERLAP** | 0.580 |
| **SMOOTH-4 longest block** | **1239.1 (1109.7–1259.9, 12)** | **983.2 (971.0–997.8, 12)** | NO OVERLAP | <0.001 |
| S4 LoAF blocking | 1196.7 (1067.5–1216.6, 12) | 938.6 (919.4–943.5, 12) | NO OVERLAP | <0.001 |
| S4 watchdog drift | 1239.1 (1109.7–1259.9, 12) | 983.2 (971.0–997.8, 12) | NO OVERLAP | <0.001 |
| **SMOOTH-5 worst swap** | **1148.2 (1028.1–1183.7, 12)** | **147.4 (142.3–151.6, 12)** | NO OVERLAP | <0.001 |
| S5 into town | 16.0 (14.3–129.4, 12) | 16.8 (14.1–129.1, 12) | **OVERLAP** | 0.386 |
| S5 town → overworld | 1148.2 (1028.1–1183.7, 12) | 147.4 (142.3–151.6, 12) | NO OVERLAP | <0.001 |
| SMOOTH-6 worst tap | 54.0 (33.6–86.2, 12) | 50.3 (33.2–87.3, 12) | **OVERLAP** | 0.436 |
| S6 battle command | 16.6 (14.4–18.3, 12) | 16.2 (14.2–18.1, 12) | **OVERLAP** | 0.544 |
| splats before terrain | 1 (1–1, 12) | 1 (1–1, 12) | **OVERLAP** | 1.000 |
| walk tiles travelled | 17 (10–36, 12) | 11 (8–40, 12) | **OVERLAP** | 0.191 |

**One correction to the author's table.** They report **S2 mean fps** as `NO OVERLAP`. Over 12 runs
per side the spreads do overlap (base 46.5–53.0 against fix 49.2–53.9); the central tendency still
separates (p < 0.001) but the row is not "established" by the author's own overlap standard.

Every other overlap/no-overlap call in the round-3 report reproduces.

---

## 2. Attack 1 — the correctness claim. **REFUTED.**

The change asserts, in `docs/SMOOTH-ROUND-3.md:76` and again in a code comment at
`public/dq-tiles.js:3654`:

> *Worse than slow, it is WRONG. The analytic field it builds describes an unconsolidated coastline
> … so the hero walks on a collision field the painting disagrees with until the window next moves.*

I built a throwaway diagnostic pair of `dist/` trees (base and fix, each with an **additive**
`__DIAG_OWM__` handle exposing `owmBuild`/`owmState`/`owmMapHash`/`a1mFree` and a log written where
`owmState` is assigned — no behaviour changed, and no timing number in this document comes from
them), drove the real Greenhollow and Millbrook doors, and compared the field base actually caches
against the field the settled map produces for the same window.

### What is true

Base really does build the field from a half-set-up map, and the numbers match the author's:

| build | window | src | ms | mapHash vs bake | consolidated | plated |
|---|---|---|---|---|---|---|
| Greenhollow return #1 | `0_0_44_38` | analytic | 413.1 | `274739541` ≠ `3096430556` | **0** | **0** |
| Greenhollow return #2 | `36_228_44_38` | analytic | 486.2 | `2239228427` ≠ `3096430556` | **0** | 1 |
| Millbrook return #1 | `0_0_44_38` | analytic | 409.9 | ≠ | **0** | **0** |
| Millbrook return #2 | `12_324_44_38` | analytic | 402.4 | ≠ | **0** | 1 |
| fix, either door | the real window only | **baked** | **5.2 / 6.6** | **=** | 1 | 1 |

The `0_0_44_38` window appears on base on every return and **never on the fix**. Confirmed.

### What is not true

With the hero standing still 600 ms and 2000 ms after the return, I rebuilt the *same window* from
the *now-settled* map and compared it pixel for pixel against the field base had cached:

| door | cached field | field from settled map | differing px | blocked/free flips | `a1mFree` disagreements |
|---|---|---|---|---|---|
| Greenhollow (base) | `cfadfd63` | `cfadfd63` | **0 / 3,852,288** | **0** | **0 / 58,240** |
| Millbrook (base) | `a06e3341` | `a06e3341` | **0 / 3,852,288** | **0** | **0 / 58,240** |

**Zero pixels differ. Zero collision decisions differ, over 58,240 sampled hero positions per
window.** Base's field was not wrong. It was *expensive*.

**Why the claim looked true and is not:** window `36_228_44_38` lies wholly inside the Act 1 plate
rect (x 16–163, y 218–399), and the plate is written over that rect *after* consolidation. Every
change `consolidateMapData` makes inside the rect is overwritten by the plate, so the collision
field over an in-plate window is a function of the plate alone — and the plate is **already
applied** when base builds (`plated: 1` on the real window, in every run). The whole-map membership
hash differs because consolidation moves ~1,500 tiles *elsewhere* on the 320x400 map. A hash miss,
not a field error.

### Resolving the collision-hash tension

The brief asked how base can cache a wrong field and still produce `canMove` `317b8b0a` / 78,711
blocked. **Both halves of the tension dissolve, and for two independent reasons:**

1. **`canMove` could not have shown it anyway.** `canMove` and the pixel field are deliberately
   *different authorities* — `dq-tiles.js:2417` splits them: `OWM_FIELD_OWNED={2,4,5}` (water,
   mountain, bridge) belongs to the pixel field, and `scene.canMove` answers for every other cell.
   `canMove` is a tile-lattice function of `mapData` plus `act1-world-map.js`'s forest/gate wrapper;
   it is never derived from `owmBuild`. An identical `canMove` hash is not evidence about the field.
2. **There was no wrongness to reach it.** Measured above: 0 differing pixels.

So the honest reading is: **the wrongness never existed**, and `canMove` was the wrong instrument to
look for it with. I re-derived `canMove` `317b8b0a` / 78,711 blocked independently, cold and after
every round trip, on both builds.

### An unclaimed point in the fix's favour

On **base** the field over `36_228_44_38` is `3142f540` (from the bake) on a cold load and
`cfadfd63` (analytic) after a town return — 117 of 3,852,288 pixels apart, max magnitude 9, no
blocked/free flip, no collision-decision change. That is the documented window-rim band between
`owmAssemble` and `owmBuild`. On the **fix** the field is `3142f540` in both states. **The fix makes
the collision field bit-identical cold and after a return, where base's drifted slightly.** Small,
real, and the author did not claim it.

---

## 3. Attack 2 — the re-ordered map setup. **CONFIRMED, with a caveat the author should record.**

This is the highest-risk part of the change and the author asked for it to be read adversarially.
It is riskier than they wrote, and it lands on the right side anyway.

### The re-ordering is larger than "about one frame earlier"

`owEnsureMapSetup` is now reachable from `owmFor`, which runs from the mover's `sceneUpdate` wrapper
**before** the engine's own `update()` for that frame. On a town return that makes it the **first**
thing to touch the new `mapData` array. The consequences, measured:

| | base, after a return | fix, after a return | cold load (both) |
|---|---|---|---|
| `consolidateMapData` BFS start | `[69,257]` / `[39,346]` | `[69,256]` / `[39,345]` | `[69,256]` / `[39,345]` |
| prune ops | 346 | **349** | 349 |
| fill ops | 937 | **884** | 884 |
| `before_reachable` | 14,943 | **14,992** | 14,992 |
| `before_landmarks` | 8 | **13** | 13 |
| Act 1 plate `repairs` | 1, then 2 | **0** | 0 |

Two inputs changed, not one: the BFS seed cell (`scene.heroTileY` has not yet advanced), **and
whether the plate has been written yet**. On base the return order was *plate → consolidate → plate
repair*; on the fix it is *consolidate → plate*.

**The fix's order is the documented one.** `dq-tiles.js` itself says: *"apply only after legacy
mountain consolidation so semantic forest, harbor water, and both bridge decks remain
authoritative."* Base's **return** path violated that and was rescued by the deep plate repair
(`repairs: 1, 2`); the fix restores it, and the fix's return-path statistics now match the
cold-boot path exactly. That is an argument the author did not make and it is the strongest one
available for this hunk.

### Did the different inputs produce a different map? Not anywhere I could reach.

| state | base | fix |
|---|---|---|
| overworld `mapData` full hash, cold and after every trip | `45756f2a` | `45756f2a` |
| overworld water/bridge/mountain membership hash | `b88fc7dc` | `b88fc7dc` |
| overworld `canMove` hash / blocked | `317b8b0a` / 78,711 | `317b8b0a` / 78,711 |
| `mut.safe` (no orphans, no landmarks lost or gained) | true | true |
| `mut.reverts` | 0 | 0 |
| plate relocation of the hero | `null` | `null` |
| page errors, all diagnostic runs | 0 | 0 |

Because `reverts` is 0 and no landmark is lost or gained on either side, the two global gates that
*could* propagate a difference outside the plate rect never fire. **This is empirical, not
structural**: if those gates ever fired asymmetrically, the maps could diverge outside the rect.
Two towns × two round trips is the evidence I have.

### Other re-entrancy questions, answered

- **Can it run twice, or on the wrong map?** No. `owMapRef=md` is assigned *before* the body, so one
  attempt per array even on throw; the guard `scene.currentMapId!=='overworld'` plus the
  `mapData` non-empty test is the same guard base used. `loadMap` is synchronous, so neither
  `sceneUpdate` nor the 80 ms `setInterval` can observe a half-swapped scene.
- **Is `tick()`'s window invalidation still correct?** `owSetupPending` is set only when `owmFor`
  performed the setup and is consumed unconditionally on the next `'ow'` tick. If the player leaves
  the overworld before it is consumed, the stale `true` causes one redundant terrain re-draw on
  return — where the array has changed anyway.
- **Did it lose `tick()`'s `isActive` / `tileGrid.length` guards?** Yes, and it does not matter:
  Phaser only calls `sys.sceneUpdate` for a running scene, and nothing in the setup body indexes
  `tileGrid` except `act1-world-map.js:291`, which falls back to 48 — which is `TILE`.
- **The minimap redraw moved to the per-frame clock.** Re-derived on both builds, cold and after two
  round trips: `minimapGfx` = **51,280 draw commands**, `minimapPlayerDot` = 8, identical
  everywhere, 0 page errors. It is not being drawn too early or drawn empty.
- **Save resumed in a town / in a dungeon / mid-swap.** Seeded saves at Greenhollow, Millbrook,
  Port Sapphire and Sunken Cellar exits all boot identically on both builds (table in §5).
  `owEnsureMapSetup` returns immediately off the overworld.

---

## 4. Attack 3 — the unexplained ~240 ms. **Mechanism NOT found. Five candidates falsified, including the author's own.**

First, the framing needs correcting, and this is the finding that matters for round 4.

**SMOOTH-4's improvement is *entirely* the unexplained part.** SMOOTH-4 is the longest *single*
block. The blocks this change removes were the 2nd and 3rd largest, never the leader:

| | base run 1 | fix run 1 |
|---|---|---|
| 1st (the walk splat) | 1215.1 ms @ 13445 | **922.3 ms @ 12171** |
| 2nd (`owmBuild` `36_228`) | **534.1 ms @ 11102** | 74.7 ms @ 8965 |
| 3rd (`owmBuild` `0_0`) | **455.7 ms @ 10580** | 70.8 ms @ 10333 |

Removing 990 ms of 2nd- and 3rd-place blocks moves SMOOTH-4 by **0 ms** by construction — the same
lesson round 1's refutation had to teach. So the full **−255.9 ms** of SMOOTH-4 (and the −261.1 ms
of S3 worst frame) is the leader getting faster, and that is exactly the movement the author cannot
explain. The report presents these as separate facts; they are the same milliseconds.

**SMOOTH-5, by contrast, is fully attributable:** −1000.8 ms measured, against 413 + 486–620 ms of
`owmBuild` removed. That arithmetic closes.

### It is the same event, not a cheaper one

I instrumented `createImageData`/`putImageData` to record every full-viewport procedural splat with
the render window it covers, its content, and the loop time between allocation and blit.
**Six runs, three per side: the walk splat is the same event on both builds** —
window `48_228_44_38`, **3,852,288 px**, hero `[70,257]`, **429 mountain cells / 32 water cells** in
the window, once per session, on every single run. No work was deferred, moved or shrunk.

### The loop over identical input, and four controls

| build | walk splat loop (ms) | the two **boot** splats (ms, identical window, before any divergence) |
|---|---|---|
| base (6 runs) | 1192, 1203, 1067, 1172, 1035, 1202 | 996/973, 998/963, 977/963, 970/967, 966/967, 979/968 |
| fix (3 runs) | **945, 934, 919** | 974/962, 973/969, 976/967 |
| **fix + forced analytic `owmBuild` on the swap** (`__DQ_WIGGLE__` nudged 0.26 → 0.2600000001, the documented review knob that makes `owmBakeFor` refuse the bake) | **942, 975, 933** | 983/967, 982/976, 1017/975 |
| **fix + 1000 ms of neutral main-thread spin before the walk** | **923, 937, 935** | 975/970, 983/966, 982/967 |
| **base + forced full GC immediately before the walk** (heap 130 MB → 80 MB, i.e. the fix's) | block 1259, 1246 (unchanged) | — |

- **The boot splats cost the same on both builds.** The loop is not intrinsically faster on the fix.
- **The author's own candidate is refuted.** They speculated the hero "walks that leg on the
  analytic, unconsolidated collision field, so both her path and the allocation profile differ."
  The path does not differ (same window, same hero cell, same content, 6/6 runs), and forcing the
  fix onto the analytic `Uint16Array` path does not reproduce the slowdown.
- **Heap occupancy is not it.** The fix enters the walk with ~50–60 MB less JS heap, but forcing a
  full GC on base to match it leaves the block unchanged.
- **Sustained CPU load is not it.** A neutral 1 s spin on the fix changes nothing.

### What I can say

The same per-pixel loop over the same data runs ~27% slower on base in the seconds after the swap,
and base shows the identical signature *inside* `owmBuild`: base's analytic build of
`36_228_44_38` costs 486–621 ms while the fix's forced-analytic build of the **same window** costs
285–312 ms. The CPU profile attributes **145–156 ms of base's block to `(program)`** — V8's bucket
for compilation and (de)optimisation — against **4 ms** on the fix. That points at JIT churn from
running ~1 s of per-pixel field code through `owmBuild` immediately before `drawTerrain` calls the
same functions, but the forced-analytic control (a single 290 ms build) did not reproduce it, so I
cannot claim it. **Real, reproducible, direction consistent on two instruments, mechanism unknown.**

---

## 5. Attack 5 — the new SMOOTH-4 leader. **CONFIRMED pre-existing.**

Same window `48_228_44_38`, same 3,852,288 px, same 429 mountain cells, same hero cell `[70,257]`,
one occurrence per session, on **both** builds in every run of every harness I wrote. It is
`drawTerrain`'s procedural splat covering an undecoded chunk during the walk, exactly as the author
says, and it is not newly exposed. It *is* ~250 ms cheaper on the fix, for reasons §4 could not
establish.

---

## 6. Attack 6 — visual identity and anti-gaming. **CONFIRMED, re-derived.**

Live canvas textures re-hashed with FNV-1a over every byte of `getImageData` (not screenshots), from
four seeded cold entries and driven round trips:

| state | window | `dqterrain` | `dqcanopy` | base = fix |
|---|---|---|---|---|
| overworld @ (69,256) cold | `36_228` | `cd80bafa@2112x1824` | `cb7f1dc5@2112x1824` | **YES** |
| after Greenhollow round trip ×1 | `36_228` | `cd80bafa` | `cb7f1dc5` | **YES** |
| after Greenhollow round trip ×2 | `36_228` | `cd80bafa` | `cb7f1dc5` | **YES** |
| overworld @ (39,345) cold | `12_324` | `f73a5f2a` | `717f097c` | **YES** |
| after Millbrook round trip | `12_324` | `f73a5f2a` | `717f097c` | **YES** |
| overworld @ (133,348) cold | `108_324` | `f40be8af` | `8c347972` | **YES** |
| overworld @ (30,275) cold | `0_252` | `21db5531` | `cf6dcdc6` | **YES** |
| inside Greenhollow / Millbrook / Port Sapphire | — | `dqtownskin 5fb48986@768x768`, 256 objects | — | **YES** |
| inside Sunken Cellar (dungeon) | — | `mapData 66f6cfb2`, `canMove 395eb6f4`/633, 840 objects | — | **YES** |
| inside Port Sapphire | — | `mapData 1ee61969`, `canMove 5f1abbd5`/98 | — | **YES** |

**Zero mismatches.** `cd80bafa`/`cb7f1dc5` and `mapData 45756f2a` are the values rounds 1 and 2
recorded, so the terrain has not moved across three rounds. Three towns and one dungeon entered
through their real doors on both builds. Anti-gaming per §3 of the skill: nothing deferred (the
splat count, window, pixel count and content are identical), no quality, resolution, draw distance
or map size traded, no smaller scene or warmer cache measured, absolute milliseconds reported
throughout.

---

## 7. Non-regression gates, run by me on the committed tree

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
$ shasum -a 256 public/dq-tiles.js   -> d62f14c3...0d0097d  (295,936 B — matches all four pins)
$ shasum -a 256 scripts/perf_probe.cjs -> 0a429d62...338eae  (unchanged; git diff empty)
```

Act 1 plate sha `205dbe88…` unchanged — world generation did not move.

---

## 8. What the author got wrong, overstated, or missed

1. **Wrong — "it was also WRONG, not merely slow."** 0 of 3,852,288 pixels differ, at two towns,
   and 0 of 58,240 sampled collision decisions. This claim also sits in a **code comment**
   (`public/dq-tiles.js:3654-3657`), which is how round 1's bad number propagated into round 2.
   Correct both.
2. **Mis-framed — SMOOTH-4's −238 ms and the "unexplained ~240 ms" are the same milliseconds.** The
   removed blocks were 2nd and 3rd place; SMOOTH-4 measures 1st. Round 4 must not treat 988 ms as
   the floor this change established.
3. **Refuted — the author's own candidate mechanism** ("her path and the allocation profile differ")
   is false: identical window, hero cell and window content in 6/6 runs, and forcing the analytic
   path on the fix does not reproduce the cost.
4. **Overstated — S2 mean fps is not NO OVERLAP** at 12 runs per side.
5. **Understated — the re-ordering is bigger than "about one frame earlier."** It also changes
   *which* map `consolidateMapData` sees (raw vs plated) and the cell its reachability BFS starts
   from, visibly: 349/884 ops against 346/937, and plate repairs 0 against 1 and 2.
6. **Missed — that this is an argument FOR the change.** `dq-tiles.js`'s own comment requires the
   plate to be applied *after* consolidation. Base's return path did it backwards; the fix restores
   the documented order and makes the return path match the cold-boot path exactly.
7. **Missed — the fix removes a small real drift.** Base's collision field over `36_228_44_38`
   differs by 117 px between a cold load and a post-return load; the fix's is identical in both.
8. **Correct and worth keeping:** the `0_0_44_38` window is real, is on every return, never appears
   on the fix, and is a straight deletion; SMOOTH-5 goes green and the arithmetic closes; SMOOTH-1
   did not move; the refusal to add a new cache.
9. **SMOOTH-1 doubt 2 settles as noise, in the opposite direction.** Both sides are bimodal at
   ~2470/~2700. The author drew the high mode 5/8 on the fix and 4/8 on base; I drew it **5/12 on
   base and 4/12 on the fix** — the sign flipped. Pooled 20 per side it is 9/20 against 9/20.
   `S1 first real terrain` is flat-to-slightly-better on the fix (2429.8 → 2412.9, p = 0.112).
   **SMOOTH-1 did not regress.**

---

## Recommendation

**MERGE WITH FOLLOW-UP.**

Merge, because: SMOOTH-5 goes green with a 1000.8 ms improvement that is fully attributable to the
work removed, reproducible over 12 runs per side with no overlap; the rendered terrain, the map, the
collision lattice, the minimap and every door are byte-identical to base at every state I could
drive; both mechanical gates, the frozen bundle md5 and the plate sha are green; and the hunk that
looked riskiest turns out to *restore* the ordering the file itself specifies.

Follow-up required before round 4 starts:

1. **Correct the correctness claim** in `docs/SMOOTH-ROUND-3.md:76` and in the code comment at
   `public/dq-tiles.js:3654-3657`. It was a bake miss and a 480 ms cost, not a wrong field.
2. **Restate SMOOTH-4.** Its −256 ms is 100% the unexplained walk-splat effect; the removed blocks
   contributed 0 ms to it. Say so, or round 4 will attribute a floor to this change that it did not
   set.
3. **Record the consolidation-input change** (BFS start cell, raw-vs-plated map, plate repairs
   0 vs 1/2) and confirm the resulting map at the remaining five doors before it is treated as
   settled. Identical at Greenhollow and Millbrook is evidence, not proof.
4. **A dungeon exit and the Port Sapphire exit remain undriven** — third round running. Both failed
   to transition within 30 s of held input on *both* builds, so it is pre-existing, but it is now
   the standing hole in every round's coverage.
5. **Browser numbers only.** No simulator was booted, per the brief. The device verdict is
   outstanding for all three rounds.
