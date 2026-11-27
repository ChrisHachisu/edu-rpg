'use strict';
// ad-hoc probes for day-4 triage: node dbg_d4.cjs <name>
const D = require('./d4lib.cjs'); const { X, L, recSave, J, dig, tap } = D;
const name = process.argv[2];
(async () => {
  const S = await X.launchX(), page = S.page;
  const boot = async (save, town) => { await D.freshLS(page, D.slotLS({ 1: { auto: save, town } }, 1)); await D.waitTitleSlots(page); const r = await D.loadSlotUI(page, 1, 0); if (!r.ok) throw new Error(J(r)); await L.noEncounters(page); };
  if (name === 'defeat') {
    await boot(recSave('ironMine:f2', s => { s.player.gold = 1001; }), { mapId: 'ironkeep', x: 32.5, y: 56.5 });
    await page.evaluate(() => { window.__GAME_STATE__.player.state.hp = 1; });
    console.log('start', await D.startFight(page, 'bandit')); await page.waitForTimeout(4000); let s = await D.bst(page); console.log('menu', J(s), J(await page.evaluate(() => window.__PHASER_GAME__.scene.getScenes(true).map(s => s.scene.key))));
    for (let i = 0; i < 40; i++) { s = await D.bst(page); console.log(i, J(s)); if (s.go || !s.on) break;
      if (s.phase === 'playerMenu') await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); b.menuIndex = 0; b.confirmMenuAction(); });
      else if (/Quiz/.test(s.phase)) await D.answer(page, false);
      else if (s.phase === 'message') await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); b.advanceMessage(); });
      await page.waitForTimeout(500); }
    await X.jpeg(page, '/home/user/work/d4/x/dbg', 'defeat'); console.log(J(await page.evaluate(() => window.__PHASER_GAME__.scene.getScenes(true).map(s => s.scene.key))));
  }
  if (name === 'grade') {
    await boot(recSave('ironkeep:gate'));
    await tap(page, '#fieldTabs [data-fi="3"]'); await page.waitForTimeout(1200);
    const keys = await page.evaluate(() => window.__PHASER_GAME__.scene.getScene('MenuScene').settingsList); console.log(J(keys));
    const i = keys.indexOf('difficulty');
    for (let k = 0; k < 3; k++) { const t = await tap(page, `[data-act="setting"][data-i="${i}"]`); await page.waitForTimeout(500);
      console.log('tap', t, J(await page.evaluate(() => ({ g: window.__GAME_STATE__.player.state.quizDifficulty, qm: window.__GAME_STATE__.quizManager.difficulty, label: [...document.querySelectorAll('[data-act="setting"]')][0] && document.querySelectorAll('[data-act="setting"]')[0].innerText })))); }
    await X.jpeg(page, '/home/user/work/d4/x/dbg', 'grade');
    await tap(page, '[data-act="close"]'); await page.waitForTimeout(800);
    const g = await page.evaluate(() => window.__GAME_STATE__.player.state.quizDifficulty);
    await D.startFight(page, 'bandit'); await D.untilPhase(page, ['playerMenu'], 20000); await tap(page, '[data-act="battleMenu"][data-i="0"]', 3000); await D.untilPhase(page, ['playerQuiz'], 15000);
    console.log('state grade', g, J(await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return { q: b.quizQuestion && b.quizQuestion.gradeLevel, qtext: document.querySelector('#qok-ui').innerText.slice(0, 120), qm: Object.keys(window.__GAME_STATE__.quizManager).slice(0, 20) }; })));
  }
  if (name === 'kp0') {
    await boot(recSave('ironkeep:gate'));
    await page.evaluate(() => localStorage.setItem('qok-keypad', '0'));
    await D.startFight(page, 'bandit'); await D.untilPhase(page, ['playerMenu'], 20000); await tap(page, '[data-act="battleMenu"][data-i="0"]', 3000); await page.waitForTimeout(2000);
    console.log(J(await D.bst(page)), J(await page.evaluate(() => ({ kpad: !!document.querySelector('#qok-ui .kpad'), ch: document.querySelectorAll('[data-act="quizAns"]').length, txt: document.querySelector('#qok-ui').innerText.slice(0, 200) }))));
    await X.jpeg(page, '/home/user/work/d4/x/dbg', 'kp0');
  }
  if (name === 'title5') {
    const t0 = Date.now(), A = recSave('greenhollow:gate'), M = recSave('millbrook:gate'), C = recSave('demonCastle:boss');
    await D.freshLS(page, D.slotLS({ 1: { auto: A, save: M }, 5: { auto: C, save: C, clear: { t: t0, count: 1, ng: { inventory: [], equipment: {}, gold: 5, heroName: 'M', heroColor: 'gray' } } } }, 1)); await D.waitTitleSlots(page);
    await X.jpeg(page, '/home/user/work/d4/x/dbg', 'title5a');
    console.log(J(await page.evaluate(() => ({ loc: window.__QOK.loc(), ls: localStorage.getItem('edu-rpg-locale'), nav: navigator.language, st: window.__GAME_STATE__ && window.__GAME_STATE__.player && window.__GAME_STATE__.player.state && window.__GAME_STATE__.player.state.locale }))));
    await tap(page, '[data-act="titleSlots"]'); await page.waitForTimeout(800); await X.jpeg(page, '/home/user/work/d4/x/dbg', 'title5b');
    console.log(J(await page.$$eval('[data-act="slotPick"]', es => es.map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 60)))));
  }

  if (name === 'old') {
    const V = {
      locale_missing: s => { delete s.player.locale; },
      equipment_null: s => { s.player.equipment = null; },
      map_unknown: s => { s.player.position.mapId = 'noSuchPlace'; },
      flags_null: s => { s.player.storyFlags = null; },
      v3_shape: s => { s.version = 3; for (const k of ['kanjiMode', 'masterVolume', 'timerEnabled', 'questProgress']) delete s.player[k]; },
      boss_item_missing: s => { s.player.storyFlags['boss.sandGolem.defeated'] = true; s.player.inventory = s.player.inventory.filter(i => i.itemId !== 'flameCloak'); s.player.equipment = { weapon: null, armor: null, shield: null, helmet: null, accessory: null }; },
    };
    for (const n of process.argv.slice(3)) {
      S.errors.splice(0);
      await D.freshLS(page, D.slotLS({ 1: { auto: (() => { const s = recSave('ironMine:f2'); V[n](s); return s; })() } }, 1)); await D.waitTitleSlots(page).catch(() => {});
      const r = await D.loadSlotUI(page, 1, 0).catch(e => ({ ok: false, why: String(e) })); await page.waitForTimeout(6000);
      const st = await page.evaluate(() => ({ scenes: window.__PHASER_GAME__.scene.getScenes(true).map(s => s.scene.key), cover: window.__QOK_COVER__ && window.__QOK_COVER__.phase && window.__QOK_COVER__.phase(), msg: (() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w && w.showingMessage && w.messageText && w.messageText.text; })(), body: document.body.innerText.slice(0, 150) }));
      console.log(n, J({ ok: r.ok, why: r.why && r.why.slice(0, 60), st, errs: S.errors.slice(0, 3) }));
      await X.jpeg(page, '/home/user/work/d4/x/dbg', 'old-' + n);
      if (n === 'boss_item_missing') { for (let i = 0; i < 6; i++) { const d = await dig(page); console.log('  dig', J({ msg: d.msg, scenes: d.scenes, inv: d.inv.flameCloak, hero: d.hero })); await D.dismissMsgs(page, 1); await page.waitForTimeout(800); } console.log(J(await D.canMove(page))); }
    }
  }

  if (name === 'retry') {
    const sv = recSave('ironMine:f2'); delete sv.player.locale; const good = recSave('ironkeep:gate'); good.timestamp = Date.now() - 100000;
    await D.freshLS(page, D.slotLS({ 1: { auto: sv, save: good } }, 1)); await D.waitTitleSlots(page);
    await D.loadSlotUI(page, 1, 0).catch(() => {}); await page.waitForTimeout(4000);
    for (let i = 0; i < 2; i++) { const t = await tap(page, '[data-act="coverRetry"], button:has-text("Retry")', 3000); await page.waitForTimeout(6000);
      console.log('retry', i, t, J(await page.evaluate(() => ({ scenes: window.__PHASER_GAME__.scene.getScenes(true).map(s => s.scene.key), cover: window.__QOK_COVER__.phase(), body: document.body.innerText.slice(0, 80) })))); }
    await page.reload({ waitUntil: 'load' }); const how = await D.afterKill(page, 1, 1); console.log('after reload, load the manual save', J(how), J(await dig(page).catch(e => String(e))));
    await page.reload({ waitUntil: 'load' }); const how2 = await D.afterKill(page, 0, 1); console.log('after reload, load the bad auto again', J(how2));
    console.log(J(await page.evaluate(() => document.body.innerText.slice(0, 100))));
  }
  await S.browser.close();
})().catch(e => { console.log('ERR', e); process.exit(1); });
