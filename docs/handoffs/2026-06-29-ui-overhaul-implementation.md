---
date: 2026-06-29
type: handoff
project: edu-rpg
milestone: UI overhaul — in-game implementation (Storybook Quest, mobile/tablet-first)
status: active
tags: [handoff, ui, frontend, dom-overlay, responsive, touch]
---

# Handoff — edu-rpg UI overhaul: in-game implementation

## ✅ UPDATE 2026-06-29 — ALL 5 SCREENS BUILT + VERIFIED, NOT DEPLOYED (awaiting user sign-off)
The DOM-overlay UI layer is implemented and verified on the `.eduharness` mobile harness (393×852, EN+JA, tap + state-change asserted): **Menu** (Status/Items/Equip/Settings), **Shop** (Buy/Sell), **Healer**, **Intro/Setup**, **Battle HUD** (action menu / quiz / message / item-select). Files: `dist/ui-overhaul.css` (13KB), `dist/ui-overhaul.js` (45KB), `#qok-ui` wired into `dist/index.html`. `__QOK` extended with `shops`(=`Fn`) + `loc()`(=`vi()`); local bundle backup `backups/versions/v1.15.2-qok-bridge-shops-loc.js`. Overworld regression: overlay is `display:none` during play → game unaffected. **Full architecture is now documented in the edu-rpg skill → "DOM UI OVERLAY LAYER".**

Key build decisions vs the original plan below: (1) poll with `setInterval(50ms)` NOT rAF (rAF throttles when not compositing); (2) keyboard is dual-input for free (Phaser owns it → poll re-renders); (3) BATTLE is **fully opaque** with the monster as a DOM `<img>` (BattleScene is letterboxed → a transparent overlay double-UI'd) and the black-bg PNG is chroma-keyed to transparent at runtime; (4) each takeover screen renders its own close ✕ (the Phase-1 ☰ is under the overlay).

**REMAINING before deploy (user-gated):** (a) user sign-off on the in-game result; (b) bundle offline M PLUS Rounded 1c woff2 into `dist/fonts/` for the Capacitor app (currently Google-Fonts `@import`; system-ui fallback offline); (c) gh-pages deploy must include the NEW files (ui-overhaul.css/js + fonts), not just bundle+index.html.

## ✅ UPDATE 2026-06-29 (later) — DESIGN LOCKED, QA PASSED, DEPLOY-STAGED (still awaiting go-ahead)
Approved after several icon/avatar iterations: real game hero (snapshot of `hero-walk` frame 0, live color in intro), shopkeeper portrait avatar (snapshot of `shopkeeper` texture, `contain`+0.9 framing), unique consumable icons (leaf/flask/bomb/crystal), filled category equipment artwork (cuirass / blue heater shield w/ gold boss / knight helm / gem ring / diagonal detailed sword), battle quiz keeps the enemy visible, poison indicator in status. **Locked snapshot:** bundle `backups/versions/v1.15.3-qok-ui-icons.js` + UI files `backups/ui-overhaul/v1.15.3/`.

**QA sweep** (`.eduharness/qa-sweep.js`) passed: tablet 820×1180 + desktop 1280×800 (centered max-560 col, playable), battle at desktop, edge states (empty inventory, no equipment, long name + huge gold + low HP, poison). No errors.

### Deploy when approved (gh-pages, /tmp-worktree method — MUST include the new files)
The standard deploy only swaps bundle+index.html; this overhaul ALSO needs `ui-overhaul.css` + `ui-overhaul.js`. From `edu-rpg/`:
```bash
git worktree add /tmp/edu-ghpages gh-pages
cp dist/assets/index-BhoGQRaA.js /tmp/edu-ghpages/assets/index-BhoGQRaA.js   # bundle (has __QOK shops+loc)
cp dist/ui-overhaul.css dist/ui-overhaul.js /tmp/edu-ghpages/                 # NEW files
cp dist/index.html /tmp/edu-ghpages/index.html                               # wires the 2 new files + #qok-ui
# verify monsters untouched: git -C /tmp/edu-ghpages ls-tree gh-pages assets/monsters/ | wc -l  (expect 75)
git -C /tmp/edu-ghpages add -A && git -C /tmp/edu-ghpages commit -m "Deploy: Storybook Quest DOM UI overlay" && git -C /tmp/edu-ghpages push origin gh-pages
git worktree remove /tmp/edu-ghpages
# verify live: curl -sw '%{size_download}' https://chrishachisu.github.io/edu-rpg/ui-overhaul.js  (>0)
```
NOTE: if offline iOS fonts get bundled into `dist/fonts/` first, copy those too.

---

## Where we are (original plan, for reference)
- **Phase 1 (responsive + touch) DONE + LIVE** on gh-pages `v1.15.0` (commit `fae6a22`, bundle `dist/assets/index-BhoGQRaA.js` ≈ 4.98MB, monsters 75). RESIZE world-fill, connected slide d-pad (overworld-only), Z removed, full tap-reactivity, control-orientation setting, collapsible minimap. iOS app rebuilt (Cap 7, BUILD SUCCEEDED). Restore baseline `backups/versions/v1.15.0-responsive-touch.js`.
- **UI mockups LOCKED + APPROVED** — direction **"Storybook Quest"** (user picked option 1 of 5 from `style-board.html`). Full set: `edu-rpg/design/ui-overhaul/mockup-v2-full.html` (Intro/Setup, Menu Status/Items/Equip/Settings, Battle actions+quiz, Shop, Healer). Design system: warm parchment+gold on deep slate, **M PLUS Rounded 1c** font (EN+JA), ≥52px targets, bottom tab/action bars, gold `.sel` = shared tap+keyboard selected state, `env(safe-area-inset-*)` (Dynamic Island/home-indicator clearance), pixel sprites kept, diagonal sword icon, sprint Run icon, item ×N counts (shop count on its own line), healer cross upper-left+outlined. v1 = `mockup-v1.html`.
- **Implementation FOUNDATION laid + verified:** bundle now exposes **`window.__QOK`** (added right after `window.__PHASER_GAME__ = T;`): `{ Z (i18n fn), db (item DB `ye`), find (item lookup `Bi`), tile (xt=48), state() (returns `tt`) }`. Verified: `__QOK.find('herb').type==='consumable'`, `__QOK.db.ironSword.stats.atk===9`, `__QOK.Z('menu.status')` localizes. This is the bridge the DOM UI binds to.

## The goal (user, locked)
Menu / Battle / Shop / Healer / **Intro-setup** screens become **true full-screen on phone/tablet** (Phase 1 left them scale-to-fit/letterboxed) AND get the **complete Storybook-Quest UI overhaul**. Must work in **touch AND keyboard**. **Smartphone/tablet is the END GOAL**, PC just-playable. Implement **carefully** to keep the transition smooth (never break the live build).

## Architecture (decided)
**DOM/HTML-CSS UI overlay layer**, NOT a Phaser-native re-layout. The mockups already ARE HTML/CSS → render them as DOM overlays (`#qok-ui`, full-screen, `z-index` above the canvas) driven by game state; the Phaser scenes keep running as the **logic layer** underneath (their tap-reactive methods already mutate game state correctly). For Battle, keep the Phaser sprite/effects stage and overlay only the DOM HUD (bars/message/menu/quiz). This is what makes the screens pixel-match + truly responsive (CSS) + touch-native — the right fit for the phone/tablet goal.

### Files (keep ADDITIVE + shippable)
- `dist/ui-overhaul.css` — lift the design system from `mockup-v2-full.html` (`<style>`), scope under `#qok-ui`. Include `@font-face`/Google-Fonts M PLUS Rounded 1c (bundle the woff2 into `dist/fonts/` for offline iOS — DON'T rely on network in the Capacitor app), the component classes (panel, btn, tabbar, card, qty, hp, statrow, swatch, gchip, toggle, seg, switch, slider, setrow, eyebrow, topbar, enemy-card, msg), and `env(safe-area-inset-*)`.
- `dist/ui-overhaul.js` — the UI controller (see pattern below).
- `dist/index.html` — add `<link rel=stylesheet href=ui-overhaul.css>` + `<script src=ui-overhaul.js>` + an empty `<div id="qok-ui"></div>`. ONLY wire these in once a screen works, so the live game stays unaffected during the build.

### Controller pattern (per screen)
1. **Detect** the active scene. Reuse the bundle's scene-lifecycle signal: it already toggles `document.body.classList` for `show-controls` via `updateControlVis()` in the global IIFE (near bundle end). Add similar — OR have `ui-overhaul.js` poll `__PHASER_GAME__.scene.isActive('MenuScene'|'ShopScene'|'BattleScene'|'TitleScene')` on a rAF / scene events.
2. **Render** the screen's DOM into `#qok-ui` from state: read `__GAME_STATE__.player.state` (inventory, equipment, level, hp, gold, settings) + `__QOK` (item names/types/stats/desc via `Z`/`db`/`find`) + the scene's own getters (`ms.getConsumableItems()`, `ms.getEquipInventoryItems()`, `ms.settingsList`, `ms.currentTab`).
3. **Route input** → call the scene's existing methods (they run the real logic): e.g. tab tap → `ms.currentTab=tab; ms.tabIndex=i;` then re-render; item tap → `ms.listIndex=i; ms.useItem();` re-render; equip tap → set `ms.equipMode/equipSlotIndex/equipInventoryIndex` then `ms.handleEquipAction()`; setting tap → `ms.listIndex=i; ms.handleSettingToggle(1)`; close → `ms.scene.stop(); ms.scene.resume('WorldMapScene')`. Keyboard: arrow keys move a JS `selectedIndex` highlight (`.sel`), Enter/Z confirms — same handlers as tap.
4. **Show/hide** `#qok-ui` (display + which screen) with the active scene; hide the Phaser scene's own visuals by covering with the opaque DOM (no need to touch the Phaser draw).

## Build order (one at a time, verify each)
1. **Menu** (proof + reusable components): Status (hero card + ATK/DEF/SPD + EXP + accuracy from `__GAME_STATE__` + `tt.quizManager.getStats()`), Items (`getConsumableItems()` → cards w/ ×N), Equip (slots + `getEquipInventoryItems()` + ▲▼ deltas + type filter), Settings (difficulty/language/sound/timer/volume slider/controlOrientation seg). Close → world.
2. **Shop** (`ShopScene`: mode menu/buy/sell, `Fn[shopId].items`, `buyItem/sellItem`, gold). Count on its own line.
3. **Healer** — it's a field OVERLAY in WorldMapScene (`healerOverlayOpen`, `confirmHealerOption`/`handleHealer`), not a scene. Render the DOM heal-confirm when `wm.healerOverlayOpen`.
4. **Intro/Setup** — `TitleScene` create mode (`mode==='create'`, `createRow`, `colorIndex/difficultyIndex`, `confirmCreate`, `focusNameInput`). Name field = a real DOM `<input>` (native keyboard). 
5. **Battle HUD** — `BattleScene` `phase` (playerMenu/playerQuiz/enemyQuiz/message/itemSelect). DOM overlay for enemy/player bars + message + action menu + quiz answers; KEEP the Phaser monster sprite/effects visible underneath (DOM HUD is bottom-anchored + top enemy card, leaving the sprite stage visible). Methods: `confirmMenuAction/confirmQuizAnswer/advanceMessage/confirmItemSelection`, `menuIndex/quizSelectedIndex`.

## Verify (every screen)
- Mobile-emulated harness (`.eduharness`, 393×852, isMobile/hasTouch): tap every control, confirm state changes + DOM re-renders + matches the mockup; check safe-area (content below island). Keyboard path too.
- Then iOS: `npx cap copy ios` + xcodebuild + sim (note: boot-gesture gate blocks headless tap; rely on the live-web-on-iPhone WebKit equivalence + a real device tap).
- Keep the game SHIPPABLE at every checkpoint (additive files; `index.html` wiring only when a screen is done). Don't deploy to gh-pages until the user signs off on the in-game result.

## Gotchas
- i18n default locale may be JA on a fresh load; `Z` follows the player's `locale` once a save loads — render with `Z`, never hardcode strings.
- The bundle is the compiled beautified file (no source) — surgical edits only, `node --check` + `wc -c` after each; restore from `v1.15.0-responsive-touch.js`. The `__QOK` bridge edit is already in (verified).
- Font: bundle M PLUS Rounded 1c woff2 locally (`dist/fonts/`) for the offline iOS app; don't depend on Google Fonts at runtime in Capacitor.
- gh-pages deploy must include the NEW files (ui-overhaul.css/js, fonts) — the prior `/tmp`-worktree deploy only swapped bundle+index.html.

## Kickoff prompt (paste verbatim)
```
Continue edu-rpg UI overhaul — IMPLEMENT the locked "Storybook Quest" mockups in the game. Invoke the edu-rpg skill. Read docs/handoffs/2026-06-29-ui-overhaul-implementation.md FIRST. Mockups are LOCKED at design/ui-overhaul/mockup-v2-full.html. Foundation done: window.__QOK bridge is live in the bundle (Z/db/find/state) + verified. Build the DOM-overlay UI layer (dist/ui-overhaul.css + ui-overhaul.js + #qok-ui in index.html), MENU FIRST as the proof, then shop/healer/intro/battle-HUD per the handoff's controller pattern (render from __GAME_STATE__/__QOK, route taps→existing scene methods, dual-input). Keep ADDITIVE + shippable; verify each screen by TAPPING on the .eduharness mobile harness; don't deploy until the user signs off. Smartphone/tablet is the goal; PC just-playable.
```
