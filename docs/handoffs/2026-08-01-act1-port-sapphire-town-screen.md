---
date: 2026-08-01
type: handoff
project: edu-rpg
milestone: act1-town-screens
status: superseded
tags: [handoff]
superseded_by: "[[2026-08-02-act1-port-sapphire-in-app]]"
---

# Handoff — Act 1 town screens, Port Sapphire — 2026-08-01

## What shipped

Nothing committed. **The whole session is uncommitted work in the
`codex/map-engine-semantic-data` worktree** at
`/Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data`.
HEAD is unchanged at `c4f97d5`. The tree carries ~200 modified/untracked files, most of them
from a CONCURRENT session (see Gotchas).

Produced this session:

| file | what |
|---|---|
| `design/act1-towns/portSapphire-screen.png` | **v4, the current town artwork.** 1885x1885 |
| `design/act1-towns/portSapphire-screen-v3.png` | v3, scale approved / 5 issues |
| `design/act1-towns/portSapphire-screen-v1.png` | v1, rejected (too small, too empty) |
| `design/act1-towns/anchor/portSapphire-style-anchor-65.png` | overworld terrain at this exact density — the style/palette reference for generation |
| `scripts/render_town_hero_proof.py` | renders the town + canonical hero at true scale |
| `docs/CANONICAL-ASSETS.md` | which hero + which world scale, and why sessions keep getting it wrong |
| `design/act1-towns/PORT-SAPPHIRE-SPEC.md` | **STALE in its method** — see Gotchas |

**Superseded and safe to delete** (the scrapped semantic-map-first pass):
`scripts/build_town_semantic.py`, `scripts/render_town_art.py`,
`scripts/make_town_materials.py`, `scripts/verify_town_lattice.py`,
`design/act1-towns/portSapphire.json`, `portSapphire-placement.png`,
`portSapphire-art-*.png`, `portSapphire-hero-scale-proof.png`, `design/act1-towns/materials/`.
Owner agreed in principle; deletion was held back only because a concurrent session is live in
this worktree. Confirm that session is done before removing.

## Verification

No typecheck/lint/test run — this session produced **no application code**, only art assets and
standalone Python tooling. `npm run build` / `vite` remain forbidden per `AGENTS.md`.
The shipped `dist/` bundle was read-only throughout and is untouched.

Measured verification that was done, and that matters:

- **Colour vs the overworld:** v4 mean RGB `(89.7, 101.3, 39.2)`, luminance **94.3**;
  overworld at Port Sapphire `(83.3, 96.4, 40.0)`, luminance **89.5**; v3 was 69.3.
- **Scale:** hero renders 65 art px; Codex measured typical house 220-300 art px against the
  briefed 196-293 target. ~9-11 buildings across.

## Live state (verified 2026-08-01)

- **HEAD:** `c4f97d5` "docs: point handoff at stabilization branch tip", branch
  `codex/map-engine-semantic-data` — verified via `git log --oneline -1` / `git branch --show-current`.
- **Nothing deployed, nothing built, nothing committed.** No TestFlight / App Store action was
  taken or is pending for this workstream.
- **A concurrent session is actively writing to this same worktree** — verified twice by
  `find -newermt` bursts at 20:34-20:38 and after 20:52 touching `skirt_sprite.py`,
  `composite_landmarks.py`, `render_material_map.py`, `render_dungeon_material_map.py`,
  `make_dungeon_materials.py` and the Sunken Cellar materials. Neither of this session's Codex
  runs touched those (zero hits in both logs).

## Locked decisions

- **Towns are art-first.** Codex authors the town screen; walkable geometry is DERIVED from the
  painting, exactly as the overworld does it (`public/act1-hifi/walkable-polygons.js`,
  `designLocks.collisionOwner = "r26-polygon-authority"`). **A grid is never an input.** The
  first pass generated a semantic grid and painted into it; the owner scrapped it outright
  ("this square tile style is what did not work before").
- **Towns keep dedicated maps.** Not open world. A town is a bounded screen loaded on entry.
  Surrounding terrain appears as a 2-3 cell BORDER so the town sits in its world (DQ-style),
  not as a seamless continuation.
- **Port Sapphire is 65x65 cells = 1040x1040 world px = 5x5 camera screens**, art 1885x1885 at
  29 art px/cell. 2x2 screens was tried and rejected: at hero 36 world px a proper house is ~7
  cells, so a 26x26 town is under four houses wide.
- **Scale rule, and it is what finally worked:** brief the generator with a TABLE of art-pixel
  heights keyed to the hero (65px), not prose. Cottage ~196, house/shop ~228, inn ~293, lanes
  3-4 cells, quay 3-4 cells, plus the explicit failure mode "a building must never be near the
  player's height."
- **Shop and healer are pre-determined and never entered.** Both front the main square on
  opposite sides. Shop = ground floor open under a wide awning, counter across the full
  opening, goods displayed. Healer = herbalist's porch, drying herbs under the eaves, stone
  basin, waiting bench. Ground directly in front of each stays clear — that is where the player
  stands. Building interiors are cut from the design; hidden loot in towns is cut.
- **Preserved from the shipped game, and nothing else:** NPC roster (healer, sailor, wisewoman,
  drake) with their dialogue keys, shop inventory (herb, potion, smokeBomb, bronzeSword,
  ironSword, bronzeArmor, leatherArmor, ironShield, leatherCap, ironHelm), healer price **8 G**.
- **Canonical hero + world scale** — `docs/CANONICAL-ASSETS.md`. Hero is
  `public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png` at 36 world px. NEVER
  `public/assets/hero/*-walk.png` (that is the 48px tile-map runtime).

## Gotchas for next session

- **`ART-DIRECTION.md`'s environment STYLE BLOCK is stale and will re-darken every asset.** It
  says "Dark, dense, realistic old-growth ... deep forest shadows"; the settled overworld is
  bright. Briefs are required to embed it verbatim, and that is exactly what pulled v3 to
  luminance 69 against a 89.5 target. v4 fixed it by explicitly overriding the tone language
  with measured RGB targets. **The doc itself still needs updating** — this recurs for dungeons
  and landmarks too, not just towns.
- **`design/act1-towns/PORT-SAPPHIRE-SPEC.md` describes the SCRAPPED method** (semantic grid,
  tile atlas, 24->48 lattice). Its preserved-gameplay contract and validation-gate thinking are
  still good; its pipeline is dead. Do not follow it as-is.
- **Landmark cell authority is `owner-terrain.json -> acts.1.landmarks` = (133,349).** Two other
  plausible sources are WRONG: `LANDMARK-SPRITE-CONTRACT.md`'s (133,347), and the shipped
  compass / `startCell` (130,290). The art-space entrance pixels in
  `OVERWORLD-MOVEMENT-BOUNDARIES.md:76` belong to the SCRAPPED tiled overworld.
- **Two terrain sources exist and only one has water.** `owner-terrain.json.terrainRows`
  contains only `. F M` — reading it concludes there is no sea. Water lives in the PNG class map
  `act1-owner-semantic.png`. Read the PNG.
- **`public/act1-hifi/chunks/` is the SCRAPPED dark painterly overworld.** The settled overworld
  is `owner-terrain/art-tiles/act1-material-map.png` (7104x8736, 48 art px/cell).
- **`act1-hifi` is an overlay, not a runtime.** `adapter.js` patches the shipped Phaser scene and
  is gated on `activeMapId(scene) === 'overworld'`. A hi-fi town means extending that gate to
  `portSapphire`. There is no second engine to choose.
- **The shipped runtime hardcodes three town positions** — shop counter `(width-4, 13, dir 3)`,
  healer `(width-13, 12)` (its `npcs[]` entry is never read), and town edge-exit always taking
  `connections[0]`. All three block per-town layouts and three gates. Only relevant if the town
  ends up on the legacy tile renderer rather than the hi-fi overlay.
- **Codex image generation is ~9-10 minutes per call.** Budget for it; do not poll tightly.
- **A concurrent session is live in this worktree.** Coordinate before deleting anything or
  committing.

## OPEN — the camera is too tight for a town, and it is unresolved

`designLocks.cameraWorldWidth = 208` world px = 13 cells = **20% of the town's width**, fitting
**1.9 houses across** (1.3 for the inn). DQ3 shows ~15x11 tiles with ~3-tile houses, about five
houses across; matching that here needs **~540 world px (34 cells), 2.6x the lock.** The
artwork is right; the play view is cramped. This was surfaced to the owner and **no decision was
made.** It is a `designLocks` change, not an art change, and it affects the overworld too if
changed globally.

## Resume here

**Distilled state:** Port Sapphire v4 artwork is owner-approved on scale, colour, walkable
clarity, building coherence and shop/healer treatment. Owner's words: *"much better ... just fix
that and make an actual port and we should be good."* Two art fixes remain, then the work moves
off art and onto deriving walkable geometry.

**The two remaining art fixes:**

1. **Kill the yellow/olive cast.** It is not green — it is blue starvation. The cobbled square
   measures R170 G156 B59; **blue is only 35% of red** where paved stone wants 85-95%.
   Vegetation is fine as-is; the cast is on stone, timber, plaster and dirt. Prefer a
   deterministic per-class channel grade (the pattern in `scripts/grade_act_map.py` — one global
   gain field keyed on the semantic mask, never per-tile) over another generation, because
   generation is unreliable on tone.
2. **Make it an actual port.** v4's waterfront thinned to two small jetties and open water across
   the bottom quarter. v3 had a dense working harbour with a moored sailing ship —
   `portSapphire-screen-v3.png` is the reference for harbour density. Wanted: real quay
   frontage, a moored ship, working jetties, boats, stacked cargo, drying nets.

Also worth fixing in the same pass, flagged by this session but not by the owner: v4's lanes
form a near-symmetrical cross and the square is a clean rectangle. The neatness fix bought
order at the cost of the organic quality that was the founding requirement.

**Pointers:**

| purpose | path | read when |
|---|---|---|
| hero + world scale authority | `docs/CANONICAL-ASSETS.md` | before any visual work |
| locked world numbers | `public/act1-hifi/manifest.json` -> `designLocks` | before any visual work |
| current artwork | `design/act1-towns/portSapphire-screen.png` | always |
| harbour density reference | `design/act1-towns/portSapphire-screen-v3.png` | fixing the port |
| style/palette anchor at this density | `design/act1-towns/anchor/portSapphire-style-anchor-65.png` | any regeneration |
| the v4 brief that worked | `/tmp/terra-ps4-brief.md` (copy it somewhere durable) | writing v5's brief |
| proof renderer | `scripts/render_town_hero_proof.py` | after any regeneration |
| global colour grade pattern | `scripts/grade_act_map.py` | fixing the cast |
| settled overworld art | `design/continent-terrain-class-method/owner-terrain/art-tiles/act1-material-map.png` | colour targets |
| terrain class map (has the water) | `design/continent-terrain-class-method/owner-terrain/act1-owner-semantic.png` | geometry questions |
| overworld walkable derivation | `public/act1-hifi/walkable-polygons.js` | when deriving town collision |

## Kickoff prompt (paste verbatim into next session)

```
edu-rpg, Act 1 town screens — continue Port Sapphire.

Work in the worktree /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data
(branch codex/map-engine-semantic-data). NOTE: a concurrent session may be writing here —
check before deleting or committing anything.

Pre-flight reads, in this order, and nothing else:
  1. docs/handoffs/2026-08-01-act1-port-sapphire-town-screen.md   (this handoff — the gotchas matter)
  2. docs/CANONICAL-ASSETS.md
  3. public/act1-hifi/manifest.json -> designLocks

The current artwork is design/act1-towns/portSapphire-screen.png (1885x1885 = 65x65 cells at
29 art px/cell). The owner has approved its scale, colour brightness, walkable clarity,
building coherence, and the shop/healer treatment. Do not regress any of those.

Two fixes remain, then stop and show the owner:

1. Remove the yellow/olive cast. It is blue starvation, not green: the cobbled square measures
   R170 G156 B59, blue at 35% of red where paved stone wants 85-95%. Vegetation is correct
   already. Prefer a deterministic per-class channel grade in the style of
   scripts/grade_act_map.py (one global gain field keyed on a semantic mask, never per-tile)
   over regenerating, because generation is unreliable on tone.

2. Make it an actual working port. v4's waterfront is two small jetties and open water across
   the bottom quarter. Use design/act1-towns/portSapphire-screen-v3.png as the reference for
   harbour density: real quay frontage, a moored sailing ship, working jetties, boats, stacked
   cargo, drying nets. If this needs a regeneration, base the brief on /tmp/terra-ps4-brief.md
   (copy it somewhere durable first) and keep every "KEEP" constraint in it.

While regenerating, also loosen the street geometry: v4's lanes form a near-symmetrical cross
and the square is a clean rectangle. The founding requirement was that the town look organic.

Image generation runs on Codex Terra and takes ~9-10 minutes per call:
  /Applications/ChatGPT.app/Contents/Resources/codex exec -m gpt-5.6-terra \
    --skip-git-repo-check --sandbox workspace-write -o /tmp/out.md < brief.md

CRITICAL: ART-DIRECTION.md's environment STYLE BLOCK says "dark, dense, realistic old-growth,
deep forest shadows". That language is STALE and pulled a previous pass 25 luminance too dark.
Embed its material/composition guidance but override its tone language with measured targets:
the overworld at Port Sapphire is mean RGB (83.3, 96.4, 40.0), luminance 89.5.

Verify with: python3 scripts/render_town_hero_proof.py
It renders the town with the canonical hero at true scale and prints the scale targets. Show
the owner that proof image. Do NOT use public/assets/hero/*-walk.png — wrong runtime.

Do not run npm run build / vite (forbidden, see AGENTS.md). Do not commit or deploy.

Still open and NOT decided by the owner: designLocks.cameraWorldWidth = 208 shows only 1.9
houses across, roughly 2.6x tighter than a Dragon Quest town. Raise it if the owner asks; do
not change it unilaterally.

After the two fixes land and the owner approves, the next milestone is deriving the walkable
geometry from the painting (see public/act1-hifi/walkable-polygons.js) and anchoring the shop
counter, healer porch, save point and the four NPCs onto the derived walkable space.
```
