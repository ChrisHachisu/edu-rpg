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
const TOWN_IDS = new Set(['portSapphire']);
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

const style = document.createElement('style');
style.textContent = `
  #act1-hifi-preserved-root { position: fixed; inset: 0; z-index: 70; overflow: hidden; background: #02060a; }
  #act1-hifi-preserved-root[hidden] { display: none; }
  #act1-hifi-preserved-root iframe { width: 100%; height: 100%; border: 0; display: block; background: #02060a; opacity: 0; }
  #act1-hifi-preserved-root[data-ready="true"] iframe { opacity: 1; }
  body.act1-hifi-active #qok-field-hud { display: none !important; }
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
  body.act1-hifi-active.qok-dialogue #touch-controls { display: none !important; }
  body.act1-hifi-active.qok-dialogue #qok-field-hud { display: block !important; }
  body.act1-hifi-active.qok-dialogue #qfh-hp,
  body.act1-hifi-active.qok-dialogue #qfh-map,
  body.act1-hifi-active.qok-dialogue #qfh-compass,
  body.act1-hifi-active.qok-dialogue #qfh-floor { display: none !important; }
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

function patchScene(scene) {
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
  if (data.type === 'act1-town-interact') {
    // `__QOK.Z` is the shipped i18n function, so the player reads dialogue in the locale they
    // chose. The frame's bundled English is only what shows for the frame it takes to reply.
    const translate = window.__QOK?.Z;
    if (typeof translate !== 'function') return;
    frame.contentWindow.postMessage({
      type: 'act1-town-text', npc: data.npc,
      name: data.nameKey ? translate(data.nameKey) : undefined,
      text: translate(data.dialogueKey),
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
    lifetimeStats.parentTransitions += 1;
  }
});

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

let townSuspended = false;

function suspendTownOverlay() {
  townSuspended = true;
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

async function enterTown(scene, mapId) {
  const token = ++generation;
  prepareRoot();
  suppressLegacyWorldRender(scene);
  root.dataset.ready = 'false';
  const loaded = new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = () => reject(new Error('town runtime iframe failed to load'));
  });
  frame.src = `${TOWN_URL.href}?town=${encodeURIComponent(mapId)}`;
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
  if (scene && TOWN_IDS.has(activeMapId(scene)) && worldSceneActive()) {
    const mapId = activeMapId(scene);
    prepareRoot();
    suppressLegacyWorldRender(scene);
    if (townSuspended) {
      // Hand control back the moment the shipped shop/heal/save UI is done with it.
      if (!shippedUiBusy(scene)) restoreTownOverlay();
      requestAnimationFrame(tick);
      return;
    }
    if (townEntry) postTownChrome(false);
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
