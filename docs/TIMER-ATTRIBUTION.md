# Timer attribution — what the shell's periodic work actually costs

**Measured 2026-08-11 at HEAD `c410c56`. Bundle md5 `60d90b63607b6e6980eb170aeeed445e` confirmed
unchanged before sampling.**

> [!important] Every number here is a Chrome/Playwright number on an M-series Mac.
> No simulator and no device was used. The owner's freeze was reported on an **iPhone 13 / iOS 26.6**
> and **nothing here is a claim about that device.** Say this out loud whenever quoting these numbers.

## Method

Instrumented entirely from OUTSIDE the game via Playwright `addInitScript`, the same discipline
`scripts/perf_probe.cjs` uses. **No file under `public/` was touched.** Three independent methods:

1. **Exact, all four outer timers** — wraps `window.setInterval` before any game script runs; the four
   targets are disambiguated by period (50/80/200/400 ms), confirmed unique against every
   `setInterval` in `public/*.js`, the frozen bundle and `index.html`.
2. **Exact, `drawFieldMap` only** — it is closure-local and unreachable directly, but every real
   (non-throttled) invocation opens with one `ctx.setTransform` on `#qfh-map-canvas`; wrapping
   Canvas2D prototype methods filtered to that canvas reconstructs each call's exact span.
3. **CDP `Profiler` self-time** (100 µs sampling) + `startPreciseCoverage` for exact call counts, for
   the five functions inside the 50 ms tick.

**6 runs** (3 profiled + 3 clean), 20 s walk each, 21 tiles walked per run, random encounters
suppressed (`encounterRateMultiplier=0`; `battleEntered` false on every run). **Load 1.93–3.46
throughout, before and after every run. Nothing discarded.**

Harness: `scratchpad/timer-attribution/` (`attribution_probe.cjs`, `analyze.cjs`, `full-run.json`).

## Result: all four timers are cheap. The named suspect is RETIRED.

| Timer | Calls/run | Total ms/run | Mean ms/call | p99 | Max single | % of wall-clock |
|---|---|---|---|---|---|---|
| `ui-overhaul.js:1806` (50 ms) | 400–402 | 42.9 / 65.8 / 88.4 | 0.11–0.22 | 0.2–0.5 | 0.3–0.7 | **0.21–0.44%** |
| `dq-tiles.js:4255` (80 ms) | 250–252 | 25.0 / 30.6 / 36.8 | 0.10–0.15 | 2.2–3.2 | 3.4–5.2 | 0.12–0.18% |
| `hero-override.js:205` (200 ms) | 100–101 | 1.0 / 2.45 / 3.6 | 0.01–0.04 | 0.1–0.2 | 0.1–0.2 | 0.00–0.02% |
| `act1-world-map.js:282` (400 ms) | 50–51 | 3.6 / 4.7 / 8.7 | 0.07–0.17 | 0.5–1.1 | 0.5–1.1 | 0.02–0.04% |

Sum of all attributed time: **73–135 ms against a 20,000 ms walk (≤0.7%)** — and the sum being far
under wall-clock is the check that the instrumentation is not double-counting.

**`public/ui-overhaul.js:1806` was the handoff's "leading suspect… by far the largest periodic
main-thread cost in the shell". It costs 0.21–0.44% of a walk. It is not the freeze.** The "40x the
cadence of the timer just removed" framing was true about cadence and irrelevant about cost.

### `drawFieldMap`, real draws only

| | value |
|---|---|
| Real (non-throttled) calls/run | 80–81 |
| **Mean per ONE real call** | **0.04–0.10 ms** |
| p99 / max | 0.2–0.3 ms |
| % of wall-clock | 0.02–0.04% |

**The entry-count trap, confirmed.** `drawFieldMap` is *entered* ~404 times per run — essentially
every tick — but only **80–81** entries do canvas work; the rest hit the 220 ms throttle's early
return in under a microsecond. **Reporting entries as "the cost of drawFieldMap" overstates it 5x.**
Always say which number you mean.

### Inside the 50 ms tick (CDP self-time, 3 profiled runs)

| Function | Self ms/run | Calls/run |
|---|---|---|
| `measureSafeArea` | 0 / 0 / 0.19 | 404 |
| `hookScenes` | 0 | 404 |
| `syncFieldNav` | 0 / 0 / 0.21 | 404 |
| `syncMsgCatcher` | 0.18 / 0.18 / 0.48 | 404 |
| **`updateFieldHud`** | **1.97 / 6.49 / 8.65** | 404 |
| `drawFieldMap` (self) | 0 / 1.63 / 2.71 | — |

`updateFieldHud`'s own DOM work (class toggles, `textContent` / `style.width` writes, compass trig)
is **3–4x** the canvas draw inside it, paired per-run in all three runs. Suspicion inside the tick
belongs on the HUD's DOM writes, not the minimap render. Both are tiny in absolute terms.

## The one real periodicity found

**`dq-tiles.js`'s 80 ms tick is NOT uniform.** In **all six independent runs**, a burst of ~15
elevated calls lands in the same narrow window — **t ≈ 5.0–6.2 s into every 20 s walk** — consuming
**45–58% of that timer's entire 20-second total in ~1.2 s**.

```
dq-tiles(80ms) per-1s buckets, run 1:
[3-4s] 1.2ms   [4-5s] 1.1ms   [5-6s] 11.2ms  ← 15-20x neighbours   [6-7s] 3.3ms   [7-20s] 0.4-0.8ms
```

The walk starts on the identical tile and moves the identical 21 tiles every run, so landing at the
same walk-relative timestamp across six independent page loads is **positional, not coincidental**:
a chunk / terrain-signature boundary crossed once during this walk. That matches the mechanism
`dq-tiles.js` documents for itself — chunk-texture drain ("one chunk texture per tick") and a
terrain/overlay rebuild gated on `A1A.dirty`.

**This is genuinely periodic on a cycle longer than its own timer, and it recurs per chunk crossing
— i.e. it scales with walking, which is exactly when the owner sees freezes.** That is the shape the
investigation was looking for.

`ui-overhaul`'s ticks and `drawFieldMap`'s spans show **no** comparable spike in the same window, so
this is specific to `dq-tiles`'s tick rather than a general main-thread pile-up.

## What this does NOT establish

**The burst is 13–18 ms spread across ~15 individually sub-5 ms calls.** That is not, on these
numbers, enough to produce a human-perceptible freeze. **No call in any of the six runs came near
100 ms.** So either:

- the device magnifies this same mechanism far beyond Chrome/M-series (plausible — texture
  decode/upload, iOS storage sandboxing, a much weaker CPU), or
- the freeze's cause is outside these four timers entirely.

**The second possibility is wide open and under-explored:** only **2.5–12.8 ms of ~20,150 ms of
profiled samples matched the five named functions at all.** The overwhelming majority of main-thread
time in an overworld walk is somewhere this brief never looked — GC, texture upload/decode, Phaser's
own step. **That is where the next investigation should go.**

## The gap that blocks the most promising inference

The burst is tied to **chunk-texture work**, and round 5 (`15859db`, "the camera moves instead of the
pixels") made chunks their own GPU textures. The owner reported build 10 as *"momentary pauses here
and there but it was minor"* and build 11 as freezes — a **worsening**. If round 5 is the 10→11
delta, chunk-texture upload becomes the leading hypothesis with the right periodicity, the right
trigger (walking), and the right reason the simulator never reproduces it.

**That inference cannot currently be made, because the build↔commit map is not recorded anywhere.**
All five rounds landed on 2026-08-08; `ios/build/last-testflight-build.txt` holds a bare `12`;
`ship_ios.py` has no query mode; and `GROUND-TRUTH.md` already warns its "uploaded build N" message
is self-written and proves nothing. **Recording which commit each TestFlight build was cut from is
the cheapest high-value fix available to this project** — without it, every future "which build
introduced this?" question is unanswerable, and this one is unanswerable right now.
