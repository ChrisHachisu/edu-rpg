# Independent final water-r2 output review

Status: paired-output integrity and QOK reconstruction pass. Visual acceptance awaits an image composed in the primary sprite path; the earlier crop used the canvas fallback blend. Static generated-output evidence only; no app copy, runtime, native collision, or release acceptance.

## Frozen identities

- Source freeze: `terrain-implementation-plan/generation-water-r2-final-r1/source-freeze.json`, SHA-256 `fa7840b4864e445884610ad40ff11cd4fd90bf3eba41a63ebc8a3c02ede89a90`.
- Generator: `design/terrain-current-profile-20261007/generate_forward_profile.py`, SHA-256 `ada1236ffbe937f8ad700c3124c1c7c9ae6e73e4488e83f05cf9d20c7125e97a`.
- Final 18-removal overlay: `placements/cliff-current-feedback-overlay-v1.json`, SHA-256 `ddcd827c2343772ea2b2b7391ea123acd16153ee45dfde5ca87a3d28a93b104d`.
- Water recipe/texture SHA-256: `ca6369ce2334e07768e5ffeff37823400d1a9fca84ac6949842386ed3c22cec1` / `39e7ae458009fc28b6060b1d2a58faa5dadcca356e382f602358eaf7dce3dbd0`.
- Overlay-bound A1OW source-only record: SHA-256 `bbd871d26a2aef234faa91fc54bd6c9dc658473ac65ac2592e6bfcf6d59fbdc3`.
- A/B receipts: A `d7251a90e2fca436d28c91a3b113f46858f3b3d55d684dca9d376d976ebdc4d5`; B `7800284f5b2f2d4cd42ad8d0788e9eec4dc3f0be3fbf58d68cbdf973cf4464ef`; comparison `62ef61e70e6aa6cb487d78c3845825a983ff7914f9a584ca0a3064b5ebdbc632`.

## Independent integrity checks

- Both generated inventories contain 494 files; I hashed every listed file and checked the on-disk path sets. Each has zero missing, extra, or mismatched files. A and B inventory dictionaries are exactly equal.
- I decoded A and B `final-visible-raised-alpha.png`, `north-support-collision-alpha.png`, and `final-visible-plus-north-support-collision-alpha.png`. The union PNG is exactly the binary OR of the two inputs: 10,483,376 raised-art pixels, 11,479 support pixels, 1,414 new collision pixels. Independently packing the union produces SHA-256 `72558e1a7605850a657d32b52c5c49ad7d07a6f83ec3069bdfeaba1956e43b3d`; rebuilding the 64-byte QOK header and packed payload reproduces both `forest-collision.bin` files byte-for-byte, SHA-256 `a0d08d9d1bae329355f9c44b60d6b3484f5e00717386d7d99cd4a8f309d6307e`.
- The actual chunk forest-alpha assembly equals the generated visible-plus-support union PNG. The separate baseline raised-art plane remains independently identified by the current geometry-event render in the generator; it differs from the output union only at the 1,414 support-only collision pixels.
- Compared against the earlier 15-removal r6 output, the final raised-alpha plane contains no new opaque pixels and removes 5,733 pixels in exactly three strips: x=4704..4733, y=2528..2637; x=4704..4733, y=4448..4557; x=4704..4733, y=4576..4685. Each is 1,911 pixels, matching the three added whole-event removals at world y=297, 357, and 361. This is localized to the authored edge tips; it is not evidence for any other prior collision baseline.
- The current 8-component north-sea mask proof reports 37,051 accepted pixels and zero visible-art, collision, non-M, hero/route, corridor, or boundary overlap. A1OW source-only equivalence is tied to the current DQ and final overlay. These checks do not establish visual output acceptance.

## Visual diagnostic — production compositor still needs review

Reviewed generated compositor crops directly:

- `terrain-implementation-plan/generation-water-r2-final-r1/rendered-crops/north-rim.png` (SHA-256 `7ee8796ffaa9146b780bcee9471d00b981ba7c82cad42ab2f0ff256bbfdc3b36`)
- `generated-northwest-zoom.png`
- `source-northwest-zoom.png`
- `terrain-implementation-plan/generation-water-r2-final-r1/rendered-crops/northwest-green-layer-breakdown.json`

The north-rim crop has a strong horizontal texture/palette step at y=320, exactly the world y=218 map boundary. The deep patterned global-phase backing above the map does not visually match the brighter, smoother in-map water composite below it. The generated northwest zoom also shows a green fringe at the seaward cliff edge.

For the fallback crop, all 5,213 diagnostic green-tint pixels have base alpha; 5,187 have no forest/north-support alpha; 1,167 are semantic-W; only 1,427 have water-layer alpha. RGB was used only for diagnosis. This does not establish whether green pixels remain visible under the primary sprite blend.

Recommendation: hold visual acceptance pending a crop composed in the primary sprite path. If that image retains the water step or green land at direct semantic-W rock contact, fix the source coverage/backing; otherwise the fallback crop is not a blocker. Preserve M/plains/forest shapes; do not select pixels by RGB or coordinate box.

## Layer-order trace for the blocker

The generated crop manifest states its layers as global-phase r2 backing, generated base, generated water-r2 at 0.28, generated north support, and raised forest/cliff. In the generator, `generate_forward_profile.py` lines 1751–1772 derives the backing mask, applies the base cut, and passes that mask to `render_water_r2`; lines 1789–1794 write the raised layer and R2 water chunk. The runtime DQ canvas compositor draws base, screen-blends each water chunk at alpha 0.28, then draws north support (`public/dq-tiles.js` lines 2353–2357). The whole-object sprite path instead draws R2 water at normal alpha 1.0 (`public/dq-tiles.js` lines 3144–3147 and 3184–3185). Its plate water backing is below streamed plate sprites (`public/dq-tiles.js` lines 3324 onward). The reviewed crop represents the fallback blend; the primary visual acceptance image must use normal/1.0 sprite blending.

Failable retest for the targeted correction: use regenerated A output only; check the crop manifest binds that receipt and current source hashes; inspect `north-rim.png` and the actual generated zoom at x64–78/y218–232; require no prominent horizontal palette/texture step at y=218 and no green-base reveal on semantic-W pixels at the direct cliff/water contact. Recompute the layer-membership diagnostic in this crop (green base-only over semantic W must be zero); retain M/plain/forest art outside true water, and do not use RGB or coordinate boxes to choose pixels. Verify the reviewed collision union/QOK bytes remain identical or report any changed bits for a separate collision review. A crop harness-only change does not satisfy these checks.


Review correction: the original visual concern was based on a canvas-fallback compositor crop. It is evidence for that crop only, not a finding against primary sprite-mode output until the normal/1.0 R2 path is inspected.
