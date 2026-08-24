# Brief — the shopkeeper and the healer, BRIGHTER (v3)

Owner, 2026-08-24, after playing TestFlight build 57:
*"the shopkeeper and healer needs to look more unique and use brighter and captivating colors"*

This brief covers **one character per worker**. Do only the character your dispatch names.

## THE DEFECT, MEASURED

Fifteen of the seventeen shipped NPC sheets have a dominant hue between **23 and 47 degrees** —
one single amber/rust/brown family. Only the sage (234) and the wise woman (240) sit outside it.
So "more unique" is not a vague note: the cast is monochrome and these two are in the middle of it.

| sheet | mean luminance | mean saturation | dominant hue |
|---|---|---|---|
| shopkeeper (today) | 66.6 | 0.77 | **23** rust/brown |
| healer (today) | 97.3 | 0.49 | **37** cream/olive, washed out |

`design/act1-towns/npc/final/*-shopkeeper-4x3-64.png` reads as one brown mass: rust shirt, brown
leather apron, brown hair, brown boots. `*-healer-4x3-64.png` is desaturated cream and sage and
reads beige against pale cobble.

## THIS REVERSES THE PREVIOUS ROUND, DELIBERATELY

On 2026-08-23 these two were pushed DARKER on purpose, toward the heroine's body luminance of 83
(shopkeeper landed at 77, healer at 97), under an authored 80–110 luminance band. **That band is
withdrawn for these two characters.** Brighter and more captivating is the instruction now. Do not
re-apply it, and do not "correct" the new sprite back toward the hero's luminance.

Nothing else about the finish changes. The FINISH gate below still binds, and it is about the edge,
not the colour.

## TARGET PALETTES — chosen so nothing in the cast collides

- **Shopkeeper — dominant hue ~180, bright teal/turquoise.** A saturated teal waistcoat or coat
  over a warm saffron/gold shirt, a crimson sash, polished brass scales and coin pouch. The leather
  apron shrinks to an accent, it is no longer the read. Keep his identity: the broadest, heaviest
  silhouette in the cast, moustache, brass scales, coin pouch, merchant's belt.
- **Healer — dominant hue ~150, vivid jade/mint.** A luminous jade robe with a clean warm-white
  apron and gold trim, a coral or rose kerchief, herb bundles in vivid green with violet flowers.
  Keep her identity: kerchief/hood, herbs at the belt, small clay bottle, basket, kind and practical.

### HOW "DOMINANT HUE" IS MEASURED — use `scripts/measure_npc_palette.py`

A median or modal hue is the WRONG instrument here and both redraws exposed it: hair, skin, boots,
baskets and leather carry most of a chibi sprite's pixel area at 20–40 degrees, so the median sits
in the warm family however vivid the garment is. The accepted shopkeeper reads as unmistakably teal
and still measures a median hue of 37.

The number that means anything is **how much of the character sits in a hue family nobody else in
the cast uses**, which is what `scripts/measure_npc_palette.py` prints. Measured after both redraws:

    shopkeeper   30.5% teal (165-200 deg)   every other NPC <= 1.1%
    healer       23.7% green (90-180 deg)   every other NPC <= 0.5%

Target: **at least 20% of opaque pixels in your character's own hue family**, and under 2% for
everyone else in that family. Aim mean saturation **0.55–0.80** and mean body luminance **105–140**. The shopkeeper's raw
generation landed at 90.6 and needed a post-hoc HSV value gain of 1.35 (saturation untouched) to
reach the band; that is an accepted move if the generation comes in dark, but ask for the brightness
in the prompt first. — measurably brighter than
today, still stepped and readable rather than pastel. Neither may read as the heroine (silver-grey
armour, cobalt cape, high brown ponytail, sword, shield) and neither carries a sword, shield or cape.

## THE ANCHOR — finish, proportions and scale

`public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png` (192x512 RGBA).
Smooth faux-pixel illustration: chunky pixel-textured strokes, crisp forms, soft painterly
transitions, **NO contour line**. Chibi JRPG proportions, ~2–3 heads tall, stepped shading 2–4 tones
per hue, single top-left light, 3/4 top-down field perspective, no grid quantization.

**Forbidden: a black or near-black keyline around the silhouette.** The edge is the form's own colour
a shade or two darker where it turns from the light. This rejection has already been paid for twice.

## OUTPUT

One `192 x 256` RGB sheet on pure magenta `255,0,255`: twelve `64 x 64` cells, **3 columns x 4 rows**.
Columns: 0 idle, 1 leading-foot contact, 2 opposite-foot contact. Rows: 0 down, 1 left, 2 right, 3 up.
**Author left and right separately — never mirror.** Shared foot baseline, row 58, every cell.
No pure magenta inside the artwork.

**ONE character serves all three towns.** The finished sheet is copied to all three names and the
three files must be md5-identical:
`design/act1-towns/npc/final/{millbrook,greenhollow,portSapphire}-<who>-4x3-64.png`

`design/act1-towns/npc/final/` is where the accepted sheets live. The loose sheets at
`design/act1-towns/npc/*.png` are STALE pre-2026-08-23 copies — do not read them and do not let
`bake_npc_sheets.py` default to them.

### `final/` IS A MIXED-FORMAT DIRECTORY AND RE-BAKING IT CORRUPTS SHEETS — measured 2026-08-24

Eight of the ten files in `final/` are already-KEYED RGBA, not RGB-on-magenta. Two of those
(`greenhollow-elder`, `millbrook-miller`) carry near-black RGB under alpha 0. `bake_npc_sheets.py`
keys by chroma distance to literal magenta, so on those two **nothing keys and the output is a
100%-opaque ruined sheet**; on the other six it keys to something that does not match what is
shipped. Reproduced by baking `final/` into a scratch directory and comparing:

    elder      100.0% opaque   != public
    miller     100.0% opaque   != public
    healer      60.1% opaque   != public
    kiki/sage   ~60%  opaque   != public
    shopkeeper  37.3% opaque   == public   (the only clean, re-bakeable format)

So: **never run `bake_npc_sheets.py --src design/act1-towns/npc/final`.** Put YOUR three copies in a
scratch directory, bake THAT into a scratch out-dir, and copy only your own three files into
`public/act1-hifi/town/npc/`. Your new sheet must be written to `final/` as **RGB on pure magenta**,
the format the shopkeeper now uses — that is the one the tooling actually agrees on.

### DO NOT RUN `key_landmark_sprite.py` ON A 3x4 SHEET

It is a SINGLE-sprite landmark tool. On a twelve-cell sheet it computes one contact-shadow footprint
across the whole canvas and smears a grey blob over two pose rows, and it zeroes background RGB to
(0,0,0) at alpha 0 instead of preserving magenta — which is how `millbrook-miller` got into the state
above. Step 4 of the pipeline below is therefore AMENDED: measure the edge with `key_cell()` from
`scripts/place_town_npcs.py`, the same keyer `bake_npc_sheets.py` and `check_character_finish.py`
already use, and use `scripts/defringe_sprite.py --write` only if the ring measurement shows a cast.

## PIPELINE

1. Generate ONE large raw grid with `codex exec -m gpt-5.6-sol`. Brief on **stdin**; `-i` is
   VARIADIC, so a positional prompt after `-i` is swallowed as another image path. Pass the hero
   anchor with `-i`. Say in the brief "do this yourself, one generation call, do not dispatch a
   sub-agent" — Codex sub-agents redraw the image and the newest file is often the worst one.
   Output lands in `~/.codex/generated_images/` AND next to the input; score candidates, never trust
   arrival order.
2. `scripts/fit_npc_sheet.py <RAW> <OUT> --baseline 58` — always generate large and reduce; the
   LANCZOS reduction is what produces the soft edge the gate measures.
3. `scripts/anchor_npc_sheet.py` if the baseline is not already 58.
4. Halo: see the amendment above — `key_cell()` for measurement, `scripts/defringe_sprite.py
   --write` only if needed. **A magenta pixel COUNT is blind to the halo** — magenta blended into
   the sprite reads salmon, not magenta. Measure the outermost opaque ring's mean RGB instead.
5. Copy to the three town names, then
   `scripts/bake_npc_sheets.py --src design/act1-towns/npc/final --out public/act1-hifi/town/npc`.

## CHECKS THAT CAN FAIL — report every number

- `python3 scripts/check_character_finish.py <the three sheets>` → **PASS** (edge step within 15 of
  the heroine's, soft-edge >= 40% of hers).
- Sheet is exactly 192x256, 3x4 of 64, feet on row 58 in all twelve cells.
- md5 identical across the three town copies, and `public/act1-hifi/town/npc/*-<who>-*.png` matches
  what `bake_npc_sheets.py` produced.
- Mean body luminance and mean saturation and dominant hue of the new sheet, against the table above.
  Brighter and more saturated, dominant hue at the target, is the whole point.
- Outermost opaque ring mean RGB — no pink/magenta cast.

## MECHANICS YOU WILL OTHERWISE GET WRONG

- **You cannot wait on your own background job.** A subagent never receives its own job's completion
  notification. Run every long job through `~/.claude/scripts/watch-job.sh` in the FOREGROUND, in a
  loop, with `--max-seconds 540`; **exit 4 means TIMEOUT — call it again**, 0 SUCCESS, 1 FAILED,
  2 DIED, 3 STALLED.
- `pgrep -f "codex exec"` matches the watching shell's own command line and never clears. Use
  `ps -eo pid,command | grep -E "codex exec -m|xcodebuild " | grep -v grep | grep -v SECONDS`.
- Stop and report after **eight generation calls** or **two failed retries on this one character**
  rather than shipping a worse sheet.

## RETURN

Absolute paths written, the exact numbers for every check above, the generation-call count, and any
`NEEDS-CONSULT` question. Do NOT run the repo gate, do NOT touch pins, do NOT commit — the lead does
that on the committed tree.
