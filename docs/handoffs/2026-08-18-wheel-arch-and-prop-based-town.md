---
date: 2026-08-18
type: handoff
project: edu-rpg
milestone: build-38 feedback tail + prop-based town
status: active
supersedes: "[[2026-08-17-build38-feedback-and-town-art]]"
tags: [handoff]
---

# Handoff — wheel, arch, and the prop-based town — 2026-08-18

## What shipped

TestFlight **44 → 53**, each verified `externalBuildState == IN_BETA_TESTING` (not merely VALID).

- `c0329fe` **the arch mask patch had sealed three dungeons** — reverted. Its verifier tested a
  ZERO-WIDTH POINT while the runtime needs 12–16 px of body clearance. Also: a tap is now finger
  travel, not element identity (the name field's double-tap).
- `8421ef4` + `bc5408c` **the blue map was two loaders with no retry, NOT a lost GPU context** —
  an empty `im.onerror`, and `a1aFetch` with no `onerror` at all. Owner's *"movement and game play
  is fine"* is what localised it; six prior commits had treated it as GPU memory.
- `8eefea5` the town art gate can now tell hand-drawn work from a painting AND from a posterized
  fake, plus paving IoU so a candidate cannot re-invent the street layout.
- `e9842cf` interact prompts in Japanese. **Owner approved the wording: "ja all good."**
- `0222b41` → `8d423c4` the grade wheel, twice. **Still unconfirmed — see gotchas.**
- `54d61e9` → `636fc7e` → `208219f` the arch overhead layer, three times, then **turned OFF**.
- `ede721f` the approved props + the four arch assets preserved into `design/`.
- `34bd176` the orchestral BGM player, verified against the real bundle, deliberately NOT wired in.

## Verification

- `npm run gate`: **PASS** on the committed tree, 2026-08-18. `PINS CHECK PASS: all 84 pins`.
- `npm run repin`: consistent, both gates green, frozen bundle intact.
- Tree clean at `ede721f`.

## Live state (verified 2026-08-18 via the ASC API, not from prose)

- TestFlight **50, 51, 52, 53** all `VALID`, `internal=IN_BETA_TESTING`,
  `external=IN_BETA_TESTING`, groups `['Internal Testers','Beta Testers']`, `expired=False`.
  **Build 53 is the head and carries everything, and the owner has it installed** (confirmed
  2026-08-18). It briefly did not appear in his TestFlight while the API already reported it
  distributed — that gap is propagation, not a submission problem. Do not re-submit on that symptom;
  check the API first, then wait.
- HEAD: `ede721f`, branch `fix/graduated-gpu-heal`, **NOT merged to main**.
- Ship order remains `./scripts/ship-ios.sh` → `asc.py` → `assign.py <n>` → `submit.py <n>`.

## Locked decisions

- **The town becomes PLACED PROPS over a tiled ground**, the way the dungeons already work — not one
  baked painting. Owner agreed after the DQ3-HD-2D discussion. This dissolves the canvas-size blocker
  (a prop is ~200 px; the 1950² plate was unreachable), makes style matching judgeable one object at
  a time, and makes collision authored rather than colour-thresholded out of a painting.
- **API keys are NOT an option** (owner, explicit). Generation stays on `codex exec -m gpt-5.6-sol`.
- **The town must look ORGANIC.** v8 was rejected for being square. Organic comes from PLACEMENT,
  VARIETY and PATH SHAPE — not from the individual asset. The existing plate's paving mask is the
  organic street shape and should be reused as the layout source.
- **Fuzziness and the town art are ONE job**, measured: hero 1.778 vs town 1.812 source px per world
  px — nearly identical density, completely different legibility. Hard-edged art at 1/3 canvas
  resolution reads as pixel art; painterly art reads as fuzz. **Do not re-propose device-resolution
  rendering** — 9× the fragment cost for a pixel-identical overworld.
- **Music is DEFERRED to the next bundle edit** (owner: *"Wait and bundle it with the next edit"*).
  Licence CLEARED (合同会社ChalkMap). Pointers sit beside `BUNDLE_SHA256` and `FROZEN`.
- **S5 (walking on the arch) is ART, not collision.** `patch_dungeon_arch_mask.py` now refuses all
  four floors: there is no mask edit that keeps a mouth passable.

## Gotchas for next session

- **THE WHEEL IS NOT VERIFIABLE IN THE BROWSER HARNESS.** Measured: a listener attached to
  `#qok-gwheel` receives **ZERO scroll events** while `scrollTop` demonstrably changes. Four "fixed"
  builds shipped on the strength of local green results that could not see the bug. The owner's
  device is the only instrument that has ever shown it. If 53 still fails, **ship instrumentation in
  the build** (log which events fire) rather than guessing a fifth time.
- **`'onscrollend' in el` is a CAPABILITY check, not proof of delivery.** It reports true on the
  shipping engine and evidently does not fire for touch momentum — that is what made build 50 a
  no-op. The commit now happens inside the scroll listener, which the owner's video proves runs
  (the highlight tracks his finger).
- **A NEW ASSET CAN PASS EVERY GATE AND NEVER SHIP.** Four overhead PNGs passed `npm run gate` while
  reaching neither `dist/` nor the iOS payload — `build-dist.sh` assembles from
  `runtime_baseline.py`'s ENUMERATION. Add the pin key by hand (placeholder zeros), then repin, then
  **count the files in `ios/App/App/public/`**.
- **An aborted `build-dist.sh` leaves `dist/` broken and `git status` clean** (it is gitignored).
  Re-run it and re-gate before trusting a clean tree.
- **Do not derive an occlusion shape from the baked plate.** Three attempts (band, ring, ring+mask)
  each put 33–51% of the overlay on WALKABLE floor, hiding the player in the open. Authored assets
  have the right silhouette by construction; that is why the owner asked for one, twice.
- Codex cannot write to `/tmp` (sandbox `PermissionError`) and once DELETED its own output. Have it
  REPORT the path in `~/.codex/generated_images/` and copy it yourself.
- `derive_town_walkable.py` still cannot run here — wants
  `design/continent-terrain-class-method/owner-terrain/owner-semantic-index.json`.

## Resume here (load on demand — do NOT eager-read the corpus)

**Distilled state:** Everything code-side from the build-38 list is shipped. The wheel awaits the
owner's verdict on 53. The arch overhead layer is OFF and needs the four authored assets wired in.
**The town has NOT been generated** — 25 approved props and 4 arch assets exist; the ground tiles and
the composer do not. Next action: the **ground-tile pilot** (grass + cobble at the props' finish),
because ground is the half that decides whether the prop-based town works.

| purpose | path | read when |
|---|---|---|
| approved props + arch assets | `design/act1-towns/props/`, `design/act1-dungeons/arch/` | building the town or the arch |
| town placement data | `public/act1-hifi/town/portSapphire-town.json` | placing props — healer 38.6,29.9; shop COUNTER 24.5,29.2; save 31.4,29; exit 33,3 |
| art gate | `scripts/check_town_finish.py --layout-ref` | judging any town candidate |
| feedback tracker | `docs/FEEDBACK-BUILD-38.md` | any item's status (A1–A5, L1, L2) |
| music, ready + deferred | `docs/MUSIC-INTEGRATION-READY.md` | the next time the bundle is edited |
| arch bake (derived, superseded) | `scripts/bake_dungeon_overhead.py` | only as a record of what failed |

**Still open:** ground tiles · town composer · wisewoman has no building · props saturation drift
(0.704 vs hero 0.629) · D2(a) boss cut from the baked floor plate · O1 overworld entrance structure ·
L1 landmark + L2 walk-mask permanent-failure loaders (same no-retry class, gameplay-affecting).

## Kickoff prompt (paste verbatim into next session)

```
edu-rpg, worktree /Users/christopherhachisu/Documents/claudecode/edu-rpg/.claude/worktrees/laughing-mahavira-c9f72b,
branch fix/graduated-gpu-heal, HEAD ede721f, tree clean, gate green (84 pins), NOT merged to main.

READ FIRST: docs/handoffs/2026-08-18-wheel-arch-and-prop-based-town.md

THE OWNER SAID PROGRESS HAS SLOWED AND WANTS BACK ON TRACK. The town is the value item and has
not moved: 25 approved props and 4 arch assets exist in design/, but there is NO ground art, NO
composer, and the game still renders the old painted plate. Do the town; do not start a bug sweep.

TASK 1 — THE GROUND PILOT. Generate seamless tiling ground for Port Sapphire: grass, pale cobble
paving, a dirt/sand shore, and a grass->paving edge treatment. Match the approved props in
design/act1-towns/props/ (hero-matched palette; measured saturation 0.626 / value 0.433 against
the hero's 0.629 / 0.421 -- note the props drifted to 0.704, so pull saturation back). Hard-edged
as drawn: NO -unsharp, NO -posterize. Generation is `codex exec -m gpt-5.6-sol --skip-git-repo-check`
with the brief on stdin; Codex CANNOT write to /tmp, so have it report the path under
~/.codex/generated_images/ and copy the file yourself. API keys are NOT an option.
Ground is the half that decides whether this approach works, so show the owner a composed patch --
ground + a few props + the hero at true game scale -- before building anything further.

TASK 2 — THE COMPOSER, only once he likes the ground. Place props over the tiled ground using
public/act1-hifi/town/portSapphire-town.json as the authority (healer NPC 38.6,29.9; shop COUNTER
24.5,29.2 -- there are NO interiors, both stand in the open; save 31.4,29; exit 33,3). Reuse the
EXISTING plate's paving mask as the street shape: the owner rejected v8 for being square, and the
current layout is organic and has never been criticised. The wisewoman (30.2,27.8) has no building
yet. Judge candidates with scripts/check_town_finish.py --layout-ref.

HARD-WON RULES, do not relearn them:
 * The browser harness CANNOT verify the grade wheel -- a listener there gets ZERO scroll events
   while scrollTop changes. Four builds shipped green and broken. If the owner says the wheel still
   fails on build 53, ship instrumentation IN the build; do not guess again.
 * A new runtime asset must get a pin KEY added by hand in scripts/runtime_baseline.py (placeholder
   zeros), then repin, then COUNT the files in ios/App/App/public/ -- otherwise it passes every gate
   and never ships.
 * Never derive an occlusion shape from the baked plate: three attempts each covered 33-51% walkable
   floor and hid the player. The arch overhead layer is OFF (A1D_OVERHEAD_ON) pending the four
   authored assets in design/act1-dungeons/arch/ (opening 36x51, masonry 84x76, identical on all
   four floors).
 * Do NOT re-propose rendering at device resolution (9x cost, pixel-identical).
 * Ship order: ./scripts/ship-ios.sh -> asc.py -> assign.py <n> -> submit.py <n>; the gate is
   externalBuildState == IN_BETA_TESTING.
```
