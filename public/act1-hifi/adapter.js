const REVISION = 1;
const MANIFEST_SHA256 = 'cb3865ba5f51d27dc025594df6a487dc97728f76dbecb98bebf172e75dd4def8';
const RUNTIME_URL = new URL('./runtime.html', import.meta.url);
// Towns are a second hi-fi surface behind the same overlay. The gate below was
// `activeMapId === 'overworld'` only; a town screen is a different runtime, not a different
// corridor, so it gets its own entry path rather than another branch inside enterAct1().
const TOWN_URL = new URL('./town.html', import.meta.url);
// OWNER DECISION 2026-08-02: this overlay is TOWNS ONLY. It used to take over the OVERWORLD as
// well, via `runtime.html` -- but that file is a desktop design MOCKUP: it wraps the canvas in
// `<div id="phone">` with a hardcoded "9:41" status bar, a fake Dynamic Island, a duplicate HUD
// and a duplicate bottom nav, and its own canvas calls itself a "phone motion mockup". Inside the
// real iOS app that renders a phone inside a phone. It also streams `chunks/`, which is the
// SCRAPPED dark painterly overworld, not the settled `act1-material-map.png`. The overworld
// therefore goes back to the shipped tile runtime until a real hi-fi overworld exists.
// TOWN_IDS gates which maps this overlay takes over. It has been portSapphire alone since the
// overlay shipped, which is why the two villages' art, collision and manifests could rot
// unexercised -- both carried a shopId of None and millbrook's save point sat on a cottage
// roof, and nothing caught either because no player could reach them. OPENED 2026-08-22, on
// the owner's ask for a play test, now all three have a finished plate, collision derived
// from that plate, and every actor verified standable and reachable from startCell.
const TOWN_IDS = new Set(['portSapphire', 'millbrook', 'greenhollow']);
const MANIFEST_URL = new URL('./manifest.json', import.meta.url);
const SEARCH = new URLSearchParams(location.search);
const VERIFY = SEARCH.has('act1Verification');
const HOLD_TRANSITIONS = SEARCH.has('act1HoldTransitions');
const FORWARDED_QUERY = new Map([
  ['act1Demo', 'demo'],
  ['act1PathDebug', 'pathDebug'],
  ['act1StartProbe', 'startProbe'],
  ['act1EdgeDemo', 'edgeDemo'],
]);
const MOVE_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'a', 'A', 'd', 'D', 'w', 'W', 's', 'S',
]);
// FACING CONTINUITY between the overworld and a town. WorldMapScene.heroDir is a number -- 0 down,
// 1 left, 2 right, 3 up, the same order dq-tiles.js's dungeon-arrival rescue uses (public/dq-tiles.js
// ~3197) -- and town.html speaks the direction WORDS its own `state.facing` already uses. These two
// tables are the one place that mapping lives; both enterTown() (entering) and the act1-town-exit
// handler (leaving) go through them so the two directions can never drift apart.
const HERO_DIR_TO_FACING = ['down', 'left', 'right', 'up'];
const FACING_TO_HERO_DIR = { down: 0, left: 1, right: 2, up: 3 };

const style = document.createElement('style');
style.textContent = `
  #act1-hifi-preserved-root { position: fixed; inset: 0; z-index: 70; overflow: hidden; background: #02060a; }
  #act1-hifi-preserved-root[hidden] { display: none; }
  #act1-hifi-preserved-root iframe { width: 100%; height: 100%; border: 0; display: block; background: #02060a; opacity: 0; }
  #act1-hifi-preserved-root[data-ready="true"] iframe { opacity: 1; }
  /* The field HUD STAYS UP over the town. It used to be hidden here, which is why Port Sapphire
     had no HP bar, minimap or compass while the overworld and the dungeons had all three. It
     draws town-correct content from __ACT1_TOWN_VIEW__ -- see publishTownView() below. The floor
     tag is the one piece with nothing to say in a town. */
  body.act1-hifi-active #qfh-floor { display: none !important; }
  /* Owner 2026-08-04: the town overlay is FULL-BLEED at the top -- the art runs under the status
     bar and the field HUD stays hidden -- but the BOTTOM TAB BAR has to stay reachable over it.
     The bar is #fieldTabs, a child of #touch-controls, so hiding that container (which this rule
     used to do wholesale) took the bar with it. Keep the container displayed and hide only the
     analog stick: the town runtime draws its own. The container is pointer-events:none and the
     bar is pointer-events:auto, so only the bar itself takes taps; the rest reaches the town. */
  body.act1-hifi-active #touch-controls {
    display: block !important; position: fixed; inset: 0; z-index: 100; pointer-events: none; }
  /* The town runtime draws its own analog pad, so the parent's stays hidden -- but the two must
     agree on WHERE it sits. postTownChrome() forwards the orientation setting and the measured
     safe-area insets into the frame; see town.html's #pad rules. */
  body.act1-hifi-active #dpad { display: none !important; }
  /* Dialogue still takes the controls away -- the tab bar and the pad would sit on top of the
     message -- but the HUD now behaves exactly as it does on the overworld and in a dungeon,
     where it stays up while an NPC talks. The rules that used to blank it piece by piece are
     gone; one of them (#qfh-hp) never matched anything anyway, because the HP block is a
     class, .qfhp -- this whole block is a template literal, so it cannot quote them. */
  body.act1-hifi-active.qok-dialogue #touch-controls { display: none !important; }
`;
document.head.append(style);

const root = document.createElement('div');
root.id = 'act1-hifi-preserved-root';
root.hidden = true;
root.dataset.ready = 'false';
const frame = document.createElement('iframe');
frame.title = 'Playable Act 1 overworld';
frame.allow = 'gamepad';
root.append(frame);
document.body.append(root);

let manifest = null;
let entry = null;
let entryPromise = null;
let generation = 0;
let lastError = null;
let suppressedScene = null;
let townEntry = null;
const lifetimeStats = { semanticCommits: 0, parentTransitions: 0 };

function gameState() {
  return window.__GAME_STATE__ || null;
}

function phaserGame() {
  return window.__PHASER_GAME__ || gameState()?.game || null;
}

function worldScene() {
  const game = phaserGame();
  return game?.scene?.getScene?.('WorldMapScene') || null;
}

function playerState() {
  return gameState()?.player?.state || null;
}

function activeMapId(scene) {
  return scene?.currentMapId || playerState()?.position?.mapId || null;
}

function worldSceneActive() {
  return Boolean(phaserGame()?.scene?.isActive?.('WorldMapScene'));
}

// PAUSED IS NOT GONE, AND CONFUSING THE TWO COST THE PLAYER HER POSITION.
// Every shipped UI that sits on top of the world -- the shop and the menu both -- does
// `launch(<other scene>)` then `this.scene.pause()`, and a paused Phaser scene reports
// `isActive() === false`. tick()'s guard used to be `worldSceneActive()` alone, so opening a shop
// or a menu inside a hi-fi town dropped straight through to `releaseRoot()`: `frame.src` went to
// about:blank and the whole town runtime was destroyed. Closing the UI then re-entered from
// scratch and town.html spawned her on `startCell`, the arrival cell by the gate -- OWNER, build
// 64: "after opening a menu screen or shop screen the user snaps to near the entrance of the town
// but they need to be in the same position as they were and in the same location."
//
// The town's position lives in the iframe and nowhere else, so keeping the iframe ALIVE is the
// whole fix: suspended, hidden, not reloaded. Never widen this to "any scene is active" -- the
// point is that WorldMapScene itself is still the player's scene, merely stopped for a moment.
function worldScenePaused() {
  return Boolean(phaserGame()?.scene?.isPaused?.('WorldMapScene'));
}
function worldSceneLive() {
  return worldSceneActive() || worldScenePaused();
}

function prepareRoot() {
  root.hidden = false;
  document.body.classList.add('act1-hifi-active');
}

function suppressLegacyWorldRender(scene) {
  if (suppressedScene && suppressedScene !== scene) {
    suppressedScene.sys?.setVisible?.(true);
    suppressedScene.scene?.setVisible?.(true);
  }
  scene?.sys?.setVisible?.(false);
  scene?.scene?.setVisible?.(false);
  suppressedScene = scene;
}

function releaseRoot() {
  generation += 1;
  suppressedScene?.sys?.setVisible?.(true);
  suppressedScene?.scene?.setVisible?.(true);
  suppressedScene = null;
  entry = null;
  entryPromise = null;
  townEntry = null;
  townSuspended = false;
  window.__ACT1_TOWN_VIEW__ = null;
  root.hidden = true;
  root.dataset.ready = 'false';
  document.body.classList.remove('act1-hifi-active');
  frame.src = 'about:blank';
  frame.blur();
  window.focus();
  if (document.activeElement === frame) {
    const previousTabIndex = document.body.getAttribute('tabindex');
    document.body.tabIndex = -1;
    document.body.focus({ preventScroll: true });
    if (previousTabIndex === null) document.body.removeAttribute('tabindex');
    else document.body.setAttribute('tabindex', previousTabIndex);
  }
}

/* ---- the healer charges in Greenhollow too ----------------------------------------------------
   OWNER, build 67: "healer needs to ask for a fee when the player needs healing and the player
   needs to be able to choose whether to pay and heal or cancel (menu popup). the fact that this is
   gone is a regression."

   Nothing is broken and nothing needs writing: `handleHealer()` already prices the heal, already
   refuses politely when the player is short, and already opens a confirm popup with Heal / Leave --
   `npc.healer.popupTitle` ("Shall I heal you?"), `.offer`, `.healOption`, `.leaveOption` are all in
   the frozen bundle, in every locale. The ONE reason none of it ever runs in the starting town is
   `HEALER_PRICES.greenhollow === 0`, and a price of zero takes the early-return branch that heals
   silently for free.

   So the fix is the price, not the flow, and the price is reachable: TypeScript's `private static`
   is a compile-time fiction, so the table is a plain static on the scene's constructor at runtime.
   Setting it here means the shipped confirm path runs exactly as it does in every other town --
   same prompt, same gold arithmetic, same save format -- rather than this file growing a second
   heal implementation, which is the fork every other service in this adapter is careful to avoid.

   3 G, below millbrook's 5 and Port Sapphire's 8, so the starting town stays the cheapest. */
const GREENHOLLOW_HEAL_PRICE = 3;
function patchHealerPrice(scene) {
  const table = scene?.constructor?.HEALER_PRICES;
  if (table && table.greenhollow === 0) table.greenhollow = GREENHOLLOW_HEAL_PRICE;
}

function patchScene(scene) {
  patchHealerPrice(scene);
  if (!scene || scene.__act1HifiPreservedPatch) return;
  const originalUpdate = scene.update;
  const originalLoadMap = scene.loadMap;
  // The overworld branch used to force `isMoving` so the mockup runtime kept animating. Towns
  // do not need it -- town.html drives its own loop -- so the scene's update is left alone.
  scene.update = originalUpdate;
  scene.loadMap = function preservedAct1LoadMap(mapId, ...args) {
    if (TOWN_IDS.has(mapId)) prepareRoot();
    return originalLoadMap.call(this, mapId, ...args);
  };
  scene.__act1HifiPreservedPatch = { revision: REVISION, originalUpdate, originalLoadMap };
}

function nearestRoute(cell, preferredId) {
  const corridors = manifest.pathConstraints.corridors;
  const candidates = corridors.flatMap(corridor => corridor.semanticCells.map((candidate, index) => ({
    corridor,
    index,
    distance: Math.hypot(candidate.x - cell.x, candidate.y - cell.y),
    preferred: corridor.id === preferredId ? 0 : 1,
  })));
  candidates.sort((a, b) => a.distance - b.distance || a.preferred - b.preferred);
  const requested = SEARCH.get('act1Route');
  if (requested) {
    const corridor = corridors.find(candidate => candidate.id === requested);
    if (!corridor) throw new Error(`unknown Act 1 route: ${requested}`);
    const index = corridor.semanticCells.reduce((best, candidate, candidateIndex) => (
      Math.hypot(candidate.x - cell.x, candidate.y - cell.y)
        < Math.hypot(corridor.semanticCells[best].x - cell.x, corridor.semanticCells[best].y - cell.y)
        ? candidateIndex : best
    ), 0);
    return { corridor, index };
  }
  return candidates[0];
}

function routePointAtIndex(route, semanticIndex, semanticCount) {
  const total = route.waypoints.slice(1).reduce((sum, point, index) => (
    sum + Math.hypot(point.x - route.waypoints[index].x, point.y - route.waypoints[index].y)
  ), 0);
  const wanted = total * semanticIndex / Math.max(1, semanticCount - 1);
  let traversed = 0;
  for (let index = 1; index < route.waypoints.length; index += 1) {
    const from = route.waypoints[index - 1];
    const to = route.waypoints[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (traversed + length >= wanted || index === route.waypoints.length - 1) {
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, (wanted - traversed) / length));
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    traversed += length;
  }
  return { ...route.waypoints.at(-1) };
}

function runtimeQuery(routeId) {
  const query = new URLSearchParams({ route: routeId });
  if (playerState()?.storyFlags?.['boss.giantToad.defeated']) query.set('crystalGate', 'open');
  for (const [outer, inner] of FORWARDED_QUERY) {
    if (SEARCH.has(outer)) query.set(inner, SEARCH.get(outer) || '1');
  }
  return query;
}

function waitForRuntime(token) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const poll = () => {
      if (token !== generation) return reject(new Error('superseded Act 1 runtime load'));
      const runtime = frame.contentWindow?.__ACT1_HIFI_G1__;
      if (runtime?.assetsReady && frame.contentDocument?.body?.dataset.ready === 'true') return resolve(runtime);
      if (performance.now() - started > 30_000) return reject(new Error('Act 1 runtime load timed out'));
      requestAnimationFrame(poll);
    };
    poll();
  });
}

async function alignRuntime(runtime, corridor, semanticIndex) {
  const route = runtime.activeNavigationRoute;
  const point = routePointAtIndex(route, semanticIndex, corridor.semanticCells.length);
  runtime.state.position = point;
  runtime.state.semanticIndex = semanticIndex;
  runtime.state.cell = { ...corridor.semanticCells[semanticIndex] };
  runtime.state.minSemanticIndex = semanticIndex;
  runtime.state.maxSemanticIndex = semanticIndex;
  const stage = frame.contentDocument.querySelector('#stage');
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  runtime.camera.x = point.x - width / (2 * runtime.camera.zoom);
  runtime.camera.y = point.y - height / (2 * runtime.camera.zoom) + 40;
  await runtime.ensureVisibleAssets({
    left: runtime.camera.x,
    top: runtime.camera.y,
    right: runtime.camera.x + width / runtime.camera.zoom,
    bottom: runtime.camera.y + height / runtime.camera.zoom,
  }, true);
  runtime.streamStats.visibleAssetMisses = 0;
  runtime.streamStats.visibleDetailMisses = 0;
  runtime.streamStats.visibleDetailMissRegionIds = {};
  runtime.streamStats.frameSamples = 0;
  runtime.streamStats.maxFrameMs = 0;
  runtime.streamStats.overBudgetFrames = 0;
  runtime.streamStats.maxFrameWorkMs = 0;
  runtime.streamStats.overBudgetFrameWork = 0;
}

function localizeRuntime() {
  const doc = frame.contentDocument;
  const Z = window.__QOK?.Z || (key => key);
  const labels = ['menu.status', 'menu.items', 'menu.equip', 'menu.settings'];
  [...doc.querySelectorAll('.nav-item')].forEach((item, index) => {
    const label = Z(labels[index]);
    const text = [...item.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (text) text.nodeValue = label;
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.style.cursor = 'pointer';
    const open = () => document.querySelector(`#fieldTabs [data-fi="${index}"]`)?.click();
    item.addEventListener('click', open);
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') open();
    });
  });
}

async function enterAct1(scene) {
  const token = ++generation;
  prepareRoot();
  suppressLegacyWorldRender(scene);
  root.dataset.ready = 'false';
  manifest ||= await fetch(MANIFEST_URL).then(response => {
    if (!response.ok) throw new Error(`Act 1 manifest ${response.status}`);
    return response.json();
  });
  if (manifest.revision !== 11) throw new Error(`unexpected Act 1 manifest revision ${manifest.revision}`);
  const state = playerState();
  if (!state) throw new Error('Act 1 player state is not ready');
  const position = state.position || { x: 60, y: 340 };
  const selected = nearestRoute(position, state.act1HifiRouteId);
  const query = runtimeQuery(selected.corridor.id);
  const loaded = new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = () => reject(new Error('Act 1 runtime iframe failed to load'));
  });
  frame.src = `${RUNTIME_URL.href}?${query}`;
  await loaded;
  const runtime = await waitForRuntime(token);
  if (token !== generation || activeMapId(scene) !== 'overworld') return;
  await alignRuntime(runtime, selected.corridor, selected.index);
  localizeRuntime();
  entry = {
    scene,
    runtime,
    ready: true,
    routeId: runtime.activeCorridor.id,
    semanticIndex: runtime.state.semanticIndex,
    commits: runtime.state.commits,
    routeSwitches: runtime.state.routeSwitches,
    semanticCommits: 0,
    parentTransitions: 0,
  };
  state.act1HifiRouteId = entry.routeId;
  lastError = null;
  root.dataset.ready = 'true';
  frame.contentWindow.focus();
}

// The town frame deliberately owns no translations and no map transitions. It posts intent and
// this side, which can see `window.__QOK` and the live Phaser scene, performs it.
addEventListener('message', event => {
  const data = event.data;
  if (!data || event.source !== frame.contentWindow || !townEntry) return;
  if (data.type === 'act1-town-strings-request') {
    // Answer the whole table in one message so the town never has to paint English first. Missing
    // keys come back from the shipped i18n as the key itself (or as `[key]`); the town treats
    // either as "no translation" and keeps its bundled English rather than showing a raw dotted key.
    const translate = window.__QOK?.Z;
    if (typeof translate !== 'function') return;
    const strings = {};
    for (const k of data.keys || []) {
      try {
        const v = translate(k);
        strings[k] = untranslated(k, v) ? (bundlePredates(k) ?? v) : v;
      } catch (e) {}
    }
    frame.contentWindow.postMessage({ type: 'act1-town-strings', strings }, '*');
    return;
  }
  if (data.type === 'act1-town-interact') {
    // `__QOK.Z` is the shipped i18n function, so the player reads dialogue in the locale they
    // chose. The frame's bundled English is only what shows for the frame it takes to reply.
    const translate = window.__QOK?.Z;
    if (typeof translate !== 'function') return;
    // THIS is the reply the box actually renders, and it is why the bulk-strings fix alone did not
    // show up: town.html's `act1-town-text` branch takes `data.name` as given, so a raw
    // `[npc.villager2.name]` from here lands straight on screen no matter how careful the cache is.
    // Both paths go through the same untranslated() test now.
    const localise = key => {
      if (!key) return undefined;
      const v = translate(key);
      return untranslated(key, v) ? (bundlePredates(key) ?? undefined) : v;
    };
    frame.contentWindow.postMessage({
      type: 'act1-town-text', npc: data.npc,
      name: localise(data.nameKey),                       // undefined -> the town uses its own name
      text: localise(data.dialogueKey),
    }, '*');
    return;
  }
  if (data.type === 'act1-town-service') {
    // Shop, healer and save all render on the PHASER canvas, which the town overlay is covering.
    // So the overlay steps aside for the duration rather than trying to reproduce any of them:
    // the shipped ShopScene, `handleHealer()` and `saveGame()` stay the single implementation,
    // which keeps prices, inventory and save format from forking. tick() puts the town back when
    // the shipped UI is finished.
    const scene = townEntry.scene;
    const translate = window.__QOK?.Z;
    const state = window.__QOK?.state?.();
    suspendTownOverlay();
    try {
      if (data.kind === 'shop') {
        phaserGame()?.scene?.getScene?.('WorldMapScene');
        scene.scene.launch('ShopScene', { shopId: data.shopId });
        scene.scene.pause();
      } else if (data.kind === 'healer') {
        scene.handleHealer();
      } else if (data.kind === 'save') {
        state?.saveGame?.();
        state?.player?.fullHeal?.();
        if (typeof translate === 'function') scene.showMessage?.(translate('npc.savePoint'));
        scene.updateHUD?.();
      }
    } catch (error) {
      lastError = error.stack || error.message;
      console.error('[act1-hifi-town] service', data.kind, error);
      restoreTownOverlay();
    }
    return;
  }
  if (data.type === 'act1-town-exit') {
    // Same sequence the shipped town edge-exit uses: set the id, floor and hero tile, then load.
    const scene = townEntry.scene;
    const target = data.targetMapId || 'overworld';
    releaseRoot();
    scene.currentMapId = target;
    scene.currentFloor = 1;
    if (Number.isFinite(data.toX)) scene.heroTileX = data.toX;
    if (Number.isFinite(data.toY)) scene.heroTileY = data.toY;
    const state = playerState();
    if (state?.position) {
      state.position.mapId = target;
      if (Number.isFinite(data.toX)) state.position.x = data.toX;
      if (Number.isFinite(data.toY)) state.position.y = data.toY;
    }
    scene.loadMap(target);
    // FACING CONTINUITY, leaving. `state.facing` at the moment she crossed the mouth already says
    // which way that was (town.html's exit-crossing block posts it) -- map it back onto the
    // overworld's heroDir so she keeps walking the direction she was already going, instead of
    // facing whichever way she faced BEFORE she ever entered the town (usually up, back into the
    // door she just walked out of -- the bug this fixes). Applied AFTER loadMap(), the same order
    // dq-tiles.js's dungeon-arrival rescue uses for its own post-load facing (a1dApply,
    // public/dq-tiles.js ~3200): loadMap() repositions `scene.hero`, it does not replace it, so this
    // repaints the SAME sprite loadMap just placed. heroDir alone is state, not a picture -- the
    // bundle only redraws the hero's frame on a move -- so setFrame(heroDir*3) has to be called
    // here too, or she stands at the mouth facing whichever way her last overworld step left her.
    const facingDir = FACING_TO_HERO_DIR[data.facing];
    if (facingDir !== undefined) {
      const paintFacing = () => {
        try {
          scene.heroDir = facingDir;
          if (scene.hero && typeof scene.hero.setFrame === 'function') scene.hero.setFrame(facingDir * 3);
        } catch (error) { /* display-only: never let this break the transition itself */ }
      };
      paintFacing();
      // Belt-and-braces: the overworld does not rebuild the hero synchronously inside loadMap() the
      // way the dungeon rescue's caller does, so reapply once on the next frame in case anything
      // else (a scene event loadMap fires synchronously) repaints the hero after this line runs.
      requestAnimationFrame(paintFacing);
    }
    lifetimeStats.parentTransitions += 1;
  }
});

/* ---- the two keys the frozen bundle predates -------------------------------------------------
   `npc.villager1.name` and `npc.villager2.name` exist in src/i18n/locales/{en,ja,jaKanji}.ts and
   are NOT in dist/assets/index-*.js: the bundle was frozen before they were added, and it cannot be
   rebuilt. The shipped translate therefore answers `[npc.villager2.name]`, which the town used to
   print verbatim onto a villager's dialogue box (OWNER, build 66: "Villager names show system
   text"). town.html now rejects a bracketed answer and falls back to the name authored in its own
   JSON, which fixes English on its own -- but that fallback is English-only, and a Japanese player
   would have read a Japanese line under the name "Villager".

   So the 24 keys the bundle DOES carry are still answered by the shipped i18n, unchanged, and only
   these two are filled in here, with the same three strings the locale files already hold. This is
   a BRIDGE, not a second home for translations: when the bundle is next rebuilt these keys resolve
   on their own and `bundlePredates` returns null for them without any code change, because it is
   only ever consulted when the shipped translate has already said it does not know the key. */
const BUNDLE_PREDATES = {
  'npc.villager1.name': { en: 'Villager', ja: 'むらびと', jaKanji: '村人' },
  'npc.villager2.name': { en: 'Villager', ja: 'むらびと', jaKanji: '村人' },
};
function untranslated(key, value) {
  return !value || value === key
    || (typeof value === 'string' && value.charAt(0) === '[' && value.charAt(value.length - 1) === ']');
}
function bundlePredates(key) {
  const row = BUNDLE_PREDATES[key];
  if (!row) return null;
  const st = playerState();
  if (st?.locale !== 'ja') return row.en;
  return st?.kanjiMode ? row.jaKanji : row.ja;
}

/* ---- parent chrome -> town frame -------------------------------------------------------------
   Two things the town frame cannot work out for itself:

   1. The control-orientation setting (left / center / right) lives on the parent's <body> as a
      ctrl-* class, written by index.html from localStorage.
   2. The real safe-area insets. `env(safe-area-inset-*)` inside a same-origin iframe is not the
      root scroller's and reads 0, so the town pad's own `calc(18px + env(...))` was measuring
      nothing. ui-overhaul.js already probes the true values and publishes __QOK_SAFE__.

   Without both, the pad sat bottom-left 18px up while the overworld and dungeon stick sat
   bottom-right above the tab bar -- and the parent's #fieldTabs bar (z-index 90) covers this
   iframe (z-index 70), so the pad's lower half was not reachable at all. Observed on device
   2026-08-06. */
const CTRL_CLASSES = ['ctrl-left', 'ctrl-center', 'ctrl-right'];
let lastChromeSig = '';

function currentChrome() {
  const cls = CTRL_CLASSES.find(c => document.body.classList.contains(c)) || 'ctrl-right';
  const safe = window.__QOK_SAFE__ || {};
  return {
    type: 'act1-town-chrome',
    ctrl: cls.slice(5),
    // The town hides its own pad for its own dialogue box, but it cannot see the SHIPPED message
    // box drawn over it. Forward that, so one text box on screen means one set of controls hidden
    // whichever surface drew it. postTownChrome() only posts on a real change, so this rides the
    // existing signature and costs nothing per frame.
    dialogue: Boolean(worldScene()?.showingMessage),
    safeBottom: Number(safe.bottom) || 0,
    safeLeft: Number(safe.left) || 0,
    safeRight: Number(safe.right) || 0,
  };
}

/* Called every frame while the town is up. It compares a signature and only posts on a real
   change, which also covers the ordering problem: ui-overhaul.js measures the insets over the
   first ~1s, so they are usually still 0 at the moment the frame reports ready. */
function postTownChrome(force) {
  const win = frame.contentWindow;
  if (!win || root.hidden) return;
  const chrome = currentChrome();
  const sig = JSON.stringify(chrome);
  if (!force && sig === lastChromeSig) return;
  lastChromeSig = sig;
  win.postMessage(chrome, '*');
}

/* ---- town -> field HUD seam -------------------------------------------------------------------
   The parent's field HUD used to be hidden outright while a town was up, so Port Sapphire showed
   no HP bar, no minimap and no compass where the overworld and every dungeon show all three
   (owner, on device 2026-08-06).

   It could not simply be un-hidden. ui-overhaul.js draws its minimap from `wm.mapData` and
   `wm.heroTileX/Y`, and during town play BOTH are wrong: the Phaser map for portSapphire is a
   16x16 stub, and the hero tile is only written back on exit, so the dot would sit wherever the
   player entered -- frequently outside the 16 rows entirely. The hi-fi town is a different world
   (65 cells at 16 world px, collision from a polygon authority, no tile grid at all).

   So the town publishes its own view instead. `walkable` is passed BY REFERENCE -- it is ~490 kB
   and the consumer only rasterises it once per town id. */
let townSuspended = false;

function publishTownView() {
  const runtime = townEntry?.runtime;
  if (!runtime || townSuspended) { window.__ACT1_TOWN_VIEW__ = null; return; }
  const town = runtime.town;
  const cellPx = town.worldPxPerCell;
  const pos = runtime.position();
  window.__ACT1_TOWN_VIEW__ = {
    id: town.id,
    nameKey: town.nameKey,
    cells: town.cells,
    world: town.cells * cellPx,
    walkable: runtime.walkable,
    hero: { x: pos.x, y: pos.y },
    facing: runtime.state?.facing || 'down',
    // Cells, in the same space as `hero` once multiplied by cellPx.
    exit: town.exit?.cell || null,
    shop: town.shopCounter || null,
    save: town.savePoint || null,
    npcs: (town.npcs || []).map(n => n.cell),
    cellPx,
  };
}

function suspendTownOverlay() {
  townSuspended = true;
  window.__ACT1_TOWN_VIEW__ = null;
  root.hidden = true;
  document.body.classList.remove('act1-hifi-active');
  suppressedScene?.sys?.setVisible?.(true);
  suppressedScene?.scene?.setVisible?.(true);
}

function restoreTownOverlay() {
  townSuspended = false;
  if (!townEntry) return;
  prepareRoot();
  suppressLegacyWorldRender(townEntry.scene);
  root.dataset.ready = 'true';
  postTownChrome(true);
  frame.contentWindow?.focus?.();
}

function shippedUiBusy(scene) {
  return Boolean(phaserGame()?.scene?.isActive?.('ShopScene'))
    || Boolean(scene?.showingMessage)
    || Boolean(scene?.healerOverlayOpen);
}

// Is this the town's first entry OF THIS PLAYTHROUGH? town.html opens in front of the town elder
// when it is (`firstEntryCell`) and on the arrival cell by the gate when it is not (`startCell`).
//
// The lifetime has to be the SAVE's, and story flags are the only per-playthrough store there is:
// `gameState.newGame()` replaces `player.state` wholesale, so the flag is gone on a new game, and
// `saveGame()` writes storyFlags out with the rest of the player. Build 62 used a localStorage key
// instead, which records "ever visited on this device" -- nothing clears it, so the opening played
// once per install and never again. Correct on a fresh install, wrong forever after.
//
// The flag cannot be one the shipped game already sets. `compass.visited.<mapId>` looks perfect and
// is useless here: WorldMapScene.loadMap() sets it for every town on load, which for the starting
// town happens BEFORE this overlay opens, so it would read "already visited" on the very first
// frame of a new game. Hence a flag of our own, under the act1 prefix nothing else touches.
//
// Not persisted until the player's next save, by design -- writing localStorage behind
// SaveManager's back means reproducing its profile-slot key scheme, and the failure mode of being
// a save behind is replaying the opening once, which is the harmless direction.
// Flat boolean keys, same shape as `compass.visited.<mapId>`: storyFlags is serialized straight
// into the save as JSON and read back by SaveManager, so it stays a flat string->boolean map.
// Read and mark are separate because enterTown() is retried by tick() after a failed load: burning
// the flag on an attempt that never rendered would cost the player the opening entirely.
const townOpenedFlag = mapId => `act1.townOpened.${mapId}`;
function isFirstTownEntry(mapId) {
  const flags = playerState()?.storyFlags;
  // No live player state means no playthrough to be at the start of, so this is not an opening.
  return Boolean(flags) && !flags[townOpenedFlag(mapId)];
}
function markTownOpened(mapId) {
  const flags = playerState()?.storyFlags;
  if (flags) flags[townOpenedFlag(mapId)] = true;
}

async function enterTown(scene, mapId) {
  const token = ++generation;
  prepareRoot();
  suppressLegacyWorldRender(scene);
  root.dataset.ready = 'false';
  const loaded = new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = () => reject(new Error('town runtime iframe failed to load'));
  });
  const first = isFirstTownEntry(mapId);
  // FACING CONTINUITY, entering. `scene.heroDir` is still the overworld's -- read it before the
  // frame's src ever changes -- so a player who just walked north through the door arrives facing
  // the way she walked, not hard-coded 'down' as this used to be. `firstEntryFacing` still wins on
  // the opening (town.html's own precedence), so this is a no-op there.
  const facingWord = HERO_DIR_TO_FACING[scene.heroDir] || 'down';
  frame.src = `${TOWN_URL.href}?town=${encodeURIComponent(mapId)}${first ? '&first=1' : ''}`
    + `&facing=${facingWord}`;
  await loaded;
  // The town runtime has no corridor to align to and no semantic route to commit, so there is
  // nothing to wait for beyond its own readiness flag.
  const win = frame.contentWindow;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (token !== generation) return;
    if (win.__ACT1_TOWN__) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  if (token !== generation || activeMapId(scene) !== mapId) return;
  if (!win.__ACT1_TOWN__) throw new Error(`town runtime ${mapId} did not become ready`);
  townEntry = { scene, mapId, runtime: win.__ACT1_TOWN__, ready: true };
  if (first) markTownOpened(mapId);   // only now: the opening was actually rendered
  lastError = null;
  root.dataset.ready = 'true';
  lastChromeSig = '';
  postTownChrome(true);
  frame.contentWindow.focus();
}

function releaseInput(runtime) {
  runtime.touch.x = 0;
  runtime.touch.y = 0;
  for (const key of MOVE_KEYS) {
    frame.contentWindow.dispatchEvent(new KeyboardEvent('keyup', { key }));
  }
}

function syncHud(runtime) {
  const state = playerState();
  const Z = window.__QOK?.Z || (key => key);
  const status = frame.contentDocument.querySelector('#status');
  const locationLabel = frame.contentDocument.querySelector('#location');
  if (status && state) status.firstChild.nodeValue = `${Z('menu.level')} ${state.level ?? 1}  ${Z('menu.hp')} ${state.hp ?? 0}/${state.maxHp ?? state.hp ?? 0}`;
  if (locationLabel) locationLabel.textContent = window.__QOK?.locationName?.('overworld') || 'Act 1';
}

function syncSemanticState(current) {
  const { runtime, scene } = current;
  const corridor = runtime.activeCorridor;
  const index = runtime.state.semanticIndex;
  const commitChanged = runtime.state.commits !== current.commits;
  const routeChanged = corridor.id !== current.routeId;
  const indexChanged = index !== current.semanticIndex;
  if (!commitChanged && !routeChanged && !indexChanged) return;

  const cell = corridor.semanticCells[index];
  const atEndpoint = index === 0 || index === corridor.semanticCells.length - 1;
  if (!atEndpoint && Number(scene.transitionCooldown || 0) > 0) scene.transitionCooldown = 0;
  if (commitChanged && atEndpoint && !HOLD_TRANSITIONS && Number(scene.transitionCooldown || 0) <= 0) {
    const transition = scene.checkTransition(cell.x, cell.y);
    if (transition) {
      current.parentTransitions += 1;
      lifetimeStats.parentTransitions += 1;
      current.commits = runtime.state.commits;
      current.semanticIndex = index;
      current.routeId = corridor.id;
      playerState().act1HifiRouteId = corridor.id;
      scene.performTransition(transition);
      return;
    }
  }

  scene.heroTileX = cell.x;
  scene.heroTileY = cell.y;
  playerState().act1HifiRouteId = corridor.id;
  if (commitChanged) {
    current.semanticCommits += 1;
    lifetimeStats.semanticCommits += 1;
    if (!VERIFY) scene.onStep();
  }
  scene.updatePosition();
  scene.updateMinimap?.();
  current.commits = runtime.state.commits;
  current.semanticIndex = index;
  current.routeId = corridor.id;
  current.routeSwitches = runtime.state.routeSwitches;
}

function snapshot() {
  const runtime = entry?.runtime;
  const resources = frame.contentWindow?.performance?.getEntriesByType?.('resource') || [];
  return {
    revision: REVISION,
    manifestRevision: manifest?.revision ?? null,
    manifestSha256: MANIFEST_SHA256,
    ready: Boolean(entry?.ready),
    error: lastError,
    parentMapId: entry ? activeMapId(entry.scene) : activeMapId(worldScene()),
    parentCell: entry ? { x: entry.scene.heroTileX, y: entry.scene.heroTileY } : null,
    routeId: runtime?.activeCorridor?.id || null,
    semanticIndex: runtime?.state?.semanticIndex ?? null,
    semanticCell: runtime?.state?.cell ? { ...runtime.state.cell } : null,
    position: runtime?.state?.position ? { ...runtime.state.position } : null,
    semanticCommits: lifetimeStats.semanticCommits,
    parentTransitions: lifetimeStats.parentTransitions,
    phoneFrame: frame.contentDocument?.body?.dataset.phoneFrame || null,
    worldViewWidth: Number(frame.contentDocument?.body?.dataset.worldViewWidth || 0),
    walkPoseMs: Number(frame.contentDocument?.body?.dataset.walkPoseMs || 0),
    heroRuntimeDirections: Number(frame.contentDocument?.body?.dataset.heroRuntimeDirections || 0),
    stream: runtime ? { ...runtime.streamStats } : null,
    streamConfig: runtime ? { ...runtime.streamConfig } : null,
    resources: {
      count: resources.length,
      transferBytes: resources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0),
      decodedBytes: resources.reduce((sum, resource) => sum + (resource.decodedBodySize || 0), 0),
    },
  };
}

window.__ACT1_PRESERVED_CUTOVER__ = {
  revision: REVISION,
  manifestSha256: MANIFEST_SHA256,
  get ready() { return Boolean(entry?.ready); },
  get frame() { return frame; },
  flushSemanticState() {
    if (entry?.ready) syncSemanticState(entry);
    return snapshot();
  },
  snapshot,
};

for (const type of ['keydown', 'keyup']) {
  window.addEventListener(type, event => {
    if (!entry?.ready || !worldSceneActive() || entry.scene.showingMessage
      || !MOVE_KEYS.has(event.key) || activeMapId(entry.scene) !== 'overworld') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    frame.contentWindow.dispatchEvent(new KeyboardEvent(type, { key: event.key }));
  }, true);
}

async function tick() {
  const scene = worldScene();
  patchScene(scene);
  if (scene && TOWN_IDS.has(activeMapId(scene)) && worldSceneLive()) {
    const mapId = activeMapId(scene);
    prepareRoot();
    suppressLegacyWorldRender(scene);
    // A PAUSED world scene means a shipped UI is on top of it. Step aside for it exactly as the
    // act1-town-service path does -- including for the ones that never send us a message, which is
    // how the MENU gets here: WorldMapScene.launch('MenuScene') + pause() happens entirely inside
    // the shipped scene and the overlay is never told.
    if (worldScenePaused() && !townSuspended) suspendTownOverlay();
    if (townSuspended) {
      // Hand control back the moment the shipped shop / menu / heal / save UI is done with it, and
      // not one frame earlier: `active` is the only state in which the player can move again.
      if (worldSceneActive() && !shippedUiBusy(scene)) restoreTownOverlay();
      requestAnimationFrame(tick);
      return;
    }
    if (townEntry) { postTownChrome(false); publishTownView(); }
    if (!townEntry && !entryPromise) {
      entryPromise = enterTown(scene, mapId).catch(error => {
        lastError = error.stack || error.message;
        console.error('[act1-hifi-town]', error);
      }).finally(() => { entryPromise = null; });
    }
  } else if (entry || entryPromise || townEntry || !root.hidden) {
    releaseRoot();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
