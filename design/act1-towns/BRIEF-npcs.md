# Task: Port Sapphire NPC walk sheets — four characters, matching the Act 1 heroine

Repo: /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data

Four town NPCs for Port Sapphire. They stand in the same town screen as the player and must look
like they come from the same hand as her.

## THE ANCHOR — study this file before drawing anything
`public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png`
The Act 1 heroine, `192 x 512` RGBA, 24 native `64 x 64` cells, 3 columns x 8 rows, shared foot
baseline. **This is the style, density, proportion and outline standard.** Match its pixel
density and finish exactly — an NPC that is smoother or noisier than she is will read as a
different game. She is also the SCALE reference: these NPCs stand at the same height she does.

## Output — one file per NPC, exact dimensions
| file | who |
|---|---|
| `design/act1-towns/npc/portSapphire-healer-4x3-64.png` | Healer |
| `design/act1-towns/npc/portSapphire-sailor-4x3-64.png` | Sailor |
| `design/act1-towns/npc/portSapphire-wisewoman-4x3-64.png` | Wise Woman |
| `design/act1-towns/npc/portSapphire-drake-4x3-64.png` | Captain Drake |

Each is **`192 x 256` RGB**, drawn on a **pure magenta `255,0,255`** field.
Twelve native `64 x 64` cells, **3 columns x 4 rows**:

- **Columns:** `0` = idle/neutral standing, `1` = leading-foot contact, `2` = opposite-foot contact.
- **Rows, in this order:** `0` down (toward camera), `1` left, `2` right, `3` up (away).

This is the heroine's sheet restricted to the four cardinal directions the runtime actually
selects (`designLocks.heroRuntimeDirections = 4`). **Author left and right separately — do not
mirror one to make the other**, exactly as her sheet does, so handedness of a staff, a rope or a
pipe stays consistent.

**Shared foot baseline across all twelve cells.** The feet must sit on the same row in every
cell or the NPC will bob when it turns. This is the single most common defect in this format.

The magenta is load-bearing — it gets chroma-keyed to RGBA. **No pure magenta anywhere in the
artwork**: not in a shawl, a flower, a sash, a shadow.

## STYLE BLOCK — embed verbatim, from `design/ART-DIRECTION.md`
> Detailed 16-bit cel-shaded pixel art in the SNES Dragon Quest tradition (DQ3/DQ5/DQ6): bold
> dark outlines, warm saturated colors, clean 2-tone cel shading with a single top-left light
> source, readable silhouette, no anti-aliasing halos, transparent background.

Plus, from the same doc's locked rules:
- **Faux-pixel cel rendering** — chunky pixel-textured strokes, crisp edges, no soft gradients or
  airbrushing. Bold near-black (not pure `#000`) outline around the full silhouette.
- **Chibi JRPG proportions — CORE, non-negotiable.** Big head, compact rounded body, short limbs,
  roughly 2–3 heads tall. Match the heroine's proportions precisely.
- **Stepped cel shading**, 2–4 tones per hue. One dominant hue family plus 1–2 accents each.
- **Kid-friendly, never babyish.** Bright, readable, warm — SNES Dragon Quest, Toriyama tradition.
- 3/4 top-down field perspective, consistent with the heroine.

## THE FOUR IDENTITIES
Each must be distinguishable from the other three **by silhouette alone**, and none may read as
the heroine — she has a high brown ponytail, silver-grey armour, a cobalt cape, sword and shield.
**No NPC carries a sword, a shield, or a cape.**

**1. Healer** — female, runs the herbalist's porch on the square. Warm domestic apothecary, not a
temple priestess: simple long dress in soft green or cream with an apron, sleeves pushed up, hair
tied back in a kerchief or bun. Carries or wears something herbal — a bundle of dried herbs at
the belt, a small clay bottle, a basket. Kind, practical, middle-aged. Her dominant hue is
**herb green**.

**2. Sailor** — male, a young deckhand on the quay, superstitious and talkative. Rolled canvas
trousers, a horizontally striped shirt (blue/cream), bare forearms, a knitted cap or head
scarf, a coil of rope over one shoulder. Wiry and a bit scruffy. Dominant hue **sea blue**.

**3. Wise Woman** — female, the quest-giver, an elder. Long layered robe with a shawl or hood
worn back off the head, grey hair, a **wooden staff** (her clearest silhouette cue), maybe a
pendant. Dignified and calm — a village elder, not a witch: no pointed hat, no cauldron, no
warts. Dominant hue **deep violet or dusty plum**, which no other NPC uses.

**4. Captain Drake** — male, the ship's captain, broad and weathered and cheerful. Long navy coat
with turned cuffs, a **captain's hat**, a full beard, a wide belt, boots. The biggest and
broadest silhouette of the four. Dominant hue **navy** with brass/gold accents.

## Forbidden
- No text, labels, numbers, letters, UI, borders, frames, grid lines, or drop shadows on the
  magenta.
- No mirroring left to make right.
- No pure magenta in the artwork.
- No swords, shields or capes. No realistic/western-fantasy proportions — chibi, always.
- No anti-aliasing halos against the magenta; keep edges crisp so the key is clean.

## Return
For each of the four: absolute path, exact dimensions, confirmation of the 3x4 cell layout, that
left and right were authored separately, that the foot baseline is shared across all twelve
cells, and that the background is pure magenta with none in the artwork. Then one line on how the
four read against each other by silhouette.

If after 8 generation calls the proportions still do not match the heroine anchor, STOP and
report rather than shipping a set that does not belong to her world.
