---
date: 2026-08-09
type: handoff
project: edu-rpg
milestone: smoothness-loop
status: active
tags: [handoff]
---

# Handoff — smoothness loop + the overworld freeze — 2026-08-09

## The one thing to know

**The battle crash is FIXED (owner-confirmed on build 13). The overworld freeze is NOT, and the
leading suspect is named and never measured.** Do not re-investigate the crash. Do not re-derive
the perf work. Read `docs/GROUND-TRUTH.md` before trusting any file in this repo.

## What shipped (49 commits, `2daf11e..09396e1`, all unpushed)

Five rounds of the `/smooth` loop, each independently verified by an adversarial agent:

| round | change | device result |
|---|---|---|
| 1 | keep baked chunks across a door (`a1aReleaseChunks` trims instead of dropping) | map swap 3626 → 2156 ms |
| 2 | overworld stops building 128,000 invisible Phaser Images (`renderMap` override) | longest block 2062 → 1249 ms |
| 3 | stop rebuilding the collision field for a window the hero is not in (`owmFor`/`owEnsureMapSetup`) | map swap → **147 ms, first target GREEN** |
| 4 | prefetch chunks one window step ahead (`a1aRects` + MARGIN ring) | first playable 2681 → **400 ms**, periodic 12-tile pause gone |
| 5 | chunks become their own GPU textures, camera moves instead of pixels | worst frame 810 → **47 ms** |

Then, for the crash: the chunk cache is released on the battle path (it was unreachable — a paused
scene is inactive, `dq-tiles.js:4025`), the overworld stops rendering behind the battle overlay
(98 of 99 draw calls per frame), the dungeon-fog teardown, the iOS floor at 16.4, a crash-recovery
net, and a black-box recorder.

Tooling: `npm run repin` (whole pin chain, one command), `npm run gate`, `scripts/equivalence_fingerprint.cjs`
+ `docs/EQUIVALENCE-REFERENCE.json`, and **`docs/GROUND-TRUTH.md`** — the authority table.

## Verification (run 2026-08-09, this session, on the committed tree)

- `npm run test:map-engine` — **PASS**, all 9 suites, plate `205dbe88…` unchanged
- `./scripts/ship-gate.sh .` — **PASS**, 74/74 pins, both Act 1 overlay verifies, iOS payload synced
- `md5 dist/assets/index-BhoGQRaA.js` = `60d90b63607b6e6980eb170aeeed445e` — frozen bundle intact
- `npm run fingerprint:check` — EQUIVALENCE PASS

## Live state (verified 2026-08-09 via the ASC API, not from memory)

- **TestFlight: build 13 VALID, in the Beta Testers group.** Group holds `['13','11','10','9']`.
  **Build 12 is a dud** — it uploaded but never completed processing (blank status in the console),
  which is why ~20 group-assignment attempts returned 404 while the API still reported
  `processingState: VALID`. Builds 12 and 13 are the SAME commit `09396e1`.
- **HEAD `09396e1`, 83 commits unpushed to origin.** Owner's standing rule: push only after a
  device gate passes. The last full tier-2 gate FAILED on the dungeon fog, which is now fixed —
  **the gate has not been re-run since.** That is the blocker on pushing, and it is stale, not real.
- Device: **iPhone 13 (`iPhone14,5`), iOS 26.6.** Sim `4B05EF44` is an iPhone 13 on iOS 26.5.

## Owner's verdict on build 13, verbatim

> *"good news: battle starts now. no problems here. bad news: overworld movement freezes periodically"*

Also earlier, on the overworld after round 5: *"the game looks pretty smooth on my phone"* — the
smoothness work landed and is confirmed on real hardware.

## The open problem: periodic overworld freezes

**Eliminated, with evidence — do not re-test these:**

- **The recovery net's `localStorage` writes.** Measured at ~7 µs (626-byte payload, 0.0033 ms,
  amortised over 300 calls because `performance.now()` is clamped to 1 ms in WKWebView). Build 13
  removes them entirely while walking (proven: 0 writes across three 30 s walks of ~143 tile
  changes; beacon frozen 17.0 s and 14.9 s on device). **The freezes persist. Candidate dead.**
- **They are not recoveries.** A recovery draws an on-screen toast; the owner confirms **no message
  appears** during the freezes. A real kill also costs 5.1 s of dark screen, not "momentary".
- **Not geometry.** iPhone 13 and iPhone 17 Pro compute an identical 33x39 window, 9-chunk ring,
  1584x1872 terrain canvas. Measured on both simulators.

**LEADING SUSPECT, NEVER MEASURED: `public/ui-overhaul.js:1806` runs `setInterval(tick, 50)`
permanently.** 20 Hz, **40x the cadence of the timer just removed**, shipped since before build 10
so it is not the 10→11 delta — but it is by far the largest periodic main-thread cost in the shell
and nobody has ever put a number on it. **Start here.**

Second candidate: the simulator has never reproduced the freeze at all, so whatever it is may be
device-only (thermal, WebKit-version, or a cost the M-series absorbs).

## Locked decisions

- **Do NOT recompile from source.** The bundle is not a stale build output — it has been maintained
  AS source in compiled form across ~20 versions, with ~19 numbered hand-edit annotations spanning
  bundle lines 73,695-83,288, and the intermediate vintages are gone. Recommended path is the
  drift doc's own option (b): a ~130-line bridge so a future rebuild fails loudly. ~1.5 days.
  Full scope: `scratchpad/scope-restore-android/SCOPE.md`.
- **Full chunk release during battle: REJECTED.** Frees 104.6 MB but costs a 1,083 ms blocking
  frame on every battle exit. Measured, not guessed.
- **Android: 11-13 days, not started, deliberately deferred by the owner.** Biggest risk is memory,
  not speed. Free win available: 101 MB of the 184 MB payload is 12 uncompressed PNGs.
- Battle command bar: owner approved variant A (gold press wash), no resting selection, red sword.
  Shipped. The always-highlighted state on the OTHER six `.sel` screens is **still his call**.

## Gotchas (each one cost real time this session)

- **`docs/GROUND-TRUTH.md` exists because claims in this repo go stale silently.** It records which
  file is authoritative per question and which plausible-looking file is an impostor. **Read it
  first.** It has already caught: `src/` being fiction for runtime, the CSS being fiction for the
  battle bar, stale door coordinates, and two of my own briefs.
- **A worker's green gate is uninterpretable for `main`.** `dist/` is gitignored and per-worktree,
  so a merge carries `public/dq-tiles.js` without `dist/dq-tiles.js`. Always `npm run repin` after
  merging before believing a gate.
- **Agent worktrees are sometimes cut 79 commits stale** (`42b17a8`). Two agents hit it. **Every
  brief must require verifying the base commit.**
- **Never `simctl shutdown all`** — it killed two other agents' devices mid-run this session.
- **A timing number above load 10 is void.** Load hit 40 and 55 during one window.
- **Random battles manufacture fake 1.7-1.8 s "stalls"** in `simctl` recordings. They once inverted
  a 46%-better result into 45%-worse. Verify world advancement: real stalls change 51-64% of the
  play area, fake ones 0-8%.
- **`page.reload()` is the wrong stand-in for a process kill** — it fires the page lifecycle. Use
  CDP `Page.crash`.
- **`pod install` is broken** on this machine (CocoaPods fails inside its own config loader).
- **A fresh worktree cannot build iOS**: needs `node_modules`, `.eduharness`, `ios/App/Pods`, and
  `ios/App/App/capacitor.config.json` + `config.xml` (they are in `ios/App/App/`, NOT the repo root).

## Resume here

**Distilled state:** Battle crash fixed and owner-confirmed. Five rounds of smoothness work landed
and confirmed on his phone. 83 commits unpushed pending a tier-2 device gate re-run. The single
open bug is periodic overworld freezing, with one named unmeasured suspect.

| purpose | path | read when |
|---|---|---|
| **authority table — read first** | `docs/GROUND-TRUTH.md` | always |
| the freeze suspect | `public/ui-overhaul.js:1806` | first task |
| what each round did + its refutation | `docs/SMOOTH-ROUND-{1..5}.md` (**banners first**) | if touching perf |
| the goal + the loop | `~/.claude/skills/smooth/SKILL.md` | running another round |
| source/bundle drift + rebuild scope | `docs/SOURCE-BUNDLE-DRIFT.md`, `scratchpad/scope-restore-android/SCOPE.md` | source work |
| black-box code table | `index.html` (QOK-<CLASS>-<NNNN>) | owner reports a code |

## Kickoff prompt

```
edu-rpg, repo /Users/christopherhachisu/Documents/claudecode/edu-rpg, branch main, HEAD 09396e1.
Read docs/handoffs/2026-08-09-smoothness-and-overworld-freeze.md and docs/GROUND-TRUTH.md first.

Owner tested TestFlight build 13 on an iPhone 13 / iOS 26.6 and reported: "good news: battle starts
now. no problems here. bad news: overworld movement freezes periodically."

TASK 1 — the periodic overworld freeze. Do NOT re-test these, they are eliminated with evidence:
the recovery net's localStorage writes (~7us, and build 13 removes them while walking entirely),
recoveries (they draw a toast; he sees no message), and device geometry (iPhone 13 and 17 Pro
compute identical windows). THE LEADING SUSPECT, NEVER MEASURED: public/ui-overhaul.js:1806 runs
setInterval(tick, 50) permanently - 20Hz, 40x the cadence of the timer just removed. Measure it
before changing it. The simulator has never reproduced the freeze, so it may be device-only.

TASK 2 - re-run the tier-2 device gate on the whole batch, then push. 83 commits are unpushed only
because the last full gate failed on the dungeon fog, which is now fixed. That blocker is stale.

Rules: npm run repin after any public/ edit (build + pins + both gates, one command). Never
npm run build/dev/vite - the bundle md5 must stay 60d90b63607b6e6980eb170aeeed445e. Simulator
4872FCF0-6444-4A31-8D76-F92CEA09BF8D or the iPhone 13 sim 4B05EF44, NEVER 24A4D890, and never
simctl shutdown all. Verify every agent's base commit. A timing number taken above load 10 is void.
Exclude random battles from walk recordings - they manufacture fake 1.7s stalls that have inverted
a result on this project before.
```
