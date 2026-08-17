---
date: 2026-08-17
type: handoff
project: edu-rpg
milestone: build-38-feedback + Port Sapphire art
status: active
tags: [handoff]
---

# Handoff — build-38 feedback + Port Sapphire art — 2026-08-17

## What shipped

TestFlight builds **40, 41, 42, 43**, each verified `externalBuildState == IN_BETA_TESTING`
(not merely VALID — see gotchas).

- `1b65c5b` diagnostic panel was DEAD since 2026-08-15 (`var DEBUG_UI` read from a sibling IIFE →
  `ReferenceError` every tick); flag hoisted to script scope. Panel gained the render chain.
  Collapsed map icon `▧` → folded-map SVG (owner: *"map icon is good"*).
- `874f695` **the town's fuzz is a NON-INTEGER nearest upscale (3.1034x)**; `town.html` snaps the
  art→device ratio to a whole number. Uniform 3x3 device blocks 14% → 100%.
- `8998989` `scripts/check_town_finish.py` + `docs/T1-PORT-SAPPHIRE-REBAKE-SPEC.md`.
- `184b420` **S3** difficulty wheel + create-screen layout pass (828 → **758** px vs the app's ~763).
- `4898e2d` **D2 (b)** `a1dBossSort` depth-sorts the boss around the hero's soles. v6 plate committed
  to `design/`, deliberately NOT wired in.
- `e07947a` **S5** arch blocked in the walk masks (3 floors patched, 1 refused) + **D1** entrance
  crystal's floor cell no longer blocks.
- `4a60b06` wheel scrolls like a wheel (`proximity` snap + settle-on-idle). **NOT YET IN A BUILD.**

## Verification

- `npm run gate` (map-engine tests + ship gate): **PASS** on the committed tree, 2026-08-17.
- `npm run repin`: 80 pins consistent, both gates green, frozen bundle intact.
- Device evidence throughout: WebKit on sim `4B05EF44` (iPhone 13, dpr 3), measured not eyeballed.

## Live state (verified 2026-08-17 via `asc.py` / `submit.py`)

- TestFlight: **40, 41, 42, 43 → `IN_BETA_TESTING`**. Build **39 is VALID and DELIBERATELY UNRELEASED**
  (it carries a debug-panel default the owner had turned off). Do not assign or submit 39.
- HEAD: `4a60b06` on `fix/graduated-gpu-heal`, tree clean, **NOT merged to `main`**.
- **Ship 44** — it must carry `4a60b06` (wheel smoothing) plus whatever the art lands.

## Locked decisions

- **The fuzziness cause is settled:** non-integer nearest upscale, not blur, not a resolution
  shortfall. `[[learning-20260817-fuzz-is-a-noninteger-nearest-upscale]]`.
- **DO NOT re-propose "render at device resolution"** — measured, 9x cost, *pixel-identical* output.
- **The owner validated hard-edged art from the IN-GAME render:** *"i do agree the fuzziness is
  better"*. Rejected v6 for *"the color theme feels slightly off and the art looks like a painting
  rather than pixel art"* + *"keep the grass"*.
- Panel default stays **off** — *"the diagnostic panel was intentionally turned off."*

## Gotchas for next session

- **`VALID + group-assigned` is NOT shipped.** The gate is `externalBuildState == IN_BETA_TESTING`.
  Order: `./scripts/ship-ios.sh` → `asc.py` → `assign.py <n>` → `submit.py <n>`.
- **A green metric is not a result — three times in one session.** The canvas change (9x cost, no
  visible change), the pixel snap (invisible to the owner), and the v6 plate (passed every gate band,
  unshippable). `[[learning-20260817-a-gate-measures-what-you-told-it]]`.
- **`derive_town_walkable.py` cannot run in this worktree** — wants
  `design/continent-terrain-class-method/owner-terrain/owner-semantic-index.json`. Fix before any
  art integration.
- Another session's Xcode build hit **load average 280**; several runs were thrown away. Check
  `uptime`. The sim shuts itself down mid-run — re-boot and wait for screen surfaces.
- No simulator input tool this session: drive the game by seeding the save + calling
  `TitleScene.confirm()`. Synthetic DOM clicks do NOT work.

## Resume here

**Distilled state:** Everything code-side from the build-38 list is shipped except art. The one open
thread is the **Port Sapphire plate**: v8 was generating on Codex when this session ended
(`/tmp/qok-codex-v8.log` → `design/act1-towns/portSapphire-screen-v8.png`). The owner wants to SEE it
as soon as it lands, rendered through the real game.

| purpose | path | read when |
|---|---|---|
| live resume state | `.relay/edu-rpg-overworld-stability.md` | FIRST, always |
| feedback tracker | `docs/FEEDBACK-BUILD-38.md` | any item's status |
| art spec + gate | `docs/T1-PORT-SAPPHIRE-REBAKE-SPEC.md`, `scripts/check_town_finish.py` | judging a plate |
| v8 brief | `/tmp/qok-t1-brief-v8.md` | re-running generation |

**Still open:** T1/T2 art + integration · D2(a) boss cut from the baked plate · O1 entrance structure
· `whisperingWoodsCave-f1` arch (the mask patcher refused it — needs art).

## Kickoff prompt (paste verbatim into next session)

```
edu-rpg, worktree /Users/christopherhachisu/Documents/claudecode/edu-rpg/.claude/worktrees/laughing-mahavira-c9f72b,
branch fix/graduated-gpu-heal, HEAD 4a60b06, tree clean, gates green, NOT merged to main.

READ FIRST: .relay/edu-rpg-overworld-stability.md, then docs/handoffs/2026-08-17-build38-feedback-and-town-art.md.

FIRST TASK, and the owner is waiting on it: a Codex run was generating
design/act1-towns/portSapphire-screen-v8.png when the last session ended (log /tmp/qok-codex-v8.log,
brief /tmp/qok-t1-brief-v8.md). Check whether it landed.

  1. If v8 exists: gate it with
     `python3 scripts/check_town_finish.py design/act1-towns/portSapphire-screen-v8.png --anchor public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png`
     AND independently re-measure its pale-paving coverage against the shipping plate — the gate
     passes a coverage RISE, but paving IS the collision map and v6 was rejected for exactly that
     (13.3% -> 20.7% made 14.2% of the town newly walkable). Target 13-15%, hard ceiling 17%.
  2. Then SHOW IT IN-GAME before asking him to judge it. Recipe (proven, /tmp/qok-v6-inapp.png):
     copy dist/ to a scratch dir with symlinks, replace act1-hifi with a REAL copy, drop the plate
     over town/portSapphire-screen.png, rescale town/portSapphire-foreground.png AND its JSON offset
     by newSize/1885 or it lands 3.4% off; serve it; seed the town save; drive
     TitleScene.confirm() on the Continue item; `xcrun simctl openurl` on sim 4B05EF44 (iOS 26.5,
     boot it and wait for screen surfaces). Send him the screenshot.
  3. If v8 misses, re-brief rather than filtering. The insight that matters: it is DETAIL DENSITY,
     not palette. The hero is 23,423 unique colours over 29,611 px (79% unique) — she is NOT a
     limited-palette sprite — and v6 was posterized to 297 and still read as a painting. Demand a
     MINIMUM FEATURE SIZE (4-6 art px; a cobble is a drawn shape with one light and one dark edge,
     not a photographed pebble) and colour matched to her (saturation ~0.65 vs the town's 0.597).
     NO -unsharp / -posterize; v6 faked its hardness score that way and the owner saw through it.

THEN: ship build 44. It MUST include 4a60b06 (difficulty-wheel smoothing), which is committed but
not yet in any build. Ship order is ./scripts/ship-ios.sh -> asc.py -> assign.py 44 -> submit.py 44,
and the gate is externalBuildState == IN_BETA_TESTING, NOT "VALID + assigned" (build 37 was stranded
in exactly that state). Build 39 stays unreleased on purpose.

DO NOT re-propose rendering the canvas at device resolution: measured 2026-08-17, 9x the fragment
cost for a pixel-identical overworld. And do not trust a green gate as a result — that happened
three times in one session; verify the artifact and re-derive anything downstream of it.
```
