---
date: 2026-07-21
type: design-proposal
project: edu-rpg-map-engine-semantic-data
status: OWNER-REVIEW
tags: [overworld-art, pipeline, terrain-f, terra, seams, style-consistency]
supersedes-intent: per-tile independent img2img (dq-art-full-v2)
verify-on: 2026-07-25 (Codex/Terra resume)
---

# Region-based overworld art pipeline: master-conditioned generation

> Design-only. NO image generation was run (Terra/Codex parked until 2026-07-25).
> Every quantitative claim below comes from a deterministic Python pass over the
> shipped code, the class map, and the shipped 120 tiles. Terra behaviour is
> reported strictly as PROVEN (cited from shipped pipeline) vs NEW (flagged
> VERIFY-on-resume). Honours [[LOCKED-ART-STYLE]] and [[ART-DIRECTION]].

## 1. Recommendation (TL;DR)

Adopt **global-master conditioning as a two-layer pipeline**: (1) generate ONE
low-res "Act master" as a single img2img pass over the *whole-Act code-drawn
base* (deterministic layout truth) with the locked Terrain-F anchor, giving one
inherently-consistent, internally-seamless tone/style ancestor; (2) keep the
proven ~18-cell high-res tiles, but make each tile's img2img **inherit its crop
of the Act master** (pre-blended into the tile's code base), so every tile
descends from one parent image and matches by construction; (3) reuse the shipped
`finalize_full_map.py` (deterministic shared water, per-class tone shift, linear
overlap feather) as the last-mile safety net; (4) add a **structural
style-consistency gate** because the current tone-only seam metric passes on a
map that still reads as a patchwork. This validates the candidate approach's core
mechanism (it is what [[LOCKED-ART-STYLE]] step 1 already specified) and corrects
its one weak assumption (seams cannot be hidden on class transitions here: only
~7% of a tile grid's seam length falls on a transition, so the master + feather,
not transition placement, is the real seam guarantee).

**Act 1 feasibility headline:** the region partitions cleanly into a small number
of coherent masses (top 5 masses = 79% of area, top 8 = 86%; transition density
only 7.2%), but Terra's proven 1530 px output caps a *single high-res call* at
~18 world-cells, so "regions" operate at two scales: **6-8 coherence regions**
(one master each, or one whole-Act master) for consistency, and **~120 generation
tiles** (or ~30-42 if a higher Terra output res is verified) for detail.

---

## 2. Why the current pipeline fails (grounded)

`dq-art-full-v2` generates each of 120 tiles as an **independent** img2img pass
over that tile's own code-drawn base, then harmonises in finalize. Two failure
modes, one of which the shipped metrics do not even detect:

- **Structural style drift ("rogue" tiles).** Each tile is Terra's own
  interpretation of Terrain-F. The base renderer only authors a 48 px/cell
  skeleton (`TILE=48`, `render()` in `render_overworld_dq_art.py`); *all* real
  texture (rock faceting, canopy pattern, trail rendering) is Terra-authored
  per tile and upscaled to 1530. Nothing ties one tile's texture statistics to
  its neighbour's.
- **Thin-feature fragmentation.** Paths and shorelines that cross a tile seam are
  re-interpreted independently on each side, so they break into "patches."

**Proof that finalize cannot fix this.** The shipped seam gate
(`SEAM_THRESHOLD=24.0`, `finalize_full_map.py`) measures only the *mean absolute
RGB step* between the two pixel rows/cols straddling each boundary, and only on
*same-class* pixels. The shipped map **passes** it (worst boundary
`horizontal-y90`: mean 14.494 < 24; `seam-report.json`). Yet a deterministic
style probe over the 120 shipped tiles (`terrain-fix-preview/style_variance_probe.py`)
shows large within-class *structural* variance that the tone gate is blind to:

| Dominant class | tiles | edge-density CV | ex. rogue tile (z) |
|---|---|---|---|
| water | 37 | 38.1% | tile-3-0 contrast z=+2.48 |
| meadow | 23 | 19.7% | tile-7-3 contrast z=-2.49 |
| forest | 28 | 16.2% | tile-2-2 contrast z=+3.08 |
| mountain | 32 | 14.2% | **tile-5-9 contrast z=+3.94** |

16 tiles sit >=2 sigma from their class mean on at least one texture descriptor.
These are precisely the owner-reported "rogue tiles with different
tone/rock-interpretation." **Conclusion: the tone-only metric is necessary but
insufficient; the fix must (a) prevent structural drift at generation time and
(b) add a structural gate.** (The probe is a coarse grayscale proxy: some water
CV is the deterministic-vs-mixed water split, and a peakier mountain tile
legitimately has more edges. It screens for rogues; it is not the final gate.
See section 8.)

---

## 3. Terra proven capabilities vs new requirements

All PROVEN rows are cited from the shipped pipeline (`PIPELINE-batch-gen-brief.md`,
`render_overworld_dq_art.py`, `finalize_full_map.py`, `checkpoint.json`,
`manifest.json`, batch handoffs).

### 3a. PROVEN (rely on these)

| Capability | Proven value / evidence |
|---|---|
| Model | `gpt-5.6-terra`, img2img |
| Input | a code-drawn **base** image = layout truth (Terra does NOT control layout from a flat class mask: batch 1 failed, forest landed on the wrong side) |
| Reference anchor | one style anchor attached to **every** call: `terrain-f-natural-trail-comparison-locked.png` |
| Output resolution | **1530x1530 RGB** accepted tiles (`masterDimensions:[1530,1530]`; `source_base()` rejects non-1530) |
| Denoise/strength | "moderate denoise": repaint to Terrain-F while preserving base composition (no numeric strength persisted) |
| Coverage per call | 18 world-cells (`tileCoverageCells:18`) at `latticePxPerWorldCell:85` -> 1530 px |
| Conformance achieved | 0.94-0.96 structural agreement with base; water-region IoU ~1.0 (handoffs) |
| Cost signal | AI call has real budget cost: `>=95%` water tiles use a deterministic **water-shortcut** (no call); batches of <=8; retry-once then `needs-review` |
| Determinism up-stream | base renderer fully deterministic (hash-noise + `random.Random(seed)`, seed=42 from map) |
| Finalize primitives | deterministic shared-water replace; per-class per-channel **additive** shift to a map-median target (`landTargetsRgb`); **separable linear feather** over a 3-cell (255 px) overlap; streamed 255 px strips |

### 3b. NEW requirements (design needs these; VERIFY on 2026-07-25)

| # | New requirement | Why needed | Risk | Fallback if unavailable |
|---|---|---|---|---|
| V1 | **Per-tile conditioning from the Act master.** Primary mechanism: upscale the tile's master crop and alpha-blend it into the tile's code base *before* img2img (keeps the proven 1-base + 1-anchor call shape, just pre-tints the input). | This is the consistency guarantee. | LOW (it is preprocessing the base) | V1b below |
| V1b | **Master crop AS the anchor** (swap/append the fixed forest anchor with the tile's master crop). | Stronger tone transfer if pre-blend is too weak. | MED (does Terra transfer tone from an arbitrary anchor? only the fixed forest anchor is proven) | rely on V1 pre-blend + finalize tone shift |
| V2 | **Whole-Act master pass**: Terra accepts a portrait ~0.81:1 non-square input at 1530 tall. | One master = zero internal seams. | MED (proven input is ~square 1530^2) | per-mass masters (6-8 near-square calls; their seams fall on mass boundaries = transitions) |
| V3 | **Terra max output resolution.** If > 1530 (e.g. 2448 / 3072). | Larger tiles -> far fewer seams (30-42 vs 120). | unknown | keep 1530 / 120 tiles |
| V4 | **Exact denoise/strength dial + value** that preserves layout while transferring master tone. | tune master-vs-layout balance | LOW-MED | use the "moderate" setting proven for base->Terrain-F |
| V5 | **Outpainting / mask-conditioning.** | ONLY if the outpainting-chain alternative is chosen (it is NOT recommended). | HIGH (never exercised) | not needed by the recommended design |

**Verify-on-resume list (paste into the Jul-25 kickoff):** V1, V1b, V2, V3, V4.
V5 only if outpainting is reconsidered.

---

## 4. Recommended pipeline, end to end

```
  CLASS MAP (terrain-classes.json, Act1 [16,218,163,399], seed 42)
        │
        │  render_overworld_dq_art.py  (deterministic; NOW)
        ▼
  ┌───────────────────────────┐        ┌──────────────────────────────┐
  │ A. Whole-Act CODE BASE     │        │ B. Per-tile CODE BASES (120)  │
  │    sample=6 -> 8 px/cell    │        │    48 px/cell -> upscale 1530  │
  │    ~1184 x 1456 px          │        │    (proven per-tile inputs)   │
  └───────────┬───────────────┘        └───────────────┬──────────────┘
              │ img2img x1 (Terra, anchor)               │
              ▼   [VERIFY V2/V4]                          │
     ┌──────────────────┐   master crop per tile          │
     │  ACT MASTER       │───────────────┐  upscale+blend  │  [VERIFY V1]
     │  (tone/style      │               ▼                 ▼
     │   ancestor,       │        ┌──────────────────────────────┐
     │   no seams)       │        │ C. MASTER-CONDITIONED INPUT    │
     └──────────────────┘        │    = code base pre-tinted with │
                                  │      master crop (per tile)    │
                                  └───────────────┬──────────────┘
                                                  │ img2img x120 (Terra,
                                                  │   anchor, moderate denoise)
                                                  ▼  [reuse checkpoint/manifest]
                                        ┌────────────────────┐
                                        │ D. HIGH-RES TILES   │
                                        │    1530^2, all      │
                                        │    descend from the │
                                        │    one Act master   │
                                        └─────────┬──────────┘
                                                  │ finalize_full_map.py (NOW)
                                                  ▼  deterministic water + per-class
                                                     tone shift + linear feather
                                        ┌────────────────────┐
                                        │ E. FINAL MAP        │
                                        │  12495 x 15385      │
                                        │  + M1/M2/M3 gates   │
                                        └────────────────────┘
```

**Steps:**

1. **Render the whole-Act code base** at 8 px/cell (`render()` with `sample=6`;
   `48 % 6 == 0`), ~1184x1456 px. Deterministic, buildable NOW.
2. **Act master (1 Terra call).** img2img that whole-Act base -> Terrain-F at the
   lifted tone, anchor attached. One image, so it is internally seamless and has a
   single consistent tone/palette/rock-interpretation. [VERIFY V2, V4]
   *Fallback:* if portrait input is rejected, generate 6-8 per-mass masters
   (section 6), stitched with a wide feather; their seams sit on mass boundaries.
3. **Per-tile code bases (120).** Exactly as shipped: render 18-cell base at 48
   px/cell, resize to 1530.
4. **Master-conditioned input (per tile).** Upscale the tile's master crop
   (18x8 px = 144 px) to 1530 and alpha-blend it into the tile's code base at a
   tuned opacity, so the img2img *input* already carries the master's low-freq
   color/tone field. [VERIFY V1; V1b = use the master crop as the anchor instead]
5. **img2img the 120 tiles** with the locked anchor at moderate denoise. Detail
   comes from Terra; tone/style is pulled toward the shared master. Keep the
   `>=95%` water-shortcut. Reuse `checkpoint.json` / `manifest.json` verbatim.
6. **Finalize** with the shipped `finalize_full_map.py` unchanged: deterministic
   shared water, per-class additive tone shift to `landTargetsRgb` (now a much
   smaller correction because tiles already agree), 3-cell linear feather, stitch.
7. **Gate** with M1 (existing tone seam) + M2 (new structural seam) + M3 (new
   global style-consistency). Regenerate only tiles that fail M3 (rogue tiles),
   re-running from the same master so replacements still match.

---

## 5. How the two hard guarantees are met

### (1) Style consistency: "no rogue tiles"

- **Single ancestor.** Every tile is img2img-conditioned on a crop of ONE master
  image. The master fixes the low-frequency color/tone/material identity globally;
  each tile can only add high-frequency detail on top of an already-shared field.
  Consistency is **by construction**, not by post-hoc matching.
- **Layout truth preserved.** The code base still supplies exact feature
  placement (Terra's proven need), so conditioning on the master does not move
  forest/water/rock.
- **Structural gate (M3).** The generation is not trusted blindly: the same
  descriptor that flags 16 rogue tiles today becomes an acceptance gate. Target:
  zero tiles beyond 2.5 sigma and within-class CV at least halved vs the shipped
  baseline in the table above.

### (2) Seamlessness: "no visible tile grid"

Honest correction to the candidate's assumption: **seams cannot be hidden on
class transitions here.** A uniform 18/3 tile grid places only **7.2%** of its
gridline length on a family transition (the rest cuts straight through coherent
mid-forest / mid-sea / mid-meadow, exactly where a seam shows worst). So the seam
guarantee rests on three mechanisms that do not depend on transition placement:

- **Master tone-continuity.** Adjacent tiles are conditioned on adjacent crops of
  ONE continuous image, so both sides of every seam already share the same
  low-freq tone. The feather then has almost nothing to hide.
- **Overlap feather (proven).** Separable linear feather over the 3-cell / 255 px
  overlap, weighted-accumulate-normalise. Widen to 4-5 cells if V3 lets tiles grow.
- **Deterministic finish (proven).** Shared-water replace kills water seams
  outright; per-class additive tone shift removes any residual class-level drift.
- **Bonus transition-snap.** Where a boundary *can* be nudged onto the 7.2% that
  is a transition, do so; it is free insurance, not the primary mechanism.

---

## 6. Region-definition scheme (real Act 1 numbers)

Source: `terrain-fix-preview/region_feasibility.py` ->
`region-feasibility-report.json`. Region bounds `[16,218,163,399]`; the shipped
half-open render is 147x181 cells (12495x15385 px at 85 px/cell). The scan used
the inclusive 148x182 = 26,936-cell superset (the extra edge row/col is
immaterial: <1.3%).

**Class mix (dominated by 4 classes = 90.9%):**

| class | % | family | % |
|---|---|---|---|
| water 27.9 · forest 24.5 · mountain 21.1 · meadow 17.4 | | water 27.9 · forest 24.5 · rock 23.8 · open 20.5 · lightForest 3.0 · built 0.2 | |

**Coherence regions = connected semantic masses (4-connectivity on the material
family grid):** 246 components exist, but the map is really a handful of big
masses plus speckle. Top masses:

| mass | cells | % | bbox rows | bbox cols |
|---|---|---|---|---|
| Sea (water) | 6728 | 25.0 | 218-399 | 16-163 |
| NE-Mountain (rock) | 4386 | 16.3 | 218-299 | 70-163 |
| Central-Forest | 4189 | 15.6 | 226-355 | 24-110 |
| Meadow-Basin (open) | 4160 | 15.4 | 260-371 | 32-163 |
| SE-Mountain (rock) | 1849 | 6.9 | 294-376 | 131-163 |
| + secondary forest/open/water pockets (688, 668, 615, 397, 354 ...) | | | | |

Top 5 masses = **79%**, top 8 = **86%**. **Transition density = 7.2%** of interior
edges cross a family boundary (9.4% cross a raw-class boundary): the masses are
large and coherent, which is what makes a small set of coherence regions viable.

**Two scales, because of Terra's res:**

| scheme | region side | overlap | grid | # regions | single 1530 call? | px/cell if forced |
|---|---|---|---|---|---|---|
| **Generation tiles (proven)** | 18c | 3 | 12x10 | **120** | yes (85 px/cell) | 85 |
| if V3 gives ~2x res | 37c | 5 | 6x5 | **30** | needs 3072 out | 41 |
| if V3 gives ~1.7x res | 30c | 4 | 7x6 | **42** | needs 2448 out | 51 |
| macro (too soft alone) | 74c | 8 | 3x3 | 9 | no (20.7 px/cell) | too soft |
| macro (too soft alone) | 91c | 9 | 3x2 | 6 | no (16.8 px/cell) | too soft |

**Reading of the table:** a "region" bigger than ~18 cells cannot be a single
high-res Terra call at final density, so big semantic masses do NOT collapse the
call count on their own. They are the right unit for **masters and QA grouping**;
the **generation unit stays ~18 cells**. If V3 confirms a higher output res,
switch generation tiles to 30-42 (strictly fewer seams) without changing the
master layer.

**Master feasibility (whole-Act, one image):**

| Terra max side | master px | px/cell | downscale from final |
|---|---|---|---|
| 1024 | 833x1024 | 5.6 | 15.0x |
| 1280 | 1041x1280 | 7.0 | 12.0x |
| **1530 (proven)** | **1244x1530** | **8.4** | **10.1x** |
| 2048 | 1665x2048 | 11.2 | 7.5x |

8.4 px/cell is intentionally low: the master is a **tone/style ancestor**, not
detail. Detail is authored by the per-tile passes on top of it. If V2 rejects the
portrait aspect, the 6-8 coherence masses each fit a near-square <=1530 master
(NE-Mountain 94x82 cells -> 1530 = 16 px/cell, etc.).

---

## 7. Resolution / reduction math (and a correction)

- Class cell -> **85 px/cell** at final resolution (`PX=85`; 147x181 cells =
  12495x15385).
- One Terra 1530 call = 1530/85 = **18.0 cells** square. This is the hard cap on a
  single high-res region.
- Code base renderer native ceiling = **48 px/cell** (`TILE=48`, sample>=1); the
  shipped pipeline resizes the 864 px base to 1530 before img2img. All texture
  above 48 px/cell is Terra-authored.
- **Correction to the locked plan.** [[LOCKED-ART-STYLE]] step 2 specifies a
  912/512 (1.78x) supersample-then-reduce. The **shipped** pipeline does NOT do
  this: `finalize_full_map.py` blits tiles natively at 85 px/cell with no
  reduction (only review overviews are LANCZOS-downscaled). Generation already
  happens at final density. Getting the crisp faux-pixel finish that a real
  supersample-reduce would give **requires Terra output > 85 px/cell** (VERIFY
  V3). Flag for owner: keep parity with shipped (no reduce), or pursue V3 for a
  genuine reduce.
- Master render uses `sample=6` -> 8 px/cell -> whole-Act base 1184x1456 (fits
  <=1530 on both axes with margin).

---

## 8. Alternatives evaluated

| approach | consistency | seams | detail | Codex calls | verdict |
|---|---|---|---|---|---|
| **Master-conditioned (recommended)** | by construction (1 ancestor) | master-continuity + feather | proven 1530/tile | 1 master + ~120 tiles (minus water-shortcut); or +30-42 if V3 | **ADOPT** |
| Outpainting-chain (each region on neighbour's edge) | drifts along the chain | good locally | proven | sequential, no parallel, error accumulates | **REJECT** (needs V5 outpainting, never exercised; high risk) |
| Large-region + generous feather | still independent between big regions | fewer seams | drops below proven res (>18c) or needs sub-tiling | fewer but each riskier | **PARTIAL** (only useful *with* a master; = V3 lever on the recommended design) |
| Global post-hoc style/tone match (current finalize) | tone only, not structure | ok on tone | n/a | 0 extra | **KEEP as finish, not as the fix** (this is exactly what passes today while the map is still a patchwork) |

**Hybrid chosen:** master-conditioned generation (fixes structure + consistency)
+ the shipped finalize (deterministic water, tone shift, feather) as the
last-mile finish + optional V3 large-tile lever to cut seam count.

---

## 9. Verification plan

Three gates, all deterministic Python (PIL/numpy), all buildable NOW and runnable
on the existing map to baseline them:

- **M1 - seam tone (existing, keep).** Mean abs RGB step across each boundary,
  same-class pixels only, gate mean < 24. (Shipped map passes: worst 14.5.)
- **M2 - seam structure (NEW).** Same-class, cross-boundary distance between local
  texture descriptors (edge-density, local contrast, gradient-orientation
  histogram EMD) in the overlap band. Catches thin-feature fragmentation and
  texture steps M1 cannot see. Threshold calibrated against the shipped baseline
  (set at, e.g., the shipped p75 so the new map must beat today).
- **M3 - global style-consistency (NEW, the rogue-tile gate).** Per class,
  cross-tile variance of the texture-descriptor vector; flag any tile beyond
  k sigma. Prototype (`style_variance_probe.py`) already flags **16 tiles >=2
  sigma** on the shipped map. Acceptance target for the new map: **0 tiles >= 2.5
  sigma** and within-class edge-density CV at least halved (e.g. mountain
  14.2% -> <7%, meadow 19.7% -> <10%).
- **Visual proofs (existing).** Native crop spanning >=2 boundaries
  (`act1-map-seam-proof-2x2-boundaries.png`) + 2400 px overview, eyeballed by
  owner. M-metrics gate; owner eye is final.

Harden the M2/M3 descriptor before it gates (add per-class masking so a peakier
mountain is not penalised for legitimately having more edges; separate
deterministic-water tiles from mixed-water in the water group).

---

## 10. Phased build plan

### Phase 0 - buildable NOW, deterministic, no Codex (before Jul 25)

1. **[DONE] Region feasibility** (`region_feasibility.py`,
   `region-feasibility-report.json`).
2. **[DONE] Style-variance baseline** (`style_variance_probe.py`,
   `style-variance-report.json`) - quantifies the patchwork, validates M3.
3. **Harden M2 + M3** into a single `style_gate.py` (per-class masking, thresholds
   from the shipped baseline). Run on shipped tiles to freeze the baseline numbers.
4. **Render the whole-Act code base** at `sample=6` (the Act master INPUT).
5. **Master-prelight compositor** (`prelight_bases.py`): given an Act master PNG,
   upscale each tile's crop and alpha-blend into that tile's 1530 code base,
   emitting the exact master-conditioned img2img inputs (C in the diagram). This
   is the only genuinely new deterministic code; it stages everything so the
   Jul-25 run is "load inputs, call Terra, finalize."
6. **Coherence-region map** JSON + overlay (the 6-8 masses) for QA grouping and
   the per-mass-master fallback.

Everything in Phase 0 is additive and own-files-only; it does not touch the
shipped map.

### Phase 1 - needs Terra (Codex resume, 2026-07-25)

1. Run VERIFY V1/V1b/V2/V3/V4 with 2-3 probe calls before the full run.
2. Generate the Act master (1 call, or 6-8 per-mass on the V2 fallback).
3. Regenerate the 120 tiles from master-conditioned inputs (reuse
   checkpoint/manifest; water-shortcut still applies).
4. Finalize (shipped script, unchanged).
5. Run M1/M2/M3. Regenerate only rogue tiles from the same master; re-gate.
6. If V3 confirmed higher res: optionally re-cut to 30-42 larger tiles and repeat
   3-5 for strictly fewer seams.

---

## 11. Open risks / questions for the owner

1. **Regenerate all vs rogues-only (budget).** Cheapest path that still meets the
   guarantee: generate the master, then re-do only the ~16-40 rogue/outlier tiles
   conditioned on it, and re-run finalize. Full 120-tile re-gen is the strongest
   guarantee but costs the most Terra calls. Which do you want?
2. **Detail vs coherence.** Master-conditioning deliberately constrains per-tile
   creativity to enforce a shared look. This is the point, but confirm you prefer
   uniformity over per-tile flair (the locked style implies yes).
3. **Higher Terra res (V3).** If Terra can output > 1530, re-tiling to 30-42
   larger tiles cuts seam count ~3-4x and enables a real supersample-reduce for
   crisper faux-pixel edges, at higher cost-per-call and less parallelism. Pursue,
   or keep parity with the shipped 120/no-reduce?
4. **One whole-Act master vs 6-8 per-mass masters** depends on VERIFY V2. Per-mass
   is the safe fallback and its seams fall on mass boundaries (transitions), but it
   reintroduces a few low-res master seams to feather. Accept the fallback if V2
   fails?
5. **Anchor mechanism (V1 vs V1b).** Pre-blend (V1, low risk) is primary; using
   the master crop AS the anchor (V1b) is stronger but unproven. OK to let the
   Jul-25 probe pick between them?

---

## Appendix - artifacts produced by this design pass

- `terrain-fix-preview/region_feasibility.py` + `region-feasibility-report.json` +
  `region-feasibility-summary.txt` - Act 1 region analysis.
- `terrain-fix-preview/style_variance_probe.py` + `style-variance-report.json` +
  `style-variance-summary.txt` - patchwork evidence + M3 prototype.
- Reference inputs read: `PIPELINE-batch-gen-brief.md`, `render_overworld_dq_art.py`,
  `finalize_full_map.py`, `checkpoint.json`, `manifest.json`, `seam-report.json`,
  `finalization-report.json`, `continent-macro-g3/terrain-classes.json`,
  `LOCKED-ART-STYLE.md`, `ART-DIRECTION.md`, batch-011 + finalization handoffs.
