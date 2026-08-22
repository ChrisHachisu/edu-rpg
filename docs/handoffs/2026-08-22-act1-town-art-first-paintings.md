---
date: 2026-08-22
type: handoff
project: edu-rpg
milestone: act1-town-plates
status: active
supersedes: "[[2026-08-20-arch-authored-blockers-and-seams]]"
tags: [handoff]
---

# Handoff — Act 1 town plates, art-first restored — 2026-08-22

Stage 1 of three is DONE for all three towns. The machine died after it; nothing was lost and the
tree is green. Stages 2 and 3 have not been started.

## What shipped

- `b759450` chore: park the two village collision authorities on their pinned bytes
- `a114da5` art: all three towns painted fresh, each with a shop and a healer, nothing overhanging a lane
- `bf760f0` art: the villages stand in the meadow they actually stand in, and fill their frames
- `e4143d0` art: both villages repainted by fresh per-town workers, as AGENT-WORKFLOW requires
- `18839fd` feat: towns are art-first again, and Port Sapphire is restored untouched
- (earlier in the session, now superseded by the pivot: `5022071`, `61e67fa`, `cf0c0d7`, `2f01f8f`,
  `a7df997`, `0046f75`, `30086d7`, `1f833a1` — the plan-primed approach the owner scrapped)

## Verification

- map-engine tests: **PASS** — topology, determinism, collision, progression gates, minimap,
  retained-later gate, DQ replay, runtime snapshot `205dbe88`, override revision 7
- ship gate: **PASS** — protected runtime verified, canonical overrides and iOS payload synchronised
- pins: **PASS** — all 101 match disk
- typecheck/lint: not run this session (no TypeScript was touched; all work was Python tooling,
  briefs and PNGs)

## Live state (verified 2026-08-22)

- HEAD: `b759450` on `fix/graduated-gpu-heal`, tree clean — `git status` / `git log`
- iOS payload: **722** files — `find ios/App/App/public -type f | wc -l`
- **Port Sapphire is LIVE and UNCHANGED.** screen `f0d29456…`, walkable `fe4278ae…`, both matching
  their pins in `scripts/runtime_baseline.py` — `shasum -a256`
- **Nothing from this session is installed.** `public/act1-hifi/town/*-screen.png` are still the old
  plates; `TOWN_IDS` in `public/act1-hifi/adapter.js` is untouched, so no player can reach
  millbrook or greenhollow.
- TestFlight 55 unaffected (no build pushed this session)

## Locked decisions

- **TOWNS ARE ART-FIRST. A grid is NEVER an input.** The painting is authored first and collision is
  DERIVED from it. This rule predates the session and is stated in `derive_town_walkable.py`; the
  plan-primed approach in `town_layout.py` is the one the owner scrapped, twice. Owner, 2026-08-21:
  *"go back to the initial port sapphire style that was working for all towns (style and boundary
  setting method)."*
- **Port Sapphire is being REPLACED, not preserved.** Owner asked for fresh art with no
  demijohn/mast/chimney overhangs and fresh boundaries. Its new painting exists; its live art is
  still the old one until stage 3 lands.
- **Whether a town is walled is the PAINTER's call** (owner, mid-turn 2026-08-21). millbrook came
  back unwalled, greenhollow fenced, Port Sapphire open.
- **Nothing may overhang walkable stone** — this is what retires the foreground-overlay layer.
- **Both villages get a SHOP.** `src/data/maps.ts` already defines `shopId: 'greenhollow'` and
  `shopId: 'millbrook'`; the manifests carry `shopId: None` and must be wired at stage 3.
- Exit sides differ: millbrook and greenhollow SOUTH, **portSapphire NORTH** (`portSapphire-town.json`
  exit cell `[33,3]`, "north trail mouth").

## Gotchas for next session

- **The stage-1 painting is SUPPOSED to look soft.** Measured on Port Sapphire's own chain: painting
  15.42/20.8% → hard redraw 20.64/29.2% → tiled plate 22.17/29.7%. Demanding the final figure at
  stage 1 cost two workers their whole retry budget. Stage-1 target is >= 13 / >= 17%.
- **Whole-frame luminance and whole-plate blue/red are COMPOSITION statistics, not quality
  measures.** They called two correctly lit paintings "too dark", and a blue/red gate was actively
  FORCING village grass blue-green. Compare like surface with like surface.
- **A rejected tile does NOT stop the bake**, and each tile grafts its band from its neighbour's
  `raw-*.png` ON DISK — so a rejection lets the next tile graft the PREVIOUS bake's art. All stale
  `tile-*`/`raw-*`/`primer-*`/`plate-stitched.png` were deleted for exactly this reason. Use the
  retry wrapper pattern that checks for the FILE, not the exit code.
- **`~/.codex/generated_images` is ONE SHARED DIRECTORY.** Never run two image workers concurrently.
- **`codex exec` writes stray PNGs into the working directory**, not only its own image dir. Sweep
  the town folders after every batch.
- **The lead must not call image generation** (`docs/AGENT-WORKFLOW.md` §4). One fresh worker per
  town, serially. The owner spotted a violation from the output alone: one context produced two
  near-identical villages.
- **greenhollow's painting is 1950×1950; the other two are 1254×1254.** Check `rebake_town_tiles.py`
  scales per-axis from the REF before assuming this is harmless.
- **Something in this session killed the machine.** Most likely a heavy codex batch running
  alongside other work. Prefer one job at a time and check load before starting the tile rebake.

## Resume here (load-on-demand — do NOT eager-read the corpus)

**Distilled state:** All three town paintings are done, committed and audited, at
`design/act1-towns/<town>/painting-raw.png`. Gates are green, payload 722, nothing installed.
The next action is **stage 2: the tile rebake at 1950, priming from those paintings** — then stage 3,
derive collision, then wire the shops, pin, and flip `TOWN_IDS` LAST.

| purpose | path | read when |
|---|---|---|
| stage-2 tiler, and its per-town REF config | `scripts/rebake_town_tiles.py` | starting the rebake |
| stage-3 collision derivation from paving | `scripts/derive_town_walkable.py` | after plates exist |
| stage-1 painter + `audit()` thresholds | `scripts/town_paint.py` | only if a painting is redone |
| the finish gate | `scripts/check_town_finish.py` | gating a stitched plate |
| exposure-match + min-error quilt | `scripts/stitch_plate.py` | stitching tiles |
| pin registry (add screen keys by hand) | `scripts/runtime_baseline.py` | before `npm run repin` |
| the last switch — flip LAST | `public/act1-hifi/adapter.js` (`TOWN_IDS`) | only on owner's yes |
| what the accepted style is | `design/act1-towns/BRIEF-v4-that-worked.md`, `BRIEF-rebake-v1.md` | if style drifts |

Audit figures for the three paintings (lead-verified):

| | cobble lum | step / hard | connected net | exit |
|---|---|---|---|---|
| portSapphire | 165.6 | 23.82 / 35.2% | 11.22% | 1× TOP |
| millbrook | 172.5 | 16.80 / 23.3% | 20.19% | 1× BOTTOM |
| greenhollow | 160.2 | 14.05 / 18.0% | 13.41% | 1× BOTTOM |

## Kickoff prompt (paste verbatim into next session)

```
Continue the edu-rpg Act 1 town plates.

Repo: /Users/christopherhachisu/Documents/claudecode/edu-rpg/.claude/worktrees/laughing-mahavira-c9f72b
Branch: fix/graduated-gpu-heal   HEAD: b759450   Tree clean, gates green, payload 722.

Read docs/handoffs/2026-08-22-act1-town-art-first-paintings.md first. Do not read the
PROJECT-RUNBOOK or old handoffs.

STATE: Stage 1 is DONE. All three towns have an approved whole-town painting at
design/act1-towns/<town>/painting-raw.png (portSapphire, millbrook, greenhollow). Towns are
ART-FIRST: the painting is authored first and collision is DERIVED from it; a grid is NEVER an
input. Nothing is installed — the live plates are still the old ones and TOWN_IDS is untouched.

NEXT TASK, stage 2: rebake each town into four tiles at 1950 with scripts/rebake_town_tiles.py,
priming each tile from that town's painting-raw.png and from its already-finished neighbours, then
stitch with scripts/stitch_plate.py and gate with scripts/check_town_finish.py.

Then stage 3: derive each town's collision from the finished plate with
scripts/derive_town_walkable.py, wire the two missing shop counters (src/data/maps.ts already
defines shopId 'millbrook' and 'greenhollow' while both town.json carry shopId None), add the
screen pin keys by hand in scripts/runtime_baseline.py as 64 LITERAL zeros, npm run repin, confirm
the payload count, and flip TOWN_IDS in public/act1-hifi/adapter.js LAST and only on the owner's
explicit yes.

HARD RULES, each already paid for:
- The lead does NOT call image generation (docs/AGENT-WORKFLOW.md section 4). One fresh
  standard-tier worker per town, run SERIALLY — ~/.codex/generated_images is one shared directory.
- Delete a town's raw-*/tile-* before re-baking it. A rejected tile does not stop the run, and each
  tile grafts its band from its neighbour's raw file ON DISK, so a stale file gets quilted in
  silently.
- codex exec writes stray PNGs into the working directory; sweep the town folders after each batch.
- Whole-frame luminance and whole-plate blue/red are COMPOSITION statistics, not quality measures.
  Compare like surface with like surface.
- Port Sapphire's live art and collision must not change until stage 3 lands for it.
- Something killed the machine last session, probably a heavy codex batch alongside other work. Run
  one job at a time and check load before the rebake.

Start by confirming the branch and HEAD, then run the stage-2 rebake for ONE town and show the
owner the stitched plate before doing the other two.
```
