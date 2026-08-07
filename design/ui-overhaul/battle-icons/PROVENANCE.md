# Battle command icon source

Owner, 2026-08-07, on the shipped line-drawn set: *"actually i think the battle command icons look
a bit too flimsy. i want them to be redone and made to look more solid. give me a few candidates
and show me in a mockup so i can compare them."* Three candidates were built into
`design/mockups/battle-icons-solid.html`, and on that mockup he chose: **"for the icons i like the
Struck Relief"**.

**Struck Relief is candidate B, and B is what ships.** Filled bodies with the interior detail
knocked out as negative space: a fuller down the blade, a boss ring and a chevron seam in the
shield, a stopper seam and a liquid line in the bottle, a sole seam and a heel line in the boot.

This decision **overrides the previous brief's own recommendation.** The round's write-up
recommended C, Forged Line, because C is the only candidate whose stroke is still a stroke and it
lands nearest the tab family it used to match. The owner picked B. That is not a tie to be broken
later by measurement, and the shipped sheet must not be quietly nudged toward C because C prices
better against the tabs. The full candidate round, prompts, raw generations and machine records
are preserved in [`solid/`](solid/PROVENANCE.md).

## The shipped source

| | |
|---|---|
| generator | `codex exec -m gpt-5.6-terra` |
| codex session | `019fdb7e-b927-74a3-a6ad-dbbf8eba1718` |
| generated file | `~/.codex/generated_images/019fdb7e-b927-74a3-a6ad-dbbf8eba1718/exec-f788e7f4-81f7-4e4c-abdb-28bccb44e55b.png` |
| md5 | `0647844c979a471a6177e2918490f923` |
| `solid/source-b-struck-relief.png` here | **byte-identical** to the generated file (`cmp` clean) |
| prompt | `solid/prompt-b-struck-relief.txt`, verbatim as sent |
| images that session emitted | 2; this is the second, adopted by mtime and md5-proved, not by filename |

The md5 check is not ceremony, and this round proved it twice over. The runs left three
uninvited files in this folder that nobody asked for and none of which was adopted; one of them
was **1783x882** where every image the generator actually emitted is 1774x887, so it was not
written by the image generator at all but post-processed afterwards. Nothing about it looks wrong
on inspection. It is caught by arithmetic or not at all. Every session also emitted two or three
frames, so "the newest png" and "the last filename" are both arbitrary — the adopted frame is
named by md5 above and nothing else.

**Nothing was hand-drawn, retouched or redrawn.** Every transformation between that raw file and
`public/ui-icons/battle-icons.png` lives in `scripts/build_battle_icons.py` and is reproducible by
one command.

## Why B, over A and C

Three genuinely different routes to "solid", not three weights of one idea, all shown to the owner
at true size in the same bar in `design/mockups/battle-icons-solid.html`.

| | route | what it is | outcome |
|---|---|---|---|
| A | **Cast Iron** | Filled silhouettes. No outline, no interior, no negative space at all. | not chosen |
| **B** | **Struck Relief** | Filled bodies with interior detail knocked out. Reads as one mass at a glance and keeps some drawn character. | **CHOSEN by the owner** |
| C | **Forged Line** | The old construction with a much heavier pen. Still a hollow line drawing. | not chosen (and was the write-up's recommendation) |

Measured on each set's own source pixels by this repo's own estimator, so no candidate can look
better by being measured differently:

| set | attack | defend | item | flee | ink share | vs the 5.91-6.67% tab band |
|---|---|---|---|---|---|---|
| A Cast Iron | 18.31% | 51.09% | 43.22% | 20.51% | 44% | 5.3x heavier |
| **B Struck Relief, SHIPS** | **13.55%** | **21.92%** | **24.15%** | **14.36%** | **41%** | **2.9x heavier** |
| C Forged Line | 10.55% | 11.19% | 10.45% | 9.64% | 27% | 1.7x heavier |
| the superseded line set | 5.57% | 6.09% | 6.24% | 6.10% | 16% | matches |

**Read the ink-share column, not the stroke column.** The stroke estimator infers a pen width from
ink area over edge length. That is meaningful for a line drawing and meaningless once a shape is
filled, where it reports body mass instead — A's shield "stroke" of 51% is not a pen, it is a solid
shield. Ink share, the proportion of each glyph's own bounding box that is opaque, is what actually
ranks the four sets by solidity.

**"Solid" and "matches the tab bar" are the same dial pulled in opposite directions.** The old set
was not defective; it was calibrated to the bottom tab family's measured 5.91-6.67% stroke band and
landed inside it, which at 22px is a hairline. Shipping B deliberately breaks that match. The
battle bar is the primary combat control and now reads heavier than the navigation chrome on
purpose. Panel 4 of `proof.html` puts the two strips one above the other so the weight being
accepted is visible rather than argued.

## What the generator got wrong: a green screen, which a luminance key cannot see

**The chequerboard did not come back.** Seven generations now on a brief that names it as the thing
not to do, and none has painted one. `hasAlpha: no` as always — it still cannot emit a transparent
canvas.

It answered the background instruction **two different ways in the same hour.** Candidate C came
back on flat near-black as asked. **A and B came back on a green screen** — and B is what ships.

Neither is a chequerboard, so both look fine to a human opening the file. That is the trap. A
luminance ramp cannot key green: pure green sits at luminance ~150, squarely inside the shipped
40..190 ramp, so keying B on luminance renders the background at **75% opacity** — a solid slab with
faint icons floating in it. It would not have looked like a keying bug. It would have looked like
the art was bad, and the art would have been blamed and re-rolled.

`build_battle_icons.py` therefore **detects** the background from the four corners rather than
assuming it: `G - max(R, B)`, median of the corners, measured 203 on the green sources and 0 on
every dark one. Above 60 it keys on chroma (exact at pure green and at pure white, linear across
the antialiased edge); below, it falls through to the shipped luminance path unchanged. The
detection was written for the candidate round and moved into the shipping builder on promotion, so
there is one keyer and not two — `solid/build.py` now calls it rather than keeping a copy.

That the shipped sheet is byte-identical to `solid/b-struck-relief-mask.png` is the check that the
promotion changed nothing: the pixels shipping are the pixels the owner compared.

## The constraints that survived the swap

**It is still a tintable alpha mask, white on transparent.** This is the one hard requirement.
Gilded Rail has no coloured button blocks, so each command's colour lives entirely in its glyph
tint — Attack reads ruby, Defend reads sky, and the selected cell inverts to charcoal on the gold
plate. Verified on the shipped file: RGB is 255,255,255 at every pixel where alpha is non-zero, and
alpha is exactly 0 in all four cell corners and around every cell's 2px frame. Baked-colour art
would break the HUD outright.

**Attack stays distinguishable from the tab bar's Equip sword.** The anchor's Equip sword is
vertical, point-up, a narrow parallel-sided outline blade with a straight bar crossguard and a
small round pommel. This one differs on five counts, all specified in the brief and all preserved
by the fill: **diagonal**, a **broad leaf-shaped blade**, a **swept crescent crossguard**, an **open
ring pommel**, and now a **solid body** against the anchor's hollow one. No motion of any kind is in
the glyph — no arc, no speed lines, no impact marks. Panel 4 of `proof.html` stacks the two bars.

**Flee keeps its three speed lines,** as solid tapered bars outside the boot.

## Review artefacts in this folder

| file | what it is |
|---|---|
| `solid/source-b-struck-relief.png` | the shipped raw four-up sheet, byte-identical, `cmp` clean |
| `solid/` | the whole candidate round: all three raws, prompts, records, masks and its own PROVENANCE |
| `contact-sheet.png` | the four glyphs for one-glance approval, emitted by the build script |
| `proof.html` | the true-size proof page; loads the SHIPPED css and png, not copies |
| `proof-truesize-dpr3.png` | that page captured at 390 CSS px, deviceScaleFactor 3 |
| `source-generated.png`, `source-generated-attack.png` | the SUPERSEDED line set's raws, kept: `proof.html`'s before/after row is rebuilt from them at capture time rather than archived as a fifth binary |

The contact sheet shows each glyph at 96px **over** the same glyph at 21px. The small row is the
one that decides it: art that reads at 4x and mushes at 21px has passed a review it should have
failed.

## Rebuilding

```
python3 scripts/build_battle_icons.py \
    --src design/ui-overhaul/battle-icons/solid/source-b-struck-relief.png
node   scripts/capture_battle_icon_proof.cjs
python3 scripts/regenerate_pins.py
./scripts/build-dist.sh && ./scripts/ship-gate.sh .
```

No `--replace`: all four glyphs come off one sheet, so the family scale means what it is supposed
to mean and every glyph is drawn with one pen at one relative size.

---

# History: the superseded line-drawn set

Kept because the reasoning still binds — the anchor, the distinctness requirement and the
calibration behaviour all carried into the round above. The set itself no longer ships.

Owner, 2026-08-07, earlier the same day: *"i saw the mockups. A looks the best. please have codex
generate new and better icons for that screen and swap them with the better ones with the old
ones."* Variant A is **Gilded Rail** (`design/mockups/battle-command-selector.html`), which is what
made a tintable mask the requirement in the first place.

| | |
|---|---|
| generator | `codex exec -m gpt-5.6-terra` |
| codex session | `019fd9e8-afd9-7402-b5f9-d805f01445b8` |
| md5 | `5c6d3ab80f0e7ffa4e168eb14ac59451` |
| `source-generated.png` here | **byte-identical** to the generated file (`cmp` clean) |

## The style anchor

Not `design/ART-DIRECTION.md`. That document's STYLE BLOCK describes the 128px battle-MONSTER
family, and the doc itself warns it has already mis-driven three generations by being pasted where
it did not belong. This is UI chrome.

The anchor is the **bottom tab icon family** (`design/ui-overhaul/tab-icons/`, shipped as
`public/ui-icons/tab-icons.png`), which came from the owner's near-identical request the night
before. Both the gold-tinted shipped sheet and the raw generated sheet were attached to every
generation call as reference images, and the style description in the brief was **measured off
those pixels** rather than copied from any document:

| property | measured on the anchor |
|---|---|
| construction | monoline outline only, no fills, no shading, no gradients |
| stroke weight | uniform within and across glyphs |
| stroke / optical size | **5.91% – 6.67%** |
| caps and joins | round |
| glyph fill of cell | ~78%, centred |
| detail count | 3–7 strokes per glyph |

The Struck Relief set keeps the anchor's SUBJECTS, composition and order, and deliberately leaves
its construction and its stroke band behind.

## Candidates, runs 1 to 3

| run | codex session | md5 | stroke / optical | verdict |
|---|---|---|---|---|
| 1 | `019fd9e0-a6a1-7162-a639-bef5a1623822` | `2941b922fcf79d8a63957c3451a97e44` | 4.10 – 4.71% | REJECTED — ~30% under the anchor. At 21px the blade and the slash arc blur into one grey smear. |
| 2 | `019fd9e4-b3b5-7473-b5ab-8b1d71b742f8` | `d6d13cf13f8bef0da940e94280781c42` | 7.15 – 8.58% | REJECTED — ~28% over. The potion's stopper closes up, the shield's boss stops reading as a ring. |
| **3** | **`019fd9e8-afd9-7402-b5f9-d805f01445b8`** | **`5c6d3ab80f0e7ffa4e168eb14ac59451`** | **5.92 – 6.24%** | CHOSEN then; superseded by Struck Relief. |

Run 3's brief carried the two previous measurements back to the generator as explicit calibration
("attempt 1 was 4.4%, attempt 2 was 8.1%, aim for 6.3%"), which is why it landed first try. The
rejected runs were regenerated, not fixed.

## Attack was replaced after owner review — runs 4 to 7

Owner, on the true-size proof: *"icons look better but the motion on the sword looks unnatural so
it can just be a sword."* The set was accepted; only the Attack glyph's slash arc was rejected, so
**one cell was regenerated, not all four**, via `--replace attack=<png>`.

| run | codex session | md5 | stroke / optical | verdict |
|---|---|---|---|---|
| 4 | `019fd9f9-3085-7633-8213-4f3ef46b02a2` | `aef43348796592d07c242c7fb5a5e55f` | 4.62% | REJECTED — composition right, stroke a quarter too light. |
| 5 | `019fd9fa-87d8-7bb1-8cf9-6a519f86d523` | `a18433366b642f865e57e5b885167824` | 5.04% | REJECTED — asked for a third thicker, moved a tenth. |
| **6** | **`019fd9fc-d89d-7833-ad51-6af866c8d1e1`** | **`5c2ada8ff54c3aa5eadd3cdfb574c3c0`** | **5.56%** | CHOSEN then; superseded. |
| 7 | `019fd9fe-49cc-73d3-8fd9-4ef6cc3e6794` | `122ae012161b566412196253384c393b` | 4.72% | REJECTED — asked for 62px, went *backwards*. This is where the loop was stopped. |

**The calibration loop that worked for runs 1–3 did not converge here: 4.62 → 5.04 → 5.56 → 4.72.**
Numeric feedback moved the generator about half as far as asked each time and then oscillated, even
when the target was restated in absolute canvas pixels. The same "moves about half as far as asked"
behaviour showed up again in the solid round, where C was asked for 12% and delivered 10.5%.

`replace_scale()` in the build script survives from this episode and is still the right answer if a
single cell ever has to be regenerated again: a separately generated glyph cannot use the family
scale — that factor only means anything within one sheet — so a replacement is scaled to match the
family's **output stroke** instead, which is the property the family scale existed to protect.

## The splitter divergence, which still applies

The tab build cut the sheet on **every** empty gutter and asserted it found exactly four columns.
`flee` is a boot with speed lines trailing behind it, and the gap between the lines and the boot is
a genuine empty column, so that splitter finds five and aborts on art that is correct. The battle
build ranks gutters by width and cuts on the widest three instead — on the Struck Relief sheet the
cell gutters are 86–106px and the widest in-glyph gap is 0px — and it refuses to guess if that
margin ever narrows.
