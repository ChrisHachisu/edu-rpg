// Regression for stale overworld landmark sprites after WorldMapScene shutdown/restart.
// The harness evaluates the actual private landmark renderer with a Phaser-like scene/display list;
// it does not boot the game or alter the shipped source.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'public', 'dq-tiles.js');
const srcPath = process.argv[2] || SRC;
let source = fs.readFileSync(srcPath, 'utf8');
const marker = 'window.__DQ_TILES__=';
if (!source.includes(marker)) throw new Error('dq-tiles export marker missing');
source = source.replace(marker,
  'window.__DQ_TEST__={a1aLandmarks:a1aLandmarks,A1A:A1A,owImgs:owImgs,owPropImage:(typeof owPropImage==="function")?owPropImage:null,setOwMap:function(v){owMap=v;}};\n  ' + marker);

const win = { __DQ_DEBUG__: false, addEventListener() {} };
const doc = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }), querySelector: () => null };
function ImageStub() {}
function XHRStub() { this.timeout = 0; }
XHRStub.prototype.open = function() {};
XHRStub.prototype.send = function() {};
const sandbox = {
  window: win, document: doc, Image: ImageStub, XMLHttpRequest: XHRStub, console,
  setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
  setTimeout, Math, Date, Object, Array, Float32Array, Uint8Array, JSON,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const T = win.__DQ_TEST__;
if (!T) throw new Error('dq-tiles test internals not exposed');

function makeScene() {
  const scene = { currentMapId: 'overworld', displayList: [], added: [] };
  scene.textures = { exists: key => key === 'a1alm_whispering-woods' };
  scene.add = { image: (_x, _y, key) => {
    const image = {
      scene, texture: { key }, visible: true, depth: null, x: 0, y: 0, width: 100, height: 100,
      setDepth(v) { this.depth = v; return this; },
      setTexture(v) { this.texture = { key: v }; return this; },
      setOrigin(x, y) { this.origin = [x, y]; return this; },
      setPosition(x, y) { this.x = x; this.y = y; return this; },
      setDisplaySize(w, h) { this.displaySize = [w, h]; return this; },
      setVisible(v) { this.visible = v; return this; },
      destroy() {
        const index = scene.displayList.indexOf(this);
        if (index >= 0) scene.displayList.splice(index, 1);
        this.visible = false;
        this.scene = undefined; // Phaser GameObject.destroy(true) shutdown result
      },
    };
    scene.added.push(image);
    scene.displayList.push(image);
    return image;
  } };
  return scene;
}

const map = Array.from({ length: 240 }, () => new Array(160).fill(0));
map[231][101] = 7; // current tile authority at Whispering Woods
T.A1A.landmarks = [{ slug: 'whispering-woods', cell: [101, 231], size: 144, anchor: [76, 90] }];
T.setOwMap('overworld');
const scene = makeScene();
const seen = {};
const paintLandmark = () => T.a1aLandmarks(scene, map, 90, 110, 220, 240, seen);

paintLandmark();
assert.strictEqual(scene.displayList.length, 1, 'initial Continue creates the nearby landmark image');
const beforeShutdown = T.owImgs['a1alm_whispering-woods'];
assert.strictEqual(beforeShutdown.scene, scene, 'initial sprite belongs to the live WorldMapScene');

// Frozen Phaser shutdown is same-scene: DisplayList.shutdown calls destroy(true) on children.
// GameObject.destroy removes each from the list and sets its scene to undefined; no destroyed flag
// is set. The WorldMapScene instance and current map id are reused by Continue.
for (const child of scene.displayList.slice()) child.destroy(true);
assert.strictEqual(scene.displayList.length, 0, 'shutdown empties this same scene display list');
assert.strictEqual(beforeShutdown.scene, undefined, 'Phaser shutdown detaches cached image without destroyed=true');
assert.strictEqual(beforeShutdown.destroyed, undefined, 'reproducer models the actual same-instance stale state');
T.setOwMap('overworld');
paintLandmark();

assert.strictEqual(scene.displayList.length, 1,
  'same-map Continue must attach a fresh Whispering Woods image after Phaser shutdown');
assert.notStrictEqual(T.owImgs['a1alm_whispering-woods'], beforeShutdown,
  'stale cached image must be replaced');
assert.strictEqual(T.owImgs['a1alm_whispering-woods'].scene, scene,
  'replacement belongs to the restarted same WorldMapScene instance');

// Hiding for ordinary camera culling is not shutdown: the live same-scene sprite must be reused.
const replacement = T.owImgs['a1alm_whispering-woods'];
replacement.setVisible(false);
paintLandmark();
assert.strictEqual(scene.added.length, 2, 'valid same-scene pooled sprite is reused rather than duplicated');
assert.strictEqual(T.owImgs['a1alm_whispering-woods'], replacement);
assert.strictEqual(replacement.visible, true, 'visible landmark is restored when back in view');

// Both overworld image paths share owImgs and must use the same stale-object validation helper.
assert.match(source, /var key='a1alm_'\+lm\.slug,\s*img=owPropImage\(scene,key,tk,A1A_LANDMARK_DEPTH\);/,
  'hi-fi landmark path uses the validated cache accessor');
assert.match(source, /var key=tx\+'_\'\+ty,\s*img=owPropImage\(scene,key,tk,6\);/,
  'special-tile path uses the validated cache accessor');

console.log('DQ TILES SCENE RE-ENTRY PASS: stale same-instance landmark replaced; valid hidden sprite reused; both shared-cache paths guarded');
