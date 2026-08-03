#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('/Users/christopherhachisu/Documents/claudecode/edu-rpg/.eduharness/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'design/review/overworld-art-blueprint/source-plates');
const RUN_TAG = `${process.pid}-${Date.now()}`;
const OUT_PARENT = path.dirname(OUT);
const WORK = path.join(OUT_PARENT, `.source-plates-work-${RUN_TAG}`);
const STAGE = path.join(OUT_PARENT, `.source-plates-stage-${RUN_TAG}`);
const BACKUP = path.join(OUT_PARENT, `.source-plates-backup-${RUN_TAG}`);
const URL = process.env.EDU_RPG_URL || 'http://127.0.0.1:5174/';
const TILE = 48;
const PLATE_TILE = 16;
const ZOOM = 1;
const PANEL_WIDTH = 1920;
const PANEL_HEIGHT = 1920;
const PANEL_TILES_X = PANEL_WIDTH / TILE;
const PANEL_TILES_Y = PANEL_HEIGHT / TILE;
const CHUNK_TILES_X = PANEL_TILES_X - 8;
const CHUNK_TILES_Y = PANEL_TILES_Y - 8;
const MAP_WIDTH = 320;
const MAP_HEIGHT = 400;
const BUNDLE_SHA256 = 'a56026574b42168985b353e4cee824562716af83f92d03f408df04eac9127381';
const DQ_SHA256 = 'fcd746d1be14cc1958b4ae710a75e36c0ee2a5ae141a82e63272ba7169cd688b';
const SMOKE_ONLY = process.argv.includes('--smoke');
const SMOKE_MOVE_ONLY = process.argv.includes('--smoke-move');

const plates = {
  act1: { bounds: [16, 218, 163, 399], markers: [{ id: 'crystal-act1', at: [148, 295], color: '#54d8ff' }] },
  act2: { bounds: [161, 222, 312, 399], markers: [
    { id: 'crystal-act2', at: [172, 305], color: '#54d8ff' },
    { id: 'shadow-act2', at: [260, 234], color: '#b879ff' },
  ] },
  act3: { bounds: [163, 88, 314, 210], markers: [
    { id: 'shadow-act3', at: [260, 198], color: '#b879ff' },
    { id: 'magma-act3', at: [242, 93], color: '#ffad42' },
  ] },
  act4: { bounds: [163, 3, 314, 128], markers: [
    { id: 'magma-act4', at: [242, 81], color: '#ffad42' },
    { id: 'volcanic-act4', at: [172, 110], color: '#ff5d55' },
  ] },
  act5: { bounds: [9, 7, 158, 206], markers: [{ id: 'volcanic-act5', at: [148, 110], color: '#ff5d55' }] },
};

const groups = [
  { id: 'act1', start: [60, 341], bounds: plates.act1.bounds, outputs: ['act1'], expectedHash: '2d82e050b51095280b74395db8656aed52ae919206385827502265f6e0a65202' },
  { id: 'act2', start: [200, 321], bounds: plates.act2.bounds, outputs: ['act2'], expectedHash: '2d82e050b51095280b74395db8656aed52ae919206385827502265f6e0a65202' },
  { id: 'act34', start: [260, 197], bounds: [163, 3, 314, 210], outputs: ['act3', 'act4'], expectedHash: '678650a6bb3851523debb130edd25064c2777a07b03d7058800f1a4ac4e35d57' },
  { id: 'act5', start: [100, 151], bounds: plates.act5.bounds, outputs: ['act5'], expectedHash: 'c4999a8173b3c2bf701f957fb0a11da45eddc61368687ce9420e5886bd2066d9' },
];

function saveAt(x, y) {
  return { version: 4, timestamp: 0, player: {
    name: 'Map Capture', heroColor: 'gray', level: 1, exp: 0, expToNext: 100,
    hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6,
    equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
    inventory: [], gold: 0, position: { mapId: 'overworld', x, y, floor: 1 },
    storyFlags: {}, activeQuests: [], completedQuests: [], questProgress: {},
    timerEnabled: false, quizDifficulty: '3', locale: 'en', soundEnabled: false,
    masterVolume: 0, kanjiMode: false,
  }, playtime: 0, quizStats: {} };
}

function runMagick(args) {
  const result = spawnSync('/opt/homebrew/bin/magick', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`magick failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function pngDimensions(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function expectedDimensions(bounds) {
  return [(bounds[2] - bounds[0] + 1) * PLATE_TILE, (bounds[3] - bounds[1] + 1) * PLATE_TILE];
}

function imageMetrics(file) {
  const standardDeviation = Number(runMagick([file, '-format', '%[fx:standard_deviation]', 'info:']).trim());
  const terrainCoverage = Number(runMagick([
    file, '-colorspace', 'Gray', '-threshold', '8%', '-format', '%[fx:mean]', 'info:',
  ]).trim());
  return { standardDeviation, terrainCoverage };
}

function assertRenderedTerrain(file, label, minimumTerrainCoverage = 0.35) {
  const metrics = imageMetrics(file);
  if (!Number.isFinite(metrics.standardDeviation) || metrics.standardDeviation < 0.02) {
    throw new Error(`${label} appears blank: standardDeviation=${metrics.standardDeviation}`);
  }
  if (!Number.isFinite(metrics.terrainCoverage) || metrics.terrainCoverage < minimumTerrainCoverage) {
    throw new Error(`${label} has excessive black coverage: terrainCoverage=${metrics.terrainCoverage}`);
  }
  return metrics;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function verifyPreservedInputs() {
  const parsed = new global.URL(URL);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(`capture URL must be local preserved HTTP, received ${URL}`);
  }
  const bundle = fs.readFileSync(path.join(ROOT, 'dist/assets/index-BhoGQRaA.js'));
  const publicDq = fs.readFileSync(path.join(ROOT, 'public/dq-tiles.js'));
  const distDq = fs.readFileSync(path.join(ROOT, 'dist/dq-tiles.js'));
  if (sha256(bundle) !== BUNDLE_SHA256) throw new Error('preserved bundle hash mismatch');
  if (!publicDq.equals(distDq)) throw new Error('public/dist dq-tiles twins differ');
  if (sha256(publicDq) !== DQ_SHA256) throw new Error('dq-tiles hash mismatch');
  return { bundleSha256: BUNDLE_SHA256, dqTilesSha256: DQ_SHA256 };
}

function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function boot(page, start, errors) {
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (/dq .*err|exception|cannot read/i.test(message.text())) errors.push(`console: ${message.text()}`);
  });
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20000 });
  await page.evaluate(save => localStorage.setItem('edu-rpg-save', JSON.stringify(save)), saveAt(...start));
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20000 });
  await page.evaluate(() => {
    window.__DQ_DEBUG__ = 1;
    const game = window.__PHASER_GAME__;
    if (game.scene.isActive('BootScene')) {
      game.scene.start('TitleScene');
      game.scene.stop('BootScene');
    }
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('WorldMapScene'))) break;
    await page.evaluate(() => {
      const game = window.__PHASER_GAME__;
      const title = game.scene.getScene('TitleScene');
      if (!title || !game.scene.isActive('TitleScene') || !title.menuItems) return;
      const index = title.menuItems.findIndex(item => item.getData && item.getData('action') === 'continue');
      if (index >= 0) {
        title.selectedIndex = index;
        title.confirmTitle();
      }
    });
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => {
    const game = window.__PHASER_GAME__;
    const scene = game && game.scene.getScene('WorldMapScene');
    return game.scene.isActive('WorldMapScene') && scene && scene.mapData && window.__HD2D_STYLE__ === 'dq';
  }, { timeout: 12000 });
  await page.waitForTimeout(800);
  await page.evaluate(({ width, height, zoom }) => {
    const game = window.__PHASER_GAME__;
    const scene = game.scene.getScene('WorldMapScene');
    const camera = scene.cameras.main;
    game.scale.stopListeners();
    game.scale.scaleMode = window.Phaser.Scale.NONE;
    game.scale.setGameSize(width, height);
    game.renderer.resize(width, height);
    for (const candidate of game.scene.scenes) {
      if (candidate.cameras && candidate.cameras.main) candidate.cameras.main.setSize(width, height);
    }
    camera.stopFollow();
    camera.setZoom(zoom);
    if (scene.hero) scene.hero.setVisible(false);
    if (scene.player) scene.player.setVisible(false);
    for (const child of scene.children.list) {
      if (child && child.scrollFactorX === 0 && child.scrollFactorY === 0 && child.setVisible) child.setVisible(false);
    }
    const overlay = document.getElementById('qok-ui');
    if (overlay) overlay.style.display = 'none';
  }, { width: PANEL_WIDTH, height: PANEL_HEIGHT, zoom: ZOOM });
  await page.waitForTimeout(800);
}

async function inspectRuntime(page, expectedHash) {
  const state = await page.evaluate(() => {
    const game = window.__PHASER_GAME__;
    const scene = game.scene.getScene('WorldMapScene');
    return {
      mapId: scene.currentMapId,
      width: scene.mapData[0].length,
      height: scene.mapData.length,
      mapData: scene.mapData,
      canvas: [game.canvas.width, game.canvas.height],
      camera: [scene.cameras.main.width, scene.cameras.main.height, scene.cameras.main.zoom],
      style: window.__HD2D_STYLE__,
      dqSafe: window.__DQ_MUT__ && window.__DQ_MUT__.safe,
      owProps: scene.children.list.filter(child => child && child.texture && /^owprop_/.test(child.texture.key || ''))
        .map(child => ({ key: child.texture.key, visible: child.visible, x: child.x, y: child.y })),
    };
  });
  const hash = sha256(Buffer.from(state.mapData.flat()));
  if (state.mapId !== 'overworld' || state.width !== MAP_WIDTH || state.height !== MAP_HEIGHT) {
    throw new Error(`unexpected runtime map: ${state.mapId} ${state.width}x${state.height}`);
  }
  if (state.canvas[0] !== PANEL_WIDTH || state.canvas[1] !== PANEL_HEIGHT
      || state.camera[0] !== PANEL_WIDTH || state.camera[1] !== PANEL_HEIGHT
      || Math.abs(state.camera[2] - ZOOM) > 1e-9) {
    throw new Error(`unexpected renderer geometry: canvas=${state.canvas} camera=${state.camera}`);
  }
  if (state.style !== 'dq' || state.dqSafe !== true || hash !== expectedHash) {
    throw new Error(`runtime guard failed: style=${state.style} dqSafe=${state.dqSafe} hash=${hash}`);
  }
  return { hash, canvas: state.canvas, camera: state.camera.slice(0, 2), owProps: state.owProps };
}

async function suppressFixedUi(page) {
  await page.evaluate(({ width, height, zoom }) => {
    const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    const main = scene.cameras.main;
    const fixedUi = [
      scene.hudHpPanel, scene.hpText, scene.hpBarBg, scene.hpBarFg,
      scene.hudFloorPanel, scene.floorText, scene.guideText, scene.compassContainer,
      scene.minimapGfx, scene.minimapPlayerDot, scene._minimapHit,
      scene._minimapBtn, scene._minimapBtnLabel,
      scene.messageBox, scene.messageSpeaker, scene.messageText,
      ...(scene._questTrackerObjs || []),
    ];
    let capture = scene.cameras.cameras.find(camera => camera.name === '__actPlateCapture');
    if (!capture) {
      capture = scene.cameras.add(0, 0, width, height, false, '__actPlateCapture');
    }
    capture.setSize(width, height).setZoom(zoom).setScroll(main.scrollX, main.scrollY);
    for (const child of fixedUi) {
      if (child) capture.ignore(child);
    }
    capture.setVisible(true);
    main.setVisible(false);
    scene.updateHUD = () => {};
    scene.renderMinimap = () => {};
    scene.updateCompass = () => {};
    const overlay = document.getElementById('qok-ui');
    if (overlay) overlay.style.display = 'none';
  }, { width: PANEL_WIDTH, height: PANEL_HEIGHT, zoom: ZOOM });
}

async function preparePanel(page, cameraX, cameraY) {
  await page.evaluate(({ cameraX, cameraY, tile }) => {
    const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    const main = scene.cameras.main;
    const capture = scene.cameras.cameras.find(camera => camera.name === '__actPlateCapture');
    main.setVisible(true);
    if (capture) capture.setVisible(false);
    main.setScroll(cameraX * tile, cameraY * tile);
    if (window.__DQ_TILES__) window.__DQ_TILES__.redraw();
  }, { cameraX, cameraY, tile: TILE });
}

async function snapshot(page, output) {
  try {
    await suppressFixedUi(page);
    const dataUrl = await withTimeout(page.evaluate(() => new Promise(resolve => {
      window.__PHASER_GAME__.renderer.snapshot(image => resolve(image && image.src));
    })), 15000, 'renderer snapshot');
    if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('renderer snapshot failed');
    fs.writeFileSync(output, Buffer.from(dataUrl.split(',')[1], 'base64'));
    const dimensions = pngDimensions(output);
    if (dimensions[0] !== PANEL_WIDTH || dimensions[1] !== PANEL_HEIGHT) {
      throw new Error(`unexpected panel dimensions ${dimensions.join('x')}`);
    }
  } finally {
    await page.evaluate(() => {
      const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      const main = scene.cameras.main;
      const capture = scene.cameras.cameras.find(camera => camera.name === '__actPlateCapture');
      main.setVisible(true);
      if (capture) capture.setVisible(false);
    }).catch(() => {});
  }
}

async function captureRegion(page, id, bounds) {
  const [minX, minY, maxX, maxY] = bounds;
  const widthTiles = maxX - minX + 1;
  const heightTiles = maxY - minY + 1;
  const chunks = [];
  const regionWork = path.join(WORK, id);
  fs.rmSync(regionWork, { recursive: true, force: true });
  fs.mkdirSync(regionWork, { recursive: true });

  for (let y = 0; y < heightTiles; y += CHUNK_TILES_Y) {
    for (let x = 0; x < widthTiles; x += CHUNK_TILES_X) {
      const chunkWidth = Math.min(CHUNK_TILES_X, widthTiles - x);
      const chunkHeight = Math.min(CHUNK_TILES_Y, heightTiles - y);
      const worldX = minX + x;
      const worldY = minY + y;
      const cameraX = Math.max(0, Math.min(MAP_WIDTH - PANEL_TILES_X, worldX - 4));
      const cameraY = Math.max(0, Math.min(MAP_HEIGHT - PANEL_TILES_Y, worldY - 4));
      const panel = path.join(regionWork, `panel-${x}-${y}.png`);
      const chunk = path.join(regionWork, `chunk-${x}-${y}.png`);

      await preparePanel(page, cameraX, cameraY);
      await page.waitForTimeout(260);
      await snapshot(page, panel);

      runMagick([
        panel,
        '-crop', `${chunkWidth * TILE}x${chunkHeight * TILE}+${(worldX - cameraX) * TILE}+${(worldY - cameraY) * TILE}`,
        '+repage', '-filter', 'Lanczos', '-resize', `${chunkWidth * PLATE_TILE}x${chunkHeight * PLATE_TILE}!`,
        chunk,
      ]);
      assertRenderedTerrain(chunk, `${id} chunk ${x},${y}`, 0.65);
      fs.rmSync(panel);
      chunks.push({ file: chunk, x: x * PLATE_TILE, y: y * PLATE_TILE });
    }
  }

  const output = path.join(WORK, `${id}.png`);
  const args = ['-size', `${widthTiles * PLATE_TILE}x${heightTiles * PLATE_TILE}`, 'xc:black'];
  for (const chunk of chunks) args.push(chunk.file, '-geometry', `+${chunk.x}+${chunk.y}`, '-composite');
  args.push(output);
  runMagick(args);
  return output;
}

function cropPlate(groupImage, groupBounds, plateId) {
  const plate = plates[plateId];
  const [minX, minY, maxX, maxY] = plate.bounds;
  const [width, height] = expectedDimensions(plate.bounds);
  const clean = path.join(STAGE, `${plateId}-current-clean.png`);
  runMagick([
    groupImage,
    '-crop', `${width}x${height}+${(minX - groupBounds[0]) * PLATE_TILE}+${(minY - groupBounds[1]) * PLATE_TILE}`,
    '+repage', clean,
  ]);
  return clean;
}

function markPlate(plateId, clean) {
  const plate = plates[plateId];
  const draw = [];
  for (const marker of plate.markers) {
    const x = (marker.at[0] - plate.bounds[0]) * PLATE_TILE + PLATE_TILE / 2;
    const y = (marker.at[1] - plate.bounds[1]) * PLATE_TILE + PLATE_TILE / 2;
    draw.push(
      '-fill', 'none', '-stroke', '#101820', '-strokewidth', '8', '-draw', `circle ${x},${y} ${x + 15},${y}`,
      '-stroke', '#ffffff', '-strokewidth', '5', '-draw', `circle ${x},${y} ${x + 15},${y}`,
      '-stroke', marker.color, '-strokewidth', '3', '-draw', `circle ${x},${y} ${x + 15},${y}`,
      '-draw', `line ${x - 21},${y} ${x - 10},${y} line ${x + 10},${y} ${x + 21},${y} line ${x},${y - 21} ${x},${y - 10} line ${x},${y + 10} ${x},${y + 21}`,
    );
  }
  const marked = path.join(STAGE, `${plateId}-current-connectors.png`);
  runMagick([clean, ...draw, marked]);
  return marked;
}

function listFiles(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? listFiles(path.join(directory, entry.name), relative) : [relative];
  });
}

let preservedFiles = [];

function prepareStage() {
  fs.mkdirSync(OUT_PARENT, { recursive: true });
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  preservedFiles = [];
  if (fs.existsSync(OUT)) {
    preservedFiles = listFiles(OUT);
    fs.cpSync(OUT, STAGE, { recursive: true });
  } else {
    fs.mkdirSync(STAGE, { recursive: true });
  }
}

function promoteStaged(files) {
  const expectedFiles = [...new Set([...preservedFiles, ...files])].sort();
  const stagedFiles = listFiles(STAGE).sort();
  if (stagedFiles.length !== expectedFiles.length || stagedFiles.some((file, index) => file !== expectedFiles[index])) {
    throw new Error(`staged output set mismatch: ${stagedFiles.join(', ')}`);
  }
  for (const file of expectedFiles) {
    const staged = path.join(STAGE, file);
    if (!fs.existsSync(staged) || !fs.statSync(staged).isFile()) throw new Error(`staged output missing: ${file}`);
  }
  let backedUp = false;
  if (fs.existsSync(OUT)) {
    fs.renameSync(OUT, BACKUP);
    backedUp = true;
  }
  try {
    fs.renameSync(STAGE, OUT);
  } catch (error) {
    if (backedUp) {
      try {
        fs.renameSync(BACKUP, OUT);
      } catch (restoreError) {
        error.message += `; restore failed (${restoreError.message}); original retained at ${BACKUP}`;
      }
    }
    throw error;
  }
  if (backedUp) fs.rmSync(BACKUP, { recursive: true, force: true });
}

async function captureSmoke(page, guards, runtime) {
  const started = Date.now();
  const cameraX = 70;
  const cameraY = 290;
  await preparePanel(page, cameraX, cameraY);
  await page.waitForFunction(({ minX, minY, maxX, maxY }) => {
    const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return scene.children.list.some(child => child && child.visible && child.texture
      && /^owprop_/.test(child.texture.key || '')
      && child.x >= minX && child.x <= maxX && child.y >= minY && child.y <= maxY);
  }, {
    minX: cameraX * TILE,
    minY: cameraY * TILE,
    maxX: (cameraX + PANEL_TILES_X) * TILE,
    maxY: (cameraY + PANEL_TILES_Y) * TILE,
  }, { timeout: 20000 });
  await page.waitForTimeout(500);
  const props = await page.evaluate(({ minX, minY, maxX, maxY }) => {
    const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    return scene.children.list.filter(child => child && child.visible && child.texture
      && /^owprop_/.test(child.texture.key || '')
      && child.x >= minX && child.x <= maxX && child.y >= minY && child.y <= maxY)
      .map(child => ({ key: child.texture.key, x: child.x, y: child.y }));
  }, {
    minX: cameraX * TILE,
    minY: cameraY * TILE,
    maxX: (cameraX + PANEL_TILES_X) * TILE,
    maxY: (cameraY + PANEL_TILES_Y) * TILE,
  });
  if (!props.length) throw new Error('smoke panel has no actual visible owprop objects');

  const imageName = 'native-runtime-smoke-1920.png';
  const jsonName = 'native-runtime-smoke-1920.json';
  const stagedImage = path.join(STAGE, imageName);
  await snapshot(page, stagedImage);
  const dimensions = pngDimensions(stagedImage);
  if (dimensions[0] !== PANEL_WIDTH || dimensions[1] !== PANEL_HEIGHT) {
    throw new Error(`smoke dimensions mismatch: ${dimensions.join('x')}`);
  }
  const metrics = assertRenderedTerrain(stagedImage, 'smoke panel');
  const evidence = {
    status: 'PASS',
    dimensions,
    northUp: true,
    zoom: ZOOM,
    cameraTileBounds: [cameraX, cameraY, cameraX + PANEL_TILES_X - 1, cameraY + PANEL_TILES_Y - 1],
    durationMs: Date.now() - started,
    ...metrics,
    actualVisibleOwProps: props,
    runtimeMapSha256: runtime.hash,
    ...guards,
  };
  fs.writeFileSync(path.join(STAGE, jsonName), `${JSON.stringify(evidence, null, 2)}\n`);
  promoteStaged([imageName, jsonName]);
  return { image: path.join(OUT, imageName), evidence: path.join(OUT, jsonName), ...evidence };
}

async function captureMoveSmoke(page, guards, runtime) {
  const started = Date.now();
  const landmarkTiles = await page.evaluate(() => {
    const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
    const propTiles = new Set([6, 7, 8, 9, 10, 11, 12, 15, 16, 19, 20]);
    const found = [];
    for (let y = 0; y < scene.mapData.length; y += 1) {
      for (let x = 0; x < scene.mapData[y].length; x += 1) {
        if (propTiles.has(scene.mapData[y][x])) found.push({ x, y, tile: scene.mapData[y][x] });
      }
    }
    return found;
  });
  if (landmarkTiles.length < 2) throw new Error('two-panel smoke needs at least two runtime landmark tiles');
  let pair = [landmarkTiles[0], landmarkTiles[1]];
  let bestDistance = -1;
  for (let i = 0; i < landmarkTiles.length; i += 1) {
    for (let j = i + 1; j < landmarkTiles.length; j += 1) {
      const dx = landmarkTiles[i].x - landmarkTiles[j].x;
      const dy = landmarkTiles[i].y - landmarkTiles[j].y;
      const distance = dx * dx + dy * dy;
      if (distance > bestDistance) {
        bestDistance = distance;
        pair = [landmarkTiles[i], landmarkTiles[j]];
      }
    }
  }

  const panels = [];
  const stagedFiles = [];
  for (let index = 0; index < pair.length; index += 1) {
    const landmark = pair[index];
    const cameraX = Math.max(0, Math.min(MAP_WIDTH - PANEL_TILES_X, landmark.x - Math.floor(PANEL_TILES_X / 2)));
    const cameraY = Math.max(0, Math.min(MAP_HEIGHT - PANEL_TILES_Y, landmark.y - Math.floor(PANEL_TILES_Y / 2)));
    await preparePanel(page, cameraX, cameraY);
    await page.waitForFunction(({ minX, minY, maxX, maxY }) => {
      const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      return scene.children.list.some(child => child && child.visible && child.texture
        && /^owprop_/.test(child.texture.key || '')
        && child.x >= minX && child.x <= maxX && child.y >= minY && child.y <= maxY);
    }, {
      minX: cameraX * TILE,
      minY: cameraY * TILE,
      maxX: (cameraX + PANEL_TILES_X) * TILE,
      maxY: (cameraY + PANEL_TILES_Y) * TILE,
    }, { timeout: 20000 });
    await page.waitForTimeout(500);
    const props = await page.evaluate(({ minX, minY, maxX, maxY }) => {
      const scene = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      return scene.children.list.filter(child => child && child.visible && child.texture
        && /^owprop_/.test(child.texture.key || '')
        && child.x >= minX && child.x <= maxX && child.y >= minY && child.y <= maxY)
        .map(child => ({ key: child.texture.key, x: child.x, y: child.y }));
    }, {
      minX: cameraX * TILE,
      minY: cameraY * TILE,
      maxX: (cameraX + PANEL_TILES_X) * TILE,
      maxY: (cameraY + PANEL_TILES_Y) * TILE,
    });
    const imageName = `native-runtime-move-smoke-${index + 1}-1920.png`;
    const stagedImage = path.join(STAGE, imageName);
    await snapshot(page, stagedImage);
    const dimensions = pngDimensions(stagedImage);
    const metrics = assertRenderedTerrain(stagedImage, `move smoke panel ${index + 1}`);
    panels.push({
      image: imageName,
      dimensions,
      landmark,
      cameraTileBounds: [cameraX, cameraY, cameraX + PANEL_TILES_X - 1, cameraY + PANEL_TILES_Y - 1],
      actualVisibleOwProps: props,
      ...metrics,
    });
    stagedFiles.push(imageName);
  }

  const jsonName = 'native-runtime-move-smoke-1920.json';
  const evidence = {
    status: 'PASS',
    dimensions: [PANEL_WIDTH, PANEL_HEIGHT],
    northUp: true,
    zoom: ZOOM,
    durationMs: Date.now() - started,
    runtimeMapSha256: runtime.hash,
    panels,
    ...guards,
  };
  fs.writeFileSync(path.join(STAGE, jsonName), `${JSON.stringify(evidence, null, 2)}\n`);
  stagedFiles.push(jsonName);
  promoteStaged(stagedFiles);
  return { evidence: path.join(OUT, jsonName), ...evidence };
}

(async () => {
  let browser;
  try {
    prepareStage();
    const guards = verifyPreservedInputs();
    browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader', '--mute-audio'] });
    const manifest = { source: 'preserved dist runtime', url: URL, ...guards, northUp: true, sourceTilePixels: TILE, plateTilePixels: PLATE_TILE, plates: {} };
    if (SMOKE_ONLY || SMOKE_MOVE_ONLY) {
      const group = groups[0];
      const errors = [];
      const page = await browser.newPage({ viewport: { width: PANEL_WIDTH, height: PANEL_HEIGHT }, deviceScaleFactor: 1 });
      await boot(page, group.start, errors);
      const runtime = await inspectRuntime(page, group.expectedHash);
      const smoke = SMOKE_MOVE_ONLY
        ? await captureMoveSmoke(page, guards, runtime)
        : await captureSmoke(page, guards, runtime);
      if (errors.length) throw new Error(`smoke runtime errors:\n${errors.join('\n')}`);
      await page.close();
      if (SMOKE_MOVE_ONLY) {
        console.log(`MOVE SMOKE PASS panels=${smoke.panels.length} durationMs=${smoke.durationMs} ${smoke.evidence}`);
      } else {
        console.log(`SMOKE PASS ${smoke.dimensions.join('x')} props=${smoke.actualVisibleOwProps.length} durationMs=${smoke.durationMs} ${smoke.image}`);
      }
      return;
    }
    for (const group of groups) {
      const errors = [];
      const page = await browser.newPage({ viewport: { width: PANEL_WIDTH, height: PANEL_HEIGHT }, deviceScaleFactor: 1 });
      console.log(`BOOT ${group.id} start=${group.start.join(',')}`);
      await boot(page, group.start, errors);
      const runtime = await inspectRuntime(page, group.expectedHash);
      const groupImage = await captureRegion(page, group.id, group.bounds);
      if (errors.length) throw new Error(`${group.id} runtime errors:\n${errors.join('\n')}`);
      for (const plateId of group.outputs) {
        const clean = cropPlate(groupImage, group.bounds, plateId);
        const marked = markPlate(plateId, clean);
        const dimensions = expectedDimensions(plates[plateId].bounds);
        if (pngDimensions(clean).join('x') !== dimensions.join('x') || pngDimensions(marked).join('x') !== dimensions.join('x')) {
          throw new Error(`${plateId} dimensions do not match ${dimensions.join('x')}`);
        }
        manifest.plates[plateId] = {
          bounds: plates[plateId].bounds,
          dimensions,
          clean: path.basename(clean),
          marked: path.basename(marked),
          markers: plates[plateId].markers,
          runtimeHash: runtime.hash,
        };
        console.log(`PLATE ${plateId} ${dimensions.join('x')} ${path.basename(clean)} ${path.basename(marked)}`);
      }
      await page.close();
    }
    fs.writeFileSync(path.join(STAGE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const finalFiles = ['manifest.json'];
    for (const plateId of Object.keys(plates)) {
      const cleanName = `${plateId}-current-clean.png`;
      manifest.plates[plateId].renderValidation = assertRenderedTerrain(path.join(STAGE, cleanName), `${plateId} clean plate`);
      finalFiles.push(`${plateId}-current-clean.png`, `${plateId}-current-connectors.png`);
    }
    fs.writeFileSync(path.join(STAGE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    promoteStaged(finalFiles);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      try {
        fs.rmSync(WORK, { recursive: true, force: true });
      } finally {
        fs.rmSync(STAGE, { recursive: true, force: true });
      }
    }
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
