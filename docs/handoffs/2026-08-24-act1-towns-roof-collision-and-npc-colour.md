---
date: 2026-08-24
type: handoff
project: edu-rpg
milestone: act1-town-plates
status: active
supersedes: "[[2026-08-22-act1-towns-all-three-playable]]"
tags: [handoff]
---

# Handoff — three owner items from TestFlight build 57 — 2026-08-24

Build 57 is live on TestFlight, VALID and confirmed installable. The owner played it and raised
three things. **All three are open; nothing below has been started.**

## The three items, verbatim

1. *"the shopkeeper and healer needs to look more unique and use brighter and captivating colors"*
2. *"the towns are walkable on weird places like the roofs of houses and i think it is because you
   confused the green roofs as grass"*
3. *"the in-town exit does not match what we see on screen"*

## Item 2 is DIAGNOSED — start here, it is the gameplay bug

**The owner's diagnosis is correct and measured.** `lawn_mask()` in
`scripts/derive_town_walkable.py` is:

```python
(h > 55) & (h < 175) & (s > 0.15) & (lum >= 95)
```

A green or olive shingle roof satisfies every clause. Measured on greenhollow's green-roofed
cottage: **RGB(101,159,54), hue 93.1, sat 0.66, lum 129.7 -> `lawn_mask` TRUE.** Grass and roof
tiles are the same hue family, and nothing in the mask distinguishes "ground" from "a green
surface three metres up".

Evidence image, committed: `design/act1-towns/ROOF-WALKABLE-EVIDENCE.png` — walkable area tinted
red over both villages. Greenhollow's MARKET STALL ROOF and the herbalist cottage roof are clearly
inside the walkable region.

Why it only appeared now: until 2026-08-22 walkable was PAVING ONLY, so no roof could qualify. The
owner then asked for grass to be walkable, which introduced the whole green hue family as ground.

**What will NOT work**, so nobody spends a night on it again — these were all measured and rejected
when deriving the fence boundary (see the same file's `town_boundary` docstring):
- luminance or saturation thresholds alone: roof green and lawn green overlap
- morphological cleanup: a roof is a large solid region, not noise

**Promising directions, in the order I would try them:**
- **Roofs are enclosed by building silhouette, lawns are not.** A roof's green region is bounded by
  wall/timber/shadow on all sides; a lawn connects to other ground. Flood-fill ground from the
  paving network and keep only green REACHABLE from paving at art resolution, before sampling.
- **Roofs are regular; grass is noisy.** Roof tiles are a repeating lattice with a strong local
  autocorrelation; lawn is stochastic. A local texture-regularity test separates them where hue
  cannot.
- The buildings are already known as holes/obstacles in the derived polygon — check whether the
  building footprints can simply subtract their own roofs.

Whatever is chosen, the acceptance test is mechanical: **no standable cell may sit on a roof.** Probe
the same cells the evidence image shows red on roofs, and re-run `scripts/place_town_actors.py` for
all three towns (must stay EXIT=0, every actor reachable, exits still on walkable ground).

## Item 3 — needs investigation, here are the facts

| town | startCell | exit.cell | -> overworld |
|---|---|---|---|
| millbrook | [32.5, 57.0] | [32.5, 60.5] | (39,345) |
| greenhollow | [32.5, 57.0] | [32.5, 59.0] | (69,256) |
| portSapphire | [33.0, 4.0] | [33.0, 3.0] | (133,348) |

`public/act1-hifi/town.html` arms the exit once the player is **more than 2.5 cells** from
`exit.cell` in x OR y, then fires when within **dy < 1.0 and dx < 1.6**. The overworld half is
correct and gated (`scripts/check_town_transitions.py` — the exit lands on the town's landmark exit
cell, verified). So item 3 is about the IN-TOWN half: most likely the trigger cell does not sit on
the gate as DRAWN in the plate. Measure where each fence gap actually is in the painting and compare
to `exit.cell`; expect the numbers to disagree, since those cells predate the current paintings.

## Item 1 — art

The shopkeeper and healer were redone once already this session and the owner still wants them more
unique, and specifically **brighter, more captivating colour**. Note this pulls AGAINST the previous
round's constraint: they were deliberately darkened toward the hero's luminance 83 (shopkeeper
landed at 77, healer 97). **Brighter is now the instruction; do not re-apply the 80-110 luminance
band to these two.** Keep: one character each across all three towns (verify by md5), feet on row
58, 192x256, de-fringed.

## Live state (verified 2026-08-24)

- HEAD `067ccd6` on `fix/graduated-gpu-heal`, tree clean apart from `ios/build` scratch
- **TestFlight build 57 — VALID and installable** (verified via `verify-delivery.py`, not just VALID)
- pins **102**, iOS payload **723**, full gate green
- all 17 NPC sheets 192x256 with feet on row 58; healer and shopkeeper each one md5 across 3 towns
- towns: millbrook 30.1% standable, greenhollow 23.6%, portSapphire 17.8%

## Gotchas that are still live

- **`processingState: VALID` is NOT installable.** `scripts/ship_ios.py` assigns the Beta Testers
  group then blocks on `verify-delivery.py`; it exits non-zero unless a tester can actually install.
  Build 57 first came out undeliverable and the gate caught it. Do not report a ship on VALID alone.
- **The owner receives edu-rpg builds on the EXTERNAL "Beta Testers" group**, not the internal one
  (his internal invite is still unaccepted). Assignment is part of the ship and now retries until
  ASC can see the build.
- **STANDING ORDER: when all requested fixes land, push to TestFlight without asking.**
- `pgrep -f "codex exec"` matches the watching shell's own command line and can never clear. Use
  `ps -eo pid,command | grep -E "codex exec -m|xcodebuild " | grep -v grep | grep -v SECONDS`.
- A subagent cannot wait on its own background job; give it `watch-job.sh --max-seconds 540` called
  in the FOREGROUND in a loop, where exit 4 means "call it again".
- `codex exec`'s `-i` is variadic — put the prompt FIRST and `-i <path>` after, or codex swallows the
  prompt as another image path.
- Sprite halos: `--tol 210` on `key_landmark_sprite.py`, then `scripts/defringe_sprite.py --write`.
  A magenta pixel-count is BLIND to this halo (magenta blended with grass reads salmon) — measure the
  outermost opaque ring's mean RGB instead.
- Changing any landmark sprite invalidates the runtime override -> the walk `.bin` -> `PLATED_MAP_SHA256`.
  Chain: `export_act1_runtime_override.mjs` -> update the pin -> `bake_act1_overworld_walk.mjs` ->
  `npm run repin`. The walk payload after its 64-byte header should come out byte-identical.

## Resume here

```
cd /Users/christopherhachisu/Documents/claudecode/edu-rpg/.claude/worktrees/laughing-mahavira-c9f72b
open design/act1-towns/ROOF-WALKABLE-EVIDENCE.png     # item 2, the red is walkable
```

| purpose | path |
|---|---|
| the mask that misreads roofs as grass | `scripts/derive_town_walkable.py::lawn_mask` |
| actor placement + the mechanical acceptance test | `scripts/place_town_actors.py` |
| in-town exit arming logic | `public/act1-hifi/town.html` (search `exitArmed`) |
| overworld half of the exit, already correct | `scripts/check_town_transitions.py` |
| NPC sheets | `public/act1-hifi/town/npc/`, candidates in `design/act1-towns/npc/final/` |
| ship (assigns group, then proves installable) | `./scripts/ship-ios.sh` |
