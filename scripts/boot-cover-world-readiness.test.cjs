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
      readyWhy() { return { underpaintRequired: true, underpaint: underpaintError ? 'error' : 'ready' }; },
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
    tick,
  };
}

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
  h.tick(20_001);
  assert.equal(h.api.phase(), 'error');
  assert.equal(h.api.reason(), 'title-continue');
  assert.equal(h.classes.has('error'), true);

  const partial = harness();
  partial.api.beginWorldLoad('title-continue');
  partial.tick(19_980);
  partial.tick(19_997);
  partial.setWorldReady(false);
  partial.tick(20_001);
  assert.equal(partial.api.phase(), 'error', 'a partial ready streak cannot extend the deadline');
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
  h.tick(20_001);
  assert.equal(h.api.phase(), 'error');
  h.retryNode.onclick();
  assert.equal(h.api.phase(), 'world');
  assert.equal(h.api.reason(), 'retry:title-continue');
  h.setWorldReady(true);
  h.tick(20_010);
  h.tick(20_027);
  assert.equal(h.api.phase(), 'world');
  h.tick(20_044);
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
