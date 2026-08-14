---
date: 2026-08-14
type: handoff
project: edu-rpg
milestone: act1-chunk-retile
status: active
tags: [handoff]
---

# Handoff — Act 1 overworld chunk grid re-tiled 32-cell -> 16-cell — 2026-08-14

## The one thing to know

The owner's iPhone 13 was losing its WebGL context on the Act 1 overworld because the chunk grid
(`public/act1-hifi/manifest.json`, `chunkSize`) was ~4x too coarse for the ~9-cell camera window:
a live chunk window held up to 10 chunks * ~49 MB =~ 493 MB. **The chunks are now 16 cells instead
of 32** (`chunkSize` 256, not 512), same locked pixels, cropped rather than re-rendered. Measured
real GPU-resident bytes at the identical seeded window: **156.9 MB (9 chunks, old grid) -> 59.8 MB
(12 chunks, new grid)**, a 2.6x reduction, and a real `WEBGL_lose_context` -> `restoreContext()`
cycle recovers to the exact same resident state with **zero network refetches**.

## Why 16 cells and not 8

Both were baked and pixel-verified. 8-cell chunks give only a modest further memory win over 16
(worst-case ring residency 221.8 MB vs 308.0 MB, geometry-model) at a **3.4x worse** HTTP request
count over the same fixed route (702 vs 204 requests) and 3.6x more chunk objects to manage (437 vs
120). Per the task brief's own instruction ("if 8 loses to 16 on request count or frame time, say
so and pick 16"), 16 was chosen. See the table in "Measurements" below.

## What changed

- `scripts/retile_act1_chunks.py` (new): crops the ALREADY-BAKED 32-cell raster (base/canopy/water,
  decoded then reassembled into one full-plate array) into a finer grid. Does **not** call
  `scripts/render_material_map.py` again -- a re-tiling, not a re-render, so "the pixels didn't
  change" is a `numpy.array_equal`, not an argument about renderer determinism at new window
  boundaries.
- `public/act1-hifi/manifest.json` + `chunks/{base,canopy,water}/*`: re-tiled to `chunkSize: 256`
  (120 chunks), `revision: 12`. Base/canopy re-encoded **lossless** WebP (not the original lossy
  quality-82) specifically so decode(new chunk) is byte-identical to crop(decode(old chunk)) --
  see "Pixel-identity proof" below. Water was already lossless PNG and stays lossless.
- `design/review/overworld-art-blueprint/act-by-act/act1/runtime-v2/act1-final-art-geometry-r26/runtime/`
  (manifest.json + chunks/): updated to the SAME content. This is not optional -- it is the
  authoritative reference `scripts/runtime_baseline.py`'s gate diffs `dist/` against (see
  `ACT1_R26_RUNTIME` in that file). It is proven pixel-identical to the previous bake by the same
  full-set check as `public/act1-hifi` (both are byte-identical copies of one bake output).
- `scripts/runtime_baseline.py`: `ACT1_HIFI_MANIFEST_SHA256` re-stamped to the new manifest's hash;
  the hardcoded `revision != 11` check moved to `!= 12`. Same "deliberate tripwire, re-stamped on an
  intentional change" pattern already used for `DQ_TILES_SHA256`.
- `public/dq-tiles.js`: `A1A_MAX_CHUNKS` 10 -> 12; new `A1A_RING_MARGIN` constant (0) replaces the
  reused `MARGIN` for the ring's lookahead padding in `a1aRingChunks`. The one-window-step-early
  prefetch this file used to justify at length is traded away for peak residency: at 16 cells the
  same MARGIN padding that was nearly free on the coarse 32-cell grid is NOT free (see the comment
  at `A1A_MAX_CHUNKS`'s definition). Every other function that touches chunk geometry
  (`a1aChunkAt`, `a1aRingChunks`, `a1aRects`, `a1aDrawLayer`, `a1aPlaceSprites`, ...) reads chunk
  width/height/S from the manifest already and needed no logic change -- only stale comments citing
  the old chunk pixel size (1536x1536, "5x6 grid", "30 baked chunks") were corrected in place.

## Measurements

### Geometry model (pure arithmetic port of `a1aRingChunks`/`a1aRects`, no browser needed)

Per-chunk resident-byte formula, derived (not fitted) from the task's own measured 32-cell
component breakdown (base decode + canopy decode + canopy composite + water decode, plus base +
canopy + water GPU textures -- every term is `width*height*4` for some layer):

    bytes(cells) = 20*(48*cells)^2 + 8*(16*cells)^2

| grid | chunks | worst window | worst ring (old MARGIN ring) | per-chunk MB | worst-ring MB |
|---|---|---|---|---|---|
| 32-cell (shipped before) | 30 | 6 | 9 | 49.28 | 443.5 |
| 16-cell (shipped now) | 120 | 12 | 25 (ring now disabled: A1A_RING_MARGIN=0, so effective=12) | 12.32 | 308.0 (147.8 with ring off) |
| 8-cell (evaluated, not shipped) | 437 | 30 | 72 | 3.08 | 221.8 |

Fixed-route comparison (three chained `pathConstraints.corridors`,
greenhollow-to-millbrook + millbrook-to-port-sapphire + port-sapphire-to-coastal-reef, 197
waypoints, same MARGIN-snapped window for all three grids):

| grid | distinct chunks touched | HTTP requests (x3 layers) | peak resident chunks | peak resident MB |
|---|---|---|---|---|
| 32-cell | 18 | 54 | 9 | 443.5 |
| 16-cell | 68 | 204 | 25 (12 with ring off) | 308.0 (147.8 with ring off) |
| 8-cell | 234 | 702 | 72 | 221.8 |

8-cell's memory edge over 16-cell (221.8 vs 147.8-308.0 MB depending on ring policy) does not
justify 3.4x the requests. Not shipped.

### Real browser measurement (served `dist`, seeded at overworld 130,292, real Phaser scene)

Both builds served locally (`scripts/serve_dist.py`), identity-verified by comparing the served
`dq-tiles.js` SHA-256 against the local file before measuring. "Before" = clean re-checkout of this
worktree's HEAD (`git stash -u` / rebuild dist / measure / `git stash pop` / rebuild dist), so it is
the actual previously-shipped 32-cell tree, not a simulation.

A hidden browser tab starves `requestAnimationFrame`; frames were pumped via a `MessageChannel`
loop calling `__PHASER_GAME__.loop.step(t += 16.7)` (`setTimeout` is throttled, `MessageChannel` is
not). Confirmed the hero sprite's actual world position (130,292) and `readyWhy().lastWin`
("108_264") before trusting any number -- both builds landed on the exact same window.

| | before (32-cell) | after (16-cell) |
|---|---|---|
| live `a1a_` chunks | 9 | 12 |
| GPU-resident bytes (`sum width*height*4` over `game.textures.list` keys starting `a1a_`) | 156,893,184 (156.9 MB) | 59,768,832 (59.8 MB) |
| ratio | 1.0x | **0.38x (2.6x less)** |

(No `window.__DQ_TILES__.cost()` diagnostic exists on this branch/commit -- the task brief's
description of it does not match this worktree's base; `readyWhy()` and a direct
`game.textures.list` sum were used instead, which is what the task's own fallback measurement
method specifies.)

### GPU context-loss recovery (the gate that actually matters)

At the steady seeded window (12 chunks, 59.77 MB): `canvas.getContext('webgl2').getExtension(
'WEBGL_lose_context')` -> `.loseContext()` (`isContextLost()` -> true) -> a few pumped frames ->
`.restoreContext()` -> pumped frames -> `isContextLost()` -> false.

Result: **full recovery**. Post-restore GPU-resident state is byte-identical to pre-loss (12
chunks, 59,768,832 bytes), `readyWhy().ready === true`, `readyWhy().drew === true`, terrain visibly
redrawn (screenshot taken). Network log shows **zero new requests** after the loss/restore cycle --
all 51 `act1-hifi` requests (48 chunk layers + manifest + adapter + landmarks) happened during
initial load; Phaser rebuilt the lost GPU textures from the image data already held in
`A1A.chunks`/`A1A.imgs`, which this design deliberately never evicts mid-session (see the
`a1aReleaseChunks`/"WHY KEEPING THEM CANNOT GO STALE" comment in `dq-tiles.js`). This is the
opposite of the previously-reverted attempt, which measured 108 refetches and never recovered.

## Pixel-identity proof

`scripts/retile_act1_chunks.py` reassembles the full plate (2368x2912 manifest units; base/canopy
at 7104x8736 px, water at 2368x2912 px) from the 30 EXISTING chunk files, decoding each layer
exactly as the runtime does, then crops the new grid out of that array. Verification (over the
FULL chunk set, not a sample): reassemble the plate a second time from the NEW 120-chunk output the
same way, and `numpy.array_equal` against the original reassembly.

    base equal: True   max abs diff: 0
    canopy equal: True max abs diff: 0
    water equal: True  max abs diff: 0
    water_present equal: True   (same footprint, not just same pixels where present)

Same result for the evaluated-but-unshipped 8-cell retile. `public/act1-hifi/chunks` and the
`design/review/.../act1-final-art-geometry-r26/runtime/chunks` reference copy were diffed
byte-for-byte after deployment (`diff -qr`) and are identical.

## Known tradeoff, disclosed and not hidden

Base layer is now **lossless** WebP instead of the original lossy quality-82, so decode(new) can be
proven byte-identical to crop(decode(old)) rather than merely close. Measured cost: one 32-cell base
chunk re-encoded lossless is ~6x its lossy-82 size (300 KB -> 1.8 MB on `c0-r0`). Total downloadable
art payload: ~18.05 MB (old, all lossy) -> ~78.9 MB (new, 16-cell, base lossless; canopy/water were
already lossless and did not grow). This does **not** affect resident GPU/decode memory (governed
by pixel count, not source compression) or the context-loss result above, but it is a real increase
in what a full map traversal downloads over a session. Not addressed here; flagged for a follow-up
if it matters in practice (e.g. re-rendering directly at the new grid from
`scripts/render_material_map.py`, which was deliberately NOT done here -- see "Why re-tiling, not
re-rendering" in `retile_act1_chunks.py`'s docstring -- or a lossy re-encode with a measured,
bounded, disclosed diff instead of a proven-zero one, if the owner decides that tradeoff is
acceptable).

## Gate status

`npm run repin` and `npm run gate` both pass clean on the committed tree (see the commit message /
session log for full output). Frozen bundle md5 `60d90b63607b6e6980eb170aeeed445e` intact.

## Not done / open items

- Did not test the 8-cell candidate's context-loss recovery or real GPU bytes in the browser --
  it was rejected on the request-count/geometry evidence before that was warranted. The artifacts
  (`/tmp/a1a_8` at bake time; not committed) are reproducible via
  `scripts/retile_act1_chunks.py --src public/act1-hifi --out <dir> --cells 8` against a git
  checkout of the pre-retile 32-cell tree.
- `docs/GROUND-TRUTH.md`'s "r26 bake ... likely settled" note and the bake-script docstrings that
  describe the chunk grid as "30 chunks" / "512" / "48 px/tile, 3x the shipped grid" are now stale
  for the LIVE grid size (still correct as a description of the 32-cell bake's own history). Not
  edited here to keep the diff to this change confined to the geometry constants and the files that
  actually needed new content, per the instruction that produced this change.
- This worktree is based on `main` (`7740adb`), not the branch this work needs to land on; do not
  rebase this worktree -- the integrator ports the commit by hand.
