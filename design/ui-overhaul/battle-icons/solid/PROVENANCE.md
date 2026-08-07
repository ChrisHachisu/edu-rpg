# Solid battle command icons: candidate round

Owner, 2026-08-07: *"actually i think the battle command icons look a bit too flimsy. i want them
to be redone and made to look more solid. give me a few candidates and show me in a mockup so i
can compare them."*

This is a **comparison round, not a swap.** Nothing here touches `public/`. The deliverable is
`design/mockups/battle-icons-solid.html`, a self-contained page that puts three candidates and the
shipped set in the same bar at the same size.

## Why the shipped set reads flimsy, and why that is not a defect

It is doing exactly what it was asked to do. The battle glyphs were calibrated to the **bottom tab
icon family**, whose stroke measures **5.91% - 6.67%** of optical size, and they landed at
5.92% - 6.24% with Attack at 5.56% ([`../PROVENANCE.md`](../PROVENANCE.md)). At 22 px that is a
hairline, and one glyph is thinner than the other three, so the set reads light and slightly
uneven.

**So "solid" and "matches the tab bar" are the same dial pulled in opposite directions.** Every
candidate below is heavier than the tab family on purpose, and adopting any of them breaks that
match. Panel 3 of the mockup exists to price that, on every candidate, beside the real tab strip.
Whether the tabs should follow, or whether the battle bar should deliberately read heavier because
it is the primary combat control, is the owner's call and is deliberately left open.

## The three candidates

Three genuinely different routes to solid, not three weights of one idea. Ordered boldest first.

| | route | what it is |
|---|---|---|
| **A** | **Cast Iron** | Filled silhouettes. No outline, no interior, no negative space. Maximum weight, maximum legibility at 22 px, furthest from the tab family. |
| **B** | **Struck Relief** | Filled bodies with interior detail knocked out as negative space: a fuller in the blade, a ring boss on the shield, a liquid line in the bottle, a sole seam on the boot. Reads as one mass at a glance and keeps some drawn character. |
| **C** | **Forged Line** | The shipped construction with a much heavier pen. Still a hollow line drawing; the smallest change of the three. |

## Runs

All three on `codex exec -m gpt-5.6-terra --skip-git-repo-check`, each with
`design/ui-overhaul/battle-icons/source-generated.png` attached as the reference image. The brief
inverts the usual anchor rule on purpose: the anchor constrains **subject and composition**, and
the prompt overrides **construction**, because the whole point of the round is to change the
construction while keeping four glyphs the owner already recognises.

| | codex session | adopted image | md5 | `cmp` |
|---|---|---|---|---|
| A | `019fdb7b-03e8-7772-ba21-c5f05b0c0bc2` | `exec-bf637521-b205-44c3-8902-9fcb985ad9cd.png` | `770d8ba0df74e01d5a7d13cdad1e6214` | clean |
| B | `019fdb7e-b927-74a3-a6ad-dbbf8eba1718` | `exec-f788e7f4-81f7-4e4c-abdb-28bccb44e55b.png` | `0647844c979a471a6177e2918490f923` | clean |
| C | `019fdb80-f6ff-7383-ae2a-80fc4c95cf66` | `exec-c5726317-85d1-418b-a0da-22c9b8fee12f.png` | `0dda64f3f2f46a0176f97d21a4779556` | clean |

Prompts are archived verbatim as `prompt-<candidate>.txt`; per-run machine records, including
every image the session emitted, are in `record-<candidate>.json`.

### One run, several images, and why the last one is only a default

Each of these sessions emitted **two or three** images, and the first version of `gen.py` took the
last one **by name**. The names are uuids, so that ordering is arbitrary: it silently adopted the
**oldest** frame for A and for C. That is the same class of error as adopting an untraceable file
from the shared `generated_images` directory, and it is invisible unless you go and look.

`gen.py` now orders by mtime and prints the other frames. But sorting correctly does not settle
the question, because the run's final frame is not automatically the best one:

- **A** was swapped to the run's final frame (`--adopt`). All three of A's frames measure within
  noise of each other; the final one draws the crossguard as a clean swept crescent and leaves no
  stray line in the blade, which is the truer answer to "pure silhouette".
- **C keeps its FIRST frame, not its last.** C's later frames drifted: the final one reached
  11.56% - 13.25% and added a **second rim line inside the shield**, which is a construction change
  the brief did not ask for. The adopted frame hits 9.64% - 11.19%, squarely in the range this
  round was aiming at, with a single-rim shield and a clean crescent guard.
- **B** already had its final frame; nothing was changed.

`gen.py --adopt <session>/<image>.png` is how a re-pick is expressed. It refuses any session other
than the one that candidate actually ran, and it md5-proves the adopted file against what codex
wrote, so the judgement is recorded without hand-copying a file into place.

## Measurements

Stroke as a percentage of optical size, measured on each set's **own source pixels** by
`scripts/build_battle_icons.py`'s own estimator, so the control cannot be made to look thin by
being measured differently. The control's numbers are re-derived from its two archived raw
generations and reproduce `../PROVENANCE.md` exactly, which is the check that the measurement path
here is the shipped one.

| set | attack | defend | item | flee | ink share | vs the 5.91-6.67% tab band |
|---|---|---|---|---|---|---|
| A Cast Iron | 18.31% | 51.09% | 43.22% | 20.51% | 44% | 5.3x heavier |
| B Struck Relief | 13.55% | 21.92% | 24.15% | 14.36% | 41% | 2.9x heavier |
| C Forged Line | 10.55% | 11.19% | 10.45% | 9.64% | 27% | 1.7x heavier |
| control, ships today | 5.57% | 6.09% | 6.24% | 6.10% | 16% | matches |

**Read the ink-share column, not the stroke column, for A and B.** The stroke estimator infers a
pen width from ink area over edge length. That is meaningful for a line drawing and meaningless
once a shape is filled, where it starts reporting body mass instead: A's shield "stroke" of 51% is
not a pen, it is a solid shield. Ink share, the proportion of each glyph's own bounding box that
is opaque, is the number that ranks all four sets by how solid they actually are.

C is the only candidate whose stroke figure is still a stroke, and it is the tightest set of the
four: 9.64% - 11.19%, a spread of 1.55 points against the control's 0.67 and A's 32.

## What the generator did this time

**The chequerboard did not come back.** Six generations now, on a brief that names it as the thing
not to do, and none has painted one. `hasAlpha: no` on all three, as always.

**It answered the background instruction two different ways.** C came back on flat near-black as
asked. **A and B came back on a green screen.** Neither is a chequerboard, so both key cleanly, but
a luminance ramp cannot key green: pure green sits at luminance ~150, in the middle of the shipped
40..190 ramp, so the shipped keyer would have rendered the whole background at about **73% opacity**
and produced a slab with faint icons in it. That would not have looked like a keying bug; it would
have looked like the art was bad.

`build.py` therefore **detects** the background from the four corners and keys accordingly: green
screens on greenness (`G - max(R,B)`, exact at both pure green and pure white, linear across the
antialiased edge), everything else through the shipped luminance path, imported unchanged.

**C undershot its stroke target, as the last round's calibration loop predicted it would.** Asked
for 12%, delivered 10.5% - the same "moves about half as far as asked" behaviour recorded in
`../PROVENANCE.md`. Here it did not matter: the target was a range, not a point, and the delivered
weight is inside it. It was not re-rolled.

### It also wrote three files into the repo, and one of them was a redraw

The runs left `battle-icons-solid-silhouettes.png`, `heavy-monoline.png` and
`generated/battle-command-icons-solid.png` in `design/ui-overhaul/battle-icons/`. Nobody asked for
them and none was adopted. All three were deleted.

They are worth recording because of what they were:

| file | traces to a generated image? |
|---|---|
| `heavy-monoline.png` | yes, byte-identical to C's adopted frame |
| `generated/battle-command-icons-solid.png` | **no** - matches none of the eight images the three sessions emitted |
| `battle-icons-solid-silhouettes.png` | **no** - and it is **1783x882** where every generated image is 1774x887 |

Different dimensions mean that last one was not written by the image generator at all; it was
**post-processed afterwards**, a white-on-transparent key of an earlier A frame. This is precisely
the behaviour `../PROVENANCE.md` warns about - Codex generating an image and then producing a
redrawn file beside it - and it is the reason the md5 check is not ceremony.

It never had a chance to be adopted here, because `gen.py` reads **only** from
`~/.codex/generated_images/<session>/` and copies out of a session directory it proved did not
exist before its own call. Any workflow that instead picked the newest png under `design/` would
have shipped the redraw. Nothing about it looks wrong on inspection; it is caught by arithmetic or
not at all.

## Files

| file | what it is |
|---|---|
| `prompt-*.txt` | the three briefs, verbatim as sent |
| `source-*.png` | the adopted raw codex output, byte-identical, `cmp` clean |
| `record-*.json` | model, session, adopted image, md5, and every image the session emitted |
| `*-mask.png` | 512x128 tintable alpha masks, same geometry and family scale as the shipped sheet |
| `gen.py` | runs one generation, or re-adopts a named frame from one; proves both by md5 |
| `build.py` | keys a candidate to a mask and measures it; imports the shipped pipeline |
| `make_mockup.py` | inlines the sheets and the measured numbers into the mockup |
| `mockup-template.html` | the mockup's source; the built page is generated, do not hand-edit it |

## Rebuilding

```
python3 design/ui-overhaul/battle-icons/solid/build.py
python3 design/ui-overhaul/battle-icons/solid/make_mockup.py
```

Nothing in this folder writes to `public/`. Promoting a candidate is a separate, later step:
rerun `scripts/build_battle_icons.py --src <the chosen source>`, which is the shipping pipeline and
the only thing that may write the sheet the app loads.
