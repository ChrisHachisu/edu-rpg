# Independent A1OW source-equivalence review

- Record: `design/terrain-current-profile-20261007/review-evidence/cave-reentry-20261015/a1ow-source-equivalence.json`
- Record SHA-256: `a9e7ca02240613adf34d864016ef9f6083cd913a6b89eba54d22ade35aee2c55`
- Exact prepatch DQ: `ca2447a5e816455e1f2441687d01839e1cce8192df9f116f486de0aff98fc5df`; current public/dist DQ: `6a605a8f0d7d2513871c9b8e5a18f30fa7a403ee2ec0e42a4f1646d2e4d5da1d`.
- The full prepatch-to-current diff has exactly three hunks, all before `var A1M_FOOT=12;`; the complete tail is byte-identical at `7974f54097586584fb1d3a7fd2d3a483055ec52d4e2f2699581f46ec15256be9`. This preserves A1OW parser, hero-foot projection, support functions and collision runtime code.
- The strict decoder recomputed the unchanged A1OW v2 header, payload, semantics and support values. Public, dist and iOS A1OW binaries all have SHA `00a520ae09089547ca4af4ef1077b84acdad98d4989de238f3ee30e28ad092c6`.
- Current world-map SHA `fb466fc6dbe7e05ccbb209c70867cacf4f903d55837ea69ca716e81f7196c96f` matches the baked map proof. QOK bytes decode to union source `0baf807bfd429b8ae945439c62c23610fcf62ae0fa6eeae01dcbf5c7d468fae7` and payload `72558e1a7605850a657d32b52c5c49ad7d07a6f83ec3069bdfeaba1956e43b3d`; the current independent union and safe-cell records still bind those bytes.
- The focused re-entry test passes, and the exact-prepatch source run fails at the expected missing-image assertion. The current generator's `verified_a1ow_v2_source_overlay()` passed in memory against these exact final record bytes and this SHA.
- Metadata still pins the prepatch DQ review, and the iOS DQ mirror remains prepatch. This is source equivalence only, not rendered/native acceptance.
