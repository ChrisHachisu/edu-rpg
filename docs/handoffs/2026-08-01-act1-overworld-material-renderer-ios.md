---
date: 2026-08-01
type: handoff
project: edu-rpg
milestone: act1-overworld-material-renderer
status: active
supersedes: "[[2026-07-31-act1-overworld-colour-and-seams]]"
tags: [handoff, edu-rpg, overworld, act1, material-renderer, ios]
---

# Handoff — Act 1 overworld: material renderer + iOS — 2026-08-01

## What shipped

**No commits — the dirty tree is preserved deliberately (208 entries).** Everything below is
working-tree state.

- **Tiled AI generation ABANDONED.** ~9.2M Codex tokens across prior sessions never produced a
  shippable map. Replaced by a material-splat renderer: **~83k tokens total**, seam-free.
- `scripts/render_material_map.py` — the offline renderer (materials, macro layer, interlocking
  edges, shore variety, landmark sites, host collars, ridged mountains).
- `scripts/make_materials.py` — splits the generated 2x2 sheet into 4 wrap-tileable materials.
- `scripts/skirt_sprite.py` — de-spill + organic base dissolve for landmark sprites.
- `scripts/composite_landmarks.py` — measured-anchor sprite placement **+ terrain overdraw**.
- `scripts/serve_dist.py` — threaded, no-cache, 0.0.0.0 dev server that prints the LAN URL.
- `scripts/test_dq_tiles_terrain.cjs` — 16 assertions over the ported in-game maths.
- `public/dq-tiles.js` 146,515 → 157,492 bytes — material splat + ridged mountains + shore
  variety + landmark sites, **fallback-safe** (palette ramps until textures decode, forever if
  they 404).
- `public/materials/mat-{grass,forest,rock,water}.png` (2.3 MB) + copies in `dist/`.
- `owner-terrain.json` — Port Sapphire `[133,347]→[133,349]`, owner-authorised, `_edits` logged.
- Darkfang sprite regenerated as a **forest** dungeon (old rock version kept as `-raw.png`).
- `docs/MATERIAL-RENDERER-METHOD.md` — the transferable method; already adopted by the dungeon
  session (see `docs/handoffs/2026-07-31-act1-dungeon-material-renderer.md`).
- iOS: `pod install` done, simulator build succeeds, app runs. `npx cap copy ios` synced.

## Verification (run 2026-08-01)

- `runtime_baseline.py verify` — **VERIFY PASS**
- `runtime_baseline.py verify-act1 --input dist` — **ACT 1 OVERLAY VERIFY PASS**
- `node scripts/test_dq_tiles_terrain.cjs` — **16/16 ALL CHECKS PASSED**
- `test_runtime_baseline.py` — 3 tests OK + HYDRATE PASS
- `smoke_static_runtime.py --act1-overlay` — STATIC SMOKE PASS
- iOS: `xcodebuild -sdk iphonesimulator` — **BUILD SUCCEEDED**; installs, launches, title screen
  renders correctly on iPhone 17.
- **Bundle invariant HELD**: `dist/assets/index-BhoGQRaA.js` = 4,987,581 bytes,
  md5 `60d90b63607b6e6980eb170aeeed445e`.
- Palette vs owner target (105/27/66/31): ground **104.5**, forest **26.0**, rock **65.2**,
  water **28.0**.
- No typecheck/lint run: `npm run dev` and `npm run build` are deliberately wired to a
  blocked-build script. `dq-tiles.js` is served statically, so it needs no build.

## Live state (verified 2026-08-01)

- **HEAD**: `c4f97d5` "docs: point handoff at stabilization branch tip" — `git log`. **No commits
  made this session**; 208 dirty entries — `git status --short`.
- **Branch**: `codex/map-engine-semantic-data`.
- **TestFlight**: NOT pushed this session, and not attempted. The lane exists
  (`scripts/ship-ios.sh` → `ship_ios.py` → push-to-testflight skill) but was never invoked —
  this is "never attempted", not "attempted and failed".
- **iOS simulator**: app installed on iPhone 17 (`24A4D890-…`), bundle
  `app.chalkmap.questofknowledge`, built to `/tmp/qok-dd` (ephemeral — rebuild after a reboot).
- **Dev server**: `python3 scripts/serve_dist.py`; LAN URL was `http://192.168.11.39:5174`
  (re-derive, DHCP may move it).
- **Act-1 pin**: `dq-tiles.js` → `(157_492, fb289b13…)`; new `ACT1_MATERIAL_FILES` pins the four
  materials and enforces public/dist twins.

## Locked decisions

- **Generate MATERIALS, not maps.** The semantic mask is a splatmap. Style drift and seams become
  structurally impossible, not merely mitigated. See `docs/MATERIAL-RENDERER-METHOD.md` and
  [[learning-20260731-generate-materials-not-maps]].
- **Never per-tile tone correction.** A per-tile gain is piecewise-constant with jumps on the tile
  grid — it CREATES the seams it was meant to remove. `normalise_tone` retired,
  `retone_tiles.py --apply` hard-disabled. [[learning-20260731-per-tile-gain-breaks-locked-seams]]
- **The axis is irregularity at the right scale, not hard-vs-soft.** Treeline = crown scale (~78px);
  sprite contact = tuft scale (~16px); mountains = ridged multifractal; shore = its own opaque band.
- **A hard junction needs its OWN band, not a sharper blend**, and must extend past the junction.
- **Alpha edits can never merge two layers** — the problem is ordering. Terrain is drawn back OVER
  each sprite's foot; that is what makes it look planted.
- **Owner: strict class edges are NOT required.** Some bleed between walkable terrain and water is
  fine if it looks natural. A uniform sand rim around every water body is itself unnatural.
- **Mobile-first**: iOS/iPadOS via the existing Capacitor wrapper. The game stays Phaser/web —
  **this does NOT imply a native rewrite.**
- **Towns and dungeons belong to other sessions.** Overworld only here.

## Gotchas for next session

- **The "preview boot failure" is NOT a bug.** The Browser pane runs with `document.hidden === true`,
  so rAF never fires and Phaser's loop freezes (measured: **0 frames in 1.2 s**, `loop.frame` stuck
  at 16). BootScene's `setTimeout(() => scene.start("TitleScene"), 400)` never gets processed. Do not
  re-diagnose this. Verify on the simulator or a real device instead.
- **WKWebView ignores synthetic touch injection.** HOME and springboard icon taps work; taps on the
  game's DOM buttons do nothing, `touch_path` with dwell included. A real mouse click in the
  Simulator panel DOES reach the webview. Not a game defect — do not report it as one.
- **iOS Simulator MCP needs `/var/db/xcode_select_link`.** Without it the MCP reports "Xcode is
  installed but not selected" even though `xcode-select -p` resolves fine. Fixed 2026-08-01.
- **CocoaPods:** `pod install` dies with `Unicode Normalization not appropriate for ASCII-8BIT`
  unless run as `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`.
- **Full render is ~7 min** and needs `--strip 1456` + a background run; 1024-row strips exceed a
  10-minute foreground timeout.
- **Re-measure `MACRO_COMP` after ANY macro-layer change.** The ridged hillshade pulled rock 66 → 55
  before re-compensation.
- **NEVER glob a destructive pass over `landmark-sprites/`** — it holds both `-raw` sources and keyed
  outputs. I de-spilled the raws by accident; the inverse over-corrects, so re-keying
  `crystal-cave-raw.png` now yields 38.0% coverage vs the original 49.7%. **Keyed sprites in use are
  correct**; only the intermediates are degraded.
- **Never `screencapture` a screen region to drive the simulator** — `xcrun simctl io screenshot`
  captures the device ONLY. I grabbed unrelated desktop content once; deleted immediately.
- `npx serve` dies under the act1-hifi runtime's ~19 MB of chunks. Use `scripts/serve_dist.py`.

## Resume here (load-on-demand — do NOT eager-read the corpus)

**Distilled state:** Act-1 overworld art is DONE and on-palette; the material renderer is ported
into the live `public/dq-tiles.js` and the Act-1 runtime pin is updated with all gates green. The
iOS app builds and runs. **The one unverified thing is what the overworld actually looks like
in-game on a device** — everything so far is offline renders plus a Node test of the ported maths.
Next action: get past the title screen on the simulator (owner clicks, or a real device) and
screenshot the overworld.

| purpose | path | read when |
|---|---|---|
| the method + why tiles were abandoned | `docs/MATERIAL-RENDERER-METHOD.md` | changing any renderer behaviour |
| offline renderer | `scripts/render_material_map.py` | tuning terrain appearance |
| in-game port | `public/dq-tiles.js` (search `MATERIALS`, `ridgedAt`, `siteOver`, `bankOver`) | changing in-game terrain |
| ported-maths test | `scripts/test_dq_tiles_terrain.cjs` | after ANY edit to the above |
| Act-1 gate + pins | `scripts/runtime_baseline.py` (`ACT1_OVERLAY_FILES`, `ACT1_MATERIAL_FILES`) | after changing dq-tiles.js or materials |
| sprite contract | `design/LANDMARK-SPRITE-CONTRACT.md` | touching landmark sprites/placement |
| owner terrain (INPUT — never rewrite) | `design/continent-terrain-class-method/owner-terrain/owner-terrain.json` | landmark positions |
| finished map | `.../art-tiles/act1-material-map{,-landmarks,-overview}.png` | reviewing the art |

**Known-open, not blocking:** `src/data/maps.ts` overworld connection coords are stale
(`mistyGrotto` points at (120,261) while its landmark is at (91,378); same for `voidRift` and the
four portals). `src/map-engine/act1Overworld.ts` migration still open. Act 2 not started.

## Kickoff prompt (paste verbatim into next session)

```
Continue the edu-rpg act-1 OVERWORLD in /Users/christopherhachisu/Documents/claudecode/edu-rpg-map-engine-semantic-data (branch codex/map-engine-semantic-data).

READ FIRST, in full: docs/handoffs/2026-08-01-act1-overworld-material-renderer-ios.md
Then skim only: docs/MATERIAL-RENDERER-METHOD.md

STATE: Act-1 overworld art is DONE and on the owner's target palette (ground 104.5 / forest 26.0 / rock 65.2 / water 28.0 vs 105/27/66/31). Tiled AI generation was abandoned; a material-splat renderer replaced it for ~83k tokens total. It is ported into the live public/dq-tiles.js and the Act-1 runtime pin is updated. ALL GATES GREEN: verify, verify-act1, 16/16 node test, runtime-tools, smoke. iOS builds and runs on the simulator.

THE ONE UNVERIFIED THING: nobody has seen the overworld rendered in-game on a device. Everything so far is offline renders plus a Node test of the ported maths.

FIRST TASK: get past the title screen and screenshot the overworld terrain on iOS.
- The iOS Simulator panel works: control{action:"attach"} (boot a device first if needed: xcrun simctl boot 24A4D890-F134-40DA-B106-2EF45660B198).
- App: bundle app.chalkmap.questofknowledge. Rebuild if /tmp/qok-dd is gone:
  cd ios/App && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
  xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator -configuration Debug -derivedDataPath /tmp/qok-dd -destination 'platform=iOS Simulator,id=24A4D890-F134-40DA-B106-2EF45660B198' build CODE_SIGNING_ALLOWED=NO
  xcrun simctl install <udid> /tmp/qok-dd/Build/Products/Debug-iphonesimulator/App.app
- KNOWN LIMIT: WKWebView ignores synthetic touch injection. HOME and springboard taps work; taps on the game's DOM buttons do NOT. A real mouse click in the Simulator panel DOES work — so ASK THE OWNER to click "New Game" once, then take over with screenshots. Do not report this as a game bug.
- Alternative real-device path: python3 scripts/serve_dist.py, then open the printed LAN URL in Safari on the owner's iPhone/iPad.

THEN: start hooking up overworld gameplay so it is playable — OVERWORLD ONLY. Towns and dungeons are owned by other sessions (see docs/handoffs/2026-08-01-act1-port-sapphire-town-screen.md and 2026-07-31-act1-dungeon-material-renderer.md); do not touch them.

DO NOT RE-DIAGNOSE: the "preview boot failure" in the Browser pane is document.hidden freezing requestAnimationFrame (measured 0 frames in 1.2s). The game is fine. Test on simulator or device, not the Browser pane.

HARD INVARIANTS: preserve the dirty tree, NO commits, NO builds, never npm run build or npm run dev (both are wired to a blocked-build script). dist/assets/index-BhoGQRaA.js must stay byte-identical at 4,987,581 bytes, md5 60d90b63607b6e6980eb170aeeed445e — verify before finishing. owner-terrain.json and owner-terrain.raw-export.json are the owner's INPUT; edit ONLY with owner authorisation and ALWAYS append to their _edits log. After ANY edit to public/dq-tiles.js: re-run node scripts/test_dq_tiles_terrain.cjs, re-copy to dist/, and update the pin in scripts/runtime_baseline.py, then verify-act1. Never glob a destructive pass over design/.../landmark-sprites/ (it holds both -raw sources and keyed outputs). Image generation is codex exec -m gpt-5.6-sol --skip-git-repo-check.

BUDGET: the owner is cost-constrained (~9.2M Codex tokens already spent historically). The material renderer means terrain changes are now ZERO tokens — local rendering only. Do not launch generation runs without asking.
```
