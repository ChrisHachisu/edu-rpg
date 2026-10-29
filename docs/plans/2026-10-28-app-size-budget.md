# App size budget: whole game in ≤200 MB (2026-10-28)

Owner ruling: "This is a phone app so it needs to be a realistic size to download and run."
Target: App Store download ≤200 MB (the cellular limit), and runtime memory safe on an older iPhone.

All numbers were measured in the cloud on the assembled scratch dist (frozen bundle, build-91
overlays, plus the Acts 2-5 prototype). Encodes use Pillow 12.3 WebP, `method=4`. Lossy alpha
layers keep `alpha_quality=100`. No build, no Mac. Quality crops for Chris are in
`/mnt/project-files/edu-rpg/acts-preview/size/`. Each crop shows original | q90 | q85 | q80 at 2x,
plus |orig−q80| ×6.

**What counts.** The App Store limit applies to the *download* (the compressed IPA). PNG and WebP
do not compress further, but `.bin` and `.json` do, by a lot. Each acts `collision.bin` is
3.46 MB raw and 0.11 MB zipped. `act1-overworld-walk.bin` is 9.7 MB raw and 1.0 MB zipped.
`forest-collision.bin` is 3.3 MB raw and 0.1 MB zipped. The tables below give file sizes, with
the zipped figure where it matters.

## 1. What ships today (build 91 equivalent: Act 1 only)

| group | MB on disk | notes |
|---|---:|---|
| `act1-hifi/chunks` | 112.6 | water-r2 56.0 (PNG), forest 25.9 (PNG), base 16.8 (already lossy WebP), crest 11.1, front 1.4, canopy 1.0, foam/north 0.3 |
| `act1-hifi/town` (Greenhollow, Millbrook, Port Sapphire + `npc/`) | 29.5 | each screen is a 1950² PNG of about 8 MB; npc sheets 4.1 |
| `act1-hifi` other | 10.0 | underpaint 3.1, forest-collision.bin 3.3 (0.1 zipped), materials 1.6, manifest/walkable json ~1, landmarks 0.4 |
| `act1-dungeon-art` | 141.9 | 4 dungeons, 12 floors. Per floor: `props.png` 3168×2544 RGB (about 15 MB), `overhead.png` (up to 17 MB, almost all transparent), walk mask, chests |
| `assets/` | 42.2 | bundle `index-BhoGQRaA.js` 4.8, backgrounds 21 (WebP), monsters-hd 12 (WebP), item-icons 2.1, monsters 1.4 (see note) |
| `act1-overworld-walk.bin` | 9.7 | 1.0 zipped |
| audio / fonts / materials / code | 2.9 / 3.1 / 2.4 / ~2 | |
| **total** | **≈356** | about 340 MB as a download. Already over budget before any Act 2-5 content |

Note: `dist/assets/monsters` (1.4 MB) comes in from the hydrated baseline. AGENTS.md says
`public/assets/monsters` must never ship, so confirm on the Mac whether the IPA carries it.

Acts 2-5 currently being prototyped (scratch only):

| group | MB |
|---|---:|
| Acts 2-5 overworld (4 acts) | 166 (ground lossless WebP 116.4, crest PNG 19.2, front PNG 6.1, `.bin` 25.5 raw / about 0.8 zipped, landmarks 1.7) |
| 8 more towns | 59.2 (7.5 each) |
| Acts 2-5 dungeons, 111 floors, Act 1 baked method | 447 for the first 21 floors rendered. About 2.2 GB if all 111 are baked as PNG |

## 2. Acts 2-5 overworld at lossy WebP

| layer (Acts 2-5 total) | now | q80 | q85 | q90 | lossless WebP |
|---|---:|---:|---:|---:|---:|
| ground (opaque) | 116.4 | 27.4 | **32.7** | 40.4 | 116.4 |
| front (alpha) | 6.1 | 1.6 | 1.8 | 2.1 | **2.3** |
| crest (alpha) | 19.2 | 8.5 | 9.2 | 10.1 | **8.9** |

Lossy WebP buys almost nothing on the alpha layers. Lossless WebP is as small as q85 there and
changes nothing, so: **ground q85, front and crest lossless WebP → 43.9 MB**. Add landmarks
(1.7) and zipped bins (0.8) for **≈46 MB for all four acts** (166 today).

Crops: `act2-ground-busiest.png` and `act5-ground-busiest.png` (the most detailed chunks),
`act2-front-alpha.png`, `act3-crest-alpha.png` (composited over their real ground).
- At q85 and q90 I cannot see a difference at 2x.
- q80 shows faint ringing on the snow shrubs only in the ×6 difference panel.
- Chris should look at the crops: q85 is the recommendation.

## 3. Can Act 1 be re-encoded without a visible change? Yes, mostly losslessly

| Act 1 layer | now | lossless WebP | q85 |
|---|---:|---:|---:|
| water-r2 (PNG) | 56.0 | 9.0 | 2.0 |
| forest (PNG) | 25.9 | 18.4 | 4.9 |
| base (already lossy VP8) | 16.8 | (51.9) | 12.3, a second generation: **keep as is** |
| crest | 11.1 | 5.2 | 5.3 |
| front / canopy / foam / north | 2.7 | 2.1 | n/a |

- **Lossless only: 112.6 → 51.4 MB, pixel-identical where alpha > 0.**
  - Most of the water layer's 56 MB is RGB stored under alpha = 0. WebP drops it.
  - Before shipping, confirm that no texture these layers use is sampled with LINEAR filtering. The game runs `pixelArt: true` (NEAREST) and the overworld is drawn at OW_SCALE 0.7, but `dq-tiles.js` calls `setFilter` in 29 places. If a layer is LINEAR, encode it with `exact` (keeps the hidden RGB) or premultiply.
- **Lossless, plus water and forest at q85: 31.0 MB.** Crops: `act1-water-r2.png` and `act1-forest.png`. Water at q85 is indistinguishable. Forest shows faint leaf-edge noise in the ×6 difference panel only.
- Act 1 towns: 1950² screens are 84 MB for all 11 towns, 16.3 MB at q85 and 59.4 MB lossless. Crop: `act1-town-greenhollow.png`. npc sheets go from 4.1 to 2.7 MB lossless.
- Act 1 dungeons: 141.8 → **15.8 MB at q85** (13.1 at q80, 74.1 lossless). The overhead layer goes from 17 MB to about 50 KB per floor (alpha kept lossless). The props layer is opaque and takes q85 well.

## 4. Dungeons for Acts 2-5: bake, or tile at runtime

- **Baked like Act 1, even at q85:** about 1.62 MB props + 0.03 overhead + 0.3 walk/chests per floor, times 111 floors ≈ **215 MB**. That is over the whole budget on its own; q80 is still about 170. It does not scale.
- **Runtime tiling**, composed by the game from shared materials:
  - Weight:
    - Materials: 80 tiles (20 dungeons × floor/wall/rubble/accent, 531² each) are 38 MB as PNG and **8.1 MB at q85**.
    - Per floor: a small field in place of the 5.6 Mpx picture, i.e. the wall/floor field and decal positions at about ¼ resolution as an 8-bit PNG, roughly 50 KB. 111 floors ≈ 5.6 MB.
    - Asset sprites: Act 1's set is 92 KB. Budget 2 MB for 20 themes.
    - **≈16 MB total.**
  - Can the current code compose it? Not yet.
    - `dq-tiles.js` already has a windowed dungeon canvas (`updateDng`/`drawDungeon`, redrawn per window).
    - It already has a `'material'` layer path (`window.__A1_DNG_LAYER__='material'`) that draws live asset sprites over terrain.
    - But both paths still blit a *pre-baked* full-floor picture.
    - The baked look comes from `scripts/render_dungeon_material_map.py` (1,623 lines of numpy: blurred fields, wall-neck trimming, shadow thickening, contact shadows). Porting that to JS on the CPU would take seconds per floor on an old phone.
  - The workable route is a small **WebGL shader composite** in the dungeon window:
    - Inputs: the ¼-res field texture plus the 4 material textures.
    - Output: floor/wall blend by field value, with baked-style edge darkening.
    - Asset sprites (chests, stairs) drawn live, which also fixes the looted-chest limitation the baked layer has today.
  - Effort and risk:
    - About 2-3 days to prototype, plus an art-matching pass against the baked Act 1 floors as the reference. It will not be byte-identical, so it needs Chris's sign-off.
    - The field files can come straight out of the existing `floor_field()` step, so the dungeon agent's pipeline stays the authority for layouts and collision (the walk mask is unchanged).
- **Memory as a bonus:** one baked floor today decodes to 32 MB (props) + 32 MB (overhead). The tiled version holds 4 × 1.1 MB of materials plus a window-sized canvas.

## 5. On-demand download as a fallback

| | iOS On-Demand Resources | Per-act packs fetched over HTTPS |
|---|---|---|
| how | Asset packs tagged in Xcode, hosted by Apple. A native plugin calls `NSBundleResourceRequest`, then the files must be served to the WKWebView (custom `WKURLSchemeHandler`, or copied into a directory the Capacitor server serves) | The app downloads `actN.zip` to Library/Application Support and serves it through a scheme handler or Capacitor's `setServerBasePath` (the mechanism live-update tools use) |
| pros | Apple hosts it, it is free and App Store compliant, and the OS can purge it when storage is low. Initial download can be about 120 MB | Full control, versioned packs, works for web/PWA builds too. Packs can be updated without an App Store review (art only, no code) |
| cons | Native code plus scheme-handler work in a Capacitor app that is web-first today. Packs can be purged, so the game must handle "Act 3 not downloaded" mid-save. Each tag pack has its own size limits. Testing needs TestFlight | We host and pay for the CDN. Needs integrity checks (sha pins like the current gates) and a "downloading Act N…" screen. Offline first launch of a later act fails |
| fits when | the bundled plan below cannot stay under 200 MB once audio, monsters and more towns grow | same, plus we want art hot-fixes |

Both add failure modes a child player would hit. This is a fallback, not the plan.

## Recommended plan (everything bundled, no ODR)

| item | encoding | MB (download) |
|---|---|---:|
| code + bundle + UI + fonts + audio | unchanged | 13.5 |
| `assets/` (backgrounds, monsters-hd, item-icons, hero/npcs; already WebP) | unchanged | 37.4 |
| Act 1 overworld chunks | base kept; water-r2 and forest q85; crest/front/canopy/foam/north lossless WebP | 31.0 |
| Act 1 overworld other | underpaint lossless WebP 2.3, landmarks 0.4, materials 1.6, json ~1, bins zipped 1.1 | 6.4 |
| 11 towns | screens q85, npc lossless WebP, collision/json unchanged | 19.5 |
| Act 1 dungeons (12 floors) | props q85, overhead/chests lossless-alpha WebP, walk 1-bit PNG | 15.8 |
| Acts 2-5 overworld | ground q85, front/crest lossless WebP, bins zipped, landmarks | 46.4 |
| Acts 2-5 dungeons (111 floors) | runtime tiling (materials q85 + ¼-res fields + sprites) | 16 |
| native shell (Capacitor iOS, about 5) + margin for growth | | 10 |
| **total** | | **≈196 MB** |

The headroom is small, about 4 MB. If more content arrives, take these in order:
1. Acts 2-5 ground at q80 (−5.3).
2. Act 1 dungeons at q80 (−2.7).
3. Make Act 5 an ODR pack (−15 to −20).

**Runtime memory** (does not change with lossy WebP, since textures decode to RGBA):
- Overworld: measured 107 MB of textures in Act 1 and 85.6 MB in Act 2. That is held by the chunk LRU (`streaming.maxResident`), so keep `maxResident` at 12.
- Towns: one 1950² screen is 15 MB.
- Dungeons: tiling removes the 64 MB per-floor baked pair. On older iPhones (3 GB) the WKWebView content process should stay under about 300 MB, so tiling is the item that keeps dungeons safe there, not only the item that keeps the download small.

## What this needs before it can ship

- A one-off re-encode script, `scripts/reencode_webp.py`, with per-layer settings as above:
  - Write `*.webp` next to each manifest's chunk entries and update each manifest's `format`.
  - For Act 1, re-pin the manifest sha256s by hand on the Mac. Never through `npm run repin`, which rebuilds dist with the old terrain.
  - Gates to confirm on the Mac: `ACT1_PAINT_MANIFEST_SHA256`, `ACT1_PAINT_UNDERPAINT`, and the `runtime_baseline.py` entries for any re-encoded file.
- Confirm the texture filter mode (§3) before dropping hidden RGB.
- Prototype the dungeon shader composite on one Act 2 floor against its baked render, and get Chris's sign-off.
