# Task: Greenhollow fisherman walk sheet, v2 — redraw, the props were too thin to survive 64 px

The first attempt is rejected for ONE reason, and everything else about it was right.

## THE DEFECT — a long thin fishing rod

He was drawn holding a long fishing rod that tapers to a one-pixel line and reaches out into empty
background, with a hanging float on a thread. These sheets are reduced to a **64 pixel** game frame.
At that size a rod three pixels wide becomes a **half-pixel smear that keys out as a pink streak**,
and the float becomes loose specks floating beside him. It reads as damage, not as fishing tackle.

**So: no long rod, no line, no float, no thread, no thin dangling anything.** Nothing that leaves the
body silhouette on a stalk. Every object he carries must be **chunky and held close to the body**,
its narrowest part no thinner than about one twelfth of his height.

Replace the rod with tackle that is solid at a glance:
- a **fat woven creel basket** on his hip, and
- a **short, thick wooden gaff or a rolled net bundle** gripped in his fist, no longer than from his
  hand to his shoulder, held **vertically against his body**, not angled out into space.

He may also simply carry a **plump fish** by the tail in his free hand. A fish reads instantly at
64 px where a rod does not.

## Everything else about the character is unchanged and was approved

`greenhollow-fisherman`. A **weathered older man** who works the village pond of Greenhollow, an
inland fenced village. **Moss-green** oilskin coat over tan waders folded at the knee, a soft
wide-brimmed hat, a grey stubbled chin. Lean, unhurried, squinting. Dominant hue **moss green with
weathered tan**. Keep him a touch **brighter and warmer** than the first attempt — he came out dark
enough to muddy against grass.

## THE ATTACHED IMAGES ARE THE CONTRACT

- `hero-act1-female-walk-8x3-64-g3.png` — the Act 1 heroine. **The style, proportion, density and
  scale anchor.** Match her exactly.
- `portSapphire-drake-4x3-64.png` — an ACCEPTED NPC sheet in the exact layout you are producing.
  Note how everything he carries is thick and attached to the body. Match his finish.

## THE FINISH RULE

The Act 1 field heroine has **no keyline at all**.

- **No black keyline. No near-black keyline. No uniform dark contour of any kind** tracing the
  silhouette, at any width.
- The edge is the **form's own colour going a shade or two darker** where it turns away from the
  light.
- Where a dark accent genuinely belongs — a boot sole, the shade under a hat brim, a belt — it is a
  **material**, sitting where that material is, not a ring around the whole character.
- Internal shapes are separated by **value and hue**, not by drawn black lines.

## Layout

A **3 columns x 4 rows grid of twelve walk frames**, on a **flat pure magenta (255, 0, 255)** field.

- **Rows:** `0` down / toward camera, `1` left, `2` right, `3` up / away.
- **Columns:** `0` leading-foot contact, `1` passing pose, `2` opposite-foot contact.
- Twelve equal cells, same size in all twelve, feet on a shared baseline, each figure centred in its
  own cell.
- **Clear magenta gutters between every row and column, and a margin around the whole grid.**
- **Author left and right separately — never mirror one to make the other.**
- No pure magenta anywhere in the artwork. No text, labels, borders, grid lines, ground, or drop
  shadows on the magenta.

## Style — locked

- **Chibi JRPG proportions**: big head, compact rounded body, short limbs, 2–3 heads tall. Match the
  heroine precisely.
- **Smooth faux-pixel illustration** — chunky pixel-textured strokes, crisp forms, soft painterly
  transitions, NO contour line. No grid quantization.
- **Stepped shading, 2–4 tones per hue.** Single top-left light source. 3/4 top-down field
  perspective. Warm, bright, readable, SNES Dragon Quest tradition.
- No sword, no shield, no cape.

## OUTPUT — one PNG, at this exact path

    OUTDIR/raw-greenhollow-fisherman.png

Write it at the generator's **native output resolution**. Do NOT resize, upscale, posterize, sharpen,
quantize or index it. Write nowhere else. Do not write into any directory containing the word
`handoffs`. Generate the image; do not analyse or verify it afterwards. Then print the absolute path.
