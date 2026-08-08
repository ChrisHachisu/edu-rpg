# SMOOTH round 5 — the Act 1 plate stops going through a canvas

> [!success] SHIPPED IN THIS BRANCH. Device-verified, interleaved, battles excluded.
> **Worst walking frame on the iOS simulator: 810 ms -> 46.7 ms at cell (30,277) with frames over
> 100 ms going 1 -> 0 on all five runs, and 835 ms -> 133 ms at cell (69,257). Neither pair
> overlaps.** The periodic pause the owner felt was the terrain window step, whose period is
> `MARGIN` = **12 tiles of movement**; that pause is now structurally impossible, because there is
> no longer a per-window-step repaint to pay for. Section 7 has the numbers, section 8 the residue
> that is still there, and section 6 the two fixes that were built, measured and thrown away first.
>
> **One acceptance criterion cannot pass and this is why.** `npm run fingerprint:check` compares a
> hash of the live `dqterrain` texture. That texture is the intermediate buffer this change
> deletes, so its hash moves by design. **Every other field is identical** — `canMove`, `blocked`,
> `mapData`, `tileLayerObjects`, all three bundle-only globals, `domUI`, `dqcanopy`, bundle md5 —
> and screen-level identity is proven instead, more strongly: **the rendered frame is byte-identical
> between the two builds at all six sampled cells in the browser**, and on the device no terrain
> pixel differs at all. See section 9. **This is a decision for the coordinator, not something I
> resolved myself.**

Owner's report, on a real phone: *"movement feels better but we have periodic pauses that make the
game feel clunky."*

| | |
|---|---|
| Base | `main` @ `09cfc0e` |
| Instrument | a round-5 diagnostic probe, `scratchpad/r5/` (`scripts/perf_probe.cjs` was NOT read-modified; sha unchanged) |
| Viewport | 960x720, dpr 1, real GPU (`ANGLE (Apple, ANGLE Metal Renderer: Apple M1)`) |
| Load at every run | 1-min average 1.99 – 3.64, ceiling 10 |
| Encounters | suppressed at `__GAME_STATE__.encounterManager` for the diagnostic walk, so no battle screen can masquerade as a stall (round 4's trap) |

---

## 1. The hypothesis in the brief: **half confirmed, half refuted**

**CONFIRMED — the pause is the terrain window step, and its period is exactly `MARGIN` = 12 tiles
of movement.** Every frame over 100 ms in every run coincides with a change of the window key
reported by `__DQ_TILES__.readyWhy().lastWin`, and nothing else in a 48 s walk exceeds 33 ms.

    tiles between window steps: 12, 8, 12, 2, 12, 2, 12
    (the 8s and 2s are direction reversals in the serpentine route, not extra steps)

Six base runs, worst step frame: **90.1, 94.8, 106.7, 109.8, 111.2, 121.9 ms**. Median walking
frame 16.7 ms throughout. This is the owner's "periodic pause", and 12 tiles is the number he
would recognise: at the walk speed the probe drives, that is one pause roughly every 3 seconds.

**REFUTED — it is not the GPU upload, and it is not the canopy compositing.** The brief's estimate
was ~28 MB of `refresh()` re-upload per step. Measured, `CanvasTexture.refresh()` costs **0.1 – 1.0
ms** for both canvases combined, and disabling both uploads entirely leaves the step frame at
**118 – 121 ms**. `a1aCanopy` accounts for about 15 ms of the ~110.

**REFUTED — it is not the water glint blend either**, although that is where it *looks* like it
lives. See §3; this is the trap that cost this round two attempted fixes.

---

## 2. What it actually is

**Any 2D draw into the live 2112x1824 window canvas costs a fixed ~65–100 ms once per window step,
and that cost does not scale with how much you draw.**

The decisive experiment. `a1aBlit` was replaced with a single `drawImage` of **one 48x48 pixel
region** — 0.0006% of the window — with the canopy pass disabled:

| what the step frame drew | worst step frame |
|---|---|
| everything (base + water + canopy) — the shipped path | 112 – 122 ms |
| base + water, no canopy | 98 – 100 ms |
| base only, no water | 108 – 114 ms |
| water only, no base | 106 – 116 ms |
| **one 48x48 drawImage, nothing else** | **66 – 97 ms** |
| **nothing at all (uploads still called)** | **18.9 ms** |
| nothing at all, uploads also disabled | 18.0 ms |

Removing any one pass leaves the pause. Removing *all* drawing removes it. Drawing 2304 pixels
costs about as much as drawing 3,852,288. The cost is therefore **not per-pixel work**: it is a
fixed penalty for dirtying a large accelerated canvas that the WebGL renderer is sampling every
frame and re-uploading with `gl.texImage2D`. The same fixed cost was observed landing on three
different call sites depending on what the code happened to do first — `drawImage` with
`'screen'` in the shipped build, `ctx.restore()` in the water-layer variant, and `texImage2D` in
the tiny-draw ablation.

A CPU profile confirms it is main-thread script, not rendering: the LoAF entry for the step frame
reports `renderStart` at +104.6 ms of a 105.2 ms frame, with a single 105 ms script.

**A control that matters:** the identical canvas → `refresh()` sequence, run on a texture that is
*not* being rendered (title screen, same page, same GPU), costs **0.1 ms at 2112x1824**. The cost
is not intrinsic to the canvas-to-texture path. It appears only when the canvas is simultaneously
live in the render loop, which is the shape the terrain window has.

---

## 3. Two fixes were built and both were refuted. Read this before trying either.

Both are recorded because they are the obvious things to try and both look right until measured.

**Attempt A — move the water glint to its own GPU-blended layer.** Per-call timing said one
`drawImage` with `globalCompositeOperation='screen'` at `globalAlpha=0.28` cost **94.5 ms** of a
109.8 ms frame, while the four base draws covering the entire window cost **0.1 ms**. So the glint
was moved to a third canvas texture `dqwater` drawn source-over, presented as a Phaser Image at
depth 2 with `BlendModes.SCREEN` and alpha 0.28. That substitution is exact, not an approximation:
canvas 2D `screen` over an opaque backdrop gives `Cb + A·as·Cs·(1−Cb)`, and
`gl.blendFunc(ONE, ONE_MINUS_SRC_COLOR)` over a premultiplied texture tinted by alpha `A` gives
`A·as·Cs + (1 − A·as·Cs)·Cb`, the same expression. `blendModes[3].func = [ONE, ONE_MINUS_SRC_COLOR]`
was verified in the shipped bundle at line 40067.

**Result: the 94 ms drawImage went to 0.2 ms and the frame stayed at 110–122 ms.** The per-call
attribution was measuring where Skia's deferred flush happened to land, not where the work was.
The `noWater` ablation says the same thing independently: remove the glint composite entirely and
the step frame is still 108–114 ms.

**Attempt B — give the window canvases `willReadFrequently`** so no GPU round trip is needed.
Built via `textures.addCanvas` on a canvas whose 2D context was created with the hint.
**Result: 206 ms, roughly twice as bad.** The canopy blit went from 5 to 75 ms and the upload from
0.6 to 9.7 ms.

---

## 4. What this rules out, including three of the four directions in the brief

| direction | verdict |
|---|---|
| **Ring / torus buffer** — write only the newly exposed strip, address modulo the canvas | **Will not help.** It reduces drawn pixels, and drawn pixels are not the cost. One 48x48 draw into the live window canvas already costs 66–97 ms. |
| **Blit-shift** — copy the overlap, repaint the edge | **Will not help**, same reason, and the self-copy is itself a canvas-source draw. |
| **Do not re-upload the whole texture / partial `texSubImage2D`** | **Reachable but pointless on its own.** Verified reachable from `public/dq-tiles.js`: `ct.source[0].glTexture.webGLTexture` exists, `flipY:false`, `pma:true`, and a 2112x576 strip uploads in **0.1 ms** with `gl.getError() === 0`. But disabling uploads altogether leaves the frame at 118 ms, so the upload was never the cost. |
| **Tighten the canopy gate** | Worth ~15 ms of ~110. Not the pause. |
| **Time-slice the repaint** | Cannot be sliced. The cost is one indivisible penalty for touching the canvas, not an accumulation of small work. |
| **Prepare-ahead double buffer** | Moves the same indivisible ~100 ms into an earlier frame. That is deferral, which the goal contract bans. |

The one thing all the evidence points at is: **stop repainting a large live canvas every window
step at all.**

---

## 5. Assessment of the per-chunk Phaser Image design (written BEFORE it was built)

Asked for by the coordinator: give each chunk layer its own Phaser Image at its world position and
let the camera scroll over them.

**The evidence supports the core claim.** In the live overworld scene, a 1536x1536 chunk texture
added and rendered costs a one-time **5–65 ms**, its first rendered frame **0.6–11.2 ms**, and
thereafter repositioning it costs **0.0 ms** and frames sit at vsync 16.7 ms. Scrolling over
already-uploaded chunk textures is free. The per-window-step penalty disappears because there is no
window canvas to dirty.

### 5.1 Facts about the plate that the design must respect

`public/act1-hifi/manifest.json`, verified against the files on disk:

- 30 chunks, a **5x6 grid**, `semanticBounds [16, 218, 163, 399]`.
- **Not all 512x512.** 20 are 512x512, 5 are 320x512, 4 are 512x352, 1 is 320x352 (manifest units).
- Shipped images are **3x denser**: base and canopy are 1536x1536 / 1536x1056 / 960x1536 / 960x1056.
  Water is at the manifest size (512x512 etc.) and is upscaled 3x at draw time.
- Canopy is a **pure alpha mask**, values `{0, 242}`, and **its RGB is NOT the base RGB** —
  checked on three chunks. So the `destination-in` composite is genuinely required; you cannot
  simply draw the canopy image. A per-chunk canopy Image therefore needs a **pre-composited third
  texture per chunk** (base coloured by canopy alpha), or a masking pipeline.
- Six of the thirty canopies are entirely empty (`c0-r0` alpha is uniformly 0), and several share
  a `canopySha256`, so the composite can be skipped for those.

### 5.2 The memory ceiling is the real risk, and it moves the wrong way

The existing cap comment is explicit: *"a decoded chunk is ~9 MB of base plus ~9 MB of canopy, so
every slot is ~19 MB of resident image"*, and `A1A_MAX_CHUNKS = 10`.

Today the **GPU** holds two window canvases, ~15 MB each ≈ 30 MB, and the decoded chunk images live
on the CPU side. Under the new design every resident chunk needs its own GPU textures: base 9.44 MB
+ canopy composite 9.44 MB + water 1.05 MB ≈ **20 MB per chunk, ~200 MB at the cap**. Keeping all
30 chunks resident, as "30 chunks is cheap" suggests, is **~600 MB and not viable on the phone** —
so the LRU stays, and the design inherits the residency problem the round-4 refutation already
flagged as an open item (the ring reaches 12 chunks on iPad and 16 on iPad Pro landscape, against a
cap of 10). **This must be measured on device, not reasoned about.**

### 5.3 What breaks, named

1. **`npm run fingerprint:check` cannot pass as written.** `scripts/equivalence_fingerprint.cjs`
   hashes the live `dqterrain` and `dqcanopy` textures and compares them to
   `docs/EQUIVALENCE-REFERENCE.json` (`f4082729@1920x1824`, `b3479dc5@1920x1824`). If the baked art
   stops being composited into those canvases, `texHash` returns the procedural content or `null`
   and the check fails **by design, not by defect**. The stated acceptance bar and the proposed
   design are currently incompatible. The honest resolution is to add a *screen*-level or
   *per-chunk-texture* equivalence field and re-derive the reference deliberately — not to loosen
   the check. **This needs the coordinator's decision before any code.**
2. **The procedural path cannot be deleted.** The Act 1 plate is 148x182 cells inside a 320x400
   world. Outside it, `drawTerrain` paints analytically into `dqterrain` and there are no chunks.
   So the window canvas must survive for the rest of the world, and windows that straddle the plate
   edge must show both (`a1aBlit(..., needFull=false)` at `dq-tiles.js:763` is exactly that case).
   The change is **additive, not a replacement**, and both paths must then be maintained.
3. **The boot-cover readiness chain.** `terrainState_ready` requires `terrainState.lastWin` (a
   window has been painted) and, inside the plate, `A1A.drew`. `A1A.drew` is set by `a1aCanopy`'s
   return value. Both need equivalents meaning "the chunks covering the hero are placed and
   rendered". `index.html:267` gates the cover on `__QOKUI.mapArtReady()`, which is the **minimap**
   bake (`ui-overhaul.js:1754`, `mmImgState`) and reads `scene.mapData`, so the minimap itself is
   unaffected.
4. **`A1A.dirty`** (`dq-tiles.js:1092`) currently means "a chunk landed, force a window rebuild".
   Under the new design a chunk landing just adds an Image, which is simpler — but the flag is read
   at `:3828` in the reskin tick and must not be left dangling.
5. **Depth ordering.** Terrain 1, overlay container 5, overworld prop images 6, hero 10 (bundle,
   `setDepth(10)`), canopy 11. Chunk base Images must sit at 1 (or just above the procedural
   canvas), chunk canopy Images at 11. Water sits between base and props.
6. **Teardown.** Two sites destroy `terrainState.image` / `.cimg` (`:3733`, `:3871`) on map change,
   plus `a1aHideCanopy` on every non-`ow` tick (`:3790`). Per-chunk Images multiply the objects
   these must find, and a leak here shows up as art from the overworld drawn over a town.
7. **Dungeons and towns are untouched.** They use `dqdngbase`, `dqdngfog`, `dqtownskin` and their
   own state; nothing in this design reaches them, provided the teardown above stays correct.

### 5.4 One round or several

**Several.** Concretely:

- **Round A — the terrain base layer only**, behind a runtime flag so both paths ship in the same
  build and can be A/B'd on the device without reinstalling. Keeps water and canopy exactly where
  they are. This alone is testable, reversible, and should remove most of the pause.
- **Round B — canopy.** Needs the per-chunk pre-composite and is where the memory risk concentrates.
- **Round C — water**, and retiring the window canvas inside the plate.
- **Plus, before any of them: the equivalence question in 5.3(1).**

**Yes, build it behind a flag.** Three separate reasons: the two paths must coexist anyway for the
world outside the plate (5.3(2)); the device is the verdict and an interleaved A/B needs both
builds present; and the memory question (5.2) can only be answered by comparing the two on a real
device.

---

---

## 7. What was built, and the device result

`public/dq-tiles.js` only. `A1A_SPRITES` at the top of the Act 1 sprite block is the switch.

1. **The baked plate renders from its own textures.** Each visible chunk gets one Phaser Image per
   layer at its world coordinates — base at depth 1.1, water at 1.2, canopy at 11 — so the camera
   moves instead of the pixels. `a1aRects` still runs, unchanged, so round 4's ring prefetch and
   the LRU are exactly what they were.
2. **`dqterrain`/`dqcanopy` survive for the rest of the world.** The plate is 148x182 cells inside
   a 320x400 map. The window canvas is hidden only while the window is *wholly* inside the plate —
   the one case where it carried nothing but baked art. Straddling windows still paint procedurally
   and the sprites draw over their half, as `a1aBlit(..., needFull=false)` always did.
3. **Chunk layers decode off the main thread.** `fetch -> blob -> createImageBitmap` instead of
   `new Image()`. This is not an optimisation on top; without it the change is *worse* than what it
   replaces (section 8).
4. **Textures are built ahead of the step, one per reskin tick**, from a queue fed as layers land.
5. **The canopy composite** (base coloured by the canopy's alpha — the canopy's own RGB is not the
   base's, verified, so `destination-in` is genuinely required) is done once per chunk on an
   `OffscreenCanvas` and handed over with `transferToImageBitmap`.

### Device, iOS simulator `4872FCF0…`, interleaved OLD/NEW, battles excluded

36 runs. A run is discarded if its usable overworld segment is under 3 s (an early random encounter)
or if the 1-minute load average exceeded 10 at either end; **23 runs survived both rules**. Every
frame called a stall was checked for world advancement: the gap-end change is 51.7–65.8% on both
sides, i.e. real repaints, not battle screens. `walk_moved_pct` confirms the hero genuinely walked
on every counted run.

**Cell (30,277)**

| metric | OLD (n=4) | NEW (n=5) | overlap |
|---|---|---|---|
| **worst walk frame** | **810.0 ms** (785.0, 805.0, 815.0, 820.0) | **46.7 ms** (35.0, 43.3, 46.7, 50.0, 50.0) | **NO OVERLAP** |
| **frames > 100 ms** | **1** (1, 1, 1, 1) | **0** (0, 0, 0, 0, 0) | **NO OVERLAP** |
| frames > 33 ms | 19 (14–22) | 11 (6–14) | overlap — not established |
| longest block anywhere | 810.0 ms (785–820) | 183.3 ms (166.7–186.7) | NO OVERLAP |
| median fps | 60.0 | 60.0 | overlap — the baseline says never cite this as evidence of smoothness |

**Cell (69,257)**

| metric | OLD (n=9) | NEW (n=5) | overlap |
|---|---|---|---|
| **worst walk frame** | **835.0 ms** (781.7, 785.0, 801.7, 816.7, 835.0, 850.0, 868.3, 906.7, 1275.0) | **133.3 ms** (50.0, 51.7, 133.3, 316.7, 366.7) | **NO OVERLAP** |
| frames > 100 ms | 3 (1, 1, 1, 3, 3, 3, 3, 3, 5) | 1 (0, 0, 1, 6, 6) | **overlap — not established** |
| frames > 33 ms | 10 (3–26) | 24 (6–40) | overlap — not established |
| longest block anywhere | 835.0 ms | 133.3 ms | NO OVERLAP |

1-minute load at run start/end: OLD 4.28–9.16, NEW 4.32–7.63 across every counted run (ceiling 10).

### The stall period, in tiles — the number the owner recognises

**Before: one pause every `MARGIN` = 12 tiles of movement.** Browser-measured directly — the window
key changed after 12, 12, 12, 12 tiles across a serpentine walk, and *every* frame over 100 ms in a
48 s walk coincided with one. Independently confirmed on device: OLD's 9.1 s walk contains **exactly
3 frames over 100 ms** in 5 of 9 runs, which is the 3 window steps that walk crosses.

**After: no periodic pause at all.** The window still steps every 12 tiles — `MARGIN` is unchanged —
but nothing happens when it does. The frames over 100 ms that remain at (69,257) are chunk arrivals,
which follow the map, not the hero's step count, and at (30,277) there are none.

## 8. The second cause — found, mostly fixed, honestly not entirely

The architecture removed the window-step pause immediately, and immediately exposed a different one:
**preparing a chunk for the GPU.** It is worth writing down because two intermediate builds were
*worse than the baseline*, and the naive version of this design ships that regression:

| build | worst browser frame | frames > 100 ms |
|---|---|---|
| base | 90–122 ms | 2 |
| sprites, textures built when a chunk first becomes visible | **205 ms** | 2 |
| + textures built ahead, one per tick | 78 ms | 0 |
| + `createImageBitmap` from the decoded Image | 136 ms | 2 |
| + `OffscreenCanvas.transferToImageBitmap` for the canopy | 136 ms | 2 |
| **+ decode from the blob, off-thread** | **21.8 ms** | **0** |

The load-bearing measurement, taken in the live scene on six real chunks:

| getting a 1536x1536 chunk onto the GPU | cost |
|---|---|
| `addImage(HTMLImageElement)` | 35.0, 42.3, 54.1, 62.7, 64.7, 67.7 ms |
| `createImageBitmap(thatImage)` | 43–72 ms (CPU-profiled by name) |
| **`addImage(ImageBitmap)` decoded from the blob** | **1.5, 1.8, 1.8, 2.1, 2.2, 2.6 ms** |

**What is still there.** At (69,257), two of five NEW runs show a worst frame of 316.7 and 366.7 ms
with 6 frames over 100 ms, against 50.0 and 51.7 ms on the other three. That is bimodal, not noise,
and it is a chunk arrival, not a window step. I have not chased it to a named cause on the device.
It is 2.3–2.6x better than the OLD median at the same cell and it is not periodic, so the owner
should feel it as an occasional hitch rather than a rhythm — but **"made much rarer and much
smaller" is the honest description at that cell, not "removed".** At (30,277) it is removed.

`frames > 33 ms` is UP at (69,257) (median 10 -> 24) and DOWN at (30,277) (19 -> 11); both overlap,
so neither is established. Some of the (69,257) rise is arithmetic: NEW covers 90.3% of the play
area in the sample window against OLD's 78.2%, because it is not spending 800 ms frozen.

## 9. Visual identity

**Browser, six cells, hero animation frozen, identical seeds: the PNG of the whole game canvas is
byte-identical between the two builds.** Cells (69,256), (40,250), (120,300), (30,275), (100,230),
(150,380). Zero page errors on both sides. This covers the water glint's move from a canvas `screen`
composite to a GPU SCREEN blend and the canopy's move to a pre-composited texture.

**Device, four cells, both builds installed and verified by md5 before each capture:** no terrain
pixel differs. The only differences are (a) a ±1-per-channel band at y 128–198 in the HUD region at
two cells, and (b) 162 pixels of one sprite at a different animation phase at (120,300) — the
screenshots are taken 14 s after Continue, so sprite phase is not controlled.

**Doors, both builds:** Greenhollow, Millbrook and Port Sapphire all entered by walking into the
door and returned to the overworld; Sunken Cellar entered, fog present inside, exited, and
**`dqdngfog` not visible on the overworld afterwards**. Zero page errors. (Port Sapphire missed on
the first scripted attempt on the fix and entered on both retries; base missed its walk-out on the
same script. That is my ad-hoc walking script's timing, not the build.)

**Mechanical, verbatim:**

```
REPIN OK: pins consistent, both gates green, frozen bundle intact.
```

`md5 dist/assets/index-BhoGQRaA.js` = `60d90b63607b6e6980eb170aeeed445e`.

`npm run fingerprint:check`:

```
EQUIVALENCE FAIL: this is not the same game. Fields that moved:
  dqterrain: reference f4082729@1920x1824  ->  candidate b3479dc5@1920x1824
```

`canMove 317b8b0a`, `blocked 78711`, `mapData 45756f2a`, `dqcanopy b3479dc5@1920x1824`,
`tileLayerObjects 0`, `has__QOK/has__tapItems/has__setControlOrientation true`, `domUI true`,
`pageErrors 0`, `bundleMd5 60d90b63607b6e6980eb170aeeed445e` — all match the reference.
`b3479dc5` is the hash of an empty window canvas: `dqterrain` is now hidden and unpainted inside
the plate, which is exactly the work that was removed.

## 10. Honest doubts

- **The mechanism is characterised, not named.** I can show the cost is a fixed penalty for
  dirtying the live window canvas, and I can show it is not the pixels, not the blend mode, not the
  upload call and not the canopy. I cannot tell you from inside the page whether Chrome is doing a
  copy-on-write of the 15 MB backing store, a GPU fence wait, or a surface re-allocation. The fix
  recommendation does not depend on which it is, but a claim that it *is* copy-on-write would be
  me guessing.
- **All of this is browser-measured.** The brief is right that the browser under-reports device
  stalls by 4.5–7x. What transfers unchanged is the **period**: `MARGIN = 12` is a constant, so the
  pause is every 12 tiles on any device regardless of viewport. What does not transfer is the
  magnitude, and WebKit on the phone is a different canvas implementation from Skia here — it is
  possible, though I think unlikely given the owner feels it, that the phone's cost is differently
  distributed. **A device run confirming the 12-tile cadence would settle it and I have not done
  one**, because the scope changed to diagnosis-and-assessment before I reached the device.
- **`addMs` of 5–65 ms per chunk in §5 is noisy and I do not fully understand its spread** (base
  layers cost 37–65 ms, canopy layers 5–12 ms, on identically sized images). If that is real, chunk
  arrival becomes a new hitch of its own, smaller than 100 ms but during walking. It would need to
  be paid at chunk-load time — where round 4's prefetch ring already gives a window-step of warning
  — rather than at first render.
- **My first two attempted fixes were both wrong**, and both were wrong for the same reason: I
  trusted a per-call timing that was really telling me where a deferred flush landed. The ablation
  table in §2 is the evidence I would keep; the per-call numbers in §3 are the evidence I would
  distrust.

- **The residual bimodality at (69,257) is unexplained.** Two of five runs at 316.7 and 366.7 ms
  against three at 50–52 ms is not measurement noise, and I stopped at "it is a chunk arrival, not
  a window step" rather than naming it on the device. If the owner still feels an occasional hitch
  while walking, that is where it is.
- **Memory was reasoned about and not measured.** Every resident chunk now holds its own GPU
  textures — base ~9.4 MB, canopy composite ~9.4 MB, water ~1.05 MB — roughly 20 MB per chunk
  against `A1A_MAX_CHUNKS = 10`, where before the GPU held two ~15 MB window canvases. The decoded
  ImageBitmaps replace the decoded HTMLImageElements rather than adding to them, so the CPU side
  should be a wash, but **I did not run the device memory A/B** (`scratchpad/device-ab-20260808/mem-ab.sh`
  exists for exactly this). Round 4's open iPad residency item is untouched and still open.
- **`createImageBitmap(Blob)` and `OffscreenCanvas.transferToImageBitmap` are newer platform
  surfaces than anything else this file uses.** Both are guarded and both fall back to the old
  `new Image()` path, and the fallback is the code that shipped — but the fallback is *slower than
  the baseline*, so a WebKit version that lacks them would land on the worst row of the table in
  section 8, not on the old behaviour. It works on the simulator's iOS 26.4. I have not checked the
  oldest iOS the app supports.
- **`frames > 33 ms` went the wrong way at one cell** and I have reported it as overlapping rather
  than explaining it away.
