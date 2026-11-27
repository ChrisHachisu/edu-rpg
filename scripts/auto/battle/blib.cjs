'use strict';
// Battle-screen helpers shared by scripts/auto/checks/battle-stage.cjs and scripts/auto/battle/pairs.cjs.
// A battle is started the way the bundle's startBattle does (WorldMapScene.scene.launch('BattleScene',
// { monster, zone })) from a seeded save standing on the right map; everything after that is real taps.
const fs = require('fs'), path = require('path');
const U = require('../checks/_uilib.cjs');
const { L } = U;
const ROOT = U.ROOT;
const JP = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/jump-points.json'), 'utf8'));
const FLOOR1 = {}; for (const a of JP.acts) for (const p of a.places) for (const q of p.points) if (q.kind === 'floor' && q.floor === 1) FLOOR1[p.map] = q.pos;
FLOOR1.sunkenCellar = FLOOR1.sunkenCellar || { mapId: 'sunkenCellar', x: 19, y: 17, floor: 1 };
// Overworld: one cell inside each encounter zone (Acts 3 and 4 share the zone id scorched-wastes).
const OW = { 'greenhollow-plains': [39, 345], 'whispering-woods': [100, 290], 'crystal-coast': [133, 348], 'iron-mountains': [209, 300],
  'scorched-wastes': [220, 190], 'scorched-wastes@act4': [240, 50], 'demons-threshold': [85, 60] };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Seeded save on a place. o: { mapId, x, y, floor, locale, kanji, player: {...}, ls: {...}, flags }
async function boot(page, o = {}) {
  const { player = {}, ls = {}, ...rest } = o;
  await U.boot(page, { ...rest, mutate: s => { Object.assign(s.player, { hp: 9999, maxHp: 9999 }, player); } }, { extra: ls, ready: false, settle: 1200 });
  // The loading cover must be gone before a battle pauses the world, or it can never finish ("could not finish loading").
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || !c.phase || c.phase() === 'active'; }, { timeout: 150000 }).catch(() => console.log('[INFO] loading cover still up after 150 s'));
  await page.waitForTimeout(500);
}
const bootMap = (page, mapId, o = {}) => { const p = FLOOR1[mapId]; if (!p) throw new Error('no floor-1 point for ' + mapId); return boot(page, { mapId, x: p.x, y: p.y, floor: 1, ...o }); };
const bootZone = (page, zone, o = {}) => boot(page, { mapId: 'overworld', x: OW[zone][0], y: OW[zone][1], floor: 1, ...o });

// The zone the game itself would use on this spot (overworld: getOverworldZone; dungeon: the map's own).
const zoneHere = page => page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), gs = window.__GAME_STATE__;
  if (w.currentMapId === 'overworld') return gs.getOverworldZone(w.heroTileX, w.heroTileY);
  const q = window.__QOK; const m = q && q.maps && q.maps[w.currentMapId]; return (m && m.encounterZone) || w.currentEncounterZone || null; });
async function launch(page, id, zone) {
  // never start a fight under the loading cover (it can come back for a moment after the last fight was left)
  await page.waitForFunction(() => { const c = window.__QOK_COVER__; return !c || !c.phase || c.phase() === 'active'; }, { timeout: 20000 }).catch(() => {});
  if (zone === undefined) zone = await zoneHere(page);
  return page.evaluate(({ id, zone }) => {
    const g = window.__PHASER_GAME__, wm = g.scene.getScene('WorldMapScene'), em = window.__GAME_STATE__.encounterManager, w = console.warn; console.warn = () => {};
    let m; try { m = em.rollEncounter({ monsters: [{ monsterId: id, weight: 1 }] }); } finally { console.warn = w; }
    if (!m) return 'no monster';
    if (zone) wm.currentEncounterZone = zone; wm.scene.launch('BattleScene', { monster: m, zone: zone || wm.currentEncounterZone }); wm.scene.pause();
    return 'launched';
  }, { id, zone });
}
const st = page => page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'), q = b && b.quizQuestion, r = document.getElementById('qok-ui');
  const m = r && /bg-([a-z_]+)\.webp/.exec(r.style.backgroundImage || '');
  return { on: g.scene.isActive('BattleScene'), phase: b && b.phase, mon: b && b.monster && b.monster.id, bg: m ? m[1] : null, zone: b && b.currentZone,
    kp: !!document.querySelector('#qok-ui .kpad'), choices: document.querySelectorAll('[data-act="quizAns"]').length,
    right: q ? String((q.answers.find(a => a.isCorrect) || {}).text.en) : null, rightIdx: q ? q.answers.findIndex(a => a.isCorrect) : -1, forPlayer: b && b.quizForPlayer,
    msg: (b && b.messageText && b.messageText.active && b.messageText.text) || '', ehp: b && b.engine && b.engine.monsterHp }; });
const advance = page => page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); if (b && b.phase === 'message' && b._messageCallback) b.advanceMessage(); });
// Step the battle until `want(s)` holds: intro and message boxes are advanced, the menu is answered with Attack.
async function until(page, want, { ms = 30000, attack = true } = {}) {
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) {
    s = await st(page);
    if (want(s)) return s;
    if (!s.on) { if (Date.now() - t0 < 5000) { await sleep(150); continue; } return s; }   // scene.launch starts the scene a frame or more later
    if (s.phase === 'message' || s.phase === 'intro') await advance(page);
    else if (s.phase === 'playerMenu' && attack) await U.tap(page, '[data-act="battleMenu"][data-i="0"]', 1500);
    await sleep(250);
  }
  return s;
}
const toMenu = page => until(page, s => s.on && s.phase === 'playerMenu', { attack: false });
const toQuiz = page => until(page, s => s.on && (s.phase === 'playerQuiz' || s.phase === 'enemyQuiz') && (s.kp || s.choices > 0));
// Answer the quiz that is up (right or wrong) with finger taps.
async function answer(page, right = true) {
  const s = await st(page); let idx = s.rightIdx;
  if (!right) idx = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('BattleScene').quizQuestion.answers.findIndex(a => !a.isCorrect));
  for (const sel of await U.quizTaps(page, idx)) await U.tap(page, sel, 2000);
}
async function leave(page) { await page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('BattleScene')) { g.scene.stop('BattleScene'); g.scene.resume('WorldMapScene'); } }); await sleep(500); }
// Boxes of the battle stage in CSS px: the name bar, the HUD panel under the enemy, the enemy as drawn
// (painted box when the fit wrapper is there, else the <img>), and the stage.
const boxes = page => page.evaluate(() => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const q = s => document.querySelector('#qok-ui ' + s);
  const hud = q('.hudwrap'), first = hud && hud.firstElementChild;
  return { vw: innerWidth, vh: innerHeight, name: R(q('.enemy-card')), stage: R(q('.bstage')), mon: R(q('.bmon')), fit: R(q('.bfit')), hud: R(first), shadow: R(q('.bshadow')),
    boss: !!q('.bmon.boss, .bfit.boss'), fly: !!q('.bfit.fly') };
});
module.exports = { U, L, ROOT, FLOOR1, OW, sleep, boot, bootMap, bootZone, zoneHere, launch, st, advance, until, toMenu, toQuiz, answer, leave, boxes };
