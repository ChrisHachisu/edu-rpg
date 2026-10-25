# Independent A1OW source projection review — cave roof fix, 2026-10-16

**Static source projection: PASS.** This result approves only the narrowly versioned DQ source-equivalence claim and its listed static evidence. It does not approve a build, native candidate, device run, or release gate.

## Reviewed source boundary

The public and dist `dq-tiles.js` files are byte-identical at SHA-256 `b12d7eedea5420d18605633d66ee698fda24a538e1b026e9e7a092b3a1ddcb0a`. Removing the single 5,924-byte Whispering Woods helper span (SHA-256 `aa296bb0b49c98ef002ea5593e22e9db52adf9aff7f0fe013a1e1146d30db634`) and the one 53-byte `a1mFree` callsite (SHA-256 `3bc0cf4dc07804c8025f4db4a4bb71b699be8b0386746bc80dfe9955cd9538e0`) reconstructs the pinned earlier DQ source exactly at `6a605a8f0d7d2513871c9b8e5a18f30fa7a403ee2ec0e42a4f1646d2e4d5da1d`. The twelve selected A1OW parse/support/hero-foot/full-hero functions match their pinned baseline projections; `a1mFree` matches after removing only the exact new call. The old `7974f540…` tail identity is retained only as a normalized semantic baseline for DQ `6a605a8`; it is not described as the current candidate's full-tail identity.

The unchanged A1OW payload is SHA-256 `00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6`; QOK is `a0d08d9d1bae329355f9c44b60d6b3484f5e00717386d7d99cd4a8f309d6307e`. The pinned Whispering Woods PNG is `a06eea6ab98c7c630119db1488dfea912a40bc69150ac16e387b4e696aa5f047`.

## Mask, contact, and regressions

Independent rasterization of the clipped cave material mask exactly matches the embedded 2,592-byte bitset: 4,808 solid cells, alpha threshold 128, zero solid cells outside visible PNG alpha. The corrected preview overlays that mask on the pinned image. The production gate check confirms the recorded P1 roof point and both cave sides are blocked, exterior and neighboring grass and the channel stay free, and 101 samples along the southern approach through the existing door cell stay clear. This is a static collision-path check; it does not prove a live scene transition.

The mask generator check and DQ landmark-contact and scene-reentry checks passed for both public and dist sources. The combined-runtime browser diagnostic is retained in `browser-egress/independent-result.md` with its result JSON and screenshots: it used the prior immutable App public tree with only the reviewed DQ file overridden in memory, then observed P1 Continue and usable movement around the cave. This is browser-only diagnostic evidence and is not native or exact-built-candidate acceptance.

## Consumer boundary and source pin

The generator and preparation validator now accept only the strict v2 exact-local-delta record alongside their existing v1 branch. The validator constrains all external proof paths, including the test-run receipt, to the approved evidence root. The focused consumer suite passed with six tests, including positive v2 generator/validator cases, v1 compatibility, a generator legacy-v1 predicate regression, and rejection of malformed projection, bad contact receipt hash, and escaped `/etc/hosts` receipt path. The current test module now reads the integrated target `design/terrain-current-profile-20261007/review-evidence/cave-roof-20261016/a1ow-source-projection.json`; rerun it after this staged record is integrated.

The current validator source SHA-256 is `f669be8f6087e62453746790142f8821bafd24d828a0d1754487579fb9359c6f`. Replacing only the new `cave-roof-20261016` snapshot path with the prior `water-r2-final-20261013` path reconstructs the preceding consumer-reviewed validator SHA `8fd803b2aff1ee16dae897bd3e3b67a8af78065bfeb84039c6618f62b09ea680`, confirming that the later source edit changed only this versioned path constant. After removing only the descriptor-pin line, normalized bytes are 124,248 bytes with SHA-256 `86032cb2c9d19245d04fce6b9dacd572e97845565e7b4061af1246bdf068bf06`, matching the newly staged versioned validator snapshot. The old Water R2 snapshot remains untouched (`9bd35847c1fc37cd2aa242ae682bacfaadf4bfc29a5470aec886948d46d25d4d`); it is not reused as current validator identity.

The generator source reviewed by the focused consumer suite is `2a8c37fdc80edef953171ffd4aa13ceccfbd8a16f49fa0eca5c668ccab1f2027`. The current test module hash is `121f33a603aeeb7dad4385c1636caa61b3730db57ac04b92ec472ccd26ed29ca`. The six-test suite passed with the valid v2 projection sourced from the W staging record. The test module was then pointed to the intended repository evidence path, `design/terrain-current-profile-20261007/review-evidence/cave-roof-20261016/a1ow-source-projection.json`; its rerun awaits root materializing that exact staged record. This report does not claim that pending rerun.

## Scope limits

The new source projection asserts `nativeOrRenderedPassClaimed: false` and `wholeCollisionRuntimeTailIdentical: false`. No production descriptor, gate pin, generated manifest, preparation receipt, or native build is changed by this evidence staging. Native candidate behavior and production integration remain pending root review.
