# Ground material repair checkpoint

Status: W-only corrected ground output is ready for independent review. No public
files, profile descriptor/pin, app source outside the generator, build, or native
candidate was changed.

## Cause and change

The old compositor rendered a second clean-meadow image and binary-pasted it into
owner forest/mountain (F/M) cells after rendering the R4 material mixture. The
same world-phased meadow texture therefore met materially different R4 mixtures
at the owner-cell boundary, producing crisp 32-pixel rectangular RGB steps visible
in the native join screenshot.

The generator now marks only non-water owner F/M cells as meadow in the one R4
material grid before composition. R4's world-anchored sampler and ordinary
neighbor blending then continue across those boundaries. Water cells remain
untouched, and the existing effective route factor is preserved: 1 inside owner
F/M and the original R4 meadow factor elsewhere. The adjustment divides without
clamping and fails if positive route contribution would require a zero meadow
weight. Route weights, meadow weights, and the resulting effective factor are
checked against [0,1].

## Frozen source and replay

- Candidate: `/Users/chris/.codex/workspaces/edu-rpg-forward-20261007`
- Changed source only: `design/terrain-current-profile-20261007/generate_forward_profile.py`
- Previous generator copy: SHA-256 `2bd8c853cfa15fbdcd32d5771d33efc48707c4f269f03f74e5fa1f0f4ff14b1f`
- Current generator: SHA-256 `d7d9fb98e585d1f3d9226d0a38d7202fdf234fa6c92b8820e0341c9fbe317707`
- Replay runner: `replay_ground.py`, SHA-256 `b78da33a887e4d21ef27ebdb8575a8a191f824b83ae8a60ea1f6a6e3b8e4e26f`
- Checkpoint finalizer: `finalize_ground_replay.py`, SHA-256 `d62a97685f4bce25cfef237e0937a4329cab9cdf228aa48c7a192ce30068facf`
- Output report: `ground-replay-checkpoint.json`, SHA-256 `086e9c4db06900bdb5a01ace8784cbf275396488bdff06c07c348b49296af47d`
- Output A: `A/chunks/base/` has 120 decoded corrected WebP chunks; `A/underpaint/act1-plate.png` is a normally completed 888x1092 6ppc render (SHA-256 `3cbb33a9bc78bbbfa0b8ab8300d8c85a21f24014f176c488959fda0f1e163b1d`).
- Visuals: `visual-ground-contexts.png` (SHA-256 `cef23015bc9f99c923cf7ad4668bcb96069a350256a25ae1a92d00adcea71617`), registered native crop before `visual-native-registered-before.png` (SHA-256 `bf26ecfbb015bf18cdd6c37b42f1747354205dfe2a0f497227f0119d39171dca`), and after `visual-native-registered-after.png` (SHA-256 `6d2ab5ca321b50a182569f39feeef2e91a7a9caffd95b4dd7c19dde6e5e5c7aa`).

My checkpoint watcher sent SIGINT after it observed the complete A base set, but it
mistook the fallback path's early file creation for a completed write and interrupted
Pillow while it was still encoding. The partial PNG is excluded. All 120 A base
chunks completed and decoded. The fallback was then rendered normally to a temporary
file, decoded and geometry-checked before replacing the partial file. There was no full
B replay. Five independent renderer windows (full c7-r3, forest/plain,
mountain/plain, water/shore, and a route-bearing area) were rerendered and match
the corresponding A ground bytes exactly. This is sampled determinism, not a full
second-generation claim.

## Checks

- `python3 -m py_compile` passed for the changed generator, replay runner, and finalizer.
- Focused guard test `python3 test_ground_policy.py` passed: F/M-only reclassification,
  unchanged non-F/M classes, and fail-closed malformed shape/class/water-overlap cases.
- Frozen source output receipt: all 488 listed rows rehashed before replay.
- All 120 corrected A base chunks decode with expected dimensions.
- 32ppc route-factor check: all 120 manifest windows, 764,330 route pixels,
  285,451 inside F/M, 0 changed effective-factor pixels, maximum delta
  `7.589868178392578e-08`.
- 6ppc route-factor check: full fallback extent, 26,902 route pixels, 10,049
  inside F/M, 0 changed effective-factor pixels, maximum delta
  `5.960464477539063e-08`.
- F/M to R4 water class overlap: 0. No divide-by-zero or clipping path is accepted.
- Changed ground: 964,243 high-resolution RGB pixels across 70 base chunks and
  34,967 low-resolution fallback pixels. The other 367 frozen output-inventory
  rows were revalidated against the frozen receipt (canonical rows SHA-256
  `105cfba25556bbda56799c8d113d8fc50c5ca4770edc10882bf53e9bcb4c9bb0`).
- Forest, canopy, water, alpha, manifest, and collision sample rows retain the
  frozen hashes in the JSON report. Existing A1OW is unchanged at 9,688,640 bytes,
  SHA-256 `d87c6572cbf3012180a289196cfe5e7eee7c50dc86beb06a999fa491eeacfdf3`.
- Registered before/after crops show the previously visible rectangular patches
  removed while preserving crisp grass pixels and raised forest/cliff artwork.

## Limits

This is static renderer evidence only. The corrected outputs have not been
installed in `public/`, rebound in the profile descriptor, built, or tested on
phone/tablet. Fallback RGB was regenerated; no claim is made that its resampled
alpha silhouette equals the 32ppc collision mask. Independent review is the next
checkpoint.
