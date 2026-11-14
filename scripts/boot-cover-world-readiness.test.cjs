'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const htmlPath = process.env.QOK_BOOT_COVER_HTML || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const startMarker = "(function () {\n      var cover = document.getElementById('boot-cover');";
const start = html.indexOf(startMarker);
assert.notEqual(start, -1, 'boot-cover state machine marker exists in index.html');
const end = html.indexOf('\n    })();', start);
assert.notEqual(end, -1, 'boot-cover state machine has a closing marker');
const stateMachine = html.slice(start, end + '\n    })();'.length);

function harness() {
  let now = 0;
  let worldIsActive = true;
  let titleIsActive = false;
  let worldReady = true;
  let underpaintError = false;
  let underpaintState = 'ready';
  let town = null;                      // { ready, loading }: the hi-fi town overlay's two answers
  const raf = [];
  const classes = new Set();
  const errorNode = { textContent: '' };
  const retryNode = { textContent: '', disabled: false, style: {}, onclick: null };
  const cover = {
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    querySelector(selector) {
      if (selector === '.bc-error') return errorNode;
      if (selector === '.bc-retry') return retryNode;
      return null;
    },
  };
  const worldScene = { mapData: [[0]], currentMapId: 'overworld' };
  const game = {
    scene: {
      isActive(name) {
        if (name === 'WorldMapScene') return worldIsActive;
        if (name === 'TitleScene') return titleIsActive;
        if (name === 'GameOverScene') return false;
        return false;
      },
      getScene(name) { return name === 'WorldMapScene' ? worldScene : null; },
    },
  };
  const window = {
    __PHASER_GAME__: game,
    __HERO_VARIANT__: 'g3',
    __DQ_TILES__: {
      ready() { return worldReady; },
      readyWhy() { return { kind: 'ow', inBounds: true, underpaintRequired: true, underpaint: underpaintError ? 'error' : underpaintState }; },
    },
    __ACT1_PRESERVED_CUTOVER__: {
      townSurfaceReady() { return town ? town.ready : null; },
      townSurfaceLoading() { return town ? town.loading : null; },
    },
    __QOKUI: { iconsReady: () => true, mapArtReady: () => true },
    __QOK: { loc: () => 'en', state: () => null },
    addEventListener() {},
  };
  const document = {
    getElementById(id) { return id === 'boot-cover' ? cover : null; },
    body: { classList: { contains: () => false } },
  };
  class ControlledDate extends Date {
    static now() { return now; }
  }
  const context = {
    window,
    document,
    Date: ControlledDate,
    Error,
    Math,
    Object,
    requestAnimationFrame(callback) { raf.push(callback); return raf.length; },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  vm.runInNewContext(stateMachine, context, { filename: 'index.html#boot-cover-world-readiness' });

  function tick(at = now) {
    now = at;
    const callback = raf.shift();
    assert.equal(typeof callback, 'function', 'one animation-frame callback is queued');
    callback();
  }
  return {
    api: window.__QOK_COVER__,
    classes,
    cover,
    errorNode,
    retryNode,
    setWorldActive(value) { worldIsActive = value; },
    setTitleActive(value) { titleIsActive = value; },
    setWorldReady(value) { worldReady = value; },
    setUnderpaintError(value) { underpaintError = value; },
    setUnderpaintState(value) { underpaintState = value; },
    setTown(mapId, value) { worldScene.currentMapId = mapId; town = value; },
    tick,
    // Ordinary play: one animation frame every `step` ms, from the frame after `from` up to `to`.
    frames(from, to, step = 16) { let at = from; while (at + step <= to) { at += step; tick(at); } return at; },
  };
}

// The world budget is spent in FRAMES (index.html, SLOW IS NOT FAILED): a page drawing normally
// spends its 20 s in 20 s, so the deadline tests below run real frame cadences up to it.

test('late readiness gets the same three stable frames without extending unready timeout', () => {
  const h = harness();
  h.api.beginWorldLoad('title-continue');
  h.setWorldReady(true);
  h.tick(20_001);
  assert.equal(h.api.phase(), 'world');
  assert.equal(h.api.ready(), true);
  h.tick(20_018);
  assert.equal(h.api.phase(), 'world');
  h.tick(20_035);
  assert.equal(h.api.phase(), 'active');
  assert.equal(h.classes.has('error'), false);
});

test('a false readiness sample after the original deadline fails immediately', () => {
  const h = harness();
  h.api.beginWorldLoad('title-continue');
  h.setWorldReady(false);
  const at = h.frames(0, 20_000);
  assert.equal(h.api.phase(), 'world', 'a page drawing normally still has its 20 s');
  h.frames(at, at + 64);
  assert.equal(h.api.phase(), 'error');
  assert.equal(h.api.reason(), 'title-continue');
  assert.equal(h.classes.has('error'), true);

  const partial = harness();
  partial.api.beginWorldLoad('title-continue');
  partial.setWorldReady(false);
  let t = partial.frames(0, 20_000);
  partial.setWorldReady(true);
  t = partial.frames(t, t + 32);
  assert.equal(partial.api.phase(), 'world');
  partial.setWorldReady(false);
  partial.frames(t, t + 16);
  assert.equal(partial.api.phase(), 'error', 'a partial ready streak cannot extend the deadline');
});

test('a starved page is not failed by the wall clock alone, and the hard cap still ends the wait', () => {
  const h = harness();
  h.api.beginWorldLoad('title-continue');
  h.setWorldReady(false);
  h.tick(1_000);
  h.tick(21_000);                       // one frame in twenty seconds
  h.tick(41_000);
  h.tick(61_000);
  assert.equal(h.api.phase(), 'world', 'four frames have not spent a 20 s frame budget');
  assert.ok(h.api.info().spent <= 150);
  h.setWorldReady(true);
  h.tick(81_000);
  h.tick(101_000);
  h.tick(121_000);
  assert.equal(h.api.phase(), 'active', 'and the world it was waiting for is shown when it lands');

  const stuck = harness();
  stuck.api.beginWorldLoad('title-continue');
  stuck.setWorldReady(false);
  stuck.tick(90_000);
  stuck.tick(179_000);
  assert.equal(stuck.api.phase(), 'world');
  stuck.tick(180_001);
  assert.equal(stuck.api.phase(), 'error', 'three minutes of wall clock is the end whatever the frame rate');
});

test('the budget is scaled by how long this boot took to reach the title', () => {
  const h = harness();
  h.setWorldActive(false);
  h.setTitleActive(true);
  h.tick(7_968);
  h.tick(7_984);
  h.tick(8_000);                        // the title needed 8 s: twice the ordinary 4 s
  assert.equal(h.api.phase(), 'waiting');
  assert.equal(h.api.info().cap, 40_000);
  h.setWorldActive(true);
  h.setWorldReady(false);
  h.tick(8_016);
  assert.equal(h.api.phase(), 'world');
  let t = h.frames(8_016, 8_016 + 39_984);
  assert.equal(h.api.phase(), 'world', 'still inside the doubled budget');
  h.frames(t, t + 64);
  assert.equal(h.api.phase(), 'error');
});

test('a loader still inside its own attempts is not timed out; its reported failure is', () => {
  const h = harness();
  h.setTown('greenhollow', { ready: false, loading: true });
  h.api.beginWorldLoad('title-continue');
  let t = h.frames(0, 60_000);
  assert.equal(h.api.phase(), 'world', 'a town entry being tried again is not failed at 20 s');
  h.setTown('greenhollow', { ready: false, loading: false });      // the overlay gave up and said so
  t = h.frames(t, t + 16);
  assert.equal(h.api.phase(), 'error');

  const landed = harness();
  landed.setTown('greenhollow', { ready: false, loading: true });
  landed.api.beginWorldLoad('title-continue');
  t = landed.frames(0, 30_000);
  landed.setTown('greenhollow', { ready: true, loading: false });
  landed.frames(t, t + 48);
  assert.equal(landed.api.phase(), 'active');

  const forever = harness();
  forever.setTown('greenhollow', { ready: false, loading: true });
  forever.api.beginWorldLoad('title-continue');
  t = forever.frames(0, 180_000);
  assert.equal(forever.api.phase(), 'world');
  forever.frames(t, t + 32);
  assert.equal(forever.api.phase(), 'error', 'the hard cap bounds a loader that never answers');

  const under = harness();
  under.setWorldReady(false);
  under.setUnderpaintState('loading');
  under.api.beginWorldLoad('title-continue');
  t = under.frames(0, 60_000);
  assert.equal(under.api.phase(), 'world', 'the Act 1 underpaint on a longer budget is not timed out');
  under.setUnderpaintError(true);
  under.frames(t, t + 16);
  assert.equal(under.api.phase(), 'error');
  assert.equal(under.api.reason(), 'underpaint');
});

test('a later hi-fi town is waited for like an Act 1 town', () => {
  const h = harness();
  h.setTown('ironkeep', { ready: false, loading: true });
  h.api.beginWorldLoad('title-continue');
  let t = h.frames(0, 5_000);
  assert.equal(h.api.phase(), 'world', 'the generic contract does not lift the cover over an unready town');
  h.setTown('ironkeep', { ready: true, loading: false });
  h.frames(t, t + 48);
  assert.equal(h.api.phase(), 'active');
});

test('a failure that was only slow takes itself down; a reported error does not', () => {
  const h = harness();
  h.api.beginWorldLoad('title-continue');
  h.setWorldReady(false);
  let t = h.frames(0, 20_100);
  assert.equal(h.api.phase(), 'error');
  h.setWorldReady(true);
  t = h.frames(t, t + 32);
  assert.equal(h.api.phase(), 'error', 'the same three stable frames are required');
  h.frames(t, t + 16);
  assert.equal(h.api.phase(), 'active');
  assert.equal(h.classes.has('error'), false);
  assert.equal(h.api.info().slowLifts, 1);

  const broken = harness();
  broken.api.beginWorldLoad('title-continue');
  broken.setUnderpaintError(true);
  broken.tick(16);
  assert.equal(broken.api.phase(), 'error');
  broken.frames(16, 1_000);
  assert.equal(broken.api.phase(), 'error', 'an underpaint error waits for Retry');
});

test('a false sample resets consecutive readiness frames', () => {
  const h = harness();
  h.api.beginWorldLoad('title-continue');
  h.tick(10);
  h.tick(20);
  h.setWorldReady(false);
  h.tick(30);
  assert.equal(h.api.phase(), 'world');
  h.setWorldReady(true);
  h.tick(40);
  h.tick(50);
  assert.equal(h.api.phase(), 'world');
  h.tick(60);
  assert.equal(h.api.phase(), 'active');
});

test('an explicit underpaint failure remains immediate', () => {
  const h = harness();
  h.api.beginWorldLoad('title-continue');
  h.setUnderpaintError(true);
  h.tick(1);
  assert.equal(h.api.phase(), 'error');
  assert.equal(h.api.reason(), 'underpaint');
});

test('Retry starts a new world-load attempt and still requires three ready frames', () => {
  const h = harness();
  h.api.beginWorldLoad('title-continue');
  h.setWorldReady(false);
  let t = h.frames(0, 20_100);
  assert.equal(h.api.phase(), 'error');
  h.retryNode.onclick();
  assert.equal(h.api.phase(), 'world');
  assert.equal(h.api.reason(), 'retry:title-continue');
  h.setWorldReady(true);
  t = h.frames(t, t + 32);
  assert.equal(h.api.phase(), 'world');
  h.frames(t, t + 16);
  assert.equal(h.api.phase(), 'active');
  assert.equal(h.classes.has('error'), false);
});

test('normal title and scene-start progression is unchanged', () => {
  const h = harness();
  h.setWorldActive(false);
  h.setTitleActive(true);
  h.tick(1);
  h.tick(2);
  assert.equal(h.api.phase(), 'boot');
  h.tick(3);
  assert.equal(h.api.phase(), 'waiting');
  h.setWorldActive(true);
  h.tick(4);
  assert.equal(h.api.phase(), 'world');
  h.tick(5);
  h.tick(6);
  h.tick(7);
  assert.equal(h.api.phase(), 'active');
});
