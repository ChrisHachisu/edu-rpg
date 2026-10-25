# Final-r2 independent output review

Status: bounded static output and rendered-crop review passed. This is not app-runtime, native collision, or release acceptance.

## Source and output identity

- Final source freeze: `terrain-implementation-plan/generation-water-r2-final-r2/source-freeze.json`, SHA-256 `c21e9773a8fcb141a6ae562ffdec0d17e1d90347ad48e69007ded7602928bf9e`. Recomputed all 33 frozen source-file hashes: 0 mismatches. Generator SHA `c92ef8328f4f4d1190cb6d051320aac356cd710877716d2a22e67f4e4e5e8d22`; overlay SHA `ddcd827c2343772ea2b2b7391ea123acd16153ee45dfde5ca87a3d28a93b104d`; A1OW/DQ source identity record SHA `c154db43b899e07db58d27adb55767ad42c906f6133bcca258280db5b7151484`.
- Author handoff SHA-256 `ba22a440ad62376c2f0c2478d82ad94a5d3f277850e35e989f3b065bbe6b053e`; A/B receipt SHA-256s `ea0d4e5792aa03df8e82e901115bf60734e752c8f61d8a308784c58cb2b3bb48` and `379376e6db270a7c7c1d2f14abed46bb0404a7bb7ed440db972fadae6cd50ecf`.
- Independently recomputed both inventories: each has 494 files, all receipt byte/hash entries match; no A/B path or file-hash differences. Manifest hash is `fbad11cf27c35be30e0fed8cade9a68019bee7a3b368e4cf67d8dd3dcaa2ad88` in both.

## Final-r1 comparison

- The 50 changed inventory paths are limited to 45 R2 water chunks, two base chunks, the 6ppc underpaint, the FM contacts overview evidence, and the manifest.
- Across 120 water chunks, RGB is unchanged from final-r1. I independently compared alpha against the exact semantic-W source mask and accepted contact mask: 477,625 alpha pixels changed, 0 outside those masks, and every changed pixel is now alpha 255. The contact delta is 842 pixels; 812 needed water-alpha promotion because the other 30 were already opaque.
- Base alpha changed in 812 pixels, all inside the accepted contact mask. Visible base RGB is unchanged wherever both versions remain opaque; 168 RGB-only payload differences are outside the mask where both old and new alpha are zero. Underpaint RGB is unchanged; its 23 changed pixels are alpha-only and within the nearest-neighbor 6ppc projection of the contact mask.
- Current final-r2 and final-r1 match for the raised-art alpha PNG (`267f7bd1…526bbeb`, pixel digest `760406a0…a8ef58`), north-support alpha (`d339fa63…24b13a`), union alpha (`0baf807b…d468fae7`), and QOK collision pack (`a0d08d9d…d6307e`). The union remains 1,414 new support bits with packed-bit digest `72558e1a…6e43b3d`. These exact byte matches let the already-reviewed final-r1 collision proof be reused; this check does not establish native movement/collision behavior.
- The final north mask remains 8 components / 37,893 pixels, with zero recorded art, non-M, collision, hero/route, or corridor overlap; no west/east/south map escape.

## Rendered crops

- Reviewed sprite NORMAL/1 crops and corrected actual-stack fallback crops for north rim, east shore, meadow shore, and lake/forest. North cliffs meet continuous global-phase water; the meadow and forest shorelines remain legible; no grass ribbon or uncovered patch appears at the reviewed north/east cliff-water edges.
- Corrected fallback manifest SHA-256 `a91c149d010dc253c797b9ed1ec3650f41b0c39284e58f07e49d27c749866c38`. Its compositor includes the DQ full-screen world-phased sea (depth 0.5), north-prefix backing (0.6), in-bounds 6ppc plate (0.7), and streamed layers. Independently compared all six fallback crop PNGs against the sprite NORMAL/1 crops: exact file hashes and decoded pixels match, 0 differing pixels.
- The earlier `rendered-crops-plate-fallback-r2` full-north image showed black/green bands because its harness omitted the full-screen `a1aSea` layer and clamped the 6ppc plate outside semantic bounds. It is superseded by `rendered-crops-plate-fallback-actual-stack-r2b`; do not use the earlier image as product evidence.

## Limits

These are static source-generated composites, not an app screenshot. Final-r2 receipts still say `gateReady: false` and `nativeVerified: false`; descriptor/validator admission closure and native movement, collision, saves, device, and TestFlight checks remain separate.
