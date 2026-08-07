# Source / bundle drift

How far apart the tracked TypeScript in `src/` and the shipped JavaScript in
`dist/assets/index-BhoGQRaA.js` actually are, and what a rebuild from source
would cost.

Analysis only. No code was changed. No build was attempted.

| | |
|---|---|
| Analysed at | 2026-08-07 |
| Base | `main` @ `4121557` (`Merge branch 'fix/dungeon-edge-cutoff'`) |
| Shipped bundle | `dist/assets/index-BhoGQRaA.js`, 4,987,581 B, md5 `60d90b63607b6e6980eb170aeeed445e` |
| Also tracked as | `runtime/baselines/v1.17.1-ipad-hud-walk/assets/index-BhoGQRaA.js`, byte-identical (md5 verified) |

## The one-paragraph answer

The bundle is not lost. It is tracked in git and `dist/` is hydrated from it, so
"the shipped app cannot be rebuilt" is really "the shipped app cannot be
**recompiled**". The scene and data surfaces are far closer than expected:
of 78 symbols the override scripts depend on, 68 exist in both sides with
compatible shapes. The gap is narrow and deep rather than wide. It is
**three globals, one bootstrap block, six scene members, and roughly fifteen
methods of gameplay that only exist as minified code** - plus a build toolchain
that is no longer declared anywhere. Everything that breaks, breaks silently.

## 1. Global surface

Every `window.*` the bundle assigns, checked with word-boundary matching against
the whole of `src/`. Nothing is assigned via `globalThis`, `self`, or bracket
syntax; the list is complete.

| Global | Bundle | `src/` | Who consumes it | Verdict |
|---|---|---|---|---|
| `__PHASER_GAME__` | assigns | assigns | all five override scripts | OK both |
| `__GAME_STATE__` | assigns | assigns | `ui-overhaul`, `dq-tiles`, `hero-override`, `adapter` | OK both |
| **`__QOK`** | **assigns** | **absent** | `ui-overhaul` (`.Z`, `.find`, `.shops`, `.loc`, `.setVolume`), `adapter` (`.Z`, `.state`, `.locationName`), `hero-override` (`.loc`) | **BUNDLE-ONLY** |
| **`__tapItems`** | **assigns and calls (11 sites)** | **absent** | the bundle's own Menu / Battle / Shop / quiz code | **BUNDLE-ONLY** |
| **`__setControlOrientation`** | **calls (2 sites)** | **absent** | defined in `index.html:268`, called from the bundle's settings toggle | **BUNDLE-ONLY (inverted)** |
| `__QOK_SAFE__` | - | - | published by `ui-overhaul`, read by `adapter` | override-owned, unaffected |
| `__ACT1_TOWN_VIEW__` | - | - | published by `adapter`, read by `ui-overhaul` | override-owned, unaffected |
| `__ACT1_WORLD_MAP__` | - | - | published by `act1-world-map`, read by `dq-tiles` | override-owned, unaffected |
| `__HERO_VARIANT__`, `__HERO_SCALE__` | - | - | `hero-override` | override-owned, unaffected |
| `__DQ_STICK__`, `__DQ_TILES__`, `__A1_DNG_MOVE__`, `__QOKUI` | - | - | override instrumentation | override-owned, unaffected |

Also assigned by the bundle and not relevant: `window.URL`, `window.onblur`,
`window.onfocus`.

**Three bundle-only globals. That is the whole list.** The override scripts own
their own namespace entirely, so the seam between the compiled game and the
overlay is genuinely narrow.

## 2. The bundle has been hand-edited after compilation

This is the finding that explains the rest. The bundle is pretty-printed, not
minified-on-one-line, and it carries hand-written comments that no minifier
would emit:

```
// Reusable: make an array of GameObjects tap-reactive -> onPick(index, obj).
window.__tapItems = function(items, onPick) {
```

The last ~4,950 bytes of the file are a hand-written IIFE appended to the
compiled bootstrap. It contains, in order:

- `window.__QOK`, an eight-member bridge object built with `typeof X !== "undefined"` guards over the module-internal minified identifiers.
- `fitScene(s)` - camera zoom and centering for every scene except `WorldMapScene`.
- `window.__tapItems` - makes an array of Phaser GameObjects tap-reactive.
- `wireSceneTaps(s)` - field taps that advance dialogue and confirm the quest / crystal / warp / healer / item overlays, plus `BattleScene` message advance.
- `updateControlVis()` - `document.body.classList.toggle("show-controls", ...)`.
- `setup()` - wires all of the above to scene lifecycle events and `T.scale.on("resize", ...)`.

None of it exists in `src/`. It was written directly into the build output.

Two further hand-edits sit inside the compiled bootstrap itself:

| | Bundle | `src/main.ts` |
|---|---|---|
| Phaser scale mode | `Phaser.Scale.RESIZE` | `Phaser.Scale.NONE` |
| Canvas CSS size | `style.width = "100%"; style.height = "100%"` | fixed `CANVAS_CSS_WIDTH/HEIGHT` px |

Scene keys, constants (`GAME_WIDTH` 768, `GAME_HEIGHT` 672, `TILE_SIZE` 48,
the `ZOOM` formula, `FONT_FAMILY`) and the `ZOOM` text-resolution patch are
identical on both sides.

## 3. Rebuild landmines

Nine hard landmines, ranked by how loudly they fail. "Loud" here means a person
would notice within seconds; nothing in this list produces a console error.

### Severity 1 - the game becomes unusable, silently

**L1. `__QOK` disappears, and the entire DOM UI turns itself off.**
`public/ui-overhaul.js:1722`:

```js
if (!QOK() || !GS()) { deactivate(); return; }
```

`deactivate()` (line 325) strips the `active` class, empties `stage.innerHTML`,
and removes `body.qok-overlay`. Result: menu, shop, battle, title, healer and the
field HUD all revert to whatever the compiled Phaser canvas draws natively. Not a
blank screen, but a completely different and much older-looking game. No error is
logged; the guard is a designed fallback path.

**L2. `show-controls` is never set, so the on-screen d-pad never appears.**
`body.show-controls` is styled in `index.html:73,82` and toggled from exactly one
place in the entire repo: `updateControlVis()` in the bundle's hand-written tail.
It appears once in the bundle and zero times in `src/` or any override script. On
a touch device this alone makes the game uncontrollable.

**L3. `wireSceneTaps` disappears, so tapping the field does nothing.**
Dialogue advance, and confirming the quest / mid-crystal / warp / healer / item
overlays, all currently route through the bundle-tail pointer handler. The
overlays would open and never close by touch.

### Severity 2 - visibly wrong, but the game still runs

**L4. `base: '/edu-rpg/'` in `vite.config.ts` vs relative paths in the shipped
`dist/index.html`.** The shipped page references `assets/index-BhoGQRaA.js` and
`ui-overhaul.css` relatively. A rebuild emits `/edu-rpg/assets/...`, which 404s
inside the Capacitor iOS webview. This one is loud: white screen.

**L5. Scale mode `NONE` instead of `RESIZE`, plus a fixed-pixel canvas.** The
canvas stops filling the viewport and stops responding to rotation. `fitScene`
also disappears, so every non-overworld scene loses its zoom-and-centre.

**L6. `__tapItems` disappears.** Menu, battle-command, item and quiz lists lose
direct tap selection. Keyboard and d-pad still work, so this degrades rather than
breaks.

**L7. `__setControlOrientation` loses its caller.** The definition in
`index.html:268` survives; the bundle's settings toggle that calls it does not.
The control-orientation setting writes `localStorage` and then changes nothing.

### Severity 3 - one HUD element or feature stops rendering

**L8. Six scene members the overrides touch exist only in the bundle:**

| Scene | Member | Consumer | Effect if absent |
|---|---|---|---|
| `WorldMapScene` | `hudHpPanel` | `ui-overhaul` `hideNativeFieldHud` | native HP panel no longer suppressed, so it double-draws under the DOM HUD |
| `WorldMapScene` | `hudFloorPanel` | same | same |
| `WorldMapScene` | `_minimapBtn` | same | same |
| `WorldMapScene` | `minimapCollapsed` | `ui-overhaul` minimap tap | minimap collapse toggle stops working |
| `MenuScene` | `equipTypeFilter` | `ui-overhaul` `routeMenu` | equip tab filter tap is a no-op |
| `MenuScene` | `equipScrollOffset` | same | equip list scroll position resets |

Every one of these is behind a feature-detect or a `try/catch` in the override,
so they fail as "that button does nothing", not as an exception.

**L9. The bundle filename changes.** A rebuild produces a different content hash,
which breaks the pinned entries in `runtime/manifests/` and the
`ACT1_OVERLAY_FILES` hash table in `scripts/runtime_baseline.py`. Loud, and
arguably the useful tripwire in the set.

### Not landmines, but worth knowing

Three symbols the overrides call exist in **neither** side, so they are already
dead today and a rebuild changes nothing:
`scene.updateMinimap?.()` (`adapter.js:568`, the bundle has `renderMinimap` and
`updateMinimapPlayerDot` but no `updateMinimap`), `ts.drawTitle` and
`player.heroVariant`.

Save data is **compatible**. Both sides use `SAVE_VERSION = 4`; the bundle writes
`edu-rpg-save` / `edu-rpg-autosave`, and `SaveManager.storageKey()` in `src/`
returns the bare key for the default profile (`slot1`), so an existing save
loads. This was my first hypothesis for a data-loss landmine and it is wrong.

## 4. Which parts of `src/` are fiction

The reason the surfaces are so congruent is in the history:
`a6726ed` (2026-04-02) is literally **"Reconstruct source to match deployed
v1.0.0 bundle"**. `src/` was reverse-engineered out of a bundle. Everything
committed to `src/` after that date has never been compiled, because
`npm run build` has been the blocked-build stub since.

Since `a6726ed`, `src/` has taken **+5,865 / -161 lines** with zero of it
reaching the runtime.

### Wholly fictional (not in the bundle at all)

**`src/map-engine/**` - about 3,800 lines across 20 files.** Zero trace in the
bundle for `semanticMap`, `act1Overworld`, `movementController`,
`retainedMapEvents`, `mapEngineFeatureFlag`, `starterOverworld`,
`overworldVerticalSlice`, `reentryEligibilityPlanner`, `retainedAdapterContract`,
`retainedBehaviorManifest`, `act1RuntimeSnapshot`, `act1LandmarkRenderRecipes`.
It is also imported by **nothing** in `src/` outside its own directory. It is a
standalone spec-and-test corpus exercised by `npm run test:map-engine`, not
runtime code. Reading it to understand how the running game moves the hero is
reading the wrong thing entirely: the running game's Act 1 movement is in
`public/dq-tiles.js` (`a1mInstall` wrapping `sys.sceneUpdate`) and
`public/act1-world-map.js` (wrapping `canMove`, `checkTransition`,
`getCompassTarget`).

**`TitleScene` save-profile system - 12 source-only methods, ~292 lines.**
`confirmProfile`, `drawProfiles`, `showOverwriteConfirm`, `confirmOverwrite`,
`cancelOverwrite`, `drawOverwriteConfirm`, `startCreateForProfile`,
`startNewForSelectedProfile`, `formatProfileLine`, `formatProfileTitle`,
`formatPlaytime`, `tryDevStartFromUrl`. The bundle contains the string "profile"
**zero times**. Backing it, seven `SaveManager` methods are also source-only:
`getActiveProfileId`, `setActiveProfileId`, `getProfileSummaries`,
`getActiveProfileSummary`, `normalizeProfileId`, `profileIdFromUrl`,
`storageKey`. A rebuild would *add* a five-slot profile picker nobody has seen.

### Partially fictional

| File | Source-only | Note |
|---|---|---|
| `WorldMapScene.ts` | `renderBanditLordMapSprite`, `isTileInsideUnrevealedHiddenRoom`, `clearTripwireCluster`, `getTileThemePrefix`; also a poison-damage rebalance from 5% to 20% of max HP, a `try/catch` transition-recovery path, and NPC sprite-key changes | +474 / -87 since the reconstruction |
| `MenuScene.ts` | `returnToTitle`, `update` | |
| `BootScene.ts` | 10 extra monster sprites (`mosswarden`, `coralTitan`, `oreColossus`, `phantomStag`, `sandSerpentQueen`, `ashenGuardian`, `magmaBeetleKing`, `crystalHydra`, `warGeneralMalachar`, `nullDevourer`), a whole `NPC_SPRITE_IMAGES` preload block, and a switch from a hostname check to `import.meta.env.BASE_URL` | |
| `MapGenerator.ts` | +172 / -10 | not separately audited |

### Faithful (safe to read as a description of the running game)

`src/data/maps.ts` (all 47 map ids present in the bundle), `monsters.ts` (72),
`items.ts` (58), `shops.ts` (15), `GameState.ts` (method-for-method identical),
`constants.ts` (values verified against the bundle), and the i18n locale tables.
`ShopScene`, `ExportScene`, `GameOverScene`, `VictoryScene` and `BootScene` match
method-for-method.

### Shipped content that has no source at all

Fifteen methods exist in the bundle's scene classes and nowhere in `src/`. These
are the real losses in a rebuild, because they are gameplay, not plumbing:

- `WorldMapScene`: `handleGlyphStep`, `renderGlyphPlates`, `reshuffleGlyphPlates`, `glyphSymName`, `cleanupGlyphTrial` (a glyph-plate puzzle, hooked from `loadMap` via `if (this.glyphTrialActive) this.renderGlyphPlates()`), `sandstormGust`, `forestFade`, `forestLostTransition`, `_renderQuestTracker`, `_healVfx`, `_saveVfx`, `_drawTripwireLines`
- `BattleScene`: `critEffect`
- `MenuScene`: `getItemDisplayName`

Grepping `src/` for `glyph`, `sandstorm`, `critEffect` or `QuestTracker` returns
two unrelated hits (`sandstormCloak`, a `hieroglyphs` comment). This content
exists only as minified JavaScript.

## 5. The build toolchain is also missing

Worth stating separately, because it is not a source-drift problem and it gates
everything above.

- **`vite` is in neither `package.json` nor `package-lock.json`.** `devDependencies` is `@capacitor/cli` and `typescript` only. `vite.config.ts` still imports it. Vite 6.4.1 happens to be present in `node_modules/` on this machine, undeclared and unpinned.
- `npm run build` and `npm run dev` are both `python3 scripts/runtime_baseline.py blocked-build`.
- The version of Vite that produced `index-BhoGQRaA.js` is not recorded anywhere I found.

So "rebuild from source" today is not one command that goes wrong. It is: restore
a build script, re-add an unpinned bundler, and then hit the nine landmines.

## 6. The smallest change that makes a rebuild survivable

About 130 lines, all additive, none of which touch the shipped bundle:

1. **Add `src/runtimeBridge.ts`**, imported at the end of `src/main.ts`. Port the hand-written tail out of the bundle verbatim: `window.__QOK` with its eight members (`Z`, `db`, `find`, `tile`, `state`, `shops`, `loc`, `setVolume`), `window.__tapItems`, `fitScene`, `wireSceneTaps`, `updateControlVis`, and the `setup()` wiring. Kills L1, L2, L3, L5, L6.
2. **Change `scale.mode` to `Phaser.Scale.RESIZE` and set the canvas to `100%/100%`** in `src/main.ts`. Kills the rest of L5.
3. **Add a `window.__setControlOrientation?.(next)` call** to the `MenuScene` control-orientation toggle. Kills L7.
4. **Change `base` in `vite.config.ts` from `'/edu-rpg/'` to `'./'`.** Kills L4.
5. **Declare `vite@6.4.1` in `devDependencies`** and commit the lockfile entry.

That converts a total, silent UI loss into an ordinary build. It does **not**
give you the shipped game: the fifteen bundle-only gameplay methods are still
gone and the profile picker still appears unbidden.

The single highest-value item, if only one thing is done, is **1**. It is also
the only one that can be written and reviewed without a build.

A cheap safety net worth more than any of them: make `smoke:runtime` assert
`typeof window.__QOK === 'object'` and `document.body.classList.contains('show-controls')`
on the overworld. Today nothing anywhere fails when the UI silently switches off.

## 7. Effort estimate

**A day** to make a rebuild survivable (section 6). Low risk, mechanical, and
verifiable by reading.

**One to two weeks** to make a rebuild produce the shipped game. That estimate
turns on three things:

1. **Porting fifteen methods out of minified code.** The bundle is pretty-printed and identifiers inside function bodies are readable, so this is transcription plus renaming rather than reverse-engineering. Call it two to four days if the glyph trial's state machine is as self-contained as its five methods suggest. I did not trace its reachability, so this is the estimate's softest input.
2. **A decision on the profile picker.** Ship it, or delete ~390 lines from `TitleScene` and `SaveManager`. This is a product call, not an engineering one, and it will dominate the calendar if it has to wait for the owner.
3. **Whether the compiled scene bodies are otherwise behaviourally identical.** This is what I cannot prove. The method *names* line up 68-for-78, but a minified diff will not tell you whether `updateHUD` computes the same thing on both sides. `WorldMapScene` is 233 KB of pretty-printed bundle against 179 KB of TypeScript, and neither number is a trustworthy proxy. If the bodies have drifted materially, the estimate is wrong in the "rewrite" direction, not the "day" direction.

**"Rewrite" territory** only applies to making rebuild the routine path with
confidence, and that is gated on test coverage rather than on the drift. There is
currently no automated check that would notice the UI turning itself off.

**My recommendation is not to close the gap.** The hydrate-from-baseline path is
working, the artifact is tracked and hash-pinned, and the drift is documented
here. Do item 1 of section 6 so that a future rebuild fails loudly instead of
silently, and leave the rest until there is a reason to recompile.

## Method and limits

- Bundle claims are evidenced from `dist/assets/index-BhoGQRaA.js` only, never inferred from source. Symbol presence was checked with word-boundary matching after an initial substring pass produced two false negatives (`updateMinimap` inside `updateMinimapPlayerDot`, `drawTitle` inside `drawTitleScreen`).
- Source was read from `git show main:...`, not from a working tree, because the analysis worktree sat 25 commits behind `main`.
- Scene classes were extracted by brace-matching `class X extends *.Scene`; method lists come from indentation-anchored declarations. A method defined as an assigned arrow property would be missed by both extractors.
- **Not established:** whether same-named methods have the same *behaviour*. Only names, arity-shape and the specific call sites quoted above were compared. Section 4's "faithful" list means the symbols and data match, not that every code path does.
- **Not established:** reachability of the bundle-only glyph trial in normal play. It is hooked from `loadMap` behind `this.glyphTrialActive`; I did not trace what sets that flag.
- `runtime/manifests` hash pins were not re-verified as part of this work; `npm run verify:baseline` is the tool for that.
