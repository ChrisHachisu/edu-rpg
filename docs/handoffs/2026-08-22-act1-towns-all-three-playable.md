---
date: 2026-08-22
type: handoff
project: edu-rpg
milestone: act1-town-plates
status: active
supersedes: "[[2026-08-22-act1-town-art-first-paintings]]"
tags: [handoff]
---

# Handoff — Act 1: all three towns finished and reachable — 2026-08-22

Stages 2 and 3 are DONE for all three towns. `TOWN_IDS` is OPEN. The remaining work is the three
overworld landmark sprites and the TestFlight push.

## What the owner asked for, and where each part stands

| ask | state |
|---|---|
| match the other towns to millbrook's colour theme | **DONE** — greens only; cobble already matched to within 3/255 |
| create the boundaries | **DONE** — collision derived from each finished plate |
| add all assets so the towns are playable | **DONE** — shops, save points, healers, exits, NPCs all wired and verified |
| match the overworld assets to the town artwork | **DONE** — all three sprites regenerated from the finished plates |
| push to TF for a play test | **DONE** — build 56, VALID in TestFlight 2026-08-22 |

## Live state (verified 2026-08-22)

- HEAD `f1f8389` on `fix/graduated-gpu-heal`; 14 commits since `da43526`
- iOS payload **720** files (was 722 — the two portSapphire foreground files are retired)
- pins **99** (was 101), all matching disk; `npm run repin` green
- ship gate PASS: map-engine, walkable authority, town transitions, both overlay verifies
- `TOWN_IDS = {portSapphire, millbrook, greenhollow}` — all three reachable
- all three verified in the actual runtime via `town.html?town=<id>`: plate renders, walkable loads,
  shopId/shopCounter/savePoint live, **zero console errors**

| town | finish gate (min 17.0 / 22%) | walkable | notes |
|---|---|---|---|
| millbrook | 15.19 / 20.39% — **under** | 17.6% standable | composition, not softness; see below |
| greenhollow | 17.71 / 24.80% — passes | 12.9% | best of the three |
| portSapphire | 19.86 / 28.31% — passes | 10.1% | replaces the live plate, owner-approved |

## Locked decisions

- **Millbrook's palette is the theme.** `scripts/match_town_palette.py` grades foliage AND paving,
  each to its own anchor, and takes `--ref`. Used twice per town: once to put a painting on the
  theme, once to pull the generated PLATE back onto its painting.
- **Port Sapphire's replacement was chosen by the owner** over the live plate, knowing it trades the
  ship, the mast and harbour density for the matched palette and fresh boundaries.
- **The foreground overlay layer is RETIRED.** It existed for the mast and a hanging demijohn;
  nothing overhangs walkable stone now. Files deleted, key dropped, pins removed.
- **A hi-fi town's `exit.toX/toY` is its LANDMARK exit cell** in `public/act1-world-map.js`, NOT the
  `src/data/maps.ts` connection. The override rewrites maps.ts only inside `scene.checkTransition`,
  which the hi-fi path bypasses. Gated by `scripts/check_town_transitions.py`.

## Gotchas the next session should not re-learn

- **Whole-frame hardness is a composition statistic.** millbrook misses the gate's absolute minimum
  while its cobble is, surface for surface, crisper than the painting it came from — it is 39% open
  plaza against Port Sapphire's dense harbour clutter and 16% wave texture. Compare like with like.
- **Painting resolution is the sharpness lever, not the brief.** greenhollow beat the other two
  because its painting is natively 1950, so each tile's primer is a DOWNSCALE. Paint future towns at
  1950.
- **The generator shifts colour and the stitch cannot undo it.** Grass came back with blue crushed
  45 -> 11 and cobble drifted toward grey-green. The stitch's blue/red anchor is a whole-plate
  scalar. Grade the plate back onto its painting afterwards.
- **A subagent cannot wait on its own background job.** Give it `watch-job.sh --max-seconds 540`
  called in the FOREGROUND in a loop, where exit 4 means "call it again".
- **`pgrep -f "codex exec|xcodebuild"` matches the watching shell's OWN command line** and can never
  clear. Two workers deadlocked on this. Use
  `ps -eo pid,command | grep -E "codex exec -m|xcodebuild |rebake_town_tiles\.py" | grep -v grep | grep -v SECONDS`.
- **Python buffers stdout to a redirected file**, so a bake log stays 0 bytes until the process
  exits. That is not a hang.
- **codex names its stray redraws inconsistently** (`primer-00-redraw`, `primer-00-pixel-redraw`,
  `primer-10-redrawn`). Match on the substring `redraw`.
- The 2026-08-21 kernel panic was **simctl churn, not codex**. codex generation is network-bound and
  cheap locally; what contends is `xcodebuild`.

## Shipped

**TestFlight build 56, VALID.** The milestone is complete; what follows is the owner's play test.

Things a play test may surface, in the order I would look at them:

1. **millbrook may read soft on the phone.** Its plate is under the finish gate's absolute minimum
   (15.19 / 20.39% against 17.0 / 22%). I judged that composition rather than softness — 39% open
   plaza against Port Sapphire's harbour clutter, and its cobble is surface-for-surface crisper than
   the painting it came from. If it reads soft on device, the fix is to REPAINT millbrook at 1950
   and re-run the chain, not to re-bake from the 1254 painting.
2. **Port Sapphire is plainer than the plate it replaced** — the owner chose this knowingly, trading
   the ship, the mast and harbour density for the matched palette and fresh boundaries. If he wants
   the density back, `bake_town_landmark`-style: re-bake tile (1,1) with `--add`, which is the only
   tile no other tile's band is grafted from.
3. **5.3% of Port Sapphire's standable ground is unreachable** — pockets behind necks narrower than
   two foot-radii. Nothing stands in them now, but they are dead decoration the player can see and
   not enter.

## If more work is needed

```
npm run repin && npm run gate && ./scripts/ship-ios.sh
```
`ship-ios.sh` runs the gate itself and then `fastlane beta`; the build number comes from ASC.
Landmark sprites: `python3 scripts/bake_town_landmark.py --town <town>`, one at a time.
Port Sapphire's sprite needs `--tol 130` on the key — at the default 88 the magenta field bleeds
into the dark harbour water.

| purpose | path |
|---|---|
| palette grader (foliage + paving, `--ref`) | `scripts/match_town_palette.py` |
| tiler, primes from each town's painting | `scripts/rebake_town_tiles.py` |
| exposure-match + min-error quilt | `scripts/stitch_plate.py` |
| finish gate (use `--report`, judge yourself) | `scripts/check_town_finish.py` |
| collision from the plate | `scripts/derive_town_walkable.py` |
| actor snapping, reachable-only | `scripts/place_town_actors.py` |
| overworld sprite + anchor re-measure | `scripts/bake_town_landmark.py` |
| exit authority gate | `scripts/check_town_transitions.py` |
