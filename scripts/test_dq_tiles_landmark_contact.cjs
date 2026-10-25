#!/usr/bin/env node
// Focused regression for the continuous Whispering Woods rock-contact mask.
// Evaluates the shipped additive DQ override in a small VM; it does not boot the game.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const sourcePath = process.argv[2] || path.join(root, 'public', 'dq-tiles.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const artPath = path.join(root, 'public', 'act1-hifi', 'landmarks', 'whispering-woods.png');
const artHash = crypto.createHash('sha256').update(fs.readFileSync(artPath)).digest('hex');
assert.strictEqual(artHash, 'a06eea6ab98c7c630119db1488dfea912a40bc69150ac16e387b4e696aa5f047',
  'the authored material geometry remains bound to its reviewed cave PNG');
const crystalArtPath = path.join(root, 'public', 'act1-hifi', 'landmarks', 'crystal-cave.png');
const crystalArtHash = crypto.createHash('sha256').update(fs.readFileSync(crystalArtPath)).digest('hex');
assert.strictEqual(crystalArtHash, '45fb2c0b7cf1ad2e63ee9a28bbf0ad66e3d4d9ca9258beaf7a68566e04692b55',
  'Crystal contact geometry remains bound to its exact pinned art');
const maskCheck = JSON.parse(execFileSync('python3', [path.join(__dirname, 'generate_ww_contact_mask.py'), '--source', sourcePath, '--check'], { encoding: 'utf8' }));
assert.strictEqual(maskCheck.outsideAlphaSolidPixels, 0, 'every solid mask pixel lies on visible opaque cave art');
assert.strictEqual(maskCheck.authoredSolidPixels, 5645);
assert.strictEqual(maskCheck.visibleSolidPixels, 4808);
const crystalMaskCheck = JSON.parse(execFileSync('python3', [path.join(__dirname, 'generate_crystal_contact_mask.py'), '--source', sourcePath, '--check'], { encoding: 'utf8' }));
assert.strictEqual(crystalMaskCheck.outsideAlphaPixels, 0, 'no Crystal material-mask pixel lies outside opaque art');
assert.strictEqual(crystalMaskCheck.packedMaskBytes, 2592, 'Crystal uses a compact 144x144 bitset');
assert(crystalMaskCheck.solidPixels > 0 && crystalMaskCheck.solidPixels < crystalMaskCheck.opaquePixels,
  'the carved doorway stays distinct from opaque rock');
const landmarkRows = JSON.parse(fs.readFileSync(path.join(root, 'public', 'act1-hifi', 'landmarks', 'landmarks.json'), 'utf8')).landmarks;
const cave = landmarkRows.find(item => item.slug === 'whispering-woods');
assert(cave, 'the rendered cave entry exists in the current landmark manifest');
assert.deepStrictEqual(cave.cell, [101, 231], 'the authored collision uses the live cave cell');
assert.deepStrictEqual(cave.anchor, [76, 90], 'the authored collision uses the live cave anchor');
assert.strictEqual(cave.size, 144, 'the authored collision uses the live cave display size');

const marker = 'window.__DQ_TILES__=';
assert(source.includes(marker), 'DQ public export marker is present');
const testExports = `window.__DQ_TEST__={
  free:a1mWwContactFree, footDy:a1mFootDy, mask:a1mWwMask, door:a1mDoor, landmarks:A1A.landmarks,
  artSha:A1M_WW_ART_SHA, crystalArtSha:A1M_CRYSTAL_ART_SHA, crystalMask:a1mCrystalMask,
  space:{scale:OW_SCALE,cellCenter:owCellCenter},
  setLandmarks:function(v){A1A.landmarks=v;}, rock:A1M_WW_ROCK, channel:A1M_WW_CHANNEL
};\n  `;
const instrumented = source.replace(marker, testExports + marker);
let canvasCalls = 0, pixelReads = 0;
const win = { __DQ_DEBUG__: false, addEventListener() {} };
const alpha = new Uint8ClampedArray(64 * 64 * 4);
for (let x = 0; x < 64; x += 1) alpha[(62 * 64 + x) * 4 + 3] = 255;
const maleAlpha = new Uint8ClampedArray(64 * 64 * 4);
for (let x = 0; x < 64; x += 1) maleAlpha[(60 * 64 + x) * 4 + 3] = 255;
let activeAlpha = alpha;
const doc = { createElement() {
  canvasCalls += 1;
  return { getContext() { return {
    drawImage(image) { activeAlpha = image.alpha || alpha; },
    getImageData() { pixelReads += 1; return { data: activeAlpha }; },
  }; } };
}, querySelector() { return null; } };
function ImageStub() {}
function XHRStub() { this.timeout = 0; }
XHRStub.prototype.open = function() {};
XHRStub.prototype.send = function() {};
const sandbox = {
  window: win, document: doc, Image: ImageStub, XMLHttpRequest: XHRStub, console,
  setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, atob,
  setTimeout, Math, Date, Object, Array, Uint8Array, Float32Array, JSON,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(instrumented, sandbox);
const T = win.__DQ_TEST__;
assert(T, 'test hooks exposed');
assert.deepStrictEqual(Array.from(T.landmarks || []), [], 'no asynchronous asset load is required');
assert.strictEqual(T.artSha, artHash, 'runtime geometry annotation carries the exact pinned art identity');
assert.strictEqual(T.crystalArtSha, crystalArtHash, 'Crystal geometry annotation carries the exact pinned art identity');

const map = { ow: true };
const contactScene = { currentMapId: 'overworld', hero: {
  scaleY: 1.0125,
  texture: {
    key: 'hero-contact-fixture',
    get: () => ({ cutWidth: 64, cutHeight: 64, cutX: 0, cutY: 0,
      width: 64, height: 64, source: { image: { width: 768, height: 512 } } }),
    getSourceImage: () => ({ width: 768, height: 512 }),
  },
} };
function functionSource(name) {
  const start = source.indexOf(`\n  function ${name}(`);
  assert(start >= 0, `production ${name} exists`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start + 1, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}
const productionFree = new Function(
  'A1A_FOREST', 'A1M_PROP', 'OWM_FIELD_OWNED', 'TILE', 'a1fRequiredAt', 'a1fReady',
  'a1fHeroFree', 'a1mWwContactFree', 'a1mFootDy', 'a1mNeed', 'a1mTileAt',
  'a1dIsMouthCell', 'a1mCanMove', 'a1dIsEntranceCrystalCell',
  `${functionSource('a1mFree')}\nreturn a1mFree;`,
)({}, {}, { 0: 1 }, 48, () => false, () => false, () => false,
  T.free, T.footDy, () => 0, () => 0, () => false, () => null, () => false);
const contact = (physicalX, physicalY, sceneArg = contactScene) => {
  const x = physicalX / 0.7, y = physicalY / 0.7, footDy = T.footDy(sceneArg, map);
  const field = { ow: true, ox: x - 10, oy: y + footDy - 10, W: 20, H: 20,
    dist: new Uint16Array(400).fill(255), prop: {} };
  return productionFree(sceneArg, field, x, y);
};

// Exact browser P1-after-south coordinates. The rendered prop top-left is
// (owCellCenter(101)-76, owCellCenter(231)-90) = (3334.4,7688.4); the live
// frame-derived sole adds 30.88 physical px, placing its centre at (82.112,38.759).
const p1X = 3416.5118, p1Y = 7696.2790;
assert.strictEqual(contact(p1X, p1Y), false, 'the recorded roof pose is rejected by continuous sole contact');
const localContact = (x, y) => contact(3334.4 + x, 7688.4 + y - T.footDy(contactScene, map) * 0.7);
assert.strictEqual(localContact(132, 65), false, 'visible east rock side blocks sole contact');
assert.strictEqual(localContact(134, 65), true, 'immediately exterior east-side grass remains free');
assert.strictEqual(localContact(35, 65), false, 'visible west rock side blocks sole contact');

// Crystal contact shares the production a1mFree callsite and exact authored art anchor.
const crystalLeft = T.space.cellCenter(149) - 76;
const crystalTop = T.space.cellCenter(278) - 92;
const crystalContact = (px, py, sceneArg = contactScene) => {
  const soleOffset = T.footDy(sceneArg, map) * T.space.scale;
  return contact(crystalLeft + px, crystalTop + py - soleOffset, sceneArg);
};
assert.strictEqual(crystalContact(39, 30), false,
  'the native screenshot roof pose is blocked through the production a1mFree callsite');
assert.strictEqual(crystalContact(113, 69), false, 'opaque Crystal east-side rock blocks the sole');
assert.strictEqual(crystalContact(139, 69), true, 'grass just beyond the sole disc clearance from Crystal east-side rock stays free');
assert.strictEqual(crystalContact(38, 88), false, 'opaque Crystal west-side rock blocks the sole');
assert.strictEqual(crystalContact(76, 92), true, 'the exact Crystal entry anchor remains clear in the doorway channel');
assert.strictEqual(crystalContact(76, 125), true, 'the exact Crystal exit-cell center remains clear');
assert.strictEqual(crystalContact(76, 155), true, 'the south approach outside the sprite stays clear');
for (let step = 0; step <= 100; step += 1) {
  const y = 125 - step * 0.33;
  assert.strictEqual(crystalContact(76, y), true, `continuous Crystal mouth sweep stays open at y=${y}`);
}
const maleContactScene = { currentMapId: 'overworld', hero: {
  scaleY: 1.0125,
  texture: {
    key: 'hero-male-contact-fixture',
    get: () => ({ cutWidth: 64, cutHeight: 64, cutX: 0, cutY: 0,
      width: 64, height: 64, source: { image: { width: 768, height: 64, alpha: maleAlpha } } }),
    getSourceImage: () => ({ width: 768, height: 64, alpha: maleAlpha }),
  },
} };
assert.strictEqual(crystalContact(39, 30, maleContactScene), false, 'the second hero sole row blocks the screenshot roof pose');
assert.strictEqual(crystalContact(76, 92, maleContactScene), true, 'the second hero can reach the Crystal doorway');

// A clear neighboring grass position and the authored south approach remain outside the rock.
assert.strictEqual(contact(104.5 * 33.6, 232.5 * 33.6), true,
  'clear grass immediately east of the landmark remains walkable');
assert.strictEqual(contact(101.5 * 33.6, 232.5 * 33.6), true,
  'the south approach cell remains clear');

// The painted gateway channel is explicit and local; it does not exempt the entire door tile.
assert.strictEqual(contact(101.5 * 33.6, 231.5 * 33.6), true,
  'the sole can reach the visible arch/gravel channel at the existing door');
assert.strictEqual(contact(101.5 * 33.6, 229.5 * 33.6), false,
  'the same x position over the cave roof is blocked');

// The existing discrete transition query remains responsible for the door at (101,231).
let transitioned = null;
const doorScene = {
  currentMapId: 'overworld', heroTileX: 101, heroTileY: 232, heroDir: 3,
  mapData: Array.from({ length: 240 }, () => Array(160).fill(0)),
  checkTransition(x, y) { return x === 101 && y === 231 ? { to: 'whisperingWoodsCave' } : null; },
  performTransition(t) { transitioned = t; },
};
assert.strictEqual(T.door(doorScene, map, 0, 0, 0, -1), true, 'south approach still invokes the existing north-door query');
assert.deepStrictEqual(transitioned, { to: 'whisperingWoodsCave' }, 'the original door transition is preserved');
const crystalDoorScene = {
  currentMapId: 'overworld', heroTileX: 149, heroTileY: 279, heroDir: 3,
  mapData: Array.from({ length: 420 }, () => Array(180).fill(0)),
  checkTransition(x, y) { return x === 149 && y === 278 ? { targetMap: 'crystalCave', toX: 50, toY: 99 } : null; },
  performTransition(t) { transitioned = t; },
};
const realDoorClock = Date.now;
Date.now = () => realDoorClock() + 1000;
assert.strictEqual(T.door(crystalDoorScene, map, 0, 0, 0, -1), true,
  'the exact existing Crystal entry-cell query still fires from the south exit cell');
Date.now = realDoorClock;
assert.deepStrictEqual(transitioned, { targetMap: 'crystalCave', toX: 50, toY: 99 },
  'the original Crystal target remains unchanged');

const firstMask = T.mask(), firstCrystalMask = T.crystalMask();
for (let i = 0; i < 5000; i += 1) contact(p1X + i % 7, p1Y + (i % 11));
assert.strictEqual(T.mask(), firstMask, 'one bounded 144×144 mask is cached and reused');
for (let i = 0; i < 5000; i += 1) crystalContact(39 + i % 7, 30 + i % 11);
assert.strictEqual(T.crystalMask(), firstCrystalMask, 'one bounded Crystal 144×144 mask is cached and reused');
assert.strictEqual(canvasCalls, 2, 'each hero sole image is decoded once and then cached');
assert.strictEqual(pixelReads, 2, 'movement substeps do not reread either hero image');

// The separate full-hero A1OW terrain stencil stays byte-for-byte unchanged in this patch.
const begin = source.indexOf('  function a1fHeroFree(');
const end = source.indexOf('  // Whispering Woods is a sprite prop', begin);
assert(begin >= 0 && end > begin, 'terrain stencil function is present before the cave-local mask');
assert.strictEqual(crypto.createHash('sha256').update(source.slice(begin, end)).digest('hex'),
  '5882a662d3fc5033359f05748fe9ccd83881e442d27220198e4e4e0563074a18',
  'the established full-hero terrain stencil is unchanged for both variants using this shared predicate');

console.log('DQ LANDMARK CONTACT PASS: pinned WW and Crystal masks; native Crystal roof and both sides blocked for both sole rows; exterior grass and 101-step doorway-to-exit corridor open; exact portal adapter retained; masks cached; A1OW stencil unchanged');
