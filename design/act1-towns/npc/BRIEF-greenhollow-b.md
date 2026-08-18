# Task: Greenhollow NPC walk sheets, batch B — three characters, matching the attached Act 1 heroine

Greenhollow is a small **inland fenced village** in a green hollow, with a stream and a fishing
pond: split-rail fences, vegetable plots, thatch. These stand in the same town screen as the player
and must look like they came from the same hand as she did.

## THE ATTACHED IMAGES ARE THE CONTRACT

- `hero-act1-female-walk-8x3-64-g3.png` — the Act 1 heroine. **The style, proportion, density and
  scale anchor.** Match her exactly.
- `portSapphire-sailor-4x3-64.png`, `portSapphire-drake-4x3-64.png` — two ACCEPTED NPC sheets from a
  neighbouring town, in the exact layout you are producing. Match their finish.

## THE FINISH RULE — the one thing a previous batch got wrong and was rejected for

The owner rejected an earlier set on sight: *"the npc sprites don't actually match how the hero
looks like. the crispness looks different."* The cause was a **bold near-black outline around the
full silhouette**, copied from a style guide written for a different asset family (128 px battle
monsters). The Act 1 field heroine has **no keyline at all**.

- **No black keyline. No near-black keyline. No uniform dark contour of any kind** tracing the
  silhouette, at any width.
- The edge is the **form's own colour going a shade or two darker** where it turns away from the
  light — exactly how the heroine's pauldron, skirt and ponytail are defined.
- Where a dark accent genuinely belongs — a boot sole, the shade under a hat brim, a belt — it is a
  **material**, sitting where that material is, not a ring around the whole character.
- Internal shapes are separated by **value and hue**, not by drawn black lines.
- Silhouette edges are **softly anti-aliased into the magenta**, as the heroine's are. No hard 1 px
  cut.

Measured: the outermost opaque pixel ring must sit within about 20 luminance of the mean body
luminance. The rejected batch measured 60 to 95 below it. This is checked mechanically.

## Layout — one PNG per character

Each image is a **3 columns x 4 rows grid of twelve walk frames**, on a **flat pure magenta
(255, 0, 255)** field.

- **Rows, in this order:** `0` down / toward camera, `1` left, `2` right, `3` up / away.
- **Columns:** `0` leading-foot contact, `1` passing pose, `2` opposite-foot contact.
- Twelve equal cells. Every character drawn at the **same size in all twelve cells**, feet on a
  shared baseline, each figure centred in its own cell.
- **Clear magenta gutters between every row and column, and a magenta margin around the whole
  grid.** Nothing may touch another cell or the image border. The gutters are load-bearing: the
  grid is cut apart automatically by finding them.
- **Author left and right separately — never mirror one to make the other**, so the handedness of a
  hoe, a tray or a fishing rod stays consistent.
- No pure magenta anywhere in the artwork: not in a scarf, a flower, a sash, a shadow.
- No text, labels, numbers, letters, borders, frames, grid lines, ground, or drop shadows on the
  magenta.

## Style — locked

- **Chibi JRPG proportions, CORE and non-negotiable.** Big head, compact rounded body, short limbs,
  roughly 2–3 heads tall. Match the heroine precisely.
- **Smooth faux-pixel illustration** — chunky pixel-textured strokes, crisp forms, soft painterly
  transitions, NO contour line. Not grid-true pixel art; no grid quantization.
- **Stepped shading, 2–4 tones per hue.** One dominant hue family plus one or two accents each.
- Single top-left light source. 3/4 top-down field perspective, consistent with the heroine.
- Warm, bright, readable. SNES Dragon Quest / Toriyama tradition. Kid-friendly, never babyish.

## THE THREE CHARACTERS

Each must be readable from the others **by silhouette alone**, and none may read as the heroine
(high brown ponytail, silver-grey armour, cobalt cape, sword, shield).
**No NPC carries a sword, a shield, or a cape.**

**1. VILLAGER, THE FARMHAND** — `greenhollow-villager1`. A **young woman** who works the village
plots. Pale butter-yellow shirt with the sleeves rolled to the elbow under **earth-brown** dungarees,
twin brown braids, a broad-brimmed straw hat pushed back on her shoulders by its cord, and a
**long-handled hoe carried over one shoulder** — that hoe is her silhouette cue. Sturdy, sunny,
sun-freckled. Dominant hue **earth brown with butter yellow**.

**2. VILLAGER, THE BAKER** — `greenhollow-villager2`. A **round cheerful man**, the village baker.
A **slate-blue** shirt with the sleeves pushed up under a long **cream apron** dusted with flour,
bald on top with a fringe of dark hair and a short moustache, and a **wide wooden tray of round
loaves carried level in both hands** in front of him. The widest silhouette of the three. Dominant
hue **cream and slate blue**.

**3. THE FISHERMAN** — `greenhollow-fisherman`. A **weathered older man** who works the village
pond. **Moss-green** oilskin coat over tan waders folded at the knee, a soft wide-brimmed hat, a
grey stubbled chin, a **fishing rod carried over one shoulder** and a woven creel basket on his hip.
Lean, unhurried, squinting. Dominant hue **moss green with weathered tan**.

## OUTPUT — exactly three PNG files, at these exact paths

    OUTDIR/raw-greenhollow-villager1.png
    OUTDIR/raw-greenhollow-villager2.png
    OUTDIR/raw-greenhollow-fisherman.png

Write each at the generator's **native output resolution**. Do **NOT** resize them, do NOT upscale
them, do NOT posterize, do NOT sharpen, do NOT quantize the palette, do NOT convert to indexed
colour. They are reduced to the shipping size by a separate deterministic step, and any resampling
you do first destroys that.

Write nowhere else. Do not write into any directory containing the word `handoffs`. Do not delete
the files. Generate the three images; do not analyse or verify them afterwards. Then print the three
absolute paths, one per line.
