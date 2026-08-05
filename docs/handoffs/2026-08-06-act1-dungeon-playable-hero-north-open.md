---
date: 2026-08-06
type: handoff
project: edu-rpg
milestone: act1-dungeon-playable
status: active
supersedes: "[[2026-08-04-act1-overworld-baked-next-dungeon-art]]"
tags: [handoff, edu-rpg, act1, dungeons, hero, movement, ios]
---

# Handoff — Act 1: Sunken Cellar is playable; the hero's north row is not — 2026-08-06

One session owns all three Act-1 workstreams. HEAD `9617ab5` on `codex/map-engine-semantic-data`,
tree clean, ship gate PASS, bundle byte-identical throughout.

## THE ONE THING STILL OPEN

**The hero's NORTH-facing row (row 4) is damaged in the canonical art and eight attempts have not
replaced it.** Everything else in the cellar is shipped and owner-accepted.

## What shipped (this session)

| commit | what |
|---|---|
| `eb57402` | crisp wall rims — the wall-base band was smearing 8 px of floor; owner: "i love the clear rims" |
| `addc78c` | style locked (`docs/DUNGEON-EDGE-STYLE-LOCK.md`), f1+f2 baked, hero at native 64 px |
| `a879f73` | continuous movement + collision derived from the art |
| `075d44b` | collide at her SOLES, not her sprite centre |
| `00c18e4` | tangent sliding, 125 ms cadence, camera that keeps up |
| `f6baff5` | directional clearance — keeps the shaded tuck, halves side/top bleed |
| `e372289` | floor-change black screen **11.55 s → 0.37 s** |
| `9617ab5` | wall face 0.46 → 0.70 so the shade fits the character |

Owner verdict on movement: **"movement in dungeons look pretty good."**

## Locked decisions — do not re-litigate

- **Wall face height 0.70** and the hard-terminated base band. `docs/DUNGEON-EDGE-STYLE-LOCK.md`
  carries both, the measurements behind them, and **five rejected approaches** — read it before
  touching dungeon art.
- **Movement speed stays 260 px/s.** The engine's own step is 240 px/s, so dungeon and overworld
  match within 8%. Owner: *"rather than changing the player movement only in dungeons i prefer
  expanding the dungeons."* **The lever for cramped-feeling dungeons is SIZE, not speed.**
- Collision comes from the art by construction (same `fw` field, same 0.5 threshold). Never
  hand-maintain a second grid.
- `A1M_FOOT` capped at 16. **18 orphans three authored assets and strands 40 cells.**

## THE OPEN TASK, in detail

`public/act1-hifi/hero-g3/hero-act1-female-walk-8x3-64-g3.png`, 192x512 = 3 pose cols x 8 direction
rows of 64. Wheel from SOUTH in 45° steps: `0=S 1=SW 2=W 3=NW 4=N 5=NE 6=E 7=SE`.

**Row 4 (N) was drawn ~15% larger than every other direction, so the head never fit the cell** and
its top ~12 rows are absent. Same damage exists in g2 and g1; there is no intact copy anywhere and
git has one commit for the file. It must be generated.

### Eight attempts, all reverted — do not repeat any of these

1. superellipse dome cap — restored height, not content
2. graft NE head onto N body — added a SECOND ponytail; owner spotted it instantly
3. procedural rebuild from her own hair rows (v1–v7) — "something i cannot understand"
4. full-cell generation with a **silhouette template** — locked scale, **flattened the shading**
5. colour swatch strip — scored WORSE than describing colour in words
6. skull-width instruction — head collapsed into a cone

### What is actually known (hard-won, all measured)

- **The prompt shape decides everything.** Dropping the silhouette template and simply asking for
  "the missing eighth direction, three poses" moved hair shading from *below* the reference band to
  *above* it. Owner called this: *"isn't it as simple as providing codex the other facing assets as
  references and telling it to generate a north facing walking animation?"* — he was right.
- **The head was NEVER too big.** Candidate cranium 19–20 px vs NW/NE 19–22. The real defect is the
  **figure is 30–45% too NARROW** (cape 26 vs the existing north body's 47; figure 40 vs 52–58). A
  correct head on a narrow body reads head-heavy. Five attempts adjusted the head and could not work.
- Attaching **the existing damaged N row cropped from the shoulders down** as a width reference,
  with hard sprite-pixel numbers, fixes the width — but competes with the dome instruction, and the
  generator pays for cape width out of the skull.
- **Codex launders its own output.** One run generated an image then overwrote it with 40+
  ImageMagick `-draw` ops. ALWAYS diff the delivered file against `~/.codex/generated_images/<session>/`
  and report the md5 match.
- `image_gen` returns **1254x1254 regardless of requested size**, on its own ~16.75 px block grid.
  Detect pitch/phase, per-block median → exact reduction, then coverage-weighted MODE resample to 64
  (mode, not average, so edges stay hard), then quantise to the sheet's palette.
- **The reduction pipeline is exonerated** — NW's real cell through it retains 100% of its shading.
- `codex exec -m gpt-5.6-terra`; `gpt-5.1-codex-max` is REJECTED on this account. `-i` is variadic,
  so the prompt must arrive on **stdin**.
- The shading metric (hair per-channel std; NW `(65,44,36)`, NE `(63,39,29)`) predicts flatness well
  and **did not predict the owner's actual complaint**. Judge width first, then head shape, then
  shading. Do not reject a shippable figure on 2–3% of one channel.

### Attempt 8 result — 29 renders total. Width and head shape SOLVED; one number left.

Best candidate **S1k3** (`.../scratchpad/g6/out_S1k3.png`, prompt `.../g6/prompt_S1k.txt`, raw md5
`9c3deb2c8f189e0d47e2b57dc421d566`). It is the first candidate in the whole run that sits
believably beside NW and NE — see `.../g6/PLATE_width_progression.png`.

| | cranium | cape | figure | hair std B |
|---|---|---|---|---|
| NW / NE (target) | 19–22 | 34–47 | 52–58 | 30.7–42.8 |
| S1e2 (attempt 6) | 19–20 | 26–35 | **40** | 42.8–44.2 |
| **S1k3 (best)** | **18–21 ✅** | **33–43 ✅** | **49–51** (3–6% short) | **48.4–50.9 ✗ 13–19% over** |

Two things attempt 8 nailed down:
- **The anti-cone guard works** — a clean A/B: the aspect sentence WITHOUT it gives cranium 16–17
  and a pointed cone; WITH it, 18–21 and a proper dome at the same width.
- **The aspect-ratio sentence is what buys width**, not the pixel measurements. Measurements alone
  reached 38–42; the aspect sentence with the guard reached 44–51.

**NEW, and this is the lead for attempt 9 — the B overshoot is CONTRAST, not colour.** Quantising
the candidate's hair to the sheet's own 10-tone ramp pulls G into band but leaves B at 47.8–50.0.
So it is painted with *the sheet's exact hair colours* and still measures hot: the generated hair
uses proportionally more of the extreme light and dark tones than the reference. Colour naming and
colour swatches were both dead ends because colour was never the problem.

**Untried across all 29 renders:** an instruction about TONAL RANGE. Something like *"the lightest
strand highlight is only two steps lighter than the mid tone, not five — keep the range tight and
the contrast low; most of the hair sits in the two mid tones, with highlights used sparingly."*
That targets the only remaining failing number. Start attempt 9 there, on the `prompt_S1k.txt` base.

**Judgement call left open deliberately:** S1k3 may simply be good enough by eye. The metric was
built to predict the owner's rejections and has twice failed to (it never flagged the narrow body,
which was the real defect). Show him `PLATE_width_progression.png` and let him rule before spending
attempt 9.

## Also open, in rough priority

1. **Darkfang Grotto ships NO baked art** — the Act 1 BOSS dungeon. Full procedural cost on every
   entry; observed still not recovered at ~12 s, recovered by ~35 s. Neither floor-change fix
   applies. Observed, not measured.
2. **Six floors of coastalReef + whisperingWoodsCave** are still procedural; they pick up the locked
   rim + 0.70 face on a bake. Only `sunkenCellar` has materials — the other two themes need one
   material set each first.
3. **The overworld still has the square-blocker mismatch** the dungeons shed.
4. **Expanding the dungeons** — owner's preferred answer to the cramped feel. Median straight run in
   the cellar is 78 px.
5. **HUD**: font, chic colour theme, Codex-drawn bottom icons (menu icons only after the theme
   locks), realistic minimap/compass. Keypad done.
6. **Mountain-consolidation race** — `consolidateMapData()` never re-runs after a town exit.

## Gotchas that cost hours this session

- **`run-ios.sh --skip-build` reinstalls the STALE .app** and silently tests old code. Any device
  verification of a `public/` change needs a full `xcodebuild`.
- **`simctl io screenshot` can return a stale launch-snapshot surface** — a live-looking fake frame.
  Confirm against the live DOM when a frame looks suspicious.
- The sim must already be booted; `run-ios.sh` errors on a shut-down target. It also shuts itself
  down mid-session. Use `4872FCF0-6444-4A31-8D76-F92CEA09BF8D`; **never `24A4D890`**.
- **NEVER** `npm run build` / `npm run dev` / `npx vite`. `src/` is not the source of truth.
- `dist/assets/index-BhoGQRaA.js` must stay **4,987,581 / `60d90b63607b6e6980eb170aeeed445e`**.
- `public/dq-tiles.js` is pinned in **four** places (`runtime_baseline.py`,
  `extract_act1_runtime_snapshot.mjs`, its generated `act1RuntimeSnapshot.ts` — REGENERATE, never
  hand-edit — and `shippedOverworldBaselineDqReplay.mjs`). Two more stale pins exist in
  `capture_overworld_act_plates.cjs` and `export_act1_preserved_cutover.mjs` (pre-existing, ungated).
- Any new runtime file is a REGISTRATION act — pin it or the gate rejects it as `extra`.
- One mutating agent per worktree. Two agents in one tree produced meaningless test numbers earlier
  in this project.

## Kickoff prompt (paste verbatim)

```
edu-rpg, Act 1 — replace the hero's damaged NORTH row, then continue the dungeon work.

Work in /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data
(branch codex/map-engine-semantic-data, HEAD 9617ab5, tree clean).

Pre-flight reads, in this order, and nothing else:
  1. docs/handoffs/2026-08-06-act1-dungeon-playable-hero-north-open.md   (this handoff)
  2. docs/DUNGEON-EDGE-STYLE-LOCK.md

THE TASK. The hero's north-facing row (row 4 of the 8-direction g3 sheet) was drawn
~15% too large, so the head never fit the cell and its top ~12 rows are missing. There
is no intact copy anywhere. It must be GENERATED, via Codex.

EIGHT attempts have been reverted. The handoff lists every one and why it failed. Do
not repeat them. In particular: the head was NEVER too big -- the FIGURE is 30-45% too
narrow, and that is what reads as head-heavy.

Check .../scratchpad/g6/ first: attempt 8 (S1e head language + width paragraph only)
was in flight when the previous session handed off, and its result may already answer
this. The winning prompt base is g6/prompt_S1e.txt.

HARD RULES: ship GENERATED pixels or report FAILURE -- no hand-drawing, mirroring or
grafting; the owner has rejected five such patches and spots them instantly. Diff every
delivered render against ~/.codex/generated_images/<session>/ and report the md5 match,
because Codex has been caught overwriting its own output with ImageMagick draw calls.

Then, in the owner's order: Darkfang Grotto has no baked art at all (it is the Act 1
boss dungeon); the six floors of coastalReef + whisperingWoodsCave are still
procedural; expanding the dungeons (the owner prefers this over slowing the player);
then the HUD.

INVARIANTS: never npm run build / npm run dev / npx vite; dist/assets/index-BhoGQRaA.js
stays 4,987,581 / 60d90b63607b6e6980eb170aeeed445e; dq-tiles.js is pinned in FOUR
places; ./scripts/sync-ios.sh then ./scripts/ship-gate.sh . must pass.
Device: sim 4872FCF0-6444-4A31-8D76-F92CEA09BF8D, NEVER 24A4D890, and --skip-build
reinstalls a STALE app so always full-rebuild to verify a public/ change.
```
