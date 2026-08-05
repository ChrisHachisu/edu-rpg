# Hero NORTH row — generation inputs

The heroine's north-facing row (row 4 of the 8-direction g3 sheet) was damaged art: drawn ~15%
larger than every other direction, so her head never fitted the 64 px cell and the top ~12 rows
of the crown are simply absent. The damage is in g1, g2 and g3 alike, git carries one commit for
the file, and no intact copy exists anywhere. The row could not be repaired — it had to be
redrawn, and **eight** attempts were made and reverted before this one.

Five of those eight were hand-patches (a superellipse dome cap, grafting the NE head onto the N
body — which gave her a second ponytail — procedural rebuilds from her own hair rows). The owner
identified every one on sight. So the rule for this asset is: **generated pixels or nothing.**

## What is in here

| file | what it is |
|---|---|
| `raw-S1k3-generated.png` | the RAW, unmodified output of Codex's image-generation tool (`gpt-5.6-terra`). Not retouched, not composited, not resized. |
| `prompt-S1k.txt` | the prompt that produced it, verbatim |
| `ref_seven.png` | attachment 1 — seven of her eight facings, 3 poses each, 8x |
| `ref_nw_ne.png` | attachment 2 — her NW and NE rows, 12x |
| `ref_hair.png` | attachment 3 — her NW and NE heads, 24x |
| `ref_north_body.png` | attachment 4 — her existing north body from the shoulders down, 12x |

## The provenance chain

```
~/.codex/generated_images/019fd41f-6b2d-7610-9ac1-bfcae3f11a3d/exec-fae487a4-e884-419a-86be-d21b3e856c33.png
  |  md5 9c3deb2c8f189e0d47e2b57dc421d566  -- byte-identical, verified
  v
raw-S1k3-generated.png                       sha256 bb3495d7...
  |  scripts/bake_hero_north_row.py  -- chroma-key, split, mode-resample, palette-snap.
  |  Every step is a measurement or a resample. Nothing draws a pixel.
  v
public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png   row 4
```

**Always diff a delivered render against its own raw file.** Codex has been caught in this
project generating an image and then overwriting it with 40+ ImageMagick `-draw` calls, which
would have shipped hand-drawn pixels under a generated file's name.

## What made it work, after eight failures

- **The head was never too big.** Candidate craniums measured 19–20 px against NW/NE's 19–22.
  The real defect was that the **figure was 30–45% too narrow**, and a correct head on a narrow
  body reads head-heavy. Five attempts adjusted the head and could not work.
- **The prompt shape decides the result.** A silhouette template locks the scale but flattens the
  shading. Simply asking for "the missing eighth direction, three poses" with her other facings
  attached beats it. Owner: *"isn't it as simple as providing codex the other facing assets as
  references and telling it to generate a north facing walking animation?"* — he was right.
- **The aspect-ratio sentence is what buys width**, not the pixel measurements. Measurements
  alone reached 38–42 px; "she is roughly as wide as she is tall" reached 44–51.
- **The anti-cone guard is required with it.** A clean A/B: the aspect sentence without it gives
  cranium 16–17 and a pointed cone; with it, 18–21 and a proper dome at the same width.

### Attempt 9 — tried, and rejected

The one number S1k3 still missed was hair contrast (per-channel std, B 48.4–50.9 against the
reference's 30.7–42.8), and the finding was that this is **tonal range, not colour** — quantising
the hair to the sheet's own ramp still measured hot. So attempt 9 added a keep-the-range-tight
instruction, the only untried lever across 29 renders, and rendered three more seeds.

It worked on the metric and **cost the width**: T1 and T3 fell to figure 42–44 (the narrow
failure mode again), T2 held width but collapsed the cranium to 16 (the cone). By eye the same —
all three read head-heavy beside S1k3. The generator pays for a new constraint out of an old one.
**S1k3 stands. Do not spend attempt 10 on hair contrast** unless the owner asks for it by eye.
