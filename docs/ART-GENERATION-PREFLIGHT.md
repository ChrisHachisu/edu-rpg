---
date: 2026-08-01
type: process
tags: [edu-rpg, art, codex, generation, preflight]
status: MANDATORY
---

# Art generation preflight — do this BEFORE writing any Codex brief

Owner, 2026-08-01, after three art redos in one session:
> *"you miss the mark on the artwork a lot so please make sure you are fully aware of the design
> of everything before you have codex generate any art because a redo just burns tokens."*

A Codex image-generation call is **~10 minutes**. The preflight below is ~5 minutes. **Every miss so far was
preventable by it**, so it is not optional and it is not a formality.

## The one root cause

Every art miss in this project has the same shape: **the brief was written from a design doc, and
the doc described an intent the shipped asset had already diverged from — or described a
*different asset family altogether*.**

| briefed from the doc | what the shipped asset actually was | cost |
|---|---|---|
| `ART-DIRECTION.md` environment STYLE BLOCK: *"dark, dense, deep forest shadows"* | settled overworld is bright, luminance **89.5** | town regenerated, 25 luminance too dark |
| the same block, applied to dungeon props | props need painterly, **no keyline** (amended 2026-08-01) | props read as stickers |
| `LANDMARK-SPRITE-CONTRACT.md`'s site/structure split — **true, but never restated in the brief** | terrain owns water; the sprite painted its own sea | overworld sprite regenerated |
| canonical STYLE BLOCK: *"bold near-black outline around the full silhouette"* | that block is about the **128px battle monsters**; the Act 1 heroine has **no keyline** | all four NPCs regenerated |

Note the third and fourth rows especially:

- A rule can be **correct and still missed**, because *the generator never reads the contract*.
- **Naming an anchor image does not transfer its properties.** The NPC brief told Codex to match
  the heroine and it still produced a keyline, because an explicit written instruction beats a
  reference image every time. A wrong explicit instruction therefore beats a correct anchor.

## Preflight — all six, before a word of the brief is written

1. **Open the anchor.** Actually view the shipped asset the new art must sit beside. Not the doc's
   description of it. Not a thumbnail.
2. **Measure it, and write the numbers down.** Whichever apply:
   - environments: mean RGB, mean luminance, per-class blue/red ratio
     (`scripts/grade_town_screen.py` reports all of these)
   - characters: silhouette edge step vs body, soft-edge px per 100 opaque, occupied height,
     foot row, dark-tail p10 (`scripts/check_character_finish.py`)
   - sprites: footprint, opaque coverage, what the terrain underneath already draws
3. **Identify the anchor's ASSET FAMILY, and list which doc rules do NOT apply to it.**
   `ART-DIRECTION.md` contains at least three style blocks for three different families. Never
   paste one on the assumption it is universal. Families currently in play: 128px battle monsters,
   field characters (hero + NPCs), environments, dungeon props, landmark sprites.
4. **Restate every contract rule the generator must obey, verbatim, inside the brief.** Codex does
   not read `ART-DIRECTION.md`, `LANDMARK-SPRITE-CONTRACT.md`, or this file.
5. **Put the measured numbers in the brief twice** — once as the target, once in the return block
   as the acceptance criterion, so a miss is visible without opening the file. Targets are
   numbers, never adjectives. "Target luminance ~90", not "bright".
6. **Have a failable check ready before generating, not after.** If none exists for this asset
   family, write it first — it is cheaper than one redo, and it is the only thing that catches a
   miss that looks fine at thumbnail size.

## Existing checks

| check | family | gates on |
|---|---|---|
| `scripts/check_character_finish.py` | field hero / NPCs | edge step and soft-edge, measured against the heroine herself so it follows the anchor if she is re-authored |
| `scripts/grade_town_screen.py --report` | town screens | per-class blue/red and luminance, before/after |
| `scripts/render_town_hero_proof.py` | town screens | scale, against the canonical hero at true size |
| `scripts/key_landmark_sprite.py --over --at --preview` | landmark sprites | how it actually sits on the terrain it will stand on |

## Known stale doc language — override explicitly, every time

- `ART-DIRECTION.md` environment STYLE BLOCK: *"dark, dense, realistic old-growth, deep forest
  shadows"*. **Stale.** The settled overworld is bright. Override with measured luminance.
- `ART-DIRECTION.md` canonical STYLE BLOCK outline rule. **Battle monsters only.** See its
  field-character amendment, 2026-08-01.
- `LANDMARK-SPRITE-CONTRACT.md` enclosure lock. **Amended 2026-08-01** — the perimeter is no
  longer mandatory; match the town screen instead.
- `design/act1-towns/PORT-SAPPHIRE-SPEC.md` pipeline. **Dead** — describes the scrapped
  semantic-grid method.

When a doc is found stale, amend the doc in the same session. Three of the four entries above
were discovered twice before anyone wrote them down.
