# Battle command icon source

Owner, 2026-08-07, on the battle-command mockups: *"i saw the mockups. A looks the best. please
have codex generate new and better icons for that screen and swap them with the better ones with
the old ones."*

Variant A is **Gilded Rail** (`design/mockups/battle-command-selector.html`). It removes the
coloured button blocks, so a command's colour survives **only in its glyph tint**. That is the
whole constraint on this asset: it has to be a tintable alpha mask, not baked-colour art. A flat
full-colour PNG would defeat the variant the owner picked.

| | |
|---|---|
| generator | `codex exec -m gpt-5.6-terra` |
| codex session | `019fd9e8-afd9-7402-b5f9-d805f01445b8` |
| generated file | `~/.codex/generated_images/019fd9e8-afd9-7402-b5f9-d805f01445b8/exec-06926cae-fc51-4957-8332-9fe1cd9c1a4d.png` |
| md5 | `5c6d3ab80f0e7ffa4e168eb14ac59451` |
| `source-generated.png` here | **byte-identical** to the generated file (`cmp` clean) |

The md5 check is not ceremony. This project has caught Codex generating an image and then
overwriting it with dozens of ImageMagick draw calls, so what ships has to be traceable to the
generation record rather than to something drawn afterwards. It is the raw output; every
transformation applied to it lives in `scripts/build_battle_icons.py` and is reproducible by one
command.

## The style anchor

Not `design/ART-DIRECTION.md`. That document's STYLE BLOCK describes the 128px battle-MONSTER
family, and the doc itself warns it has already mis-driven three generations by being pasted
where it did not belong. This is UI chrome.

The anchor is the **bottom tab icon family** (`design/ui-overhaul/tab-icons/`, shipped as
`public/ui-icons/tab-icons.png`), which came from the owner's near-identical request the night
before. Both the gold-tinted shipped sheet and the raw generated sheet were attached to every
generation call as reference images, and the style description in the brief was **measured off
those pixels** rather than copied from any document:

| property | measured on the anchor |
|---|---|
| construction | monoline outline only, no fills, no shading, no gradients |
| stroke weight | uniform within and across glyphs |
| stroke / optical size | **5.91% – 6.67%** (the number the candidates were ranked on) |
| caps and joins | round |
| glyph fill of cell | ~78%, centred |
| detail count | 3–7 strokes per glyph |

## Candidates, and why this one

Three runs of the same brief. The composition was right on all three; the only variable that
moved was stroke weight, and it is the variable that decides whether the set reads as part of
the anchor family or as a different set that happens to sit near it.

| run | codex session | md5 | stroke / optical | verdict |
|---|---|---|---|---|
| 1 | `019fd9e0-a6a1-7162-a639-bef5a1623822` | `2941b922fcf79d8a63957c3451a97e44` | 4.10 – 4.71% | REJECTED — ~30% under the anchor. At 21px the blade and the slash arc blur into one grey smear and the whole set reads lighter than the tabs beside it. |
| 2 | `019fd9e4-b3b5-7473-b5ab-8b1d71b742f8` | `d6d13cf13f8bef0da940e94280781c42` | 7.15 – 8.58% | REJECTED — ~28% over. At 21px the potion's stopper closes up into a solid block, the shield's boss stops reading as a ring, and the boot loses its interior. |
| **3** | **`019fd9e8-afd9-7402-b5f9-d805f01445b8`** | **`5c6d3ab80f0e7ffa4e168eb14ac59451`** | **5.92 – 6.24%** | **CHOSEN** — inside the anchor's measured band on all four glyphs. At 21px every internal feature survives: blade separate from arc, boss as a ring, neck and liquid line on the potion, sole and three speed lines on the boot. |

Run 3's brief carried the two previous measurements back to the generator as explicit
calibration ("attempt 1 was 4.4%, attempt 2 was 8.1%, aim for 6.3%"), which is why it landed
first try. Nothing was hand-drawn, retouched or redrawn at any point; the rejected runs were
regenerated, not fixed.

Distinctness was a hard requirement, because the anchor family already contains a sword and a
pouch and both can be on screen in the same session. The brief forbade a vertical upright sword
and a pouch/sack silhouette by name. Delivered: the attack sword is diagonal and carries a slash
arc (wide diagonal silhouette, against the anchor's tall narrow one), and the item is a
hard-edged round-bellied bottle with a straight neck and a squared stopper (circle-on-a-stalk,
against the anchor's soft gathered sack).

## Review artefacts in this folder

| file | what it is |
|---|---|
| `source-generated.png` | the raw generator output, byte-identical, `cmp` clean |
| `contact-sheet.png` | the four glyphs for one-glance approval, emitted by the build script |
| `proof.html` | the true-size proof page; loads the SHIPPED css and png, not copies |
| `proof-truesize-dpr3.png` | that page captured at 390 CSS px, deviceScaleFactor 3 |

The contact sheet deliberately shows each glyph at 96px **over** the same glyph at 21px. The
small row is the one that decides it: art that reads at 4x and mushes at 21px has passed a
review it should have failed, and 21px is the size `#qok-ui .btn .ic` actually uses.

## What the generator got wrong

Nothing that survived into the shipped file, which is a first for this pipeline — but only
because the brief was written around the known failure.

It still **cannot emit a transparent canvas**: `hasAlpha: no` on all three runs. The tab-icon run
handled that by painting the transparency **chequerboard into the pixels**, which is silent (every
viewer draws a chequer for real alpha too) and would have shipped a grey chequer behind every
icon. So this brief pre-empted it: *if you cannot do real transparency, use a flat solid dark
background, and explicitly do not paint a chequerboard.* It complied — white strokes on
near-black, background under luminance 32 and strokes over 224, a far cleaner key than the
chequer was.

`build_battle_icons.py` recovers the alpha from that on a 40..190 luminance ramp (the tab build's
215..245 ramp is calibrated for the chequer and is wrong for this source), and keeps the tab
build's morphological opening even though this source needed it: it costs nothing and it guards
the step that actually broke last time, where stray lit pixels stretched every measured bounding
box and silently wrecked the size normalisation.

One further divergence from the tab build, caused by the art rather than by a defect in it: the
tab splitter cut the sheet on **every** empty gutter and asserted it found exactly four columns.
`flee` is a boot with speed lines trailing behind it, and the gap between the lines and the boot
is a genuine empty column, so that splitter finds five and aborts on art that is correct. The
battle build ranks gutters by width and cuts on the widest three instead — on this sheet the
cell gutters are 96–121px and the widest in-glyph gap is 0px, so the two are never close, and
the script refuses to guess if that margin ever narrows.
