# Independent ground material repair review

## Verdict

**PASS for the bounded W-only generator/output repair.** I found no blocker in the changed ground-composition policy, the corrected registered seam render, or the preserved-output checks. This does not approve public installation, descriptor repinning, building, or native gameplay.

## Reviewed freeze

- Generator: `design/terrain-current-profile-20261007/generate_forward_profile.py`, SHA-256 `d7d9fb98e585d1f3d9226d0a38d7202fdf234fa6c92b8820e0341c9fbe317707`.
- Frozen report: `ground-material-repair-20261007/REPORT.md`, corrected SHA-256 `eb47f3a86833ceb6e3bc4de61aaf54903659fa3838a7bb46bf1c9eff13b7461d`.
- Checkpoint: `ground-replay-checkpoint.json`, SHA-256 `086e9c4db06900bdb5a01ace8784cbf275396488bdff06c07c348b49296af47d`.
- Focused test: `test_ground_policy.py`, SHA-256 `7972865d3849d6211eab273ca546c39aa584803df09e1ed5a3e24c73fb84998b`.

## Independent checks and observations

- Focused policy test passes. It checks exact F/M-only reclassification, preservation of all non-F/M classes, and fail-closed shape, class, and water-overlap cases.
- Independently reran route-factor audit: 120 32ppc windows / 764,330 route pixels and full 6ppc fallback / 26,902 pixels. Both had zero changed effective-factor pixels and zero positive-route pixels with zero new meadow weight; maximum deltas were `7.589868178392578e-08` and `5.960464477539063e-08`. Production composition multiplies route weight by meadow weight, so the adjusted intermediate route weight above 1 remains bounded by the preserved effective product; no clipping or new route artwork is introduced.
- Independently decoded all 120 corrected A chunks at manifest geometry and the 888x1092 fallback. Protected manifest/collision/raised-alpha/water/canopy/forest hashes and A1OW hash match the frozen checkpoint.
- The registered native-scale before/after crop shows the crisp rectangular grass boundaries removed while retaining the approved raised forest/cliff edge. Broader context crops show continuous meadow through forest and mountain boundaries, with water, shore, road context, and object layers intact.
- Five fresh windows match A bytes exactly: native-mapped c7-r3, forest/plain, mountain/plain, water/shore, and route context. This is sample-based determinism, not a second full generation.
- The implementation replaces the extra binary meadow paste with a single R4 material field: only nonwater F/M owner cells are reclassified before rendering. Water stays protected; route effective factors are preserved.

## Limits

The corrected files remain W-only. Fallback alpha is not claimed to equal the 32ppc collision silhouette. No public installation, descriptor repin, build, phone/tablet run, or native movement proof was performed.
