# Adversarial verification — SMOOTH round 1 (`a1aReleaseChunks` trim)

Independent refutation of `worktree-agent-ae41144fbe49348f8` @ `042acfa` against `main` @ `c7143c6`.
I did not write the change. I did not modify it, and I did not modify `scripts/perf_probe.cjs`
(sha `0a429d62…` identical to `main`'s copy, verified after all measurement).

## Verdicts

| Claim | Verdict |
|---|---|
| Performance win | **PARTIAL** — SMOOTH-5 confirmed and large; **SMOOTH-4 refuted** |
| No-invalidation safety argument | **CONFIRMED** (the true argument is stronger than the one written) |
| Correctness / non-regression | **CONFIRMED** for every path I could drive; one path unverified |
| Memory bound | **PARTIAL** — bounded and non-growing, but the stated ~79 MB is door-specific |

**Recommendation: MERGE WITH FOLLOW-UP.** The change is safe and the door win is real and worth
having. But `docs/SMOOTH-ROUND-1.md` records a SMOOTH-4 improvement that does not exist, and that
file becomes the baseline for round 2. Correct it before it is used, or round 2 will measure
~2100 ms, compare against a recorded 1568 ms, and conclude it caused a 35% regression.

---

## 1. Performance — my own measurement

`scripts/perf_probe.cjs --compare` , **6 runs per side**, interleaved A/B/A/B, same two servers,
same machine, back to back. Viewport 960x720, dpr 1, renderer `ANGLE (Apple, ANGLE Metal Renderer:
Apple M1)` — real GPU, not SwiftShader.

**1-min load average at each run start:** base 2.34 / 2.90 / 3.26 / 4.00 / 3.54 / 2.23 ·
fix 3.02 / 2.25 / 2.89 / 3.40 / 2.73 / 2.27. Ceiling is 10. **No run voided.**

Both `dist/` trees were built with `./scripts/build-dist.sh` (never Vite). `diff -rq` over the two
served trees reports **exactly one differing file**, `dist/dq-tiles.js` — the author's
attributability claim holds. Frozen bundle md5 `60d90b63607b6e6980eb170aeeed445e` on **both** sides.

| ID | base median (spread, 6) | fix median (spread, 6) | change | author claimed | agree? |
|---|---|---|---|---|---|
| SMOOTH-1 | 2510.8 ms (2487.6–2535.4) | 2496.3 ms (2475.1–2504.3) | −14.5 ms | +8.2 ms, unmoved | yes (both = noise) |
| SMOOTH-2 | 59.9 fps (59.9–59.9) | 59.9 fps (59.9–59.9) | — | — | yes |
| SMOOTH-3 | 18.8 ms (18.7–18.8) | 18.7 ms (18.7–18.7) | −0.1 ms | +0.1 ms | yes |
| **SMOOTH-4** | **2108.9 ms (2059.6–2185.1)** | **2115.1 ms (1561.3–2182.4)** | **+6.2 ms** | **−620.3 ms (−28.3%)** | **NO — refuted** |
| **SMOOTH-5** | **3626.1 ms (3501.5–3900.4)** | **2155.7 ms (2091.6–2226.5)** | **−1470.4 ms (−40.6%)** | −1525.1 ms (−40.7%) | **yes — confirmed** |
| SMOOTH-6 | 74.2 ms (33.6–137.9) | 66.3 ms (48.5–76.9) | −7.9 ms | −17.2 ms | metric too noisy to score |

### SMOOTH-5 is real. This is the change's actual result.

3501.5–3900.4 against 2091.6–2226.5 — the two distributions **do not overlap at all** over 6 runs
each. The inbound direction is unchanged (overworld→town 69.1 → 70.6 ms), so nothing was moved
into the other half of the trip. This is a genuine, large, reproducible win on the metric the
owner feels as "doors are slow".

### SMOOTH-4 did not move. The −28% is a 3-sample artifact.

Per-run `watchdog drift` (which *is* SMOOTH-4 — the probe scores `max(LoAF, watchdog)`, and the
watchdog is the larger term in all 12 runs):

```
base: 2061.3  2156.6  2059.6  2170.0  2185.1  2059.9     min 2059.6
fix:  2061.0  2169.1  1561.3  2182.4  2178.9  2060.4     min 1561.3
```

The value is bimodal around ~2060 and ~2175 on **both** sides. The fix drew the low ~1561 value in
**1 of 6** runs; base drew it in 0 of 6. The author's 3-run sample happened to draw it twice
(1566.8, 1568.0, 2171.9), which put their median at 1568.0. With 6 runs the median is 2115.1 —
nominally *worse* than base. The author explicitly flagged this spread as suspicious and asked for
it to be settled; **it settles against the claim.**

The corroborating detail: the probe's *documented primary* instrument, LoAF `blockingDuration`,
shows no movement at all — base 1520.6 ms (1516.6–1655.4), fix 1519.3 ms (1508.8–1521.6). The
author's own sub-measure table already contained this (1521.1 → 1516.2) but the report did not
draw the conclusion from it.

**Mechanically this is expected and the author's own analysis explains why they should not have
claimed it.** SMOOTH-4 reports the *single longest* main-thread block. That block is the
~2.1 s `renderMap()` build of 128,000 Phaser Images, which this change does not touch (the report
says so). The chunk work removed is a *separate* ~1.5 s block. Removing a second block shortens the
**total swap** (SMOOTH-5) but cannot shorten the **longest single block** (SMOOTH-4). The report's
sentence "Removing the rebuild took 620 ms off it" is wrong: it took ~1470 ms off the swap and
0 ms off the longest block.

### Is the win deferred rather than removed? No.

§3 forbids moving cost past the measurement point. I measured a **repeated** cycle
(overworld→town→overworld ×4 in one session) with an external instrument, counting the procedural
terrain splat by wrapping `createImageData` (exactly what `drawTerrain`'s per-pixel fallback
allocates) and counting `act1-hifi/chunks/` network requests:

| | base | fix |
|---|---|---|
| Full procedural splats **on the return**, cycles 1/2/3/4 | **1 / 1 / 1 / 1** | **0 / 0 / 0 / 0** |
| Chunk layer requests on the return, cycles 1/2/3/4 | 0 / 12 / 0 / 12 | **0 / 0 / 0 / 0** |
| Chunk requests across the whole session | 54 | **30** (all at boot) |
| Splats entering the town | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 (unchanged) |

The win is **not** first-return-only: it is identical on the 4th return as on the 1st, and no cost
reappears on a later cycle or on the inbound leg. The author's "splats 1 → 0" is confirmed exactly.

One correction to their mechanics table: **"chunk re-requests 12 → 0" is not consistently 12 on
base.** Base alternated 0 and 12 because Chrome sometimes serves the re-created `Image` from its
memory cache with no network request. Base still pays the *decode* on every return either way —
which is why its splat count is 1 every single time — so the direction of the claim is right, but
"12" is not a stable base figure.

---

## 2. The no-invalidation safety claim — CONFIRMED, and it is stronger than written

I tried to break this and could not. The argument that actually holds is one the author gestured at
but did not state in its decisive form:

> The rendered terrain is a pure function of **(window geometry, manifest, static image bytes)**.
> Retention changes only *when* an image is available, never *what* it contains. Therefore any
> render the fix produces, base also produces — just later.

Verified against the source rather than the prose:

- `a1aChunkAt` (`public/dq-tiles.js:1099`) maps a cell to a chunk using only `manifest.semanticBounds`,
  `TILE` and `A1A.S`. **It never reads a tile value.** `a1aRects` (:1114) is likewise pure rectangle
  intersection. So `consolidateMapData` and `__ACT1_WORLD_MAP__.apply()` mutating `mapData` in place
  cannot change which chunk covers a cell. The distinction from the `owmBakeFor` memo that poisoned
  itself is real, not asserted.
- `A1A.S` and `A1A.manifest` are assigned once inside `a1aFetch`'s `onload` and `A1A.req` latches, so
  the id→URL mapping cannot move within a session.
- `a1aChunkRec` (:1078) sets `im.src='act1-hifi/'+c[k]` — a static URL. The retained value is the
  decoded content of an immutable file.
- Composition is not cached: leaving the overworld sets `lastReskinMapId=null` (:3573), which forces
  `reskin` → `updateTerrain(scene,true)` on return, and `force` bypasses the `terrainState.lastWin`
  early-return (:1219). Confirmed in code, as claimed.

### Attempted stale-render reproductions

I built a throwaway probe that hashes the **live `dqterrain` / `dqcanopy` canvas textures** (FNV-1a
over every byte of `getImageData`), not screenshots — so the hero's animation frame and the HUD can
neither mask nor manufacture a difference.

**The decisive test** compares, *on the fix build only*, a **retained** round trip against a
**cold page load** parked at the same cell (where nothing is retained). If retention could go
stale, these must differ.

| State | dqterrain | dqcanopy | window origin |
|---|---|---|---|
| Greenhollow, retained return ×3 (fix) | `cd80bafa` | `cb7f1dc5` | [1728, 10944] |
| Greenhollow, **cold load** @ (69,257) (fix) | `cd80bafa` | `cb7f1dc5` | [1728, 10944] |
| Greenhollow, retained return ×2 (base) | `cd80bafa` | `cb7f1dc5` | [1728, 10944] |
| Millbrook, retained return ×2 (fix) | `f73a5f2a` | `717f097c` | [576, 15552] |
| Millbrook, **cold load** @ (39,346) (fix) | `f73a5f2a` | `717f097c` | [576, 15552] |
| Inside Sunken Cellar (fix) | `21db5531` | `cf6dcdc6` | [0, 12096] |
| Inside Sunken Cellar (**base**) | `21db5531` | `cf6dcdc6` | [0, 12096] |

**Byte-identical everywhere.** A retained cache renders exactly what a cold build renders. Zero page
errors on every run. Millbrook is a door the author never tested and one that retains 6 chunks
rather than 4.

Other constructions I tried and could not turn into a defect:

- **Return at a different location than departure** (dungeon exits elsewhere, a door that relocates
  the hero). `A1A.win` keeps the wrong chunks; the return window then intersects different chunks,
  `a1aRects` requests them, coverage is partial, and `drawTerrain` falls through to the procedural
  splat — i.e. it degrades to *base behaviour*. Geometry guarantees a retained chunk is only ever
  blitted where it belongs. A perf hole, never a wrong pixel.
- **`A1A.win` clobbered to `[]`.** `isOverworld` (:3531) matches any map id containing
  `Isles|Peaks|Realm|Temple`, and the bundle really does define `stormreachIsles`, `frostfallPeaks`,
  `twilightRealm`, `sunkenTempleIsle`, `sunkenTempleVillage`, `sunkenTempleDungeon`. Those are
  Act 2+ maps that `sceneKind` therefore calls `'ow'`. I chased this hard as the most promising
  vector. It cannot produce staleness: those maps are far shorter than the plate's y-range
  [218, 399], so their windows intersect zero chunks, which sets `A1A.win=[]` and makes the next
  departure drop *everything* — again exactly base behaviour. (The misclassification itself is a
  real pre-existing bug, present identically on `main`, and out of scope here.)
- **`updateTerrain` running for a town/dungeon.** It cannot: `drawTerrain` has exactly one caller
  (:1223, inside `updateTerrain`), and `updateTerrain` is reachable only from the `kind==='ow'`
  branch (:3613) and from `reskin` (:1276), which that branch also owns.
- **The `A1A.released` latch leaving the cache un-trimmed off-overworld.** It does — but nothing
  *adds* to the cache off-overworld either, because `a1aRects` only runs on the overworld path. It
  cannot grow.

I could not build a stale render. I consider the safety claim sound.

**Unclaimed benefit the author missed:** a save resumed *inside a town* now keeps the chunks that
`a1aPrefetchStart` loaded for the exit window. On base, `a1aReleaseChunks` ran on every non-`ow`
tick and threw the prefetch away repeatedly, so the prefetch was defeated on that path entirely.

---

## 3. Non-regression set

Run by me on the committed tree, in my own worktree:

- `npm run test:map-engine` — **PASS** (all 9 suites).
- `./scripts/ship-gate.sh .` — **PASS** (74 pins, both Act 1 overlay verifies, iOS payload).
- `dist/assets/index-BhoGQRaA.js` md5 **`60d90b63607b6e6980eb170aeeed445e`** — unchanged.
- Act 1 plate sha **`205dbe88d80f31260044b466c5a4cab59aa828377010d9e834223267e6cec434`** — unchanged,
  so world generation did not move.
- Greenhollow and Millbrook enterable and returnable, terrain identical (table above).
- The four sha pins the change forces (`runtime_baseline.py`, `extract_act1_runtime_snapshot.mjs`,
  `act1RuntimeSnapshot.ts`, `shippedOverworldBaselineDqReplay.mjs`) all match the on-disk
  `public/dq-tiles.js` sha `49d3ff28…`; the gate verifies this, and it passes.

**One path I could not verify: a dungeon EXIT.** Walking back out of Sunken Cellar is not drivable
with a single held direction (the hero is relocated on entry and the stairs need pathfinding), so my
harness timed out inside the dungeon on both builds. The author's non-regression table claims this
round trip was completed; I neither reproduced nor refuted it. What I *can* say is that the
in-dungeon canvas state is byte-identical between base and fix, so nothing about the dungeon
rendering changed. Port Sapphire and Coastal Reef were likewise not driven by me.

---

## 4. The memory trade — bounded, but the number in the report is door-specific

The bound is **structural, not empirical**, which is better than the author argued:
`a1aReleaseChunks` keeps `A1A.win`, and `A1A.win` is whatever the last window intersected. I
brute-forced the intersection count over **every** window position on the 320x400 map for the real
runtime window (44x39 at 960x720, `TILE=48`, `MARGIN=12`):

- **Worst case anywhere on the map: 9 chunks.** Never more. (Confirms the in-file comment.)
- Per chunk ≈ **19.9 MB** decoded (9.44 MB base @1536² + 9.44 MB canopy @1536² + 1.05 MB water @512²,
  with `S=3` derived from the manifest).
- **Theoretical ceiling off-overworld: ~179 MB**, not ~79 MB.

At the **eight real doors**, using the camera-derived window swept over the approach:

| Door | chunks retained | MB |
|---|---|---|
| Greenhollow | 4 | 80 |
| **Millbrook** | **6** | **120** |
| **Port Sapphire** | **6** | **120** |
| Sunken Cellar | 2 | 40 |
| Whispering Woods Cave | 3 | 60 |
| Coastal Reef | 4 | 80 |
| **Misty Grotto** | **6** | **120** |
| Crystal Cave | 4 | 80 |

So the report's "**measured 4 of them, ~79 MB**" is correct **only at Greenhollow**, the one door it
measured. Three of the eight doors retain half again as much. The sentence "the other six slots are
still dropped" is wrong at those doors — only four of ten are dropped there.

None of this is a defect: retention is still strictly below the 10-slot (~198 MB) peak the overworld
already holds while being played, the peak is genuinely unmoved, and it **cannot grow** — the trim
re-runs on every departure and `a1aRects` caps the cache at `max(10, touched)` on every window build.
Empirically, 4 consecutive cycles requested **30** chunk layers total, all at boot, with **zero**
accumulation. But the owner-facing figure should read "40–120 MB depending on which door, ceiling
~179 MB", not "~79 MB".

**Not verified on device.** All of the above is a browser number. Per the skill, that is a hypothesis
about the phone, and ~120 MB of retained decoded art on a real device is exactly the kind of claim
that should be confirmed on the simulator before it is treated as settled. I was instructed not to
boot one.

---

## 5. What the author got wrong, understated, or missed

1. **Wrong — SMOOTH-4 did not improve.** −620.3 ms / −28.3% is a 3-sample median artifact; 6 samples
   per side put the medians within 6.2 ms. This is the one finding that must not be merged as-is,
   because round 1's numbers become round 2's baseline.
2. **Understated — the memory figure is door-specific.** ~79 MB is Greenhollow only; three doors hold
   ~120 MB, and the structural ceiling is ~179 MB.
3. **Overstated — "12 → 0 chunk re-requests".** Base is 12 *or* 0 depending on Chrome's memory cache.
   The splat count (1 → 0, every time) is the honest, deterministic version of this claim.
4. **Missed — the strongest form of their own safety argument.** "Retention changes only *when* an
   image is available, never *what* it contains" is provable from the code and is what makes the
   change safe. I confirmed it by showing a retained return and a cold load are byte-identical, which
   is a stronger test than the base-vs-fix comparison they ran.
5. **Missed — a real benefit.** A save resumed inside a town now keeps its prefetched exit-window
   chunks; base discarded them on every tick.
6. **Correct and worth keeping:** SMOOTH-1 and SMOOTH-3 unmoved, the 1.2 s walk frame untouched, the
   dungeon fog vignette pre-existing (I confirmed the in-dungeon canvas is identical on both builds),
   and the refusal to fix two things in one round.

---

## Recommendation

**MERGE WITH FOLLOW-UP.**

Merge, because: the SMOOTH-5 win is large, reproducible, non-overlapping across 6 runs per side, and
persists across repeated cycles; the safety argument survives a determined attempt to break it; both
mechanical gates and the frozen-bundle and plate hashes are green; and the rendered terrain is
provably byte-identical to a cold build at two independent doors.

Follow-up required **before round 2 starts**:

1. Correct the SMOOTH-4 row in `docs/SMOOTH-ROUND-1.md` to "unmoved (2108.9 → 2115.1 ms over 6 runs
   per side)". Leaving 1568 ms in the file guarantees round 2 misreads itself as a regression.
2. Restate the memory cost as 40–120 MB by door, ceiling ~179 MB.
3. Confirm the retained-art residency on the verdict simulator before the memory question is closed.
4. Drive a dungeon exit and the two untested towns, which neither the author's harness nor mine
   reached through the real entry path.

Round 1's real result is: **doors got 41% faster; the freeze did not move.** SMOOTH-4 remains the
binding constraint at ~21x target, and it is the 128,000-Phaser-Image `renderMap()` build — known
cost source #1 — exactly as the author says in "what is still red", just with a different number.
