# Round 4 refutation — independent adversarial verification

Verification of `worktree-agent-aae3d9c31caea6ee2` @ `e02081a` against `main` @ `0c3769e`.

I did not write the change, did not modify it, and did not modify `scripts/perf_probe.cjs`
(sha `0a429d62f3606dfca41cd7dfd9d2c37a0f88a4fa066bbb3fa51ed4d3e9338eae`, verified before and after
all measurement). Both `dist/` trees built in my own worktree with `./scripts/build-dist.sh`;
`diff -rq` over the two served trees reports **exactly one differing file**, `dist/dq-tiles.js`.
Frozen bundle md5 `60d90b63607b6e6980eb170aeeed445e` on both sides, verified over HTTP from both
servers. No simulator was booted. No `npm run build`, `npm run dev` or `npx vite` was run.

## Verdicts

| Claim | Verdict |
|---|---|
| **SMOOTH-1 win** (2584.8 → 614.1 ms, RED → GREEN) | **CONFIRMED, and understated** — I measure 2681.5 → 399.6 ms at 12 runs/side, no overlap |
| **SMOOTH-3 / SMOOTH-4 wins** (988.5 → 141.9; 985 → 131.6) | **CONFIRMED** — reproduced at 12 runs/side, no overlap, both still RED |
| **Which SMOOTH-4 instrument is right** | **THE WATCHDOG. LoAF `blockingDuration` is wrong for this metric.** Adjudicated with three further methods; the author's unflattering choice was correct |
| **"Removal, not deferral" — splats 3 → 0 per session** | **PARTIAL.** True and strongly confirmed **at the probe's entry cell** (0 splats in 12/12 whole sessions). **Refuted as a plate-wide claim**: 8 cold entries elsewhere still splat (load 20 → 10, walk 7 → 2, not 0) |
| **Visual identity** | **CONFIRMED** — re-derived, zero mismatches |
| **The round-1 door/walk interaction** | **CONFIRMED on base** (the exact `c2` re-request, 6 duplicate URLs) — fix result in §5 |
| **"The ring is free — ≤9 chunks either way, zero peak residency cost"** | **REFUTED as a general claim.** True only at the probe's viewport. 6 → 9 on every iPhone; **9 → 12 (16 on iPad Pro landscape), over `A1A_MAX_CHUNKS=10`, on the iPad this app ships to** |
| **SMOOTH-3's remaining >100 ms frame is the window-step blit** | **CONFIRMED** — CDP profile puts `drawImage` at 110.8 ms inside a 117.3 ms contiguous span |

**Recommendation: MERGE WITH FOLLOW-UP.** The change is large, real, attributable, clean, and it
regresses nothing. Nothing I found is a reason to hold it. Three statements must be corrected in the
document before round 5 builds on them:

1. **The splat is narrowed, not removed.** Say "at the probe's entry cell", because §4 currently
   reads as a whole-game claim and a 930–1090 ms splat is still reachable.
2. **The ring's residency cost is viewport-specific**, and on iPad it exceeds `A1A_MAX_CHUNKS`.
3. **SMOOTH-4's instrument question is settled** — round 5's target is ~130–143 ms, not 88 ms.

---

## 1. My own numbers — 12 runs per side, interleaved

`scripts/perf_probe.cjs --compare`, A/B/A/B in one sequence, same machine. Viewport 960x720, dpr 1,
canvas 960x644, coarse-pointer touch emulation ON. Renderer
`ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)` — real GPU, both sides.

**1-min load average at every run start:** base 1.82 – 3.54, fix 2.37 – 3.67 (ceiling 10).
**0 runs voided. 0 page errors in 24 runs.** `tileLayer` objects 0 on both.

`p` is a two-sided Mann-Whitney U with tie correction over the 12+12 per-run values.

| metric | base median (spread, n) | fix median (spread, n) | overlap | p |
|---|---|---|---|---|
| **SMOOTH-1 continue-rel** | **2681.5 (2451.8–2699.5, 12)** | **399.6 (371.9–616.4, 12)** | NO OVERLAP | <0.001 |
| S1 first real terrain | 2416.7 (2403.5–2435, 12) | 1300.5 (1276.5–1333.8, 12) | NO OVERLAP | <0.001 |
| SMOOTH-2 median fps | 59.9 (59.9–59.9, 12) | 59.9 (59.9–59.9, 12) | **OVERLAP** | 1.000 |
| S2 mean fps | 53.5 (52.6–53.8, 12) | 59.2 (59–59.4, 12) | NO OVERLAP | <0.001 |
| SMOOTH-3 p99 | 18.8 (18.7–19, 12) | 18.85 (18.7–19, 12) | **OVERLAP** | 0.785 |
| **S3 worst frame** | **992.9 (985–1135.7, 12)** | **143.5 (121.1–157.3, 12)** | NO OVERLAP | <0.001 |
| **S3 frames >100 ms** | **2 (2–2, 12)** | **1 (1–1, 12)** | NO OVERLAP | <0.001 |
| **SMOOTH-4 longest block** | **985.2 (976.9–1119.8, 12)** | **127.7 (103.2–137, 12)** | NO OVERLAP | <0.001 |
| S4 LoAF blocking | 941.3 (933.6–1077.5, 12) | 85.4 (60.9–94.7, 12) | NO OVERLAP | <0.001 |
| S4 LoAF **duration** | 994.5 (986.1–1135.3, 12) | 142.8 (121.2–157, 12) | NO OVERLAP | <0.001 |
| S4 watchdog drift | 985.2 (976.9–1119.8, 12) | 127.7 (103.2–137, 12) | NO OVERLAP | <0.001 |
| **SMOOTH-5 worst swap** | **145.6 (142.2–152.9, 12)** | **148.4 (106.2–158.2, 12)** | **OVERLAP** | 0.312 |
| S5 into town | 15.95 (14.2–130.1, 12) | 16.3 (14–140.5, 12) | **OVERLAP** | 0.214 |
| S5 town → overworld | 145.6 (142.2–152.9, 12) | 148.4 (106.2–158.2, 12) | **OVERLAP** | 0.312 |
| SMOOTH-6 worst tap | 51.45 (32.7–81.6, 12) | 52.1 (33.4–82.9, 12) | **OVERLAP** | 1.000 |
| S6 battle command | 16.5 (16–17.4, 12) | 16.4 (14.5–18.3, 12) | **OVERLAP** | — |
| **splats before terrain** | **1 (1–1, 12)** | **0 (0–0, 12)** | NO OVERLAP | <0.001 |

**Per-row overlap statements.** SMOOTH-2 median fps, SMOOTH-3 p99, SMOOTH-5 and both its legs,
SMOOTH-6 worst tap and S6 battle command all **overlap, so those are not established** — which for
SMOOTH-5 is the intended result and reproduces the author's finding that round 3's green does not
move. Every other row separates completely.

### Two corrections to the author's table

1. **SMOOTH-1 is better than reported.** The author's 8 runs gave a median of 614.1 ms. Over 12 runs
   the metric is visibly **bimodal** — a low cluster at 371.9–411.6 (7 of 12) and a high cluster at
   613.4–616.4 (5 of 12) — so the median lands wherever the split falls. My median is **399.6 ms**;
   the author's 614.1 ms is the same distribution sampled 8 times. **The spread is the honest
   statistic here, and it reproduces exactly** (author 371–630.8, mine 371.9–616.4). Either way the
   improvement is 4.2x–6.7x and there is no overlap with base. The bimodality is not noise in the
   fix: it is worth one line in the document, because a round-5 reader comparing "614.1" against a
   fresh median will think the fix regressed when it did not.
2. **SMOOTH-3 p99 does not move**, and the author reports it as `OVERLAP` at p=0.242; I get p=0.785.
   No disagreement in the verdict, just a reminder that p99 is the metric the skill's own warning
   says cannot see this defect. My table keeps it only for continuity.

---

## 2. Attack 1 — the instrument disagreement. **THE WATCHDOG IS RIGHT.**

This was the round's blocking question, and it has a clean answer that does **not** require picking
a side on faith.

### 2.1 The disagreement reproduces, and it is a CONSTANT, not a ratio

The author reports LoAF 88.3 ms against watchdog 131.6 ms and calls them "49% apart". Over my 24
runs the ratio is not the invariant — **the difference is**:

| side | watchdog median | LoAF blocking median | **watchdog − LoAF, median (range)** | ratio LoAF/watchdog |
|---|---|---|---|---|
| base | 985.2 ms | 941.3 ms | **43.3 ms (42.3–51.8)** | 0.948–0.962 |
| fix | 127.7 ms | 85.4 ms | **42.3 ms (42.1–44.4)** | 0.590–0.691 |

**The two instruments differ by a near-constant ~42–43 ms across a tenfold change in the size of the
block.** That is the fingerprint of a fixed per-task subtraction. It is *not* the fingerprint of the
hypothesis the brief offered for testing — "the remaining work is split across several tasks that
LoAF attributes separately" — because a split would make the gap scale with the number of tasks and
vary from run to run. It does neither: the fix's range is 42.1–44.4 ms over twelve runs.

**They never actually agreed at round 0 either.** The probe header records 4040 vs 4135 ms and calls
that "within 2.5%". The absolute gap there was 95 ms. The constant offset was always present; it was
simply invisible when divided by four seconds. Dividing a constant by a shrinking number is what
produced the appearance of a new disagreement.

### 2.2 Why the constant is there: `blockingDuration` is a Total-Blocking-Time measure

`PerformanceLongAnimationFrame.blockingDuration` is not "how long the main thread was busy". It is
TBT-shaped: each long task contributes `duration − 50 ms`. A single 138 ms task therefore reports
**88 ms** of `blockingDuration`, and 88.3 + 50 = 138.3 is exactly the bottom of the author's own
SMOOTH-3 worst-frame spread.

SMOOTH-4 is defined by the skill as *"Longest single main-thread block after first playable frame"*.
`blockingDuration` does not measure that quantity; it measures the part of it that exceeds the 50 ms
responsiveness threshold. **Using it as SMOOTH-4 understates the metric by ~50 ms per task by
construction**, which matters not at all at 4 s and matters enormously at a 100 ms target.

### 2.3 Third, fourth and fifth methods — the adjudication

One run on the fix build, five instruments, same 10 s walk, same viewport, load 2.19:

| method | value | verdict at ≤100 ms |
|---|---|---|
| **A** LoAF `blockingDuration` (probe "primary") | **65.8 ms** | GREEN |
| **B** 8 ms setInterval watchdog (probe cross-check) | **116.4 ms** | RED |
| **C** LoAF `duration`, same observer, same entries | **130.8 ms** | RED |
| **D** rAF worst inter-frame delta | **119.6 ms** | RED |
| **E** CDP `Profiler` longest contiguous non-idle sample span | **117.3 ms** | RED |

**Four of five methods agree within 116–131 ms. Only `blockingDuration` says green**, and it is the
one method that is definitionally discounted.

The `duration` vs `blockingDuration` table from that run makes the mechanism explicit:

| LoAF entry `t` | `duration` | `blockingDuration` | difference | scripts | long scripts (>50 ms) |
|---|---|---|---|---|---|
| 1041.1 | 254.6 | 204.3 | **50.3** | 2 | 1 |
| **2818.7** | **130.8** | **0** | **130.8** | **0** | **0** |
| 52.3 | 125.1 | 73.7 | **51.4** | 1 | 1 |
| 3049.6 | 122.6 | 65.8 | 56.8 | 1 | 1 |
| 918.4 | 106.2 | 40.4 | 65.8 | 1 | 1 |
| 235.1 | 105.5 | 54.8 | **50.7** | 1 | 1 |
| 818.3 | 78.4 | 12.7 | 65.7 | 1 | 1 |

Every single-long-script frame sits at `duration − blocking ≈ 50` plus its rendering tail. **And the
second row is the killer: a 130.8 ms animation frame with no script attribution at all reports
`blockingDuration = 0`.** An instrument that scores a 130 ms frame as zero cannot be the primary for
a metric whose whole purpose is catching freezes.

The CDP profile also names the work, which settles §6 below:

```
117.3 ms  drawImage 110.8ms | owmFor 2.5ms | (program) 1.2ms | texImage2D 0.8ms | a1aDrawLayer 0.2ms
```

### 2.4 Verdict on attack 1

- **The author's choice to report RED was correct**, and the probe's `Math.max(LoAF, watchdog)` is
  not merely defensible — it is a **conservative lower bound**. The watchdog's 127.7 ms is itself
  ~15 ms below LoAF `duration` (142.8) and the rAF worst frame (143.5), because the watchdog's
  overshoot starts after its tick has already partly elapsed and excludes the rendering tail.
- **SMOOTH-4 is not already green. Round 5's target is ~130–143 ms, not 88 ms.** If anything the
  honest number is slightly *worse* than the one the author reported.
- The probe's own header calls LoAF "primary" while its code scores on `Math.max` (line 757). **The
  code is right and the header comment is wrong.** That is a probe documentation defect, not a
  behaviour defect — and per §3 of the skill I have not touched the probe. It should be corrected by
  the orchestrator, because round 1's refutation used LoAF as a tie-breaker and a future round will
  read that header and do it again.
- The probe's automatic disagreement guard (`min < 0.5 × max`, line 755) did **not** fire here
  (ratio 0.59–0.69). Given that the offset is a constant ~42 ms, a ratio test is the wrong shape of
  guard at small magnitudes. Also a follow-up, also not mine to edit.

---

## 3. Attack 2 — is the SMOOTH-1 win real? **CONFIRMED, and larger than claimed.**

2681.5 → 399.6 ms median, spreads 2451.8–2699.5 against 371.9–616.4, **no overlap**, p < 0.001, over
12 runs per side. The gate is `terrain` on both builds (110–139 ms, unchanged), and what moves is
`S1 first real terrain`: 2416.7 → 1300.5 ms, also with no overlap.

**The gate is not opening over a thinner window.** Re-derived, not re-read — see §6.

---

## 4. Attack 3 — deferral, direction, the ring's cost, memory

### 4.1 At the probe's seed cell the splat really is gone — whole session, 12/12

The strongest evidence is in the sanctioned probe's own output, which the author did not quote:

| diagnostic | base, 12 runs | fix, 12 runs |
|---|---|---|
| `splatsBeforeTerrain` | 1 (1–1) | **0 (0–0)** |
| `splatsTotal` (whole session: load + both map swaps + walk + battle + taps) | 2 (2–3) | **0 (0–0)** |
| `createImageDataCalls` (liveness witness) | 3 (3–4) | **1** |
| `largestImageDataPx` | 3,953,664 | **1** |

The liveness witness matters: the hook is demonstrably still installed on the fix (one call), and the
largest `ImageData` it ever sees is **1 pixel**. Across twelve complete sessions there is not a single
full-window procedural repaint. **At this seed cell, removal — not deferral — is CONFIRMED**, and it
covers phases the author did not claim (the battle transition, and both map swaps).

I also drove **5 consecutive Greenhollow door round trips** in one session on the fix: **0 splats on
every cycle.**

### 4.2 Away from the probe's seed cell the splat comes back — on BOTH builds

**This is the answer to "find the walk that brings the splat back": I found one, and it is not a
regression — it is a pre-existing hole the round does not close and should not claim to.**

A continuous long walk is impossible on this build: a random encounter takes the hero into
`BattleScene` after about 3 s (measured: 15 cells at **207 ms/cell**, then `BattleScene` — which
incidentally confirms the author's 173–268 ms/cell figure and refutes nothing). So instead of one
long walk I swept the plate: 8 seeded cold entries spread across the Act 1 footprint, a walk burst in
each cardinal direction from each, aborting the moment `WorldMapScene` stops being active.

| | base | fix |
|---|---|---|
| cold sessions | 8 | 8 |
| **splats during LOAD, all 8 sessions** | **20** | **10** |
| walk bursts driven | 16 | 11 |
| **splats during the walk bursts** | **7** | **2** |
| splats per walk burst | 0.44 | **0.18** |
| distinct snapped window origins visited | 20 | 19 |

**Plate-wide the fix is a large, real improvement and not a removal: load splats halve (20 → 10) and
the walk-splat rate drops ~2.4x (0.44 → 0.18 per burst).** Both numbers are far better than base, and
both are far from zero.

Two walk splats on the fix, each a full 3,852,288-px window repaint:

| build | seed | direction | window origins | splat | worst frame |
|---|---|---|---|---|---|
| **fix** | (30,275) | east | `12_252` → `24_252` | **1** | **1089.2 ms** |
| **base** | (30,275) | east | (same step) | **1** | **1076.4 ms** |
| **fix** | (120,240) | south | no window step | **1** | **930.8 ms** |
| **base** | (120,240) | south | (same) | **1** | **913.7 ms** |
| base | (30,275) | west | — | 1 | 939.2 ms |
| base | (60,380) | east | — | 1 | 679.6 ms |
| base | (120,240) | west | 3 origins | **3** | 1044.5 ms |

**Both of the fix's walk splats reproduce on base at the same cell and direction, within 17 ms** —
(30,275) east at 1076.4 vs 1089.2 ms, and (120,240) south at 913.7 vs 930.8 ms. The fix neither
introduces nor removes them. Where the fix clearly wins on the same sweep: (120,240) west is
**3 splats / 1044.5 ms on base and 0 splats / 31.5 ms on the fix.** So the honest statement is:

> The splat is **removed at the seed cell the probe measures**, and **narrowed, not removed, across
> the plate.** A 930–1090 ms stall is still reachable on the fix by starting somewhere else.

`docs/SMOOTH-ROUND-4.md` §4 says *"there is no later phase in which it reappears"* and reports
`3 → 0` **per session**. That is true of the probe's session and false as a general claim. The
document should say "at the probe's entry cell", or the next round will believe the splat is gone and
stop looking for it.

Two further observations from the same sweep, both pre-existing and both worth a round-5 note:

- **The probe measures exactly one entry cell.** Its SMOOTH-4 figure of ~130 ms is that cell's
  number. At other plate positions the fix still produces frames of **385, 395, 930 and 1089 ms**.
  The probe is not wrong — it is narrow, and no round so far has said so.
- **The 10 s walk is substantially a battle.** Both builds travel only 8–29 tiles in the 10 s window
  (at 207 ms/cell an uninterrupted walk would cover ~48), and my identical driver entered
  `BattleScene` at 3.1 s. The SMOOTH-2/3 sample is therefore part overworld walk and part battle
  scene. It is symmetric across A/B so it does not invalidate any comparison in this loop, but it is
  not the "10 s continuous overworld walk" the skill specifies.

### 4.3 All four directions

The margin is applied on all four sides in the code, and the sweep exercised
east/south/west/north bursts from 8 origins. No direction was worse than another on the fix; the two
splats were one east and one south, and both reproduce on base at the same or adjacent cells. **The
four-sided claim is CONFIRMED** — the ring's rect is symmetric by construction
(`max(0,X0-MARGIN)` … `X0+winW+MARGIN`, same in Y) and nothing in the sweep contradicts it.

### 4.4 The ring's cost — **"raises peak residency by exactly zero" is REFUTED, by direct measurement**

The document states: *"the window alone straddles at most 9 chunks and the window padded by `MARGIN`
straddles at most 9 as well … **So this raises peak residency by exactly zero** and
`A1A_MAX_CHUNKS`=10 still has its headroom."*

I measured it live. Throwaway `*-diag` trees, each carrying **one** additive read-only handle
(`__A1A_PEEK__`, +236 bytes, exposing `Object.keys(A1A.chunks).length`, `A1A.lru` and `A1A.win`
from inside the IIFE where they are in scope). Frozen bundle md5 unchanged on both. **No timing
number in this document comes from those trees** — they count resident chunks and nothing else.
Same technique the round-3 refutation used for `__DIAG_OWM__`.

Each row: cold boot, settle, then walk six 9 s legs covering all four directions.

| viewport | camera worldView | zoom | **base peak resident** | **fix peak resident** | base `A1A.win` | fix `A1A.win` |
|---|---|---|---|---|---|---|
| probe desktop 960x720 | 960x644 | 1 | **6** | **10** | 4 | 9 |
| iPhone SE portrait 375x667 | 375x591 | 1 | **4** | **10** | 4 | 9 |
| iPhone 13/14 portrait 390x844 | 390x768 | 1 | **4** | **10** | 4 | 9 |
| iPhone 15 Pro portrait 393x852 | 393x776 | 1 | **4** | **9** | 4 | 9 |
| iPhone 16 Pro Max portrait 440x956 | 440x880 | 1 | **4** | **9** | 4 | 9 |
| iPad portrait 820x1180 | 820x1104 | 1 | **4** | **10** | 4 | 9 |

**Peak chunk residency goes from 4–6 to 9–10 — it roughly doubles, and it sits AT the cap of 10 at
four of the six viewports.** "Exactly zero" and "still has its headroom" are both false as measured.

**Where the reasoning went wrong**, precisely: the author compared *worst case to worst case* — the
maximum over all snapped origins of the window alone (9) against the maximum over all snapped origins
of the ring (9) — and concluded the delta is zero. But base does not *sit* at its worst case; it
holds only the chunks the current window touches, which is **4** almost everywhere. The fix holds the
ring at **every** origin. Comparing two worst cases hid a doubling of the typical case. The author's
own doubt 4 gets the door-retention half of this right (`A1A.win` 4 → 9, confirmed exactly above);
the "peak residency" sentence in §2 contradicts it and is the one that is wrong.

Camera note: `zoom` is 1 and `cam.worldView` tracks the container at every viewport, so the window
really does vary with the device. Under `(pointer: coarse)` `index.html:70-73` sizes the container to
`100vw x (100vh − 76px)`, which the measured worldViews match exactly.

### 4.5 The cap can be exceeded on iPad — analytic, not observed

I re-implemented `a1aRingChunks` and `a1aRects`' intersection loop exactly, from
`public/act1-hifi/manifest.json` (5x6 grid, 32-cell chunks, plate origin cell (16,218)), and
enumerated **every** snapped window origin — including the ones a 54 s walk never reaches:

| viewport | window | window alone | **RING** | cap | worst origin |
|---|---|---|---|---|---|
| probe 960x644 | 44x38 | 9 | **9** | 10 | — |
| every iPhone portrait | 32–34 x 36–41 | 6 | **9** | 10 | — |
| **iPad (10th) portrait** | 42x47 | 9 | **12** | **10 — OVER** | (36,288) |
| **iPad (10th) landscape** | 49x39 | 9 | **12** | **10 — OVER** | (84,240) |
| **iPad Pro 12.9 landscape** | 53x43 | 9 | **16** | **10 — OVER** | (48,324) |

iPad is a shipping target — `ios/App/App.xcodeproj` sets `TARGETED_DEVICE_FAMILY = "1,2"` and
`Info.plist`'s `UISupportedInterfaceOrientations~ipad` allows portrait **and** landscape.

**I did not observe 12 live** — the residency sweep peaked at 10 on iPad because the hero never
reached origin (36,288) in the time available. So this row is an analytic bound from an exact replica
of the shipped code, not a measurement, and I flag it as such.

The failure mode is **not** thrash: the trim is `while(A1A.lru.length > Math.max(A1A_MAX_CHUNKS,
keep.length))` and `keep` **is** the ring, so the cap simply rises to the ring's size. It is
**memory**. On the file's own budget of ~19 MB per resident chunk: 190 MB at the cap, **228 MB at 12,
304 MB at 16**.

The author flagged this as doubt 3 but guessed the trigger would be a re-bake or "a camera wider than
~68 cells". The trigger is reached by **hardware this app already ships to**. It does not block
merge — the change is a large net win and no simulator or device has been measured in any of the four
rounds — but it should be recorded as a known ceiling rather than as headroom.

---

## 5. Attack 4 — the round-1 interaction. **CONFIRMED, exactly as described.**

I wrapped the `HTMLImageElement.prototype.src` setter and `drawImage` from outside the game and
drove the real Greenhollow door, then the walk, then six more swap cycles.

### 5.1 The interaction existed

On **base**, the six `c2-r0` / `c2-r1` layers are requested at parse time, the door round trip runs
at t=5127→6447 ms, and **the same six URLs are re-requested at t=7854 ms, during the walk** — the
"observed re-request" the author cited, reproduced:

| url | 1st set | 2nd set |
|---|---|---|
| `chunks/base/c2-r0.webp` | load @ 20.8 ms | **walk @ 7853.9 ms** |
| `chunks/canopy/c2-r0.webp` | load @ 20.8 ms | walk @ 7854 ms |
| `chunks/water/c2-r0.png` | load @ 20.8 ms | walk @ 7854 ms |
| `chunks/base/c2-r1.webp` | load @ 20.9 ms | walk @ 7854 ms |
| `chunks/canopy/c2-r1.webp` | load @ 21 ms | walk @ 7854 ms |
| `chunks/water/c2-r1.png` | load @ 21 ms | walk @ 7854 ms |

Base's splat phases: `{continue: 2, walk: 1}` — **exactly the author's `splatsByPhase` of
`{load: 2, walk: 1}`**, three per session, corroborated on a second instrument.

### 5.2 "Neither fetch nor decode" — re-derived

| base chunk layer | src → onload | ResourceTiming network | first `drawImage` |
|---|---|---|---|
| `base/c2-r0.webp` (walk) | **1008.8 ms** | **7.1 ms** | 0 ms |
| `base/c2-r1.webp` (walk) | 1007.9 ms | 6.5 ms | 0 ms |
| `base/c0-r0.webp` (load) | **2298.1 ms** | **10.5 ms** | 0 ms |
| `canopy/c0-r0.webp` (load) | 2298.2 ms | 8.5 ms | 0 ms |
| `water/c0-r0.png` (load) | 2298.2 ms | 9.2 ms | 62.5 ms |

The author's numbers (988.1 / 7.1 / 0.0 and 2308.5 / 10.4) reproduce to within ~1%. **The diagnosis
is correct: the cost is scheduling, not fetch and not decode.** The one exception worth recording is
`water/c0-r0.png`, whose first `drawImage` costs **62.5 ms** — a real decode, small next to the
2298 ms it sits behind, but not the "0.0–0.1 ms, the decode is free" the document states for every
layer. The PNG water layer decodes; the WebP layers do not.

### 5.3 The fix closes it

| | base | fix |
|---|---|---|
| **splats, all phases** (load, door in, door out, walk, 6 swap cycles) | `{continue: 2, walk: 1}` | **`{}` — none** |
| **max `src → onload`, any chunk layer** | **2298.2 ms** | **30.8 ms** |
| `c2-r0`/`c2-r1` re-requested during the walk | **yes, all six** | **no** |
| chunk requests / distinct URLs | 24 / 18 | **42 / 36** |
| requests whose image is **never drawn** | 6 of 24 (25%) | **24 of 42 (57%)** |

The specific eviction the author names is gone, and the 988–2298 ms scheduling stall with it: **the
worst `src → onload` on the fix is 30.8 ms, and it is dominated by the 30.2 ms of network under it.**

Two honest qualifications the document should carry:

- **Re-requests are not eliminated in general.** The fix still re-requests six layers during the
  walk — the `c1-r2` / `c2-r2` columns, at t=10494 ms — because the LRU still evicts as the window
  travels. They simply cost nothing now (30.8 ms, no splat). "Measured re-request, gone" is true of
  *that* re-request, not of re-requests.
- **The ring's speculative cost is visible here, not just in theory.** The fix issues **42 requests
  over 36 distinct URLs against base's 24 over 18**, and **57% of the images it loads are never
  drawn at all**. That is the price being paid for the lead, and it is the same fact §4.4 measures
  as residency.

### 5.4 Has widening `A1A.win` reintroduced what round 1's trim prevented?

No. Round 1's trim exists so that leaving the overworld does not hold the whole plate resident. It
still runs, still trims to `A1A.win`, and `A1A.win` is now the ring rather than the bare window — 9
chunks instead of ~4 at the probe's viewport, not 30. Across **six** further door swap cycles I saw
no splat, no unbounded request growth, and no heap growth (below). The trim's purpose survives; only
its aggressiveness changed.

### 5.5 Memory across many swaps

Six door swap cycles after the walk, sampled per cycle:

| | base | fix |
|---|---|---|
| JS heap, cycles 1→6 | 102.7 → 106.5 → 109.2 → 111.3 → 113.4 → 102.3 MB | **91 → 93.2 → 81.5 → 82.3 → 82.9 → 83 MB** |
| all-Chrome RSS, cycles 1→6 | 1863 → 1871 → 1878 → 1767 → 1765 → 1772 MB | 2001 → 1988 → 1895 → 1893 → 1894 → 1888 MB |

**No monotonic growth on either build across six swaps** — both sag and recover, which is collection,
not a leak. The fix's JS heap is consistently **~20 MB lower** than base's.

I could not reproduce the author's "+9 MB" figure as a clean delta: whole-Chrome RSS is a
process-tree aggregate that moves by 100 MB between runs of the *same* build, so it is not an
instrument that can resolve 9 MB. **The memory claim is neither confirmed nor refuted — it is below
the noise floor of the instrument used to make it.** The residency count in §4.4 is the measurement
that actually bounds this, and it says the ring holds 9 chunks where the window holds 6.

---

## 6. Attack 5 — visual identity, re-derived. **CONFIRMED, zero mismatches.**

Live canvas textures hashed with FNV-1a over **every byte** of `getImageData` for the Phaser
textures `dqterrain` and `dqcanopy`, from four seeded cold entries and again after driving the real
door. `canMove` is re-derived by calling `scene.canMove(x,y)` over the whole 320x400 lattice.
(My hash function differs from the author's, so my hex digests are not comparable to theirs; the
**counts** are, and they match exactly — see below.)

### Settled terrain and canopy

| cell | `dqterrain` base | `dqterrain` fix | `dqcanopy` base | `dqcanopy` fix | base = fix |
|---|---|---|---|---|---|
| greenhollow.exit (69,256) | `f7a123bc` | `f7a123bc` | `37e8e260` | `37e8e260` | **YES** |
| millbrook.exit (39,345) | `a9142729` | `a9142729` | `6db147b8` | `6db147b8` | **YES** |
| portSapphire.exit (133,348) | `d4775118` | `d4775118` | `4b711af8` | `4b711af8` | **YES** |
| landmark4 (30,275) | `0316941c` | `0316941c` | `67fe3770` | `67fe3770` | **YES** |

### Lattice, cold and after a real door round trip

| | base | fix |
|---|---|---|
| overworld `canMove` / blocked, all four cells, cold | `9f0f2958` / **78,711** | `9f0f2958` / **78,711** |
| overworld `canMove` / blocked, after return | `9f0f2958` / **78,711** | `9f0f2958` / **78,711** |
| overworld `mapData`, cold and after return | `48aa72a4` | `48aa72a4` |

**78,711 blocked** reproduces the author's and round 3's figure exactly.

### Doors driven through the real door

| door | entered | inside `canMove` / blocked, base | fix | base = fix |
|---|---|---|---|---|
| Greenhollow (town) | yes, both | `7f305010` / **100** | `7f305010` / **100** | **YES** |
| Millbrook (town) | yes, both | `dbab0d38` / **98** | `dbab0d38` / **98** | **YES** |
| Sunken Cellar (dungeon) | yes, both | `48a3edd0` / **633** | `48a3edd0` / **633** | **YES** |
| **Port Sapphire (town)** | **NO — neither build** | — | — | **UNVERIFIED** |

The blocked counts **100 / 98 / 633** match the author's table exactly on an independently written
instrument. Terrain and canopy after each round trip equal their own cold values on both builds.
**0 page errors** across all eight sessions.

**One row I could not verify.** My mover walks north for 12 s then south for 12 s from the seeded
exit cell, and it never entered Port Sapphire on **either** build. The author says they reached it by
seeding at (133,348) and stepping south. I am not refuting that — I could not reproduce it, so the
Port Sapphire door row is **unverified by me**, on both builds equally. Its cold terrain and canopy
*are* verified identical (table above).

### Anti-gaming: the SMOOTH-1 gate frame

I captured `dqterrain` at the exact frame `playableAt` is set — the frame SMOOTH-1 stops the clock —
including an opaque-pixel count:

| cell | base gate texture | fix gate texture |
|---|---|---|
| greenhollow.exit | `f7a123bc` @2112x1824, **3,852,288 / 3,852,288 opaque** | `e534a280` @2112x**1872**, **3,953,664 / 3,953,664 opaque** |
| millbrook.exit | `c94a1b28` @2112x1872, 3,953,664 / 3,953,664 | `c94a1b28` @2112x1872, 3,953,664 / 3,953,664 |
| portSapphire.exit | `4f4cc55d` @2112x1872, 3,953,664 / 3,953,664 | `d4775118` @2112x1824, 3,852,288 / 3,852,288 |
| landmark4 | `abd971e8` @2112x1872, 3,953,664 / 3,953,664 | `0316941c` @2112x1824, 3,852,288 / 3,852,288 |

**Every gate frame on both builds is 100% opaque — `opaque == px` in all eight cases.** The gate is
never opened over a partially painted or transparent window, on either build. **No visual quality,
resolution, draw distance or map size was traded, and the anti-gaming check passes.**

**One correction.** The document claims *"both builds report the identical terrain texture
`8049de2a@2112x1872` with 3,953,664 of 3,953,664 pixels opaque"* at the gate frame. That does not
reproduce: at three of four cells the gate-frame textures **differ between builds**, in both hash and
height (1824 vs 1872), because the fix reaches the gate at a different point in the camera's settle.
The author's *conclusion* is sound — full opacity, and the settled textures are byte-identical — but
the stated evidence is not. Worth fixing, because "identical texture at the gate frame" is the exact
sentence a later round would cite as proof against gaming, and it is not what the instrument says.
Where the fix is incidentally better: at portSapphire and landmark4 the fix's gate texture already
**is** the settled texture, while base shows a transient that changes afterwards.

---

## 7. Attack 6 — SMOOTH-3's remaining >100 ms frame. **CONFIRMED.**

The author attributes it to a window-step blit in which `a1aCanopy` composites each chunk three
times, and calls it the honest round-5 target. The CDP profile from §2.3 names it directly — the
longest contiguous non-idle span on the fix is **117.3 ms**, composed as:

```
drawImage 110.8 ms | owmFor 2.5 ms | (program) 1.2 ms | texImage2D 0.8 ms | a1aDrawLayer 0.2 ms
```

**94% of the span is `drawImage`.** The attribution is correct.

The plate sweep supplies the causal check the author did not run: bursts that **cross** a window
origin show worst frames of 127–151 ms, and bursts that **do not** show 19–35 ms. The stall tracks
the window step, not the clock.

One correction to the target's size: round 5 should aim at **~130–143 ms** (LoAF `duration` /
rAF worst frame), not the 131.6 ms watchdog figure and certainly not 88 ms. See §2.

---

## 8. Non-regression set, on the committed tree

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

$ md5 dist/assets/index-BhoGQRaA.js   -> 60d90b63607b6e6980eb170aeeed445e
$ shasum -a 256 scripts/perf_probe.cjs -> 0a429d62f3606dfca41cd7dfd9d2c37a0f88a4fa066bbb3fa51ed4d3e9338eae
$ git status --porcelain                -> (empty)
```

Act 1 plate sha `205dbe88…` unchanged — **world generation did not move.** All three Act 1 towns
still reachable in principle; Greenhollow and Millbrook driven through the real door on both builds
(§6), Port Sapphire not reachable by my mover on either build.

The four sha pins in the diff are exactly the new `public/dq-tiles.js` digest and byte count —
`7e974d40…` / 299,670 — which I verified against the file on disk. Bundle sha, pre-override map sha
and final map sha are untouched.

---

## 9. What should change in `docs/SMOOTH-ROUND-4.md` before round 5

1. **§4, splat counts.** Change "total per session 3 → 0" and "there is no later phase in which it
   reappears" to say **at the probe's entry cell**. Plate-wide it is 20 → 10 load and 7 → 2 walk, and
   a 930–1090 ms splat is still reachable at (30,275) and (120,240) — on **both** builds.
2. **§2, "the ring is free … raises peak residency by exactly zero".** Measured false: peak residency
   4–6 → 9–10, at the cap on four of six viewports (§4.4). The ≤9 figure compares two worst cases and
   hides a doubling of the typical case.
3. **§8 doubt 1, the instrument question.** Settled: the watchdog is right, LoAF `blockingDuration`
   is a TBT-style measure that is ~50 ms low per task by construction and reported **0** for a
   130.8 ms frame with no script attribution. **SMOOTH-4 is RED and round 5's target is ~130–143 ms.**
4. **§6, the gate-frame texture.** "Both builds report the identical terrain texture" does not
   reproduce; they differ at three of four cells. The correct anti-gaming evidence is that both are
   **100% opaque** and both settle identically.
5. **§1, "the decode is free".** True of the WebP layers; `water/c0-r0.png`'s first `drawImage` costs
   **62.5 ms** on base.
6. **§2, the lead figure.** "The hero crosses a window boundary every ~2.1–3.2 s" is right on cell
   speed (I measure 207 ms/cell) — keep it.

Two things that are not the author's to fix but should not be lost:

- **`scripts/perf_probe.cjs`'s header calls LoAF "primary" while its code scores on
  `Math.max(LoAF, watchdog)` (line 757).** The code is right. The header misled round 1 into using
  LoAF as a tie-breaker and will mislead again. Also, the automatic disagreement guard on line 755 is
  a **ratio** test (`min < 0.5 × max`) against what is actually a **constant** ~42 ms offset, so it
  cannot fire at small magnitudes — it did not fire here. Both are probe edits, i.e. a
  `NEEDS-CONSULT` to the orchestrator, and I have not touched the file.
- **The probe measures one entry cell and its 10 s walk is substantially a battle.** Both builds
  travel 8–29 tiles in the window and my identical driver entered `BattleScene` at 3.1 s. Symmetric,
  so no comparison in this loop is invalidated — but SMOOTH-2/3 is not sampling what the skill
  describes, and SMOOTH-4's ~130 ms is one cell's number while other cells still show 385–1089 ms.

---

## 10. Recommendation

**MERGE WITH FOLLOW-UP.**

The change is one small, well-argued hunk that produces the largest SMOOTH-1 move any round has
made (2681.5 → 399.6 ms, no overlap, 12 runs/side), removes the walk and load splat entirely at the
measured entry cell (0 splats in 12/12 whole sessions, hook proven live), collapses the worst chunk
`src → onload` from 2298 ms to 30.8 ms, regresses nothing on SMOOTH-2/5/6, keeps the frozen bundle
and the world plate byte-identical, passes both gates, and traded no visual quality.

Nothing I found is a reason to hold it. The follow-ups are §9 items 1, 2 and 3 — two documentation
corrections and one settled question — plus the iPad residency ceiling in §4.5, which is a known
limit to record rather than a defect to fix now.

**The device verdict remains outstanding for all four rounds.** Every number in this loop, mine
included, is a browser number.

---

## Appendix — declared diagnostics

`scripts/perf_probe.cjs` was **not modified** (sha verified before and after). The fix was **not
modified** (`git status` empty at `e02081a`). Everything below is a throwaway file outside the
repository, in this session's scratchpad, written by me for this verification only.

| file | what it does | numbers taken from it |
|---|---|---|
| `run-probe.sh` | runs the **unmodified** probe, `--compare`, 12 runs/side | §1 (all headline numbers) |
| `analyze.py` | reads the probe's own JSON; medians, spreads, overlap, Mann-Whitney U | §1, §2.1 |
| `loaf_adjudicate.cjs` | five SMOOTH-4 instruments in one run, incl. CDP `Profiler` and the LoAF `scripts[]` breakdown | §2.3, §7 |
| `plate_sweep.cjs` | 8 seeded cold entries, walk bursts in four directions, splat + window-origin counting | §4.1–4.3 |
| `chunk_trace.cjs` | `Image.src` / `drawImage` wrappers, ResourceTiming, memory across swaps | §5 |
| `visual_identity.cjs` | FNV-1a over `getImageData` for `dqterrain`/`dqcanopy`, lattice re-derivation, door driving | §6 |
| `residency.cjs` | live chunk residency at six viewports | §4.4 |
| `ring_geometry.py`, `ring_devices.py`, `ring_threshold.py`, `ring_ipad.py` | exact replica of `a1aRingChunks` over the shipped manifest, every snapped origin | §4.5 |
| `peek_state.cjs` | scene-state trace that identified the random encounter | §4.2 |
| `make_diag_trees.sh` | copies `base-dist`/`fix-dist` and inserts **one** additive read-only handle, `__A1A_PEEK__` (+236 bytes), inside the `dq-tiles.js` IIFE | **residency counts only — §4.4. No timing number in this document comes from the `*-diag` trees.** Frozen bundle md5 unchanged in both. |

The two served trees (`base-dist`, `fix-dist`) were each built by `./scripts/build-dist.sh` from
their own checkout; `diff -rq` reports exactly one differing file, `dist/dq-tiles.js`, and both serve
bundle md5 `60d90b63607b6e6980eb170aeeed445e` over HTTP.
