# SMOOTH baseline — round 0

The starting numbers for the `/smooth` loop, produced by `scripts/perf_probe.cjs` on the
committed tree. Every later round is compared against this file.

Measurement only. Nothing was optimised to produce these numbers, and no game file was
changed to measure them.

| | |
|---|---|
| Round | 0 (baseline) |
| Measured | 2026-08-07 |
| Tree | `main` @ `b36ca3a` (`perf: stop repainting 3.5M pixels before the real overworld arrives`) |
| Bundle | `dist/assets/index-BhoGQRaA.js` md5 `60d90b63607b6e6980eb170aeeed445e` (unchanged) |
| Probe | `scripts/perf_probe.cjs`, 3 runs, medians + full spread |
| Served by | `scripts/serve_dist.py` (threaded) |
| Harness | headless Chrome, real GPU — `ANGLE (Apple, ANGLE Metal Renderer: Apple M1)` |
| Viewport | 960x720, dpr 1, canvas 960x644, **coarse-pointer touch emulation ON** |
| 1-min load | 2.53 / 2.95 / 2.94 at run start (ceiling 10, no run voided) |

## The six numbers

| ID | What the owner feels | Median | Spread (3 runs) | Target | |
|---|---|---|---|---|---|
| SMOOTH-1 | "It takes forever to start" | **2513 ms** | 2484.6–2536.1 | ≤ 1500 ms | **RED** (1.7x) |
| SMOOTH-2 | "It's choppy when I walk" | **59.9 fps** | 59.9–59.9 | ≥ 55 fps | GREEN |
| SMOOTH-3 | "It hitches" | **18.7 ms** | 18.7–18.7 | ≤ 33 ms | GREEN* |
| SMOOTH-4 | "It freezes" | **2175.7 ms** | 2066.4–2926.8 | ≤ 100 ms | **RED** (21.8x) |
| SMOOTH-5 | "Doors are slow" | **3737.1 ms** | 3531.8–4509.4 | ≤ 500 ms | **RED** (7.5x) |
| SMOOTH-6 | "It ignores my taps" | **49 ms** | 34.9–74.8 | ≤ 100 ms | GREEN |

\* SMOOTH-3 is green on the metric as defined and **should not be read as "no hitching"**. See
"What the green numbers hide" below — this is the one row in the table that can mislead.

### Where each number comes from

| Sub-measure | Median | Spread |
|---|---|---|
| S1 — first real terrain (page-load relative) | 3465.2 ms | 3450.3–3527.8 |
| S1 — Continue tap (page-load relative) | ~952–992 ms | |
| S4 — LoAF `blockingDuration` | 1521.2 ms | 1516.7–2259.5 |
| S4 — watchdog scheduling drift (independent method) | 2175.7 ms | 2066.4–2926.8 |
| S4 — longest block *before* first playable frame | ~1325 ms | 1312.9–1332.3 |
| S5 — overworld → town (entering Greenhollow) | 67.5 ms | 67.3–72.2 | 
| S5 — **town → overworld** | 3737.1 ms | 3531.8–4509.4 |
| S6 — menu open (field tab) | 49 ms | 34.9–74.8 |
| S6 — battle command | 17.9 ms | 16.5–18.3 |
| Walk — mean fps (vs 59.9 median) | 52.3 fps | 52.3–53.1 |
| Walk — worst single frame | 1236.8 ms | 1098.4–1239 |
| Walk — frames > 100 ms in 10 s | 2 | 2–2 |

### Diagnostics

| | |
|---|---|
| Full procedural splats before real terrain | **1** (3,953,664 px) |
| `createImageData` calls total (hook liveness witness) | 3 |
| Phaser display objects in the overworld tile container | **128,000** |
| Initial overworld load (not counted as a map swap) | 2468.8–2493.3 ms |

The single remaining 3.95 M-pixel procedural splat is what survives commit `b36ca3a`; the
previous round's 3.5 M-px repeats are gone. The 128,000 Phaser Images in `tileLayer` are
known cost source #1 in the `smooth` skill and are **still present** — the engine walks that
list every frame.

## The binding constraint

**SMOOTH-4 — the game freezes for ~2.2 s while you are playing.** It is 21.8x its target,
the furthest of any metric, and unlike SMOOTH-1 it happens *during* play rather than once at
startup. Three of the four worst blocks in every run land after the first playable frame.

SMOOTH-1, SMOOTH-4 and SMOOTH-5 are not three problems. They are one problem measured at
three moments: **building the overworld terrain blocks the main thread for 1.5–2.9 s**, and
it runs on the initial load (2.5 s), on every return to the overworld from a town (3.7 s),
and again periodically as the hero walks into new terrain windows (the 1.2 s frame inside
the 10 s walk).

The asymmetry in SMOOTH-5 is the clearest single piece of evidence: entering a town costs
**67.5 ms** and coming back out costs **3737.1 ms**, a 55x difference across the same door.
Only one of those directions rebuilds the overworld.

Recommended target for round 1: the overworld terrain rebuild. Fixing it moves SMOOTH-4,
SMOOTH-5 and SMOOTH-1 together, and is the only item that does.

## What the green numbers hide

Read these before concluding anything from the GREEN column.

- **SMOOTH-2 is green and the walk is not smooth.** Median frame rate is a clean 59.9 fps
  while the *mean* is 52.3 fps. Almost every frame is perfect; one or two are catastrophic.
  A median cannot see a freeze, which is exactly why the skill also defines SMOOTH-3 and
  SMOOTH-4. SMOOTH-2 alone must never be cited as evidence that walking is smooth.
- **SMOOTH-3 is green at 18.7 ms and the walk still contains a 1236.8 ms frame.** p99 over
  ~520 frames is the 6th-worst frame, and there are only ~2 bad frames in the window, so the
  bad ones sit outside p99 entirely. `framesOver100ms` (2) and the worst-frame figure are the
  honest companions and are recorded above for every round. **A future round must not claim
  SMOOTH-3 improved without also showing the worst frame improved.**
- **SMOOTH-6 is genuinely green**, and it is the only green here I would defend without
  caveat. Both taps were measured, both on visible shipped controls.

## Trust and instrument limits

Two artefacts were found and fixed while building this harness. Both had produced
confident, tightly-reproducible, completely wrong numbers, and both are documented at
length in the probe's header so they are not reintroduced:

1. **SwiftShader.** Forcing software rasterisation (as `scripts/browser_runtime_smoke.cjs`
   correctly does for a behavioural smoke test) reports 3.8 fps against the real GPU's 61 —
   a 16x error. The probe now asserts the renderer and voids the run if it is software.
2. **The boot cover's 10 s `TITLE_CAP`.** The shipped cover only leaves phase `boot` after
   three consecutive painted title frames. A harness that presses Continue immediately never
   gives it three, so the cover sat pinned until its 10 s safety valve. The probe reported
   SMOOTH-1 = 9357 ms with a 6 ms spread across three runs — beautifully reproducible, and
   pure artefact: terrain had been ready since 3.4 s and every gate the cover checks was
   already satisfied. The probe now waits for the title phase to end before tapping Continue,
   and **voids any run where the cover was still in `boot`**. The real figure is 2513 ms.

Confidence in each number, stated plainly:

| ID | Confidence | Why |
|---|---|---|
| SMOOTH-1 | **High.** ±1% | 2484.6–2536.1 across 3 runs; terrain-gated and the gate is directly observed. |
| SMOOTH-2 | **High** as a median, **low as a description of smoothness.** | Spread is 0.0 fps. It is the metric that is weak, not the measurement. |
| SMOOTH-3 | **Low. Structurally noisy — treat as ±100%.** | p99 landed at 18.7/18.7/18.7 here but 38.9/259.1/274.9 on a loaded machine, because p99 flips between the 3rd and 6th worst frame depending on how many frames the window caught. Use `framesOver100ms` and worst-frame for round-over-round comparison. |
| SMOOTH-4 | **Medium-high, ±20%.** | Two independent methods (LoAF 1521 ms, watchdog 2176 ms) agree on magnitude but not value; the larger is reported, so this is a lower bound. Spread 2066–2927. |
| SMOOTH-5 | **High, ±10%.** | 3531.8–4509.4; measured over the real walk-through-the-door entry path in both directions, not a console `loadMap()`. |
| SMOOTH-6 | **Medium, ±40%.** | 34.9–74.8 on the menu tap is a wide relative spread on small absolute numbers. Comfortably inside target either way. |

Further limits worth stating:

- **This is a browser number, not a device verdict.** The `smooth` skill's verdict device is
  the iOS simulator. No simulator was booted for this baseline; the machine was already
  carrying other agents' simulators and the brief excluded it. Every figure here is a
  hypothesis about the phone.
- **Load discipline mattered more than expected.** The same probe on the same tree returned
  SMOOTH-3 = 259 ms and SMOOTH-6 = 318 ms at load 8.5–28.7, versus 18.7 ms and 49 ms at load
  2.5–3.0. The probe now waits for the machine to settle before each run and records the
  load with every result. Numbers taken above load 10 are void, per the skill.
- **SMOOTH-6's battle encounter is forced** via `startBattle`, because a random encounter is
  not deterministic. The tap being timed is a real touch on the real command rail; only the
  route into battle is synthetic.
- **Touch emulation is required, not cosmetic.** The shipped analog stick and field tab bar
  live behind `@media (pointer: coarse)`. Without emulation they are `display: none`, the tab
  buttons measure 0x0, and SMOOTH-6 cannot be measured at all.

## Reproducing

```sh
python3 scripts/serve_dist.py --port 5174 &
node scripts/perf_probe.cjs --runs 3 --label round-N --settle 6 --out /tmp/roundN.json
```

Interleaved A/B against a fix, which is the correct shape for a before/after:

```sh
node scripts/perf_probe.cjs --compare "base=http://127.0.0.1:5174/,fix=http://127.0.0.1:5175/"
```

`dist/` is gitignored; rebuild it in a fresh worktree with `./scripts/build-dist.sh`, which
assembles from the preserved baseline and never invokes Vite.
