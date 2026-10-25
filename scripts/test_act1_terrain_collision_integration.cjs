#!/usr/bin/env node
// Focused regression for the ACT1 water/visible-alpha ownership boundary. Uses the production
// analytic fallback source with a small synthetic map; it does not bake or mutate runtime assets.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const dq = readFileSync(resolve(root, 'public/dq-tiles.js'), 'utf8');

function functionSource(name) {
  const start = dq.indexOf(`\n  function ${name}(`);
  assert.ok(start >= 0, `missing production ${name}`);
  let depth = 0;
  const open = dq.indexOf('{', start);
  for (let i = open; i < dq.length; i += 1) {
    if (dq[i] === '{') depth += 1;
    else if (dq[i] === '}' && --depth === 0) return dq.slice(start + 1, i + 1);
  }
  throw new Error(`unbalanced production function ${name}`);
}

const presence = functionSource('owmPresence');
const build = functionSource('owmBuild');
const productionBuild = new Function(
  'map', 'N', 'et', 'waterField', 'mountainField', 'owmTileBlock', 'a1aPlateBounds',
  `${presence}\n${build}\nreturn owmBuild;`,
);

const N = 4;
const map = Array.from({ length: 4 }, () => Array(4).fill(4));
map[0][0] = 5; // water painted beneath the bridge deck
map[0][1] = 2; // ordinary water
const et = (m, tx, ty) => (m[ty] && m[ty][tx]) || 0;
const sampleTile = (m, x, y) => et(m, (x / N) | 0, (y / N) | 0);
const waterField = (m, x, y) => [2, 5].includes(sampleTile(m, x, y)) ? 1 : 0;
const mountainField = (m, x, y) => sampleTile(m, x, y) === 4 ? 1 : 0;
const bounds = () => [1, 1, 2, 2];
const buildField = productionBuild(map, N, et, waterField, mountainField, () => ({}), bounds);
const cellCenter = (x, y) => (y * N + (N >> 1)) * (4 * N) + x * N + (N >> 1);

const act1 = buildField(map, 0, 0, 4, 4, true);
const legacy = buildField(map, 0, 0, 4, 4, false);
const at = (field, x, y) => field.dist[cellCenter(x, y)];
assert.ok(at(act1, 1, 1) > 0, 'Act 1 mountain field still blocks inside the approved alpha-owned bounds');
assert.equal(at(act1, 3, 3), 0, 'Act 1 padded neighbor lost its existing analytic mountain blocker');
assert.equal(at(legacy, 1, 1), 0, 'non-Act-1 analytic fallback lost mountain blocking');
assert.ok(at(act1, 0, 0) > 0, 'water bridge deck stopped being walkable');
assert.equal(at(act1, 1, 0), 0, 'water remained walkable');

const freeSource = functionSource('a1fRequiredAt');
const forestState = { mode: true, stencilBounds: { minX: -25, minY: -25, maxX: 25, maxY: 25 } };
const required = new Function('owScene', 'a1aPlateOwns', 'a1aPlateCell', 'A1A_FOREST', 'a1fBuildStencil', 'TILE', 'OW_SCALE', `${freeSource}\nreturn a1fRequiredAt;`)(
  scene => !!scene && scene.currentMapId === 'overworld',
  scene => !!scene && scene.painted === true,
  (x, y) => x >= 16 && x <= 163 && y >= 218 && y <= 399,
  forestState,
  () => [],
  48,
  0.7,
);
assert.equal(required({ currentMapId: 'overworld', painted: true }, 69 * 48 + 24, 256 * 48 + 24), true);
assert.equal(required({ currentMapId: 'overworld', painted: false }, 69 * 48 + 24, 256 * 48 + 24), false);
assert.equal(required({ currentMapId: 'overworld', painted: true }, 10 * 48 + 24, 200 * 48 + 24), false);
assert.equal(required({ currentMapId: 'overworld', painted: true }, 15 * 48 + 24, 218 * 48 + 24), true,
  'full hero stencil crossing the actual plate edge lost collision authority');
forestState.stencilBounds = null;
assert.equal(required({ currentMapId: 'overworld', painted: true, hero: { scaleX: 1.0125, scaleY: 1.0125, frame: { width: 64, height: 64 } } }, 164 * 48 + 24, 300 * 48 + 24), true,
  'missing stencil fail-opened at the adjacent plate edge instead of using bounded frame extent');
assert.equal(required({ currentMapId: 'overworld', painted: true, hero: { scaleX: 1.0125, scaleY: 1.0125, frame: { width: 64, height: 64 } } }, 200 * 48 + 24, 300 * 48 + 24), false,
  'missing stencil expanded ACT1 authority beyond its bounded edge');
forestState.stencilBounds = { minX: -25, minY: -25, maxX: 25, maxY: 25 };
assert.equal(required({ currentMapId: 'overworld', painted: true }, 240 * 48 + 24, 300 * 48 + 24), false,
  'ACT1 QOK ownership leaked into a distant shared-map region');
assert.equal(required({ currentMapId: 'act2-overworld', painted: true }, 69 * 48 + 24, 256 * 48 + 24), false,
  'ACT1 QOK ownership leaked into another act');
const bitSource = functionSource('a1fBit');
const boundedBit = new Function('A1A_FOREST', `${bitSource}\nreturn a1fBit;`)({ bits: Uint8Array.from([0b00000010]) });
assert.equal(Boolean(boundedBit(-1, 0)), false, 'out-of-range pack pixels must defer to non-ACT1 terrain');
assert.equal(Boolean(boundedBit(1, 0)), true);

const freeMapSource = functionSource('a1mFree');
let stencilCalls = 0;
const scopedFree = new Function(
  'A1A_FOREST', 'A1M_PROP', 'OWM_FIELD_OWNED', 'TILE', 'owScene', 'a1fRequiredAt',
  'a1fReady', 'a1fMode', 'a1fHeroFree', 'a1mFootDy', 'a1mNeed', 'a1mTileAt',
  'a1dIsMouthCell', 'a1mCanMove', 'a1dIsEntranceCrystalCell',
  `${freeMapSource}\nreturn a1mFree;`,
)({ mode: true }, {}, { 2: 1, 4: 1, 5: 1 }, 48,
  scene => !!scene && scene.currentMapId === 'overworld',
  (scene, x) => x < 164 * 48,
  () => false,
  () => true,
  () => { stencilCalls++; return true; },
  () => 0,
  () => 0,
  () => 0,
  () => false,
  () => true,
  () => false,
);
const openField = { ow: true, ox: 11500, oy: 14200, W: 300, H: 300, dist: new Uint16Array(90000) };
assert.equal(scopedFree({ currentMapId: 'overworld' }, openField, 240 * 48 + 24, 300 * 48 + 24), true,
  'out-of-plate ACT1 movement was gated by combined-mask readiness');
assert.equal(stencilCalls, 0, 'out-of-plate ACT1 movement consulted the combined mask');
assert.equal(scopedFree({ currentMapId: 'act2-overworld' }, openField, 240 * 48 + 24, 300 * 48 + 24), true,
  'other-act movement changed under ACT1 combined-mask mode');
assert.equal(stencilCalls, 0, 'other-act movement consulted the ACT1 combined mask');

// Startup saved-position validation must call the same live movement predicate with the
// physical sprite coordinates that the scene actually stores. It defers if the matching hero
// collision or visible forest source is not ready, and it never treats a stale/out-of-window
// sample as a wall.
const spawnCheckSource = functionSource('a1mOverworldSpawnCheck');
let sampledSpawn = null;
const spawnCheck = new Function(
  'owScene', 'owCanonical', 'a1mAnyFor', 'a1mFootDy', 'a1fRequiredAt',
  'A1A_FOREST', 'A1A', 'a1fReady', 'a1mFree',
  `${spawnCheckSource}\nreturn a1mOverworldSpawnCheck;`,
)(
  scene => !!scene && scene.currentMapId === 'overworld',
  v => v / 0.7,
  scene => scene.movementField,
  () => 44,
  scene => !!scene.inPlate,
  { mode: true, status: 'ready', bits: new Uint8Array([1]) },
  { underpaint: { forest: { status: 'ready' } } },
  scene => !!scene.heroReady,
  (scene, field, x, y) => { sampledSpawn = { scene, field, x, y }; return !!scene.allowed; },
);
const spawnField = { ow: true, ox: 0, oy: 0, W: 20000, H: 20000 };
const spawnScene = { currentMapId: 'overworld', hero: {}, movementField: spawnField, inPlate: false, allowed: true };
const physicalX = 117.5 * 48 * 0.7, physicalY = 234.5 * 48 * 0.7;
assert.deepEqual(spawnCheck(spawnScene, physicalX, physicalY), { status: 'ready', free: true });
assert.equal(sampledSpawn.scene, spawnScene);
assert.equal(sampledSpawn.field, spawnField);
assert.equal(sampledSpawn.x, 117.5 * 48, 'physical X must convert through the production OW scale');
assert.equal(sampledSpawn.y, 234.5 * 48, 'the solver receives canonical sprite-center Y');

const unavailableScene = { ...spawnScene, movementField: null };
assert.deepEqual(spawnCheck(unavailableScene, physicalX, physicalY),
  { status: 'pending', reason: 'movement-field' }, 'missing live field must defer instead of teleporting');
const outsideFieldScene = { ...spawnScene,
  movementField: { ow: true, ox: 0, oy: 0, W: 20, H: 20 } };
assert.deepEqual(spawnCheck(outsideFieldScene, physicalX, physicalY),
  { status: 'outside-field', reason: 'movement-field-extent' }, 'out-of-window samples are unevaluable');

for (const heroVariant of ['g3', 'male']) {
  const inPlateScene = { ...spawnScene, inPlate: true, hero: { variant: heroVariant }, heroReady: false };
  sampledSpawn = null;
  assert.equal(spawnCheck(inPlateScene, physicalX, physicalY).status, 'pending',
    `${heroVariant}: selected hero alpha/underpaint readiness must gate an in-plate sample`);
  assert.equal(sampledSpawn, null,
    `${heroVariant}: no collision query runs while the active hero mask is pending`);
  inPlateScene.heroReady = true;
  assert.deepEqual(spawnCheck(inPlateScene, physicalX, physicalY), { status: 'ready', free: true });
  assert.equal(sampledSpawn.scene, inPlateScene,
    `${heroVariant}: ready active-hero query must reach exact a1mFree`);
}

const failedForest = new Function(
  'owScene', 'owCanonical', 'a1mAnyFor', 'a1mFootDy', 'a1fRequiredAt',
  'A1A_FOREST', 'A1A', 'a1fReady', 'a1mFree',
  `${spawnCheckSource}\nreturn a1mOverworldSpawnCheck;`,
)(scene => scene.currentMapId === 'overworld', v => v / 0.7, scene => scene.movementField,
  () => 44, () => true, { mode: true, status: 'error' },
  { underpaint: { forest: { status: 'error' } } }, () => false, () => { throw new Error('must not query'); });
assert.deepEqual(failedForest({ ...spawnScene, inPlate: true }, physicalX, physicalY),
  { status: 'error', reason: 'visible-forest-authority', forestStatus: 'error', underpaintStatus: 'error' },
  'terminal forest/underpaint failure must not fall back to coarse tile walkability');

// Exercise the real startup call chain as well: map consolidation runs before the Act 1 plate is
// applied. A saved point already represented by a walkable source tile remains the reachability
// seed; an exact owner-authored exit can also seed consolidation even though its raw map door tile
// is blocked. Neither case rewrites the hero position.
const mapRuntime = readFileSync(resolve(root, 'public/act1-world-map.js'), 'utf8');
const mapWindow = { __GAME_STATE__: { player: { state: { storyFlags: {} } } }, setInterval: () => 0 };
new Function('window', 'Error', 'Math', 'parseInt', 'Object', 'JSON', mapRuntime)(
  mapWindow, Error, Math, parseInt, Object, JSON,
);
const liveMapAuthority = mapWindow.__ACT1_WORLD_MAP__;
assert.ok(liveMapAuthority && typeof liveMapAuthority.seedWalkableAt === 'function');
assert.equal(liveMapAuthority.seedWalkableAt(117, 234), false,
  'fixture must retain the real source plate’s forest tile proxy at the native startup seed');

const startupFunctions = ['owWalkable', 'act1ConsolidationSeed', 'owReach', 'countSeen',
  'consolidateMapData', 'owEnsureMapSetup'].map(functionSource);
const startupHarness = Function('window', 'OW_BLOCK', 'OW_LANDMARKS', 'MIN_KEEP', 'FILL_MIN',
  'DENS_MAX', 'DENS_MAX_GRASS', 'STUCK_TREE_MTN', 'DXc', 'DYc',
  `var mutatedMap=null,mutStats=null,owMapRef=null;\n${startupFunctions.join('\n')}\nreturn owEnsureMapSetup;`)(
  mapWindow,
  { 2: 1, 4: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 19: 1, 20: 1, 21: 1 },
  [6, 7, 8, 9, 10, 11, 12, 15, 16, 19, 20],
  6, 4, 12, 25, 5, [-1, 0, 1, -1, 1, -1, 0, 1], [-1, -1, -1, 0, 0, 1, 1, 1],
);
function openRuntimeMap(blockedPoint) {
  const map = Array.from({ length: 400 }, () => Array(320).fill(0));
  if (blockedPoint) map[blockedPoint.y][blockedPoint.x] = blockedPoint.tile;
  return map;
}
{
  const map = openRuntimeMap({ x: 117, y: 234, tile: 3 });
  const scene = { currentMapId: 'overworld', mapData: map, heroTileX: 117, heroTileY: 234,
    hero: { x: physicalX, y: physicalY }, renderMinimap() {} };
  mapWindow.__GAME_STATE__.player.state.position = { mapId: 'overworld', floor: 1, x: 117.25, y: 234.5 };
  assert.equal(startupHarness(scene), true, 'first current-map setup should run once');
  assert.deepEqual(Array.from(mapWindow.__DQ_MUT__.start), [117, 234],
    'consolidation must retain the exact saved forest-cell start despite its tile proxy');
  assert.deepEqual([scene.heroTileX, scene.heroTileY], [117, 234],
    'consolidation must not relocate the live saved position');
}
{
  const exit = liveMapAuthority.landmarks[0].exit;
  assert.ok(exit && Number.isInteger(exit.x) && Number.isInteger(exit.y), 'live map must expose the verified exit');
  const map = openRuntimeMap({ x: exit.x, y: exit.y, tile: 6 });
  const scene = { currentMapId: 'overworld', mapData: map, heroTileX: exit.x, heroTileY: exit.y,
    hero: { x: (exit.x + 0.5) * 48 * 0.7, y: (exit.y + 0.5) * 48 * 0.7 }, renderMinimap() {} };
  mapWindow.__GAME_STATE__.player.state.position = null;
  assert.equal(startupHarness(scene), true, 'authored exit map should be consolidated once');
  assert.deepEqual(Array.from(mapWindow.__DQ_MUT__.start), [exit.x, exit.y],
    'exact authored exit should seed consolidation through the verified-exit path');
  assert.deepEqual([scene.heroTileX, scene.heroTileY], [exit.x, exit.y],
    'exit setup must preserve its actual live position');
}

const viewSources = ['a1aPlateVisibleInView', 'a1aUnderpaintRequiredForView', 'terrainState_ready'];
for (const name of viewSources) assert.ok(dq.includes(`function ${name}(`), `missing bounded terrain readiness helper ${name}`);
assert.match(dq, /a1aUnderpaintRequiredForView\(scene\)\&\&!a1aUnderpaintReady\(scene\)/,
  'sprite placement still applies Act 1 underpaint readiness globally');
assert.match(dq, /a1aUnderpaintRequiredForView\(sc\)\&\&!a1aUnderpaintReady\(sc\)/,
  'terrain readiness still applies Act 1 underpaint globally');
const plateVisibleSource = functionSource('a1aPlateVisibleInView');
const plateVisible = new Function('a1aPlateOwns', 'a1aPlateBounds', 'owCanonical', 'a1aPlateCell', 'TILE',
  `${plateVisibleSource}\nreturn a1aPlateVisibleInView;`)(
  scene => !!scene && scene.currentMapId === 'overworld',
  () => [16, 218, 163, 399],
  x => x / 0.7,
  () => false,
  48,
);
const farView = { currentMapId: 'overworld', cameras: { main: { worldView: { x: 200 * 33.6, y: 300 * 33.6, width: 20 * 33.6, height: 20 * 33.6 } } } };
const act1View = { currentMapId: 'overworld', cameras: { main: { worldView: { x: 100 * 33.6, y: 300 * 33.6, width: 20 * 33.6, height: 20 * 33.6 } } } };
const view = (x, y, width, height) => ({ currentMapId: 'overworld', cameras: { main: { worldView: { x, y, width, height } } } });
const worldPx = value => value * 48 * 0.7;
const tangencies = [
  view(worldPx(164), worldPx(300), worldPx(8), worldPx(10)),
  view(worldPx(8), worldPx(300), worldPx(8), worldPx(10)),
  view(worldPx(100), worldPx(400), worldPx(8), worldPx(10)),
  view(worldPx(100), worldPx(210), worldPx(8), worldPx(8)),
];
const onePixelOverlap = view(worldPx(164 - 1), worldPx(300), worldPx(1), worldPx(10));
assert.equal(plateVisible(farView), false, 'distant shared-map camera still intersects Act 1 plate');
assert.equal(plateVisible(act1View), true, 'camera viewing Act 1 art bypassed its readiness region');
for (const [index, tangent] of tangencies.entries()) {
  assert.equal(plateVisible(tangent), false, `zero-area camera-edge tangency ${index} incorrectly requires Act 1 readiness`);
}
assert.equal(plateVisible(onePixelOverlap), true, 'positive one-pixel camera overlap failed to require Act 1 readiness');
const requiredForViewSource = functionSource('a1aUnderpaintRequiredForView');
const requiredForView = new Function('a1aUnderpaintRequired', 'a1aPlateVisibleInView',
  `${requiredForViewSource}\nreturn a1aUnderpaintRequiredForView;`)(() => true, plateVisible);
assert.equal(requiredForView(farView), false);
assert.equal(requiredForView(act1View), true);
const terrainReadySource = functionSource('terrainState_ready');
const terrainReady = new Function('terrainState', 'a1aUnderpaintRequiredForView', 'a1aUnderpaintReady', 'READY_GRACE', 'MAT', 'A1A', 'a1aInBounds',
  `${terrainReadySource}\nreturn terrainState_ready;`)({ lastWin: '200_300', firstDrawAt: Date.now() - 3000 }, requiredForView, () => false, 1800, { ready: true }, {}, () => false);
assert.equal(terrainReady(farView), true, 'off-plate terrain loading still gates the shared world');
assert.equal(terrainReady(act1View), false, 'Act 1 terrain readiness ignored a missing underpaint in view');
assert.match(dq, /terrainRequired&&\(!A1A_FOREST\.mode\|\|!a1fReady\(scene\)\)/,
  'ACT1 did not fail closed before the combined alpha collision pack is ready');

console.log(JSON.stringify({
  kind: 'act1-visible-terrain-ownership-regression',
  act1MountainDelegatedToAlphaWithinBounds: true,
  paddedAndOtherActMountainFieldPreserved: true,
  waterBlockedAndBridgeOpen: true,
  combinedCollisionReadinessFailsClosed: true,
  outOfBoundsMaskPixelsDeferToExistingAuthority: true,
  startupSpawnUsesPhysicalCoordinatesAndExactLiveMovementAuthority: true,
  startupSpawnDefersForMissingOrOutsideFieldAndSelectedHeroReadiness: true,
  otherActAndDistantOverworldRemainUnchanged: true,
  fullHeroStencilRemainsActiveAcrossPlateEdge: true,
}));
