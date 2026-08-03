---
date: 2026-08-01
type: prompt-book
tags: [edu-rpg, act1, dungeons, art-direction, props]
aliases: [dungeon prop prompts]
---

# Dungeon prop prompt book — Act 1

The working prompt book for the nine dungeon special-tile props. Cited by
`ART-DIRECTION.md:171`; that citation dangled from 2026-07-20 until this file was written on
2026-08-01, which is why three different boss-marker designs shipped without anyone noticing.

**The generator of record is `scripts/make_dungeon_assets.py`.** The prompt text lives in that
script, not here — this document is the *contract* the script's prompt must satisfy. Change this
file first, then the script (game-design rule 7).

## The rule that overrides ART-DIRECTION's TECH SPEC

`ART-DIRECTION.md:156-157` mandates **bold near-black outlines + 2-tone cel shading** on every
sprite. That contract was written for the battle-monster set on painted backgrounds and it is
**wrong for dungeon props**, which sit directly on the material renderer's painterly rock.

Measured against the 2026-07-31 prop sheet, every stone prop ran roughly twice as saturated as the
rock it stood on (13–19% against 6–10%) and pulled warm against a cool surface (blue at 62–83% of
red against 112–124%). That is the owner's *"they look out of place"* (2026-08-01), and it is a
palette fact, not a taste dispute.

> [!warning] Do not copy those numbers into anything
> They describe the 07-31 render, and `mat-wall.png` was replaced on 08-01, moving the rock to
> **18.2% saturation**. A threshold copied out of a measurement is a fact with an expiry date.
> `scripts/check_dungeon_assets.py` therefore **derives the bands from the reference render on
> every run**, and refuses to run at all if that render is not verifiably current
> (`docs/superpowers/specs/2026-08-01-artefact-provenance-design.md`).

> [!important] Dungeon-prop amendment to the style contract
> Dungeon props are **painterly, not cel-shaded**. No hard black keyline. Stone elements share the
> rock's cool blue-grey palette (saturation under ~10%, blue ≥ red). Saturated colour is reserved
> for the four **gameplay-signal** props — chest brass, save crystal, torch flame, boss eyes —
> which are *allowed* to pop, because the player must find them in a dark cave.

Everything else in ART-DIRECTION.md still holds: 3/4 top-down, upper-left key light, readable
silhouette, transparent background, no text.

## Canonical palette

**Read it off the current render, never off this page.** `scripts/check_dungeon_assets.py` prints
the live rock and floor bands as its first output. The hexes below are the 07-31 sample, kept only
so the *direction* of the 2026-08-01 correction stays legible — they are not current:

```
rock dark      #0d0d0f  #101012  #131316  #15151a  #18181d   (07-31, superseded)
rock mid       #1d1d22  #25252b  #2e2e34  #3d3e42            (07-31, superseded)
floor          #525351  #64635e  #75746d                     (07-31, superseded)
```

The generation prompt in `make_dungeon_assets.py` still names 07-31 hexes. That is deliberate and
harmless — the prompt describes the *look being asked for*, and re-rolling a good sheet to chase a
material change is not worth the risk. Revisit only if a regeneration is needed anyway.

## The nine props

Nine cells, **nine props, no empty cell**. The 2026-07-31 sheet left the ninth cell blank; the
owner's 2026-08-01 instruction fills it with the chest's open state.

| # | Key | Subject | Palette register |
|---|---|---|---|
| 1 | `mouth` | cave mouth opening out to daylight | rock + one pale daylight accent |
| 2 | `stairsUp` | worn stone steps leading up | rock |
| 3 | `stairsDown` | worn stone steps down into darkness | rock |
| 4 | `boss` | **hooded shadow wraith** — see below | black/violet + red eyes |
| 5 | `chest` | closed treasure chest, **facing straight south** | wood + brass signal |
| 6 | `chestOpen` | same chest **open**, **facing straight south** | wood + brass signal |
| 7 | `save` | upright cyan crystal shard on a rock base | cyan signal |
| 8 | `torch` | lit torch lying on the ground | warm flame signal |
| 9 | `sign` | carved stone plaque, wall-mounted | rock |

### Boss marker — the design is the shadow wraith, and only the wraith

Three boss designs exist in the project's history. Getting this wrong has already cost two rounds:

1. **Horned red-purple beast** — the 2026-07-02 first draft in
   `edu-rpg/design/DUNGEON-ASSET-PROMPTS.md`. **Superseded the same day.** Do not use.
2. **Hooded shadow wraith** — the owner's redirect, **the version that shipped**. Recorded as
   *"genericized to a shadow silhouette"* / *"generic mysterious shadow marker"* / *"shadow
   wraith confirmed"* across four brain entries (2026-07-02, 2026-07-09). **This is canonical.**
3. **Inert carved sigil slab, glowing red** — what `make_dungeon_assets.py` generated on
   2026-07-31. A regression introduced by writing a fresh prompt with no reference to 1 or 2.
   This is what the owner means by *"boss needs the dark shadow from the previous design"*.

No verbatim prompt for #2 was ever preserved. **The shipped PNG was**, and it is the better
reference: `design/act1-dungeon-interiors/assets/refs/prev-boss-marker.png` (copied from
`edu-rpg/dungeon-assets/received/dqprop-boss-marker-128.png`).

### The design as of 2026-08-01: SMOKE, NOT A FIGURE

The recovered wraith PNG is the *ancestor* of the current design, not the target. Owner feedback
arrived in two corrections pointing opposite ways, and the second one moved the design:

| Version | Result | Owner |
|---|---|---|
| v1 hooded wraith, narrow | 28×41, wispy | *"a sliver of smoke or a crack in the ground ... does not look like a monster"* |
| v2 armoured lich, staff, crown | 39×41, ornate | *"way too far ... way too strong and specific"* |
| **v3 formless smoke + eyes** | **canonical** | *"it needs to look like a black smoke with eyes inside. less specificity"* |

**A formless mass of dense black smoke, billowing and opaque, with two glowing red eyes burning
inside it. No body, no face, no hood, no robe, no limbs, no crown, no weapon.** Near-black and
solid at its core, fraying to wisps at the edges.

> [!important] Specificity is the failure mode, not weakness
> The marker stands for an **unknown**. Anything that resolves into a recognisable creature is
> wrong *however good it looks on its own* — v2 was the better illustration and the worse marker.
> Prominence comes from **mass and draw size** (`PROP_CELLS["boss"]` = 2.2), never from detail.

Its red eyes are one of the four permitted saturated signals. Nothing else on it may be saturated
— v2 came back holding a **cyan crystal staff**, and cyan is the save-point signal.

### Chest — closed and open, both facing straight south

Owner, 2026-08-01: both states **face straight south** (directly toward the camera/player), not
the 3/4 turn the 2026-07-31 sheet used. The two cells must be *the same chest* — same wood, same
iron banding, same brass clasp, same width — so the runtime can swap one for the other on open
without the object appearing to change. The open cell shows the lid hinged back with the interior
visible.

References: `refs/prev-chest-closed.png`, `refs/prev-chest-open.png` (identity only — their warm
orange wood and hard outline are the *old* style and must not be copied).

## Style anchor

`design/act1-dungeon-interiors/assets/refs/anchor-rock-floor.png` — a 700 px crop of the approved
Sunken Cellar render carrying wall rock, floor and standing water. Attach as the reference image.

> [!warning] Attachment budget
> ~8 MB of attached references kills `image_gen` silently. The anchor is 582 KB. Do not attach the
> full-resolution floor render, and do not attach more than two references.

## Prompt-construction rules learned the hard way

- **Keep it short.** The long "uniform field / no large features" material brief *caused* the flat
  materials it was trying to prevent (gradient 3.26 vs 16.84); a four-line probe scored 11.74.
- **Never name a failure criterion.** "A smooth swatch is a failure" hung `codex exec` to the
  900 s timeout, producing nothing.
- **The frame is load-bearing.** Parameterise the nouns inside a verified prompt; do not
  reorganise its structure.
- **Clear the destination first.** The prompt ends *"modify no existing file"*, so on a re-run
  Codex generates the image and then refuses to overwrite the sheet already on disk — exit 17,
  which looks exactly like a generation failure and is not one.
- **`os.path.exists` is not evidence of generation.** Hash the destination before and after.
- **`~/.codex/generated_images` is shared across sessions.** Never adopt an artefact you cannot
  trace to your own run — a harbour village was very nearly shipped as cave rock this way.

## Verification gate

A sheet is accepted only when all of these pass:

0. The reference render is `FRESH` — `check_dungeon_assets.py` refuses to score against a render
   that no longer reflects its materials, which is how the thresholds went stale on 08-01.
1. All nine cells non-empty after chroma keying (`split_sheet` prints EMPTY on failure).
2. Stone props measure saturation ≤ 1.3× the rock's own, and blue ≥ red. Derived per run.
3. The four signal props (chest, save, torch, boss eyes) are the only cells allowed to be loud.
4. Boss cell is a hooded shadow silhouette with red eyes — not a slab, not a beast.
5. Chest closed and open are the same object, both square-on to the camera.
6. Composited onto `sunkenCellar-f3` and eyeballed at gameplay zoom before the owner sees it.
