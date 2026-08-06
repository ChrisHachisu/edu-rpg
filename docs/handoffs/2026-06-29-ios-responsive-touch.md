---
date: 2026-06-29
type: handoff
project: edu-rpg
milestone: iOS wrap + responsive (DQ-style) + touch reactivity
status: active
tags: [handoff, ios, capacitor, responsive, touch]
---

# Handoff — edu-rpg iOS build + responsive/touch (DQ-style) — 2026-06-29

## What shipped this session (all verified, deployed)
- **M6 sprites** — 12 monster re-skins + **3 new monsters** (bruiser, knifeSneak → Bandit Hideout; thornvineLurker → Haunted Forest). Count 72→75. Battle-verified.
- **fix-batch-2 corrections** — #5/#16 wind tiles (redesigned + genuinely animated), #18 canyon (wind blocks; Storm Harpy drops Windbreaker Stone to clear it), #44 Trial-of-Glyphs (full hieroglyph-floor-tile corridor redo, all floors navigable), #6 Scorched Ruins relocated by-foot (no barrier bypass), #26 patrol recording, #39 survivor NPC re-proved.
- **Deployed to gh-pages**: `v1.14.4`, gh-pages commit `a956ae6`, bundle `dist/assets/index-BhoGQRaA.js` = **4,971,422 bytes**, monsters **75**. (Web/CDN live; allow a few min for propagation.)
- Reports: `docs/m6-reports/`. Per-correction brain change-log: `claude_brain/03-Changes/2026-06-28-edu-rpg-fixbatch2-changes.md`.
- **Restore baseline (current good bundle): `backups/versions/v1.14.4-scorched-relocate.js`** (== dist, byte-identical). Do NOT restore below this.

## iOS build — pipeline stood up (NOT yet uploaded; gated on Phase 1 below)
- The game is wrapped as a native iOS app via **Capacitor 7.6.7 + CocoaPods** at `edu-rpg/ios/` (App.xcworkspace, scheme **"App"**, bundle id **`app.chalkmap.questofknowledge`**, webDir = `dist`, game bundled offline). `capacitor.config.ts` at repo root.
  - ⚠️ **Capacitor 8 was tried first and ABANDONED**: Cap 8 uses SwiftPM, and headless `xcodebuild` **hangs at 0% CPU on "Resolve Package Graph"** in this environment (even with `-disableAutomaticPackageResolution` / builtin-SCM). Cap 7 + CocoaPods resolves at `pod install` time so the build does NOT stall. **Use Cap 7 for edu-rpg.** (Cap 7 cli needs Node ≥20; Cap 8 needed Node 22.)
  - Build works: `xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=24A4D890-...' -derivedDataPath build build` → **BUILD SUCCEEDED**, App.app runs on the iPhone 17 sim, **title screen renders** (`/tmp/ios-shot1.png`). A shared `App` scheme was hand-written (no source scheme existed): `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` (App target UUID `504EC3031FED79650016851F`). CFBundleVersion already `$(CURRENT_PROJECT_VERSION)`.
- **TestFlight plan = "same as chalkmap"** (push-to-testflight skill): reuse the account-level ASC API key `chalkmap-v2/.eas-credentials/AuthKey_52937L4S9H.p8` (key `52937L4S9H`, issuer `006a572e-afa8-464e-8f46-ce19bd161a9f`), team **`M969PWP3PU`**. Mirror chalkmap's fastlane `beta` lane (dedicated `cmbuild.keychain` + cert/sigh + manual signing + `upload_to_testflight`) for App.xcworkspace/scheme App / bundle app.chalkmap.questofknowledge. **No prod-DB guard needed** (edu-rpg has no backend). After upload: `check-build.py` → VALID → `assign-beta-group.py` (Beta Testers + external beta review = public link). The ASC app + bundle id must be created first (fastlane `produce`, or manually) — **this is the irreversible step; the bundle id was a sensible default ("same as chalkmap" convention), confirm with the user before creating the ASC app if they want a different id.**
- **Touch movement DONE + verified**: `dist/index.html` has an on-screen d-pad + Z + menu(☰) overlay (touch-gated via `@media (pointer: coarse)`), wired to **synthetic KeyboardEvents on window** (keyCode forced via defineProperty). Verified on a mobile-emulated web run (`.eduharness/touch-verify.js`): holding the d-pad MOVES the hero (down/up/left worked; right was terrain-blocked). The game's keyboard target is `window` (default), so synthetic events drive it.

## ⭐ The active task — Phase 1: responsive full-screen + full touch (DQ-style)
User requirement (locked): the game must be **full-screen and adapt to each device** (iPhone/Android/iPad; web may keep a frame), with **all components adjusting per device**, AND be **touch-reactive for ALL actions** (not just movement). User's model (correct, = how DQ mobile does it): **two layers** — (1) the RENDER fills the screen (camera shows more of the world), (2) the HUD + menus + controls are a **device-reactive overlay anchored to screen edges**. Chosen approach: **"Phase 1 now, then iterate"** = world fills + overlay HUD/controls + everything tappable; battle/menus **scaled-to-fit** for now, re-laid-out responsively as a follow-up.

### VALIDATED already (de-risked)
- Changing the Phaser config `scale: { mode: ti.Scale.NONE }` → **`RESIZE`** (config at bundle line ~84435-84445; canvas dims are `Tt*pe × kt*pe` = 768×672; there's an explicit `i.style.width/height = Io/Lo px` right after `new ti.Game(x)` that must be neutralized so the canvas fills the parent) makes the **WORLD fill the device** (camera = device size, shows more map, hero centered) — proven on a phone viewport: `/tmp/proto-overworld-portrait.png`. Top-LEFT HUD (HP, minimap) stays correctly anchored. Prototype lives at `/tmp/proto-resize/` (a copy of dist with NONE→RESIZE + a full-viewport index.html, served on :5179).
- **Confirmed the remaining work**: under RESIZE the **fixed-layout scenes BREAK** (title content pushed off-screen right `/tmp/proto-title.png`; battle name/sprite/stats/message scattered+clipped `/tmp/proto-battle.png`). They were authored for 768×672 with mostly hardcoded coords.

### Phase 1 build plan (the focused continuation)
1. **Commit RESIZE** to `dist/assets/index-BhoGQRaA.js` (NONE→RESIZE + neutralize the post-create `i.style.width/height` so the canvas tracks the parent) + make `dist/index.html` host full-viewport on devices (keep the RPG frame for desktop web via media query). Back up first; restore baseline = `v1.14.4-scorched-relocate.js`.
2. **Fixed scenes fit-to-screen (low-risk, no layout rewrite):** for every NON-world scene (Title, Battle, Shop, Menu, Victory, GameOver, Export — scene classes in the config array `[$o, Cp, zr, Pp, Fp, Ip, Lp, Op, Dp]`), on create + on resize set `cam.setZoom(Math.min(W/768, H/672)); cam.centerOn(384, 336)` so their 768×672 layout scales+centers to fit the device (intact, letterboxed). Cleanest as a single post-`new ti.Game` hook that attaches `scene.events.on('create'|'wake', fit)` + `T.scale.on('resize', …)`; world scene stays at the filling camera. VERIFY each scene renders centered/intact on a phone viewport.
3. **World HUD re-anchor:** top-LEFT (HP, minimap) already correct; re-anchor the top-RIGHT elements (compass, quest tracker) to the actual screen edges on resize (they use some `scale.width`/`cameras.main` already — ~20 refs).
4. **Touch overlay:** the d-pad/Z/menu overlay (done in dist/index.html) is the controls layer — keep; ensure it sits in the bottom area in the RESIZE layout (portrait) and adapts (sides in landscape).
5. **Touch reactivity for ALL non-movement actions (req 2):** make interactive elements tap-reactive, screen by screen — tap an adjacent NPC/sign → talk (same as Z); tap battle menu actions + quiz answer choices; tap to advance dialogue/messages; tap title/character-creation/menu/shop/inventory items. Wire each `setInteractive` + `pointerdown` to the same handler its key fires (only 7 setInteractive exist today). Verify by TAPPING in the sim (not by code-reading).
6. **Verify** per screen (sim + mobile-emulated web via `.eduharness`), then **rebuild the iOS app** (`npx cap copy ios` + xcodebuild) and re-verify on the iPhone 17 sim.
7. **Then ship iOS**: set up `ios/App/fastlane` (mirror chalkmap), create the ASC app (confirm bundle id), `fastlane beta`, `check-build.py`, `assign-beta-group.py` (Beta Testers + external/public-link review).
8. Re-deploy `dist` to gh-pages (the responsive + touch changes help mobile web too; desktop web stays framed). Bump clean-head version (v1.15.0).

## Locked decisions
- DQ-style **two layers**: render fills (RESIZE camera) + device-reactive overlay HUD/controls.
- iOS bundle id `app.chalkmap.questofknowledge`, name "Quest of Knowledge", team M969PWP3PU, **Capacitor 7 + CocoaPods** (NOT Cap 8/SwiftPM — it hangs the build here).
- Battle/menus = **scale-to-fit now**, responsive re-layout later (Phase 2). Web keeps a frame; devices full-screen.
- iOS upload is **gated on Phase 1** (a keyboard-only, tiny-canvas build is not worth shipping for "test on my phone").

## Gotchas
- The good game lives ONLY in the compiled beautified bundle (no source). Surgical edits only, NEVER rebuild; `node --check` + `wc -c` after each edit (note: `wc -c` BYTES > python `len()` CHARS because of multi-byte JA text — 4,971,422 bytes = correct). Restore from `v1.14.4-scorched-relocate.js`.
- Scale mode is global in Phaser; per-scene "fit vs fill" is done via per-scene camera zoom/center (step 2), not multiple scale modes.
- Synthetic-key touch driving works because Phaser's keyboard target is `window`; keyCode must be forced (`Object.defineProperty(ev,'keyCode',…)`).
- Verify touch by TAPPING (sim/mobile-emulated web), per §4f — not code-reading. `.eduharness/touch-verify.js` is the template (mobile context + d-pad hold + assert `wm.heroTileX/Y` changed).
- Canonical sim: iPhone 17 `24A4D890-F134-40DA-B106-2EF45660B198` (booted). Serves: dist on :5174, proto on :5179.

## Kickoff prompt (paste verbatim)
```
Continue edu-rpg Phase 1: responsive full-screen + full touch (DQ-style). Invoke the edu-rpg skill. Read docs/handoffs/2026-06-29-ios-responsive-touch.md FIRST. Live good bundle = v1.14.4 (dist 4,971,422, monsters 75, gh-pages a956ae6); restore baseline backups/versions/v1.14.4-scorched-relocate.js. The world-fill approach is VALIDATED (Phaser scale NONE→RESIZE makes the world fill the device; prototype at /tmp/proto-resize, proof /tmp/proto-overworld-portrait.png). Build Phase 1 per the handoff's plan: (1) commit RESIZE to dist + full-viewport index.html (frame on desktop web only), (2) fit-to-screen the fixed scenes via per-scene camera zoom/center (single post-game hook), (3) re-anchor top-right world HUD, (4) keep the d-pad/Z/menu overlay, (5) make ALL non-movement actions tap-reactive (NPCs, battle, quiz answers, dialogue advance, menus/shop) wired to their key handlers, (6) verify each screen on the iPhone 17 sim (24A4D890) by TAPPING, (7) rebuild iOS (Capacitor 7 + Pods, cap copy + xcodebuild) and re-verify, (8) set up ios/App/fastlane mirroring chalkmap + create the ASC app (confirm bundle id app.chalkmap.questofknowledge) + fastlane beta + assign Beta Testers + external/public-link review, (9) re-deploy dist to gh-pages, bump to v1.15.0.
CRITICAL: compiled bundle, no source — surgical edits, node --check + wc -c after each, restore from v1.14.4 if broken; NEVER rebuild. Capacitor 7 + CocoaPods (Cap 8 SwiftPM hangs xcodebuild here). Verify touch by tapping in the sim, not code-reading.
```
