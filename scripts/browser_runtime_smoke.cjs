#!/usr/bin/env node
/* Behavioral smoke test for an already-served hydrated runtime.

   Uses the repository-local .eduharness Playwright install when available.
   That harness is verification tooling, not a runtime or hydration dependency.
*/

const assert = require('node:assert/strict');

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch (_) {
  ({ chromium } = require('../.eduharness/node_modules/playwright-core'));
}

const url = process.argv[2] || 'http://127.0.0.1:5174/';
const SAVE = {
  version: 4,
  timestamp: Date.now(),
  player: {
    name: 'Stability', heroColor: 'gray', level: 5, exp: 0, expToNext: 100,
    hp: 40, maxHp: 40, atk: 15, def: 5, spd: 6,
    equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null },
    inventory: [{ itemId: 'herb', quantity: 3 }], gold: 200,
    position: { mapId: 'greenhollow', x: 8, y: 14, floor: 1 },
    storyFlags: {}, activeQuests: [], completedQuests: [], questProgress: {},
    timerEnabled: true, quizDifficulty: '3', locale: 'en', soundEnabled: false,
    masterVolume: 0, kanjiMode: false,
  },
  playtime: 0,
  quizStats: {},
};
const MONSTER = {
  id: 'slime', nameKey: 'monster.slime', spriteKey: 'monster-slime',
  baseHp: 12, baseAtk: 4, baseDef: 1, baseSpd: 2,
  expReward: 4, goldReward: 2, drops: [], aiPattern: 'basic', color: 0x55aa55,
};

async function enterSavedGame(page) {
  await page.evaluate((save) => localStorage.setItem('edu-rpg-save', JSON.stringify(save)), SAVE);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
  await page.evaluate(() => {
    const game = window.__PHASER_GAME__;
    if (game.scene.isActive('BootScene')) {
      game.scene.start('TitleScene');
      game.scene.stop('BootScene');
    }
  });
  await page.waitForFunction(() => {
    const game = window.__PHASER_GAME__;
    const title = game && game.scene.getScene('TitleScene');
    return title && game.scene.isActive('TitleScene') && title.menuItems?.length > 0;
  }, { timeout: 8_000 });
  await page.evaluate(() => {
    const title = window.__PHASER_GAME__.scene.getScene('TitleScene');
    const continueIndex = title.menuItems.findIndex(
      (item) => item.getData?.('action') === 'continue'
    );
    if (continueIndex < 0) throw new Error('continue action is unavailable');
    title.selectedIndex = continueIndex;
    title.confirmTitle();
  });
  await page.waitForFunction(
    () => window.__PHASER_GAME__.scene.isActive('WorldMapScene'),
    { timeout: 10_000 }
  );
  await page.waitForTimeout(700);
}

(async () => {
  const errors = [];
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      errors.push(`console: ${message.text()}`);
    }
  });

  try {
    const bootStarted = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 20_000 });
    const bootMs = Date.now() - bootStarted;
    await enterSavedGame(page);

    const loaded = await page.evaluate(() => {
      const game = window.__PHASER_GAME__;
      const world = game.scene.getScene('WorldMapScene');
      return {
        mapId: world.currentMapId,
        x: world.heroTileX,
        y: world.heroTileY,
        monsters: game.textures.getTextureKeys().filter((key) => key.startsWith('monster-')).length,
        ui: !!window.__QOKUI && !!document.getElementById('qok-ui'),
        heroWalk: game.textures.exists('hero-walk'),
      };
    });
    assert.equal(loaded.mapId, 'greenhollow');
    assert.equal(loaded.monsters, 75);
    assert.equal(loaded.ui, true);
    assert.equal(loaded.heroWalk, true);

    const move = await page.evaluate(() => {
      const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      world.showingMessage = false;
      world.isMoving = false;
      world.hideMessage?.();
      const choices = [
        { key: 'ArrowRight', dx: 1, dy: 0 },
        { key: 'ArrowLeft', dx: -1, dy: 0 },
        { key: 'ArrowDown', dx: 0, dy: 1 },
        { key: 'ArrowUp', dx: 0, dy: -1 },
      ];
      return choices.find((choice) => world.canMove(
        world.heroTileX + choice.dx,
        world.heroTileY + choice.dy
      ));
    });
    assert.ok(move, 'seed position has no passable neighbor');
    await page.keyboard.down(move.key);
    await page.waitForFunction(
      ({ x, y }) => {
        const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
        return world.heroTileX !== x || world.heroTileY !== y;
      },
      { x: loaded.x, y: loaded.y },
      { timeout: 4_000 }
    );
    await page.keyboard.up(move.key);
    await page.waitForTimeout(650);
    const moved = await page.evaluate(() => {
      const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      world.updatePosition();
      return {
        x: world.heroTileX,
        y: world.heroTileY,
        manual: localStorage.getItem('edu-rpg-save'),
        autosave: localStorage.getItem('edu-rpg-autosave'),
      };
    });
    assert.notDeepEqual([moved.x, moved.y], [loaded.x, loaded.y]);
    assert.equal(JSON.parse(moved.manual).version, 4);
    if (moved.autosave) assert.equal(JSON.parse(moved.autosave).version, 4);

    await page.evaluate(() => {
      window.__PHASER_GAME__.scene.getScene('WorldMapScene').loadMap('overworld');
    });
    await page.waitForFunction(
      () => window.__PHASER_GAME__.scene.getScene('WorldMapScene').currentMapId === 'overworld',
      { timeout: 5_000 }
    );

    const frameStats = await page.evaluate(async () => {
      const samples = [];
      let previous = performance.now();
      const until = previous + 2_000;
      while (performance.now() < until) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        samples.push(now - previous);
        previous = now;
      }
      samples.sort((a, b) => a - b);
      return {
        frames: samples.length,
        p95Ms: samples[Math.floor(samples.length * 0.95)],
        maxMs: samples[samples.length - 1],
      };
    });

    await page.evaluate((monster) => {
      const world = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      world.currentEncounterZone ||= 'plains';
      world.startBattle(monster);
    }, MONSTER);
    await page.waitForFunction(
      () => window.__PHASER_GAME__.scene.isActive('BattleScene'),
      { timeout: 10_000 }
    );

    assert.deepEqual(errors, []);
    const result = {
      profile: 'v1.17.1-ipad-hud-walk',
      bootMs,
      loadedSave: { version: 4, mapId: loaded.mapId },
      movement: { from: [loaded.x, loaded.y], to: [moved.x, moved.y] },
      mapTransition: 'overworld',
      battleEntry: true,
      textures: { regularMonsters: loaded.monsters, heroWalk: loaded.heroWalk },
      frameStats,
      errors: errors.length,
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
