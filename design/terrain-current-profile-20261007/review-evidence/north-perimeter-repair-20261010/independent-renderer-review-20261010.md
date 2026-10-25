# Independent DQ Renderer Review

**Result: scoped PASS** for base-underpaint fallback, retry, eviction/re-entry, and fractional chunk seam geometry. This is not a native-device or full visual release pass.

## Reviewed identities

- Current `public/dq-tiles.js`: SHA-256 `2012fbce196d2c1ed2b62a1bb09cb8325292da35ca9d2a4b2f93542a5e5167ac`.
- Focused regression `scripts/test_legacy_plate_bleed.cjs`: SHA-256 `2005715c9a8e45d91f5ff2132aa00ff8883c61f255ad201c0ef2d881cae5f31b`; prior independent run passed 11/11.
- Frozen Release84-north App public tree: `.../derived-release84-north/Build/Products/Release-iphonesimulator/App.app/public`; only `dq-tiles.js` was intercepted to the reviewed source. App identity candidate `1a6b12cb98d031250353863b396ee3de8cbe2cfb6e5d60c527fc0dd640a0d235`, App SHA `9c5131d348d33efb0029d2ec57e8ff65dfe4bd7d70c093329523c6b5dbe9bdb0`.
- Independent browser harness copy SHA-256 `5431ba284b9e2c912c89d4998e64905d2f49b65400f1538af9329a0248d320a6`.
- Final browser result JSON SHA-256 `97be55600f9ffe89413f58d5f74090d020b863ada1d3f9b5f229aeb1b106a861`.

## Observed behavior

The exact frozen App starts at a test Continue save at overworld `(106,229)`. The harness injected one HTTP 503 for `c5-r0` and held its retry. While that retry was pending, the c5 base sprite was absent and the fallback mask center remained alpha 255. After retry release, the third request completed, c5 became visible, and the same mask sample became alpha 0.

A renderer-only relocation to runtime-authority-approved `(89,233)` moved the hero and followed camera in the actual rendered scene; c5 then left the visible sprite set and fallback alpha returned to 255. At capture, `queueDepth` was still 6 and unrelated visible base keys had changed while neighboring chunks drained. Eviction stability therefore used camera, hero, c5 presence, and mask alpha—not global queue emptiness or equality of all visible keys.

A second renderer-only relocation to runtime-authority-approved `(94,233)` brought c5 back; the third request confirmed a real reload, c5 was visible, and fallback alpha returned to 0. No route traversal is claimed for these fixtures.

The harness set camera scroll to `(2979.37,7451.61)` and recorded that immediate state, then the game camera returned to `(2979,7451)` before the later geometry sample and screenshot. This is consistent with the exact frozen runtime: its game config sets `pixelArt: true` and `roundPixels: true`; WorldMapScene calls `startFollow(hero, true, .09, .09)`; the bundled Phaser follow update floors scroll when `roundPixels` is set. The relevant compiled bundle is SHA-256 `ab4fc9ad1204f23b4ea55dbae2d72bdf193a52e643271bcfe8642e2210556456`. Thus a steady fractional camera-scroll image is not a valid expected product state. The re-entered and “fractional” screenshots are byte-identical. The geometry sample matched the current draw contract for all nine visible base chunks at the rendered integer-scroll state: three alpha-bearing chunks kept nominal geometry, and six opaque neighboring chunks had the expected seam bleed. This is not a separately rendered fractional-camera frame.

## Evidence and limits

The screenshots are in this directory:

- `missing-base-fallback-full.png` — SHA-256 `c1af37cd95526af081d2d3e59007c316e10f28b490e9f0d3d45aa893c0d1eb0b`
- `loaded-base-mask-full.png` — SHA-256 `af179d0d63f4b19bbada9cef86c6b857ca8d2a52160d90aa1cfe294ece0a4d6b`
- `evicted-base-fallback-full.png` — SHA-256 `5fb52eac9e227f76774300fb732ec3410a0ae47c8b35718ef4197b374c1ca451`
- `reentered-base-mask-full.png` — SHA-256 `553c6f2227399bcf723077d054390855d107fe7696db3da93a956aadd556b516`
- `fractional-seam-frame-full.png` — SHA-256 `553c6f2227399bcf723077d054390855d107fe7696db3da93a956aadd556b516` (identical to re-entry frame)

Visual inspection found the cliff-to-grass interface continuous in the captured viewport; these images do not expose the entire north plate edge unobscured by HUD. The final browser run completed in 22.1 seconds; the browser and server were closed, and no matching Chrome/Playwright child or port-4193 listener remained.

This bounded browser test does not prove native iOS behavior, full map-route accessibility, performance under sustained play, or all north-edge visual details. The tested anchor changes are explicitly renderer fixtures, not movement evidence.
