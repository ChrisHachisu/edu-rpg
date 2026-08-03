# Task: Port Sapphire NPC sheets, v2 — same four characters, WRONG FINISH, fix the finish only

Repo: /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data

The four NPCs at `design/act1-towns/npc/portSapphire-*-4x3-64.png` were rejected by the owner:
*"the npc sprites don't actually match how the hero looks like. the crispness looks different."*

**The characters, the layout, the poses and the colours were all right. Only the RENDERING
FINISH is wrong, and it is wrong in one specific, measured way.**

## THE ONE DEFECT — a hard black keyline the heroine does not have

The previous brief told you to draw a *"bold near-black outline around the full silhouette."*
**That instruction was wrong and is hereby withdrawn.** It was copied out of
`design/ART-DIRECTION.md`'s STYLE BLOCK, which describes the **128px battle-monster set** — a
different asset family. The Act 1 field heroine, who is the actual anchor, has no such outline.

Measured, on the silhouette's outermost opaque pixel ring against each sprite's own mean body
luminance:

| sprite | body L | edge ring L | step |
|---|---|---|---|
| **heroine (the target)** | 87 | 70 | **-17** |
| your healer | 114 | 19 | -95 |
| your wisewoman | 81 | 14 | -67 |
| your sailor | 82 | 20 | -62 |
| your drake | 67 | 6 | -61 |

**Target: the edge ring must sit within about 20 luminance of the body, not 60-95 below it.**

Concretely:
- **No black keyline. No near-black keyline. No uniform dark contour of any kind** tracing the
  silhouette.
- The edge is defined by the **form's own colour going a shade or two darker** where it turns
  away from the light — the same way the heroine's pauldron, skirt and ponytail are defined.
- Where a dark accent genuinely belongs — a boot sole, the shadow under a hat brim, a belt — it
  is a *material*, sitting where that material is, not a ring around the whole character.
- Internal shapes are likewise separated by **value and hue**, not by drawn black lines.
- Silhouette edges are **softly anti-aliased into the background**, exactly as the heroine's
  are. Do not draw a hard 1px cut. She measures roughly 13 partially-transparent edge pixels per
  100 opaque pixels; yours measured under 1. Match hers.

Everything below this line is unchanged from the brief that produced the right characters.

## THE ANCHOR — open it and match its finish, not just its size
`public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png`
`192 x 512` RGBA, 24 native `64 x 64` cells, 3 columns x 8 rows, shared foot baseline.
Her look: **smooth faux-pixel illustration** — chunky pixel-textured strokes, crisp *forms*, but
soft painterly transitions and NO contour line. `design/ART-DIRECTION.md` calls this the locked
"original smooth faux-pixel look ... NOT grid-true pixel art", and forbids grid quantization.
There is precedent for this correction in the same doc: the 2026-08-01 dungeon-prop amendment
drops the cel/outline contract for the same reason, because it made props read as stickers.

Match her pixel density and finish exactly. She is also the SCALE reference.

## Output — one file per NPC, exact dimensions, overwrite the existing files
| file | who |
|---|---|
| `design/act1-towns/npc/portSapphire-healer-4x3-64.png` | Healer |
| `design/act1-towns/npc/portSapphire-sailor-4x3-64.png` | Sailor |
| `design/act1-towns/npc/portSapphire-wisewoman-4x3-64.png` | Wise Woman |
| `design/act1-towns/npc/portSapphire-drake-4x3-64.png` | Captain Drake |

Each **`192 x 256` RGB** on a **pure magenta `255,0,255`** field. Twelve `64 x 64` cells,
**3 columns x 4 rows**:
- **Columns:** `0` idle/neutral, `1` leading-foot contact, `2` opposite-foot contact.
- **Rows:** `0` down (toward camera), `1` left, `2` right, `3` up (away).

**Author left and right separately — never mirror one to make the other**, so the handedness of
a staff, a rope or a pipe stays consistent.

**Shared foot baseline across all twelve cells.** The previous set achieved this perfectly —
every cell bottomed out at row 58. Keep that.

No pure magenta anywhere in the artwork. Keep edges clean enough to key, but softly
anti-aliased rather than hard-cut — the keyer despills the ramp.

## Style — the locked rules that still apply
- **Chibi JRPG proportions, CORE and non-negotiable.** Big head, compact rounded body, short
  limbs, ~2-3 heads tall. Match the heroine precisely.
- **Stepped shading, 2-4 tones per hue.** One dominant hue family plus 1-2 accents each.
- Warm, bright, readable. SNES Dragon Quest / Toriyama tradition, kid-friendly, never babyish.
- Single top-left light source.
- 3/4 top-down field perspective, consistent with the heroine.
- **No grid quantization.**

## THE FOUR IDENTITIES — keep these, they were approved
Each distinguishable from the other three **by silhouette alone**; none may read as the heroine
(high brown ponytail, silver-grey armour, cobalt cape, sword, shield).
**No NPC carries a sword, a shield, or a cape.**

1. **Healer** — female, herbalist's porch. Long simple dress in soft green or cream with an
   apron, sleeves pushed up, hair tied back in a kerchief. Dried herbs at the belt, a small clay
   bottle, a basket. Kind, practical, middle-aged. Dominant hue **herb green**.
2. **Sailor** — male, young deckhand. Rolled canvas trousers, horizontally striped blue/cream
   shirt, bare forearms, knitted cap, a coil of rope over one shoulder. Wiry, slightly scruffy.
   Dominant hue **sea blue**.
3. **Wise Woman** — female elder, the quest-giver. Long layered robe, shawl or hood worn back off
   the head, grey hair, a **wooden staff**, a pendant. A dignified village elder, not a witch: no
   pointed hat, no cauldron. Dominant hue **deep violet / dusty plum**, used by no one else.
4. **Captain Drake** — male, broad, weathered, cheerful. Long navy coat with turned cuffs, a
   **captain's hat**, full beard, wide belt, boots. The biggest, broadest silhouette of the four.
   Dominant hue **navy** with brass accents.

## Forbidden
- **A black or near-black outline around the silhouette. This is the whole point of v2.**
- No text, labels, numbers, letters, UI, borders, frames, grid lines, drop shadows on the magenta.
- No mirroring left to make right. No pure magenta in the artwork.
- No swords, shields, capes. No realistic/western-fantasy proportions.

## Return
For each of the four: absolute path, exact dimensions, the 3x4 layout confirmed, left and right
authored separately, the shared foot baseline row, and — the acceptance number — **the measured
mean luminance of the outermost opaque pixel ring versus the mean body luminance, which must
differ by roughly 20 or less, not 60+.** Report both numbers per sprite.

If after 8 generation calls the edge step is still worse than about -30, STOP and report rather
than shipping another outlined set.
