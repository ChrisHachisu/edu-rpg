# Act 1 current terrain source profile inputs

This new profile bundles the current owner terrain and semantic authority, the whole-Act1 forest/cliff placement authorities and atlases, the preserved R4 renderer/config/material inputs, current map/spawn/manifest authorities, full selectable hero sheets, and the preserved full-map authored route/start/approach/hero guard arrays.

**Provenance:** this is a newly assembled current-source profile. It is not historical R8/R9 recovery, does not alter those historical validators or pins, and does not claim to reproduce the full-world output. The 2,061 forest placements and 194 cliff placements are full-Act1 source authorities; the earlier visual checkpoint itself remains a crop-only, preview-only result.

**Scope:** terrain ground-only plus approved forest/cliff object inputs. Landmark painting is disabled in this profile; runtime landmark assets remain separate and unchanged. The old composer’s R6 solid mask remains an unresolved historical dependency. It is not substituted here, and whether a newly authored object compositor needs it is undetermined. The guard arrays do not bind to Cnew current `dq-tiles.js` or active hifi manifest hashes, so they are not current route-safety proof. The complete whole-world generation recipe and current route-reachability/cave-access proofs remain unresolved.

Run `python3 verify_bundle.py` to check every bundled input path, byte count, and SHA-256. Run `python3 verify_bundle.py --self-test` to prove valid inputs pass and missing, corrupted, or unsafe-path inputs fail. Verification checks bundle integrity only; it does not render or approve the profile.


## Portable crop check

`render_ground_crop.py` uses the byte-preserved R4 renderer with bundle-relative manifest, R26, semantic mask, configuration, and atlases. It installs an explicit file-open fence that denies asset reads outside the bundle and installed Python runtime. A clean relocated copy rendered the 640×512 meadow-only crop at window `[1568, 208, 320, 256]` (world-16 units, 32 px/cell); its RGB pixel hash exactly matches the approved v2 ground crop. See `relocation-receipt.json` and the W-side `ground-crop-proof.json`. This validates only that bounded ground-only rendering path.
