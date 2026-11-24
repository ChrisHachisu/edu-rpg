'use strict';
// Census of UI screens, one language per run:
//   node scripts/auto/census/ui.cjs <en|ja-kana|ja-kanji> [part ...]
// parts: title menu town battle defeat boss dungeon ending (default: all but ending)
// Every screen is reached the way a player reaches it (title buttons, the field tabs, a walk into a
// town and up to a person, a real encounter, a walk into a chest / crystal / boss), from a seeded save.
const fs = require('fs'), path = require('path');
process.env.PT_SHOTS = process.env.PT_SHOTS || '/home/user/work/census/pt-shots';
process.env.PT_DIR = process.env.PT_DIR || '/home/user/work/census/pt';
const C = require('./clib.cjs');
const { L } = C;
const ptsrc = fs.readFileSync(path.join(C.ROOT, 'scripts/acts/probe/playthrough/ptlib.cjs'), 'utf8');
const HELP = ptsrc.slice(ptsrc.indexOf('const HELP = () => {') + 'const HELP = '.length, ptsrc.indexOf('\nclass Session')).trim().replace(/;\s*$/, '');
const LANG = C.LANGS.find(l => l.tag === (process.argv[2] || 'en'));
if (!LANG) throw new Error('lang?');
const PARTS = process.argv.slice(3).length ? process.argv.slice(3) : ['title', 'menu', 'town', 'battle', 'defeat', 'boss', 'dungeon'];
const LG = { locale: LANG.locale, kanji: LANG.kanji };
const nm = s => `ui-${s}-${LANG.tag}`;
let page, errors;
const snap = (s, shows, how) => C.snap(page, nm(s), { area: 'ui', lang: LANG.tag, shows, how });
async function tap(sel, timeout = 5000) {
  const loc = page.locator(sel).first();
  try { await loc.waitFor({ state: 'visible', timeout }); await loc.tap({ timeout }); return true; }
  catch (e) { try { await loc.click({ timeout: 2000, force: true }); return true; } catch (e2) { C.log('tap miss', sel); return false; } }
}
const active = k => page.evaluate(k => window.__PHASER_GAME__.scene.isActive(k), k).catch(() => false);
async function setKanji() { if (LANG.kanji) await page.evaluate(() => { try { window.__GAME_STATE__.player.state.kanjiMode = true; } catch (e) {} }); }

// ---------------------------------------------------------------- title, slots, new game
async function partTitle() {
  // empty device
  await page.goto(L.URL_, { waitUntil: 'domcontentloaded' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'load' });
  await L.toTitle(page); await page.waitForTimeout(1500);
  if (LANG.locale === 'ja') { await setKanji(); await tap('[data-act="titleLang"]'); await page.waitForTimeout(800); }
  await snap('title-empty', 'title screen on a device with no saves', 'fresh localStorage, boot');
  if (await page.locator('[data-act="titleSlots"]').count()) {
    await tap('[data-act="titleSlots"]'); await page.waitForTimeout(700);
    await snap('slots-empty', 'save slot list, all empty', 'title > Start/slots');
    await tap('[data-act="slotPick"][data-i="1"]'); await page.waitForTimeout(1500);
  } else { await tap('[data-act="titleNew"]'); await page.waitForTimeout(1500); }
  await setKanji();
  await page.waitForSelector('[data-act="introStart"]', { timeout: 15000 }).catch(() => {});
  await snap('newgame', 'new game / character setup screen', 'empty slot > new game');
  const name = page.locator('#qok-name');
  if (await name.count()) { await name.fill(LANG.locale === 'ja' ? 'ミカ' : 'Mika'); await page.waitForTimeout(400); await snap('newgame-named', 'character setup with a name typed', 'typed in the name field'); }
  // grade picker if present
  if (await page.locator('[data-act="introGrade"]').count()) { await tap('[data-act="introGrade"]'); await page.waitForTimeout(600); await snap('newgame-grade', 'character setup after tapping the grade control', 'tap introGrade'); }
  // filled + cleared slots
  const base = L.save({ mapId: 'overworld', x: 69, y: 256, locale: LANG.locale, kanjiMode: LANG.kanji, flags: L.allFlags() }); base.player.name = LANG.locale === 'ja' ? 'ミカ' : 'Mika'; base.playtime = 3 * 3600 + 1234;
  const s2 = JSON.parse(JSON.stringify(base)); s2.player.position = { mapId: 'overworld', x: 85, y: 32, floor: 1 }; s2.player.name = LANG.locale === 'ja' ? 'ソラ' : 'Sora';
  const clear = { t: Date.now(), count: 1, ng: { inventory: [{ itemId: 'herb', quantity: 3 }], equipment: {}, gold: 900, heroName: s2.player.name, heroColor: 'gray' } };
  await page.evaluate(([a, b, c]) => { localStorage.clear(); localStorage.setItem('qok-slots-v1', '1'); localStorage.setItem('qok-active-slot', '1');
    localStorage.setItem('edu-rpg-save', a); localStorage.setItem('qok-slot-1-save', a); localStorage.setItem('qok-slot-2-save', b); localStorage.setItem('qok-slot-2-clear', c); },
  [JSON.stringify(base), JSON.stringify(s2), JSON.stringify(clear)]);
  await page.reload({ waitUntil: 'load' }); await L.toTitle(page); await page.waitForTimeout(1500);
  const ja = await page.evaluate(() => { try { return window.__QOK.loc() === 'ja'; } catch (e) { return null; } });
  if ((LANG.locale === 'ja') !== !!ja) await tap('[data-act="titleLang"]');
  await setKanji(); if (LANG.kanji) { await tap('[data-act="titleLang"]'); await tap('[data-act="titleLang"]'); }
  await page.waitForTimeout(800);
  await snap('title-saves', 'title screen with saves on the device', 'slot 1 filled, slot 2 cleared');
  if (await page.locator('[data-act="titleSlots"]').count()) {
    await tap('[data-act="titleSlots"]'); await page.waitForTimeout(700);
    await snap('slots-filled', 'save slot list: slot 1 filled, slot 2 cleared, 3-5 empty', 'title > slots');
    await tap('[data-act="slotPick"][data-i="2"]'); await page.waitForTimeout(700);
    await snap('slot-cleared', 'cleared slot opened: Continue / New Game+ choices', 'slots > slot 2');
    if (await page.locator('[data-act="slotDelAsk"]').count()) { await tap('[data-act="slotDelAsk"]'); await page.waitForTimeout(500); await snap('slot-delete-ask', 'delete-slot confirmation', 'slot 2 > delete'); await tap('[data-act="slotDelCancel"]'); await page.waitForTimeout(400); }
    if (await page.locator('[data-act="slotNgPlus"]').count()) { await tap('[data-act="slotNgPlus"]'); await page.waitForTimeout(1500); await setKanji(); await snap('ngplus-setup', 'New Game+ start screen', 'slot 2 > New Game+'); }
  }
}

// ---------------------------------------------------------------- field tabs, quest log, minimap
async function partMenu() {
  await C.boot(page, { ...LG, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge', 'owlsLesson'],
    inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'potion', quantity: 2 }, { itemId: 'ironSword', quantity: 1 }, { itemId: 'leatherArmor', quantity: 1 }] });
  await page.waitForTimeout(1500);
  await snap('field-overworld', 'overworld field HUD: HP, place name, quest tracker, minimap/compass, tab bar', 'seeded save near Greenhollow');
  // quest tracker: open the first entry
  if (await page.locator('.qfq-title').count()) { await tap('.qfq-title'); await page.waitForTimeout(600); await snap('questlog-open', 'quest tracker with one entry opened', 'tap a quest title'); }
  // minimap toggle (collapse) if there is one
  const mm = await page.evaluate(() => { const e = document.querySelector('[class*="fmap"], #fieldMap, .fieldmap'); return e ? (e.id || e.className) : null; });
  const names = ['status', 'items', 'equip', 'settings'];
  for (let i = 0; i < 4; i++) {
    await tap(`#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200);
    if (!(await active('MenuScene'))) { await tap(`#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200); }
    await tap(`[data-act="tab"][data-i="${i}"]`, 1500); await page.waitForTimeout(700);
    await snap(`tab-${names[i]}`, `menu tab ${names[i]}`, `field tab bar > ${names[i]}`);
    if (names[i] === 'equip' && await page.locator('[data-act="equipSlot"]').count()) { await tap('[data-act="equipSlot"]'); await page.waitForTimeout(600); await snap('tab-equip-pick', 'equip: picking gear for a slot', 'equip > tap a slot'); }
    if (names[i] === 'settings' && await page.locator('[data-act="quitAsk"]').count()) { await tap('[data-act="quitAsk"]'); await page.waitForTimeout(500); await snap('tab-settings-quit', 'settings: quit to title confirmation', 'settings > quit'); await tap('[data-act="quitCancel"]'); await page.waitForTimeout(400); }
    await tap('[data-act="close"]', 2000); await page.waitForTimeout(800);
  }
  C.log('minimap el', mm);
}

// ---------------------------------------------------------------- town: talk, shop, healer
const PILOT = fs.readFileSync(path.join(C.ROOT, 'scripts/acts/probe/pilot.js'), 'utf8');
async function townHelp() { await page.evaluate(PILOT); await page.evaluate(`(${HELP})()`); }
// close every box the way ptlib's dismissAll does: the parent's Z key (pilot), the quest-complete card
async function closeAll(max = 30) {
  for (let i = 0; i < max; i++) {
    const s = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), c = document.getElementById('qok-quest-completion');
      return { msg: !!w.showingMessage, ov: !!(w.healerOverlayOpen || w.questOverlayOpen || w.midCrystalOverlayOpen || w.warpOverlayOpen), card: !!(c && !c.hidden) }; });
    if (s.card) { await page.locator('#qok-quest-completion .qqc-dismiss').tap({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); continue; }
    if (!s.msg) return i; await page.evaluate(() => window.__P.tapKey('z')); await page.waitForTimeout(320);
  }
}
async function townKey() { await page.evaluate(() => window.__PTH.pressTalk()); }
async function partTown() {
  const d = C.LANDMARKS.find(l => l.mapId === 'greenhollow');
  await C.boot(page, { ...LG, mapId: 'overworld', x: d.exit[0], y: d.exit[1], activeQuests: ['kikisChallenge'], inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'potion', quantity: 2 }] });
  await L.walkCells(page, [d.at], { maxMs: 25000 });
  await page.waitForFunction(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(3500); await townHelp();
  await snap('town-arrive', 'Greenhollow arrival (town banner / HUD in this language)', 'real walk in');
  // elder: long lines
  await page.evaluate(() => window.__PTH.walkToNpc('elder')); await page.waitForTimeout(800);
  await snap('town-talk-button', 'next to the elder: the talk button', 'walk to the elder');
  await townKey(); await page.waitForTimeout(1400); await snap('msg-elder-1', 'elder dialogue, first box', 'talk');
  await townKey(); await page.waitForTimeout(1200); await snap('msg-elder-2', 'elder dialogue, second box', 'advance');
  await closeAll();
  // shop
  const gs = await page.evaluate(() => window.__PTH.walkToNpc('shopkeeper')); C.log('shop walk', JSON.stringify(gs).slice(0, 200)); await page.waitForTimeout(600); await townKey(); await page.waitForTimeout(1800);
  for (let i = 0; i < 4 && !(await active('ShopScene')); i++) { await closeAll(); await townKey(); await page.waitForTimeout(900); }
  if (await active('ShopScene')) {
    await snap('shop-buy', 'shop, buy list', 'talk to the shopkeeper');
    if (await page.locator('[data-act="shopBuy"]').count()) { await tap('[data-act="shopBuy"]'); await page.waitForTimeout(600); await snap('shop-buy-confirm', 'shop: buy confirmation card with quantity', 'tap an item'); await tap('[data-act="shopCancel"]'); await page.waitForTimeout(400); }
    await tap('[data-act="shopMode"][data-mode="sell"]'); await page.waitForTimeout(700); await snap('shop-sell', 'shop, sell list', 'shop > Sell');
    await tap('[data-act="shopLeave"]'); await page.waitForTimeout(1200);
  } else C.log('shop did not open');
  await closeAll();
  // healer
  await page.evaluate(() => { const s = window.__GAME_STATE__.player.state; s.hp = Math.floor(s.maxHp / 3); });
  const gh = await page.evaluate(() => window.__PTH.walkToNpc('healer')); C.log('healer walk', JSON.stringify(gh).slice(0, 200)); await page.waitForTimeout(600); await townKey(); await page.waitForTimeout(1500);
  const ho = await page.evaluate(() => !!window.__PHASER_GAME__.scene.getScene('WorldMapScene').healerOverlayOpen);
  await snap('healer', `healer / inn service (overlay open=${ho})`, 'talk to the healer at 1/3 HP');
  if (ho) { await tap('[data-act="healConfirm"]'); await page.waitForTimeout(1500); await snap('healer-done', 'after healing', 'healer > confirm'); }
}

// ---------------------------------------------------------------- battle (normal), quiz, level up
async function encounter(maxMs = 40000) {
  await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
  const t0 = Date.now(); let dir = 1;
  while (Date.now() - t0 < maxMs) {
    if (await active('BattleScene')) return true;
    await L.stick(page, dir, 0, 900); dir = -dir;
  }
  return active('BattleScene');
}
async function battleShots(prefix, { lose = false, grade = null, maxQuiz = 3 } = {}) {
  await page.waitForTimeout(2500);
  await snap(`${prefix}-start`, 'battle opening', 'random encounter / boss contact');
  let quiz = 0, t0 = Date.now(), menuShot = false, msgShot = false;
  while (Date.now() - t0 < 120000) {
    const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { on: g.scene.isActive('BattleScene'), phase: b && b.phase, over: g.scene.isActive('GameOverScene'), q: !!document.querySelector('#qok-ui .kpad, [data-act="quizAns"]') }; });
    if (s.over || !s.on) break;
    if (s.phase === 'playerMenu') { if (!menuShot) { menuShot = true; await snap(`${prefix}-menu`, 'battle command menu', 'battle'); } await tap('[data-act="battleMenu"][data-i="0"]', 2000); await page.waitForTimeout(700); continue; }
    if (s.q) {
      await page.waitForTimeout(500);
      if (quiz < maxQuiz) await snap(`${prefix}-quiz${quiz + 1}`, `quiz question ${quiz + 1}${grade ? ' (grade ' + grade + ')' : ''}`, 'Fight > quiz');
      const idx = await page.evaluate(lose => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); const a = (b.quizQuestion && b.quizQuestion.answers) || []; return lose ? a.findIndex(x => !x.isCorrect) : a.findIndex(x => !!x.isCorrect); }, lose);
      for (const qs of await C.L.quizTaps(page, idx)) await tap(qs, 2000); await page.waitForTimeout(500);
      if (quiz < 1) await snap(`${prefix}-answer`, lose ? 'right after a wrong answer' : 'right after a correct answer', 'tap an answer');
      quiz++; await page.waitForTimeout(500); continue;
    }
    if (s.phase === 'message') { if (!msgShot && quiz > 0) { msgShot = true; await snap(`${prefix}-message`, 'battle message after the answer', 'battle'); } const ok = await tap('[data-act="battleAdvance"]', 1200); if (!ok) await page.mouse.click(195, 600).catch(() => {}); await page.waitForTimeout(450); continue; }
    await page.waitForTimeout(300); await tap('[data-act="battleAdvance"]', 300);
  }
  // results / level up
  await page.waitForTimeout(800);
  return page.evaluate(() => ({ over: window.__PHASER_GAME__.scene.isActive('GameOverScene'), battle: window.__PHASER_GAME__.scene.isActive('BattleScene') }));
}
async function partBattle() {
  for (const grade of ['1', '3']) {
    await C.boot(page, { ...LG, mapId: 'overworld', x: 72, y: 270, mutate: s => { s.player.quizDifficulty = grade; s.player.level = 4; s.player.exp = 99; s.player.expToNext = 100; s.player.atk = 999; } });
    const ok = await encounter();
    if (!ok) { C.log('no encounter'); continue; }
    // capture before the battle loop closes it: results screens appear in the battle's last messages
    await page.waitForTimeout(2500);
    await snap(`battle-g${grade}-start`, `normal battle opening (grade ${grade})`, 'random encounter on the overworld');
    let n = 0; const t0 = Date.now(); let menu = false, msg = 0;
    while (Date.now() - t0 < 90000) {
      const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); const tx = document.querySelector('#qok-ui') ? document.querySelector('#qok-ui').innerText.slice(0, 200) : ''; return { on: g.scene.isActive('BattleScene'), phase: b && b.phase, q: !!document.querySelector('#qok-ui .kpad, [data-act="quizAns"]'), tx }; });
      if (!s.on) break;
      if (s.phase === 'playerMenu') { if (!menu) { menu = true; await snap(`battle-g${grade}-menu`, 'battle command menu', 'battle'); } await tap('[data-act="battleMenu"][data-i="0"]', 2000); await page.waitForTimeout(700); continue; }
      if (s.q) { await page.waitForTimeout(500); if (n < 2) await snap(`quiz-g${grade}-${n + 1}`, `quiz question (grade ${grade})`, 'Fight > quiz'); const idx = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return ((b.quizQuestion && b.quizQuestion.answers) || []).findIndex(x => x.isCorrect); });
        for (const qs of await C.L.quizTaps(page, idx)) await tap(qs, 2000); await page.waitForTimeout(700); if (n === 0) await snap(`quiz-g${grade}-correct`, 'feedback right after a correct answer', 'tap the right answer'); n++; continue; }
      if (s.phase === 'message') { if (msg < 4 && n > 0) { msg++; await snap(`battle-g${grade}-msg${msg}`, `battle message ${msg} after the answer (victory / exp / level up)`, 'battle'); } const ok2 = await tap('[data-act="battleAdvance"]', 1200); if (!ok2) await page.mouse.click(195, 600).catch(() => {}); await page.waitForTimeout(500); continue; }
      await page.waitForTimeout(300); await tap('[data-act="battleAdvance"]', 300);
    }
    await page.waitForTimeout(1500); await snap(`battle-g${grade}-after`, 'field right after the battle', 'battle won');
  }
}
async function partDefeat() {
  await C.boot(page, { ...LG, mapId: 'overworld', x: 72, y: 270, mutate: s => { s.player.hp = 1; s.player.def = 0; s.player.atk = 1; s.player.level = 2; s.player.maxHp = 10; } });
  if (!(await encounter())) { C.log('no encounter'); return; }
  const r = await battleShots('defeat', { lose: true, maxQuiz: 0 });
  await page.waitForTimeout(1500); await snap('gameover', `defeat / game over screen (over=${r.over})`, 'lost a normal battle by wrong answers');
}
// ---------------------------------------------------------------- boss fight, boss retry
async function partBoss() {
  for (const mode of ['win', 'lose']) {
    await C.boot(page, { ...LG, mapId: 'stormNest', floor: 5, x: 39, y: 33, all: false, flags: { 'boss.giantToad.defeated': true, 'boss.serpent.defeated': true },
      mutate: mode === 'lose' ? s => { s.player.hp = 1; s.player.def = 0; s.player.atk = 1; s.player.maxHp = 20; } : null });
    await page.waitForTimeout(1500);
    const t0 = Date.now(); while (Date.now() - t0 < 20000 && !(await active('BattleScene'))) { await L.stick(page, 0, -1, 600); await C.dismiss(page, 3); }
    if (!(await active('BattleScene'))) { await snap(`boss-${mode}-nobattle`, 'boss room, walking into the boss did not start a battle', 'stick up'); continue; }
    if (mode === 'win') { const r = await battleShots('boss', { maxQuiz: 1 }); await page.waitForTimeout(2500); await snap('boss-after', `after the boss battle (${JSON.stringify(r)})`, 'boss won'); await C.dismiss(page, 2); await page.waitForTimeout(500); await snap('boss-after-2', 'boss aftermath, next box', 'advance'); }
    else { await battleShots('bosslose', { lose: true, maxQuiz: 0 }); await page.waitForTimeout(1500); await snap('boss-retry', 'defeat screen after losing to a boss (retry option)', 'lost to Storm Harpy'); }
  }
}
// ---------------------------------------------------------------- chest, crystals
async function push(dx, dy, ms = 1200) { await L.stick(page, dx, dy, ms); await page.waitForTimeout(600); }
async function partDungeon() {
  await C.boot(page, { ...LG, mapId: 'sunkenCellar', floor: 1, x: 19, y: 17 }); await page.waitForTimeout(1500);
  await push(0, -1, 1400); await page.waitForTimeout(500);
  await snap('chest-open', 'opening a chest (message)', 'walked into a chest in Sunken Cellar 1F');
  await C.dismiss(page);
  await C.boot(page, { ...LG, mapId: 'sunkenCellar', floor: 1, x: 23, y: 22 }); await page.waitForTimeout(1500);
  await push(-1, 0, 1500); await page.keyboard.press('z').catch(() => {}); await page.waitForTimeout(1200);
  await snap('crystal-act1', 'Act 1 crystal (save / heal / warp) menu', 'walked into the crystal in Sunken Cellar 1F');
  await page.keyboard.press('x').catch(() => {}); await C.dismiss(page);
  await C.boot(page, { ...LG, mapId: 'stormNest', floor: 3, x: 11, y: 19 }); await page.waitForTimeout(1500);
  await push(0, -1, 1500); await page.waitForTimeout(600);
  await snap('crystal-act2-prompt', 'Act 2 crystal: prompt pill when touching it', 'walked into the crystal in Storm Nest 3F');
  await page.keyboard.press('z').catch(() => {}); await page.waitForTimeout(1200);
  await snap('crystal-act2', 'Act 2 crystal menu', 'Z at the crystal');
}
// ---------------------------------------------------------------- ending
async function partEnding() {
  await C.boot(page, { ...LG, mapId: 'demonCastle', floor: 9, x: 50, y: 10, all: true, inventory: [{ itemId: 'herb', quantity: 5 }] });
  await page.waitForTimeout(2000); await snap('ending-throne', 'Demon Castle throne room before the last boss', 'seeded below the throne');
  const t0 = Date.now(); while (Date.now() - t0 < 25000 && !(await active('BattleScene'))) { await L.stick(page, 0, -1, 600); const m = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').showingMessage); if (m) { await snap('ending-prebattle', 'dialogue before the last boss', 'walk up'); await C.dismiss(page); } }
  if (!(await active('BattleScene'))) { C.log('no final battle'); return; }
  await battleShots('final', { maxQuiz: 1 });
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(1000); const v = await active('VictoryScene'); if (v) break; const m = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w && w.showingMessage; }); if (m) { if (i < 6) await snap(`ending-dialog-${i}`, 'post-battle story box', 'after the final battle'); await C.dismiss(page, 1); } }
  await page.waitForTimeout(3000); await snap('ending-victory', 'ending (VictoryScene overlay)', 'beat the Demon King');
  await page.waitForTimeout(6000); await snap('ending-victory-later', 'ending, 6 s later', 'waited');
}
(async () => {
  const o = await C.open(); page = o.page; errors = o.errors;
  const F = { crystal1: async () => { await partDungeon(); }, title: partTitle, menu: partMenu, town: partTown, battle: partBattle, defeat: partDefeat, boss: partBoss, dungeon: partDungeon, ending: partEnding };
  for (const p of PARTS) { C.log('PART', p, LANG.tag); try { await F[p](); } catch (e) { C.log('PART ERR', p, String(e).slice(0, 300)); try { await C.snap(page, nm(p + '-error'), { area: 'ui', lang: LANG.tag, shows: 'state when the part failed: ' + String(e).slice(0, 120) }); } catch (e2) {} } }
  C.log('errors', JSON.stringify(errors.filter(e => !/favicon|audio|mp3|ogg/.test(e.m)).slice(0, 8)));
  await o.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
