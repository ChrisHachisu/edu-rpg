---
date: 2026-08-24
type: handoff
project: edu-rpg
milestone: act1-town-plates
status: active
supersedes: "[[2026-08-24-act1-towns-build58-shipped]]"
tags: [handoff, machine-migration]
---

# Handoff — build-58 feedback, four of five done, moving to `tr` — 2026-08-24

Branch `fix/graduated-gpu-heal`, pushed to `origin` at **`a692177`**. Gate green, pins 102,
payload 723. **Nothing is shipped** — TestFlight is still on build 58.

## The five owner items from build 58

| # | item | state |
|---|---|---|
| 1 | *"all the other npcs need fixing … the npcs in port sapphire look much better, so try to match to their style"* | **OPEN — the only real work left** |
| 2 | *"the town boundaries are still incorrect in many places. port sapphire was done very well"* | DONE |
| 3 | *"make the healer blue themed (young, nightingale-like)"* | DONE |
| 4 | *"the interaction buttons are overlayed on top of the control pad … same location as the dungeons"* | DONE |
| 5 | *"the shop keeper is placed on top of the shop so lets put him in front of the shop"* | DONE |

**Do not ship until item 1 lands.** The standing order ("push to TestFlight when all the requested
fixes have landed") has not been met — four of five is not the batch.

## Item 1, the open one — everything needed is committed

Brief: **`design/act1-towns/npc/BRIEF-match-portsapphire-v4.md`**. It is complete and current: two
remaining batches, B and C, four sheets each, one fresh standard-tier worker per batch, run
SERIALLY (`~/.codex/generated_images` is one shared directory). Batch A (the healer) is done and is
the worked example.

- **Batch B** — greenhollow: elder, kiki, villager1, villager2
- **Batch C** — greenhollow fisherman; millbrook herbalist, miller, sage

"Match that style" is a NUMBER, not a judgement call. `scripts/measure_npc_style.py` reports mean
luminance step between adjacent opaque pixels and the share of steps at 24+. Palette was a red
herring — the accepted and rejected sheets use the same hues; what differs is local contrast.

    portSapphire-sailor      28.2 / 40.1   <- the three the owner named
    portSapphire-drake       25.9 / 35.5
    portSapphire-wisewoman   22.6 / 35.1
    millbrook-shopkeeper     22.4 / 32.8   <- "the shopkeeper looks good"
    healer (done today)      26.9 / 39.3
    greenhollow-fisherman    21.8 / 33.7   <- redraw
    greenhollow-villager2    19.6 / 28.0   <- redraw
    greenhollow-villager1    17.9 / 23.9   <- redraw
    greenhollow-elder        17.8 / 24.6   <- redraw
    millbrook-miller         16.5 / 21.3   <- redraw, softest in the cast

**Acceptance: step >= 22.5 and hard% >= 33**, plus `check_character_finish.py` PASS.

## Gotchas that cost real time today — do not rediscover them

- **A magenta halo shipped in build 58 because the measurement excluded it.** Two workers were told
  to measure the outermost OPAQUE ring; the halo lives in the SEMI-transparent pixels. Both reported
  "no cast" on sheets averaging RGB(199,39,173). Caught by looking at a contact sheet, not a number.
  `bake_npc_sheets.py` now defringes unconditionally and `check_character_finish.py` has a `key
  bleed` column. **Look at a contact sheet before believing any sprite is finished**
  (`scripts/build_npc_contact_sheet.py`).
- **`design/act1-towns/npc/final/` is a MIXED-format directory.** Eight already-keyed RGBA sheets
  beside the RGB-on-magenta ones. `bake_npc_sheets.py --src .../final` used to destroy
  greenhollow-elder and millbrook-miller; it now refuses non-RGB input by name. Bake from a scratch
  dir holding only your own sheets. **Batches B and C will rewrite six of those eight**, which is
  the chance to clear the mess.
- **`key_landmark_sprite.py` is a SINGLE-sprite tool.** On a 3x4 sheet it smears one contact shadow
  across two pose rows. Not in the pipeline any more; do not put it back.
- **`codex exec` finishes generating and then wanders.** Today's healer image was ready at 20:02 and
  codex spent twelve more minutes reading AGENTS.md. Watch for the image appearing in
  `~/.codex/generated_images/`, not for the process to exit.
- **A subagent cannot wait on its own background job** — it never receives its own completion
  notification. Give it `~/.claude/scripts/watch-job.sh --max-seconds 540` called in the FOREGROUND
  in a loop, where exit 4 means "call it again".
- **`check_character_finish.py`'s edge-step test was recalibrated today** from a two-sided band to a
  one-sided floor. It had been failing 13 of 17 sheets including all three the owner named as the
  quality bar. Do not "fix" sheets to chase it back.

## Locked decisions

- **Colour cannot separate a roof from the ground in these plates** and the reason is the
  projection, not the tuning — three-quarter top-down puts a roof's rear edge on the grass with no
  wall or shadow between. Thresholds, morphological opening, paving-seeded connectivity, not-ground
  blob detection and texture coherence were all measured and rejected; the numbers are in
  `scripts/derive_town_walkable.py::stamp_roof_bands`. Building footprints are AUTHORED.
- **A band's quality is how much LANE it eats**, measured as painted ground inside the footprint
  reachable from the walkable body outside it. Port Sapphire worst 28.9 cells²; millbrook was 103.3
  and is now 27.4; greenhollow was 69.9 and is now 29.8.
- **`check_town_roofs.py` now carries eight fixed ART-space probes per town**, frozen with the RGB
  each sampled. The footprint half of that gate is blind to a band being pulled off a roof; the
  probes are not. If a plate is repainted, re-measure them — the gate says so itself.
- **The town and the dungeon share the interact-prompt constant** (`bottom: calc(260px + inset)`).
  If the stick's geometry ever changes, both screens move together.
- **The shopkeeper is no longer `fixed`.** He stands on the lane in front of his stall and is placed
  and validated like every other NPC.

## `tr` prerequisites — this branch has never been built there

- **iOS signing.** `fastlane/Fastfile:26` and `ios/App/fastlane/Fastfile:18` hard-code
  `/Users/christopherhachisu/Documents/claudecode/chalkmap-v2/.eas-credentials/AuthKey_52937L4S9H.p8`,
  which is gitignored and exists **only on `air`**. Copy that `.p8` across or fix the path. Cert,
  profile and `cmbuild.keychain` self-bootstrap from the API key.
- **Xcode, python3, and node v20.20.2** — the version is hard-coded in an nvm path at
  `scripts/render_act1_reconstruction_review.mjs:522`.
- `dist/`, `node_modules/`, `.eduharness/` and the other build dirs are not in the repo; `npm run
  repin` rebuilds `dist/` and the iOS payload from tracked sources.
- **`.eduharness/node_modules/playwright-core`** is what the browser harness resolves against and it
  is air-only. `scripts/greenhollow_verify_town.cjs` will not run on `tr` until it is installed.
  Everything in `ship-gate.sh` is pure python/node and will.

## Air-only, and deliberately not committed

Working images under `/tmp/rw/` (band crops, contact sheets, outline renders, phone screenshots).
All of it is reproducible: `scripts/build_npc_contact_sheet.py`, `scripts/measure_npc_style.py`,
`scripts/tighten_town_bands.py` (dry-run without `--write` prints the per-band lane figures).

## Verbatim kickoff prompt for the fresh session on `tr`

```
Continue the edu-rpg Act 1 town work on this machine (`tr`). Fresh clone; nothing from the
previous session's worktree exists here.

  git clone https://github.com/ChrisHachisu/edu-rpg.git
  cd edu-rpg && git checkout fix/graduated-gpu-heal      # HEAD a692177

READ FIRST: docs/handoffs/2026-08-24-act1-towns-to-tr.md
Do NOT preload docs/PROJECT-RUNBOOK.md or older handoffs.

Four of the owner's five build-58 items are done and pushed. ONE IS OPEN, and it is the whole job:

  "all the other npcs need fixing. however, the npcs in port sapphire look much better, so
   try to match to their style."

Eight sheets to redraw, in two batches of four, ONE fresh standard-tier worker per batch, run
SERIALLY because ~/.codex/generated_images is a shared directory:
  Batch B  greenhollow: elder, kiki, villager1, villager2
  Batch C  greenhollow fisherman; millbrook herbalist, miller, sage

The brief is committed and current: design/act1-towns/npc/BRIEF-match-portsapphire-v4.md
Batch A (the healer) is done and is the worked example -- open
public/act1-hifi/town/npc/millbrook-healer-4x3-64.png to see the bar.

"Match that style" is a number, not a judgement: scripts/measure_npc_style.py must report
step >= 22.5 AND hard% >= 33 (the Port Sapphire trio's own floor), and
scripts/check_character_finish.py must PASS including its key-bleed column. The eight sheets
you are replacing currently run 16.5-21.8 step.

BEFORE YOU BELIEVE ANY SPRITE IS FINISHED, LOOK AT scripts/build_npc_contact_sheet.py OUTPUT.
A magenta halo shipped in build 58 while two workers' numbers both said clean, because they
measured the outermost opaque ring and the halo lives in the semi-transparent pixels.

First, prove the machine can build:
  npm run --silent gate
It needs python3, node v20.20.2 and Xcode. It does NOT need signing. If it is green, the clone
is good. The iOS SIGNING key is air-only -- fastlane/Fastfile:26 and ios/App/fastlane/Fastfile:18
hard-code .../chalkmap-v2/.eas-credentials/AuthKey_52937L4S9H.p8, which is gitignored; that file
must be copied from `air` before any TestFlight push, and it is the one thing that will block the
ship. Ask the owner for it early rather than at the end.

When all eight sheets land: npm run repin, npm run --silent gate on the committed tree, then
./scripts/ship-ios.sh. That script assigns the Beta Testers group and then blocks on
verify-delivery.py -- processingState VALID is NOT installable, so never report a ship on VALID
alone. Report the build number AND that a tester can install it.

Do NOT ship before all eight land: the owner's standing order is that the batch authorizes the
push, and four-of-five is not the batch.
```
