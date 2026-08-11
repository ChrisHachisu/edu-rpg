---
date: 2026-08-11
type: handoff
project: edu-rpg
milestone: locked-art-only
status: active
tags: [handoff]
---

# Handoff — the game is painting a procedural surface over the owner's locked art — 2026-08-11

> [!danger] SUPERSEDED, 2026-08-11 — all three symptoms are FIXED, but not by one bug
> Locked art: `3cf8fb1`. Freeze: `78d9ba6`. ~~"Three symptoms the owner reported are ONE bug."~~
> Two of them were. The freeze is the **COLLISION** window, not the terrain one: `owmAssemble` bailed
> to a 3.85 Mpx analytic build if a single window cell was unbaked, and the window's 12-cell
> off-screen margin guaranteed that near the plate's north edge. `owm 625ms analytic` → `owm 4ms
> baked`; a multi-direction walk now records zero freezes at fps60. It is the SAME defect shape as
> the splat — coverage judged per window rather than per reachable cell — which is why the analogy in
> this document was productive even though its attribution was wrong. Full account, including the two
> refuted intermediate theories, in `docs/GROUND-TRUTH.md`. Do not re-derive any of them.

## The one thing to know

**Two of the three symptoms the owner reported are ONE bug.** The overworld ground not matching his
art and the visible "crease" are both `drawTerrain`'s procedural splat rendering as the
player-visible surface where baked art already exists. **The freezes are a separate cause** — see the
banner above.

**Owner's directive, asked directly and recorded in `docs/GROUND-TRUTH.md`:**
> *"no. locked in art, full stop."* — the procedural surface must NEVER be what a player sees.

**And it is achievable:** the baked plate covers **9,375 of 9,376 walkable tiles (99.99%)**. One
tile, (119,331), has no art. The owner's own reported positions both HAVE ART.

## Read first, in this order

1. `docs/GROUND-TRUTH.md` — authority table, the new **OWNER DIRECTIVES** section, and the coverage
   measurement. **Read before believing anything else.**
2. `docs/TIMER-ATTRIBUTION.md` — everything already eliminated. Do not re-tread it.
3. This file.

## What shipped (`5daa561..066629a`, all pushed)

| | |
|---|---|
| **84-commit batch pushed** | after a full tier-2 device gate; the old blocker really was stale |
| **TestFlight build 14** | live, from commit `2d79e36`, in Beta Testers, `IN_BETA_TESTING` |
| **On-device diagnostic panel** | `index.html`, bottom-left; it is what found the bug |
| Timer investigation | complete, negative, documented |
| Owner directives + coverage | recorded in `GROUND-TRUTH.md` |

## The bug, as far as it is understood

**Measured on the owner's iPhone 13 (build 14):** `freezes 15, worst 1220ms`, individual events
891/942/969 ms at +2s/+3s/+4s intervals while walking at tiles 111-113, 231-234. Between them
fps 60, worst frame 19 ms. **The game is fine, then stops dead for ~1 s, then is fine again.**

**Root cause (high confidence, from a dedicated investigation):** `drawTerrain`'s full-window
analytic per-pixel splat — 1584x1872 = 2.97 Mpx, 11.86 MB — recomputed and re-uploaded on nearly
every window step. **This repo already measured that same operation at 962-1017 ms**
(`docs/SMOOTH-ROUND-3-REFUTATION.md:244`). The owner's numbers match it.

**Why it fires:** coverage is judged per WINDOW, not per walkable tile. A window near the plate's
north edge can never report "full" — full coverage needs hero tile y >= 247 — so the splat runs on a
technicality even though every walkable tile inside the window has art. **38.7% of the plate
(10,412 of 26,936 cells) can never report full coverage.** Round 4's prefetch fixed the coverage hole
in TIME; nobody fixed it in SPACE. Every harness walk that validated this work sat at y ~ 257, the
first row where full coverage is possible — **the northern band was never walked by anything until
the owner walked it.**

**Repetition:** his tiles sit on a corner of the 12-cell window grid, so he re-crosses boundaries
almost every step; and `A1A.dirty` (`dq-tiles.js:4215`) forces a rebuild bypassing the window-key
guard.

### The next step

Find why the splat is the VISIBLE surface where art exists, and make the baked art the only visible
terrain. Do NOT start from the fix proposed earlier in the session ("clip the splat to the uncovered
region") — it was written before the owner's directive and would have made MORE of the procedural
surface authoritative. It is superseded.

## Open, not started

- **Black screen after battle exit.** Not reproduced in 4 driven exits (2 victories, a defeat through
  Game Over, an off-plate victory). Mechanism identified with moderate confidence: `a1vShow()` at
  `public/dq-tiles.js:4095` clears its `A1V.hidden` latch BEFORE doing the work and has three early
  returns after; if one fires the scene stays `visible:false` AND the 80 ms safety net at `:4168` is
  permanently disarmed because it asks the latch, not the field. Clear colour is `#111111`, so an
  active-but-invisible scene is exactly a black play area with the HUD still on top. Fix proposed,
  NOT applied — see that investigation's three device questions below.
- **Latent:** the demonKing victory path (bundle 82938) never resumes WorldMapScene at all.
- **One artless walkable tile** at (119,331). Trivial.
- **`LOCKED-ART-STYLE.md`** — owner has not ruled whether it still binds. Its `no visible seams/joins`
  clause is breached regardless. Its frontmatter names a DIFFERENT repo.
- **Dungeon + Port Sapphire polish/lock** — owner chose "polish to final, then lock"; he wants to
  play them first. Nothing started.
- **The `.sel` always-highlighted state** on six screens — still his call.

## Ask the owner these three when the black screen next happens

They separate the candidates cleanly:
1. **Is the HUD still visible** over the black? Yes -> canvas not drawing. No -> a DOM overlay covers it.
2. **Does the minimap dot still move** when he walks blind? Yes -> conclusive: scene running, not drawn = the latch.
3. **What letters does the diagnostic code show** — `QOK-GL-…` (WebGL context lost) or `QOK-KL-…`?

## Gotchas — every one of these cost real time TODAY

- **ASK THE OWNER when the records are unclear.** This orchestrator drifted twice on which art is
  authoritative and he called it: *"you are getting confused about the locked design version again
  and it is alarming. ask me if the records are unclear."* Both drifts came from inferring instead of
  asking.
- **Never compare a downscaled render against a full-resolution reference.** A 1/7-scale overview was
  put next to a full-res anchor and a conclusion about ART STYLE drawn from it. At that scale all
  material detail is gone. That single bad artefact caused the drift above.
- **Measure coverage against `public/act1-world-map.js`, NEVER `walkable-regions-v1.json`.** The
  latter is `design-only-owner-review-not-promoted`; using it reported 8.28% of walkable ground
  uncovered — **wrong by three orders of magnitude**. The authority yields exactly 9,376 walkable
  tiles, matching the ship gate's own count, which is how you confirm you have the right data.
- **The canopy chunk layer is a pure ALPHA MASK** (RGB all zero). Compositing it as an image paints
  black blobs and produces a completely misleading picture of the art.
- **`tx` in the diagnostic panel is POSITION, not memory.** 347 inside the plate, ~516 outside, where
  procedural props spawn. It was briefly presented as evidence of memory pressure. It is not.
- **The recovery net outranks a seeded save.** `simctl terminate` looks like a kill, so seed-then-
  relaunch inside 20 s replays the PREVIOUS map. Wait out 20 s and READ THE ON-SCREEN LABEL.
- **`npm run repin` after ANY `public/` or `index.html` edit.** Editing `index.html` also requires
  updating the sign-off hash in BOTH `scripts/build_static_index.mjs` AND
  `scripts/runtime_baseline.py` — repin updates both; a commit that stages only one leaves a tree
  that fails for everyone else.
- **Never `npm run build`/`dev`/vite.** Bundle md5 must stay `60d90b63607b6e6980eb170aeeed445e`.
- **Sim `4B05EF44` (iPhone 13) only. NEVER `24A4D890`** — another product's session. Never
  `simctl shutdown all`.
- **`fingerprint:check` needs `dist` served on :5174**, else it dies on ERR_CONNECTION_REFUSED and
  looks like a gate failure.
- **Another session shares this Mac** and starts Android emulators and Xcode builds without warning;
  load hit 495 at one point. A timing number above load 10 is void; a sim dying mid-run is starvation.
- **An instrument more aggressive than the thing it measures will measure itself.** A probe reported
  ~40 blocks of 1.2 s per run, confirmed by three independent instruments. It was the probe's own
  walker. What caught it was arithmetic against the symptom, not more instrumentation.

## The diagnostic panel (build 14) — how to read it

```
QOK339  fps60  max19ms          session id, frame rate, worst frame in last 500ms
overworld:1 112,231  tx501      screen/map:floor, hero tile, live texture count
kind:ow,mapData:true,...        chunk/bake state from __DQ_TILES__.readyWhy()
freezes 15  worst 1220ms
942ms +2s overworld:1 @112,231 mv tx507 s339
```
Event line = duration, **seconds since the previous freeze**, screen/map, tile, `mv` if moving,
texture count, session. It is armed only once the map is playable and re-arms on map change; the
first frame after any visibility change is dropped unconditionally.

**The panel itself adds a 2 Hz tick and is UNMEASURED on device.** If freezes get worse than build 13,
suspect it first. Sign-off in `scripts/build_static_index.mjs` says so.

## Kickoff prompt

```
edu-rpg, repo /Users/christopherhachisu/Documents/claudecode/edu-rpg, branch main, HEAD 066629a.
Read docs/handoffs/2026-08-11-procedural-surface-over-locked-art.md and docs/GROUND-TRUTH.md first.

THE TASK: the game paints drawTerrain's procedural splat as the visible overworld surface where the
owner's baked art already exists. Owner's directive, recorded in GROUND-TRUTH: "no. locked in art,
full stop" - the procedural surface must NEVER be what a player sees. It is achievable: baked art
covers 9,375 of 9,376 walkable tiles.

This one bug causes all three things he reported on build 14: ground that doesn't match his art, a
visible crease at the boundary between the two surfaces, and ~970ms freezes every 2-4s while walking
(the splat is 2.97 Mpx / 11.86 MB, and this repo already measured it at 962-1017ms in
docs/SMOOTH-ROUND-3-REFUTATION.md:244).

Root cause so far: coverage is judged PER WINDOW, not per walkable tile, so a window near the plate's
north edge never reports "full" (needs hero y >= 247) and the splat runs on a technicality. Find why
it is the visible surface, make the baked art the only visible terrain, verify on sim 4B05EF44 that
tiles 112,231 and 113,234 render the baked art, then ship a build.

Do NOT use the earlier "clip the splat to the uncovered region" proposal - it predates the owner's
directive and is superseded.

ASK THE OWNER when records are unclear rather than inferring - he flagged drift on exactly this
twice today. Never compare a downscaled render against a full-res reference. npm run repin after any
public/ or index.html edit (and commit BOTH hash copies). Never npm run build/dev/vite; bundle md5
stays 60d90b63607b6e6980eb170aeeed445e. Sim 4B05EF44 only, never 24A4D890, never simctl shutdown all.
Another session shares this Mac - a timing number above load 10 is void.

Also open: black screen after battle exit (mechanism at dq-tiles.js:4095, not reproduced, three
device questions in the handoff), and the dungeon + Port Sapphire polish-then-lock work he asked for.
```
