#!/usr/bin/env node
// Focused regression for the real in-place Act 1 plate-repair lifecycle. This does not pretend
// arbitrary writes to support-only guard cells are observable; the shipped overworld writer
// boundary is documented in the paired W proof. It verifies that the real plate timer repair
// invalidates a cached field before the next same-window lookup can reuse it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = rel => readFileSync(new URL(rel, root), 'utf8');
let dq = read('public/dq-tiles.js');
const apiMarker = 'window.__DQ_TILES__={';
assert(dq.includes(apiMarker), 'dq test export marker missing');
dq = dq.replace(apiMarker, `window.__DQ_TEST__={
  observePlateLifecycle:owmObservePlateLifecycle,
  primeMap:function(map){owMapRef=map;},
  seedWindow:function(scene){
    var cam=scene.cameras.main,winW=Math.ceil(cam.worldView.width/OW_TILE)+2*MARGIN,
        winH=Math.ceil(cam.worldView.height/OW_TILE)+2*MARGIN,
        X0=windowStart(cam.worldView.x,winW,scene.mapData[0].length,OW_TILE),
        Y0=windowStart(cam.worldView.y,winH,scene.mapData.length,OW_TILE),
        key=X0+'_'+Y0+'_'+winW+'_'+winH+'_plate',
        field={testField:true,ox:X0*N,oy:Y0*N,W:winW*N,H:winH*N};
    owmState={map:scene.mapData,key:key,m:field}; return field;
  },
  readWindow:owmFor,
  seedVerified:function(map,bytes,justResolved){owmSupportVerified={map:map,epoch:owmSupportEpoch,bytes:bytes,justResolved:justResolved};},
  supportInput:owmSupportInputBytes,
  realSupportInput:owmSupportInputBytes,
  effectiveEt:function(map,x,y){return owmSupportEt(map,x,y,buildMutedWater(map,OWM_SUPPORT_THRESHOLD),map[0].length);},
  supportFor:owmSupportFor,
  parseBake:owmBakeParse,
  supportSemantics:function(){return OWM_SUPPORT_SEMANTICS_SHA256;},
  overrideSupportInput:function(fn){owmSupportInputBytes=fn;},
  invalidateSupport:owmInvalidateSupport,
  setBake:function(b){owmBake=b;owmBakeReq=true;},
  loadBake:owmBakeLoad,
  resetBakeLoad:function(){owmBake=null;owmBakeReq=false;},
  replaceBuild:function(fn){owmBuild=fn;},
  snapshot:function(){return {epoch:owmSupportEpoch,field:owmState,verified:owmSupportVerified,
    pending:owmSupportPending,failure:owmSupportFailure};}
};\n${apiMarker}`);

const window = {
  addEventListener() {},
  intervals: [],
  xhrs: [],
  setInterval(fn, ms) { this.intervals.push({ fn, ms }); return this.intervals.length; },
  clearInterval() {},
};
const sandbox = {
  window,
  document: { createElement: () => ({ getContext: () => null }), querySelector: () => null },
  XMLHttpRequest: function XhrStub() {
    window.xhrs.push(this); this.open = () => {}; this.send = () => {};
  },
  Image: function ImageStub() {},
  console,
  setInterval: () => 1,
  clearInterval() {},
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 0,
  Math,
  Date,
  Object,
  Array,
  Uint8Array,
  Uint16Array,
  Float32Array,
  JSON,
  Set,
  Map,
  Number,
  Promise,
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(dq, sandbox, { filename: 'public/dq-tiles.js' });

const map = Array.from({ length: 400 }, () => Array(320).fill(0));
const scene = {
  currentMapId: 'overworld', mapData: map, heroTileX: 117, heroTileY: 234,
  hero: { x: 3948, y: 7879.2 },
  cameras: { main: { worldView: { x: 3751, y: 7531, width: 393, height: 697 } } },
};
scene.hero.scene = scene;
window.__PHASER_GAME__ = { scene: { getScene: id => id === 'WorldMapScene' ? scene : null } };
vm.runInContext(read('public/act1-world-map.js'), sandbox, { filename: 'public/act1-world-map.js' });
const plate = window.__ACT1_WORLD_MAP__;
assert(plate && typeof plate.ensurePlate === 'function', 'real Act 1 plate API missing');
const plateTimer = window.intervals.find(t => t.ms === 400);
assert(plateTimer, 'real 400 ms Act 1 plate timer was not installed');
// The same armWrappers callback used by the live 400 ms interval applies the plate and establishes
// the real repair state on the first tick.
plateTimer.fn();
assert.equal(plate.state.appliedMap, map, 'fixture did not enter applied-map state');
const initialCell = map[218][16];
assert.notEqual(initialCell, 0, 'fixture cell is not an authored nonzero plate tile');
const repairsBefore = plate.state.repairs;

const test = window.__DQ_TEST__;
test.observePlateLifecycle();
test.primeMap(map);
const acceptedWindow = test.seedWindow(scene);
test.seedVerified(map, test.realSupportInput(map).bytes, false);
const before = test.snapshot();
assert.equal(test.readWindow(scene), acceptedWindow, 'same-window fixture cache was not reused before the repair');

// Simulate an actual in-place tile corruption in the authored plate. Run the live interval
// callback again: its armWrappers -> ensurePlate(scene,true) path detects, rewrites, and counts it.
map[218][16] = 0;
plateTimer.fn();
assert.equal(map[218][16], initialCell, 'real plate repair did not restore its tile');
assert.equal(plate.state.repairs, repairsBefore + 1, 'real timer repair counter was not incremented once');

// The next same-window runtime lookup observes the actual plate lifecycle before its cache return.
const afterRead = test.readWindow(scene);
const after = test.snapshot();
assert.equal(after.epoch, before.epoch + 1, 'support epoch did not advance after real repair');
assert.equal(after.field, null, 'same-window field survived a real in-place repair');
assert.equal(after.verified, null, 'accepted support survived a real in-place repair');
assert.notEqual(afterRead, acceptedWindow, 'same-window lookup returned the field cached before repair');

// The global muted-water floodfill is a real dependency: a remote, outside-support connection can
// change the effective class of an unchanged in-support cell. This uses the production helper on a
// small synthetic map and does not rebuild the distance field.
{
  const a = newMap(), b = newMap();
  a[250][208] = 2; b[250][208] = 2;
  for (let x = 210; x <= 221; x++) { a[250][x] = 2; b[250][x] = 2; }
  const before = test.realSupportInput(a);
  assert.equal(test.effectiveEt(a, 208, 250), 0, 'isolated in-support water was not muted');
  b[250][209] = 2; // only out-of-support input; links the same in-support tile to 12-cell water
  const after = test.realSupportInput(b);
  assert.equal(test.effectiveEt(b, 208, 250), 2, 'remote water link did not unmute the in-support cell');
  assert.notDeepEqual(Array.from(before.bytes), Array.from(after.bytes), 'remote topology change left support bytes unchanged');
  assert.notEqual(before.fnv32, after.fnv32, 'remote topology change left the support accelerator unchanged');
}

const sha256 = bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const fnv32 = bytes => {
  let h = 0x811c9dc5;
  for (const b of bytes) { h = (h ^ b) >>> 0; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};
const mockedInput = sourceMap => {
  const bytes = Uint8Array.of(sourceMap[173][0]);
  return { bounds: { x0: 0, y0: 173, x1: 0, y1: 173 }, bytes, fnv32: fnv32(bytes) };
};
const makeBake = (input, support = sha256(input.bytes), semantics = test.supportSemantics()) => ({
  mapW: 320, mapH: 400, hash: input.fnv32, support, semantics,
});
const arrayBuffer = bytes => {
  const b = Buffer.from(bytes);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
function newMap() { return Array.from({ length: 400 }, () => Array(320).fill(0)); }
const newScene = map => ({ currentMapId: 'overworld', mapData: map });
const flushMicrotasks = () => new Promise(resolve => setImmediate(resolve));

// Versioned parser rejects unsupported versions, semantics, truncation, and trailing bytes.
function makeHeader({ version = 2, semantics = test.supportSemantics(), extra = 0, truncate = 0 } = {}) {
  const size = 96 + 320 * 400 * 2 + extra - truncate;
  const ab = new ArrayBuffer(size), h = new DataView(ab);
  h.setUint32(0, 0x574f3141, true); h.setUint16(4, version, true); h.setUint16(6, 48, true);
  h.setUint16(8, 320, true); h.setUint16(10, 400, true); h.setUint16(12, 255, true);
  h.setUint16(14, 96, true); h.setUint32(16, 0, true); h.setUint32(20, 0, true);
  new Uint8Array(ab, 32, 32).set(Buffer.from(semantics, 'hex'));
  return ab;
}
assert(test.parseBake(makeHeader()), 'v2 header fixture should parse');
assert.equal(test.parseBake(makeHeader({ version: 1 })), null, 'v1 header was accepted');
assert.equal(test.parseBake(makeHeader({ semantics: '00'.repeat(32) })), null, 'wrong semantic pin was accepted');
assert.equal(test.parseBake(makeHeader({ truncate: 1 })), null, 'truncated payload was accepted');
assert.equal(test.parseBake(makeHeader({ extra: 1 })), null, 'padded payload was accepted');

// Controlled WebCrypto makes stale completion, coalescing, mutation, and failure paths deterministic.
function deferredDigest() {
  let resolve, reject; const calls = [];
  const promise = () => new Promise((yes, no) => { resolve = yes; reject = no; });
  let pending = promise();
  return {
    calls,
    subtle: { digest(_algorithm, bytes) { calls.push(Uint8Array.from(bytes)); return pending; } },
    resolve() { resolve(arrayBuffer(createHash('sha256').update(Buffer.from(calls.at(-1))).digest())); },
    reject() { reject(new Error('fixture digest rejection')); },
  };
}

// Repeated requests share one digest; successful verification is accepted only for the same map.
{
  const m = newMap(), s = newScene(m), input = mockedInput(m), bake = makeBake(input), digest = deferredDigest();
  let supportReads = 0;
  test.invalidateSupport();
  test.overrideSupportInput(current => { supportReads += 1; return mockedInput(current); });
  window.crypto = { subtle: digest.subtle };
  assert.equal(test.supportFor(s, m, bake), 'pending');
  assert.equal(test.supportFor(s, m, bake), 'pending');
  assert.equal(digest.calls.length, 1, 'pending SHA requests were not coalesced');
  digest.resolve(); await flushMicrotasks();
  assert.equal(test.supportFor(s, m, bake), 'ready', 'valid current-map digest was not accepted');
  const readsAfterAcceptance = supportReads;
  assert.equal(test.supportFor(s, m, bake), 'ready', 'authenticated support was not reused for another window');
  assert.equal(supportReads, readsAfterAcceptance, 'accepted same-map epoch repeated the global support floodfill');
}

// A scene/map change while SHA is pending cannot authenticate the old input for the new scene.
{
  const m = newMap(), replacement = newMap(), s = newScene(m), input = mockedInput(m), bake = makeBake(input), digest = deferredDigest();
  test.invalidateSupport(); window.crypto = { subtle: digest.subtle };
  assert.equal(test.supportFor(s, m, bake), 'pending');
  s.mapData = replacement;
  digest.resolve(); await flushMicrotasks();
  assert.equal(test.snapshot().failure?.reason, 'stale-scene-map');
  assert.equal(test.snapshot().verified, null);
}

// Leaving the overworld scene while SHA is pending is rejected even if its map ref stays the same.
{
  const m = newMap(), s = newScene(m), input = mockedInput(m), bake = makeBake(input), digest = deferredDigest();
  test.invalidateSupport(); window.crypto = { subtle: digest.subtle };
  assert.equal(test.supportFor(s, m, bake), 'pending');
  s.currentMapId = 'greenhollow';
  digest.resolve(); await flushMicrotasks();
  assert.equal(test.snapshot().failure?.reason, 'stale-scene-map');
  assert.equal(test.snapshot().verified, null);
}

// Same-array input mutation during the async digest is caught by the fresh post-resolution read.
{
  const m = newMap(), s = newScene(m), input = mockedInput(m), bake = makeBake(input), digest = deferredDigest();
  test.invalidateSupport(); window.crypto = { subtle: digest.subtle };
  assert.equal(test.supportFor(s, m, bake), 'pending');
  m[173][0] = 1;
  digest.resolve(); await flushMicrotasks();
  assert.equal(test.snapshot().failure?.reason, 'changed-or-mismatched-support');
  assert.equal(test.snapshot().verified, null);
}

// Wrong profile support digest, wrong semantic identity, unavailable crypto, and rejected crypto fail closed.
{
  const m = newMap(), s = newScene(m), input = mockedInput(m), digest = deferredDigest();
  test.invalidateSupport(); window.crypto = { subtle: digest.subtle };
  const wrongProfile = makeBake(input, sha256(Buffer.from('{"profile":"wrong-profile"}')));
  assert.equal(test.supportFor(s, m, wrongProfile), 'pending');
  digest.resolve(); await flushMicrotasks();
  assert.equal(test.snapshot().failure?.reason, 'changed-or-mismatched-support', 'wrong profile digest was accepted');
  test.invalidateSupport();
  assert.equal(test.supportFor(s, m, makeBake(input, undefined, '00'.repeat(32))), 'invalid');
  test.invalidateSupport(); window.crypto = undefined;
  assert.equal(test.supportFor(s, m, makeBake(input)), 'invalid', 'missing WebCrypto did not fail closed');
  test.invalidateSupport();
  window.crypto = { subtle: { digest: () => Promise.reject(new Error('rejected')) } };
  assert.equal(test.supportFor(s, m, makeBake(input)), 'pending');
  await flushMicrotasks(); await flushMicrotasks();
  assert.equal(test.snapshot().failure?.reason, 'digest-failed', 'rejected WebCrypto did not fail closed');
}

// A mismatched v2 support fingerprint on the owned plate must hold movement, never call owmBuild.
{
  test.invalidateSupport(); test.primeMap(map); test.overrideSupportInput(mockedInput);
  test.setBake(makeBake(mockedInput(map), undefined));
  const badBake = { ...makeBake(mockedInput(map)), hash: (mockedInput(map).fnv32 ^ 1) >>> 0 };
  test.setBake(badBake);
  let analyticBuilds = 0;
  test.replaceBuild(() => { analyticBuilds += 1; return null; });
  window.crypto = undefined;
  assert.equal(test.readWindow(scene), null, 'mismatched owned-plate support did not hold movement');
  assert.equal(analyticBuilds, 0, 'mismatched owned-plate support used analytic fallback');
}

// Runtime tuning drift and an actual bake request error both hold the owned plate rather than
// silently rebuilding an analytic field for a profile the artifact does not authenticate.
for (const [key, value] of [['__DQ_WIGGLE__', 0.27], ['__DQ_WATER_THRESH__', 13]]) {
  test.invalidateSupport(); test.primeMap(map); test.setBake(makeBake(mockedInput(map)));
  window[key] = value;
  let builds = 0; test.replaceBuild(() => { builds += 1; return null; });
  assert.equal(test.readWindow(scene), null, `${key} override did not hold the Act 1 plate`);
  assert.equal(builds, 0, `${key} override used analytic fallback on the owned plate`);
  delete window[key];
}
{
  test.invalidateSupport(); test.primeMap(map); test.resetBakeLoad();
  let builds = 0; test.replaceBuild(() => { builds += 1; return null; });
  test.loadBake();
  const failedRequest = window.xhrs.at(-1);
  assert.equal(typeof failedRequest.onerror, 'function', 'real A1OW request did not install an error handler');
  failedRequest.onerror();
  assert.equal(test.readWindow(scene), null, 'failed A1OW request did not hold the Act 1 plate');
  assert.equal(builds, 0, 'failed A1OW request used analytic fallback on the owned plate');
}

// Exercise the FNV collision branch: force a distinct byte sequence to present the already
// authenticated FNV value. It must not pass through the justResolved fast path; exact bytes are
// required before any verified support can be reused.
test.invalidateSupport();
const acceptedInput = test.supportInput(map);
const alteredBytes = Uint8Array.from(acceptedInput.bytes);
alteredBytes[alteredBytes.length - 1] ^= 1;
test.seedVerified(map, acceptedInput.bytes, true);
test.overrideSupportInput(() => ({ bounds: acceptedInput.bounds, bytes: alteredBytes, fnv32: acceptedInput.fnv32 }));
window.crypto = { subtle: { digest: () => new Promise(() => {}) } };
const fnvCollisionStatus = test.supportFor(scene, map, {
  semantics: test.supportSemantics(), mapW: 320, mapH: 400,
  hash: acceptedInput.fnv32, support: 'previously-accepted-sha256',
});
assert.equal(fnvCollisionStatus, 'pending', 'same-FNV altered support bypassed exact-byte verification');
assert.equal(test.snapshot().verified, null, 'same-FNV altered support remained accepted');
test.invalidateSupport();

// Exercise actual owmFor misses at two different camera windows. An already accepted current map
// epoch must not run the whole-map water floodfill again as the visible window shifts.
{
  test.observePlateLifecycle(); test.primeMap(map);
  const exact = test.realSupportInput(map); let supportReads = 0;
  test.overrideSupportInput(current => { supportReads += 1; return test.realSupportInput(current); });
  const bake = { mapW:320,mapH:400,far:255,hash:exact.fnv32,
    support:sha256(exact.bytes),semantics:test.supportSemantics(),
    idx:new Uint16Array(320*400).fill(0xffff),blk:new Uint8Array(0) };
  test.setBake(bake); test.seedVerified(map,exact.bytes,false);
  scene.hero.x=100.5*33.6; scene.hero.y=300.5*33.6;
  scene.cameras.main.worldView={x:100*33.6,y:288*33.6,width:393,height:697};
  const first=test.readWindow(scene);
  assert(first&&first.ow,'first accepted window did not assemble');
  const firstKey=test.snapshot().field.key;
  scene.cameras.main.worldView={x:112*33.6,y:288*33.6,width:393,height:697};
  const second=test.readWindow(scene);
  assert(second&&second.ow,'shifted accepted window did not assemble');
  const secondKey=test.snapshot().field.key;
  assert.notEqual(secondKey,firstKey,'fixture did not cross a real window-key boundary');
  assert.equal(supportReads,0,'accepted map epoch repeated global support floodfill across window keys');
}
test.invalidateSupport();
console.log('PASS: v2 parser, async acceptance, real window-key cost, topology, repair lifecycle, and fail-closed cases');
