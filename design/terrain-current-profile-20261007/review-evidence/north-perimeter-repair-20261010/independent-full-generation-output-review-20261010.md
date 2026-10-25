# Independent full-generation output review — 2026-10-10

## Result

PASS for the audited deterministic generation outputs and bounded north-gap pixel changes. This is source/generated-artifact evidence only; `gateReady=false` and `nativeVerified=false` in the generation receipts. It is not runtime, simulator, or release acceptance.

## Bound artifacts

- Generator SHA-256: `95187a9c632e0b6678c04e75614b28f1268dbed9f79f4dfcb4944351767e8af1`.
- Full output audit: `generation-enclosed-gap-v1/generated-output-audit.json`, SHA-256 `80f825c0730771605bef9b3fd61c381d24a56404941c570274dc2e9ca6aefb68`.
- A/B inventory comparison: `generation-enclosed-gap-v1/regeneration-comparison.json`, SHA-256 `36648d40429a70e9c74eb899c7de46b3b6463b9a1df05dd32b86dde307342a40`.
- Generation A receipt: SHA-256 `32769af3bececee5423d77e2314c61edee59ae2fa43593e9eee972a396477599`.
- Generation B receipt: SHA-256 `d99dbfa3800b6a707bb31a0a41cae2208269e84d620c718218238ecb343012f2`.
- Accepted north-gap mask: `bounded-branch-accepted-mask.npy`, 4,026 pixels.
- Changed-region sheet: `bounded-branch-all-components-c3-c9.png`, SHA-256 `d2c51fac908b5e476f37884e67fad0ee51935691666b82013bbf6eeec9e8c2a8`; component inventory SHA-256 `a5c5d992163bb55635a1ca293d02b4c1e25df8e9cf095d3678b1ecd11bd31e75`.
- Generation A full overview: `generation-enclosed-gap-v1/clean-generation-a/evidence/fm-contacts-overview.png`, SHA-256 `7a1d87d945bd8a75c8a738c882e4f5486bab6c70ae638a3a346443985b6d98e3`.

## Independent verification

I rehashed every one of the 493 listed output files under both A and B. Every byte count and SHA matched its receipt; the receipts are equal after removing only `generationLabel`. The recorded A/B comparison has no inventory mismatches. Compared with the accepted output inventory, exactly 10 rows changed: the seven north base chunks c3–c9, `manifest.json`, the coarse underpaint plate, and the FM contacts overview. Other inventory rows are unchanged.

I decoded the seven changed base chunks and compared their alpha changes to the accepted mask. The 4,026 mask pixels match exactly 4,026 added alpha cuts; there are zero restored alpha pixels and zero RGB mismatches where the generated image remains visible. The 4,025 RGB differences are hidden under newly cleared alpha. The 132-pixel coarse underpaint cut matches the projected mask according to the audit, with RGB unchanged. The c5 target is cleared; decoded c9 bottom rows y=220–255 remain RGBA-identical to the accepted output. Forest, water, canopy, north-support, collision, forest fallback, and A1OW identities are unchanged in the audited inventory.

The generated manifest records the reviewed rule: a global 4-connected component must be adjacent to the preserved prefix, owner-M at each candidate row, and in a cliff-contact column; components reaching the approved band bottom or plate side are rejected. Its counts are 6,146 candidate pixels / 23 components, 15 accepted components / 4,026 pixels, and 8 unseeded components rejected. The actual generation-A overview and the all-c3–c9 changed-region sheet were inspected. The sheet's source record identifies the before image as the accepted metadata-rebound output and the after image as actual clean-generation A.

The overview still reports **six retained residual pixels in three disconnected components**. The accepted baseline overview carries the same six-pixel caption; these are the pre-existing accepted natural residuals (2, 1, and 3 pixels), not new cuts from this generation. This review does not claim every visible fleck was removed.
