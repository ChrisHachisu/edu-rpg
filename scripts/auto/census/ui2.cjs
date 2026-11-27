'use strict';
// Day 4 census, group 1 (UI) additions to ui.cjs, one language per run:
//   node scripts/auto/census/ui2.cjs <en|ja-kana|ja-kanji> [part ...]
// parts: fold (quest panel folded / open / empty)  keypad (keypad quiz: empty, typed, notepad, wrong, right, critical, victory, level up)
//        buttons (the four-choice quiz via localStorage qok-keypad=0: question, right, wrong)  questcard (quest complete card)  grades (quiz at grade K, 3, 6)
const fs = require('fs'), path = require('path');
const C = require('./clib.cjs');
const { L } = C;
const LANG = C.LANGS.find(l => l.tag === (process.argv[2] || 'en'));
if (!LANG) throw new Error('lang?');
const PARTS = process.argv.slice(3).length ? process.argv.slice(3) : ['fold', 'questcard', 'keypad', 'crit', 'buttons', 'grades'];
const LG = { locale: LANG.locale, kanji: LANG.kanji };
const nm = s => `ui-${s}-${LANG.tag}`;
let page;
// A battle message advances on a timer: hold the scene clock while the picture is taken, then let it run.
const hold = v => page.evaluate(v => { try { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); if (b && b.time && window.__PHASER_GAME__.scene.isActive('BattleScene')) b.time.paused = v; } catch (e) {} }, v).catch(() => {});
const snap = async (s, shows, how, extra = {}) => { await hold(true); try { return await C.snap(page, nm(s), { area: 'ui', lang: LANG.tag, shows, how, ...extra }); } finally { await hold(false); } };
async function tap(sel, timeout = 4000) {
  const loc = page.locator(sel).first();
  try { await loc.waitFor({ state: 'visible', timeout }); await loc.tap({ timeout }); return true; }
  catch (e) { try { await loc.click({ timeout: 1500, force: true }); return true; } catch (e2) { C.log('tap miss', sel); return false; } }
}
const active = k => page.evaluate(k => window.__PHASER_GAME__.scene.isActive(k), k).catch(() => false);
const uiText = () => page.evaluate(() => { const e = document.querySelector('#qok-ui .msg') || document.querySelector('#qok-ui'); return e ? e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160) : ''; }).catch(() => '');
async function encounter(maxMs = 45000) {
  await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
  const t0 = Date.now(); let dir = 1;
  while (Date.now() - t0 < maxMs) { if (await active('BattleScene')) return true; await L.stick(page, dir, 0, 900); dir = -dir; }
  return active('BattleScene');
}
const bstate = () => page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { on: g.scene.isActive('BattleScene'), phase: b && b.phase,
  q: !!document.querySelector('#qok-ui .kpad, [data-act="quizAns"]'), kp: !!document.querySelector('#qok-ui .kpad'), forPlayer: b && b.quizForPlayer, over: g.scene.isActive('GameOverScene') }; }).catch(() => ({ on: false }));
const typeTaps = async v => { for (const c of String(v).replace('-', '')) await tap(`[data-act="kpKey"][data-k="${c}"]`, 1500); if (String(v).startsWith('-')) await tap('[data-act="kpKey"][data-k="pm"]', 1500); };
const answers = () => page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'), a = (b.quizQuestion && b.quizQuestion.answers) || []; return { right: a.findIndex(x => x.isCorrect), wrong: a.findIndex(x => !x.isCorrect), rt: a.filter(x => x.isCorrect).map(x => x.text.en)[0] }; });
const wrongNumber = async () => { const a = await answers(); return String((Number(a.rt) || 0) + 1); };
// answer the live quiz: right or wrong, by whichever input mode is up
async function answer(right) {
  const st = await bstate();
  if (st.kp) { const v = right ? String((await answers()).rt) : await wrongNumber(); await typeTaps(v); await tap('[data-act="kpKey"][data-k="go"]', 1500); }
  else { const a = await answers(); await tap(`[data-act="quizAns"][data-i="${right ? a.right : a.wrong}"]`, 2000); }
}

// A whole fight with every distinct stage photographed. mode: keypad | buttons.
async function fight(prefix, opts = {}) {
  const { grade = '3', wrongFirst = true, extras = true } = opts; let lastTx = '', dmgShot = false, sameTx = '', sameSince = Date.now();
  await C.boot(page, { ...LG, mapId: 'overworld', x: 72, y: 270, mutate: s => { Object.assign(s.player, { quizDifficulty: grade, level: 4, exp: 99, expToNext: 100, atk: opts.weak ? 1 : 999, hp: 9999, maxHp: 9999, timerEnabled: !!opts.timer }); } },
    prefix.startsWith('buttons') ? { extra: { 'qok-keypad': '0' } } : {});
  if (!(await encounter())) { C.log('no encounter'); return; }
  if (process.env.CENSUS_DEBUG) await page.evaluate(() => { window.__LOG = []; let last = ''; setInterval(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'), t = ((document.querySelector('#qok-ui .msg') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 70); const k = [b && b.phase, g.scene.getScenes(true).map(x => x.scene.key).join('+'), t].join(' | '); if (k !== last) { last = k; window.__LOG.push(Math.round(performance.now() / 100) / 10 + ' ' + k); } }, 100); });
  await page.waitForTimeout(1800);
  if (!opts.only) await snap(`${prefix}-start`, 'battle opening: monster and intro box', 'random encounter');
  const seen = new Set(); let q = 0, msgs = 0, t0 = Date.now(), menuShot = false, notepadShot = false, typedShot = false, critShot = false, lvShot = false, vicShot = false;
  while (Date.now() - t0 < 150000) {
    const s = await bstate();
    if (s.over || !s.on || (opts.stopAfterCrit && critShot)) break;
    if (s.phase === 'playerMenu') { if (!menuShot) { menuShot = true; await page.waitForTimeout(300); if (!opts.only) await snap(`${prefix}-menu`, 'battle command menu (Fight / Guard / Items / Run)', 'battle'); } await tap('[data-act="battleMenu"][data-i="0"]', 1500); await page.waitForTimeout(600); continue; }
    if (s.q) {
      await page.waitForTimeout(500); q++;
      const who = s.forPlayer === false ? 'enemy turn (Defend)' : 'your turn (Attack)';
      if (!opts.only && (q <= 2 || (s.forPlayer === false && !seen.has('enemyq')))) { seen.add('enemyq'); await snap(`${prefix}-quiz${q}`, `quiz question ${q}, ${who}, grade ${grade}, ${s.kp ? 'keypad' : 'four choice buttons'}`, 'Fight > quiz'); }
      if (s.kp && q === 1 && extras) {
        await tap('[data-act="kpKey"][data-k="note"]', 1500); await page.waitForTimeout(500);
        const np = await page.evaluate(() => { const e = document.getElementById('qok-notepad'); if (!e || e.style.display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
        if (np) { await page.mouse.move(np.x + 40, np.y + 50); await page.mouse.down(); await page.mouse.move(np.x + 150, np.y + 100, { steps: 8 }); await page.mouse.move(np.x + 90, np.y + 150, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300); notepadShot = true;
          await snap(`${prefix}-notepad`, 'keypad quiz with the notepad open and a pen stroke drawn', 'tap Notepad, draw with a finger');
          await page.locator('#qok-notepad [data-np="close"]').tap().catch(() => {}); await page.waitForTimeout(400); }
        const w = await wrongNumber(); await typeTaps(w.length > 1 ? w : w); await page.waitForTimeout(250);
        await snap(`${prefix}-typed`, 'keypad with a typed answer in the display, before pressing Attack', 'type digits');
        await tap('[data-act="kpKey"][data-k="go"]', 1500); await page.waitForTimeout(450);
        await snap(`${prefix}-wrong`, 'right after a WRONG keypad answer (typed value struck out next to the right one)', 'typed a wrong number, Attack');
        await page.waitForTimeout(900); continue;
      }
      if (!s.kp && q === 1 && wrongFirst) { await answer(false); await page.waitForTimeout(450); await snap(`${prefix}-wrong`, 'right after a WRONG answer on the four-button quiz', 'tapped a wrong choice'); await page.waitForTimeout(900); continue; }
      // answer right at once (a fast right answer is a critical hit)
      await answer(true); await page.waitForTimeout(350);
      if (!seen.has('right') && !opts.only) { seen.add('right'); await snap(`${prefix}-right`, 'right after a RIGHT answer (fast: critical window)', 'right answer at once'); }
      await page.waitForTimeout(500); continue;
    }
    if (s.phase === 'message') {
      const tx = await uiText();
      if (tx && tx !== lastTx && msgs < 14) {
        lastTx = tx; msgs++;
        const crit = /critical|クリティカル/i.test(tx), lv = /level \d|reached|レベル/i.test(tx), vic = /victory|勝利|しょうり/i.test(tx), dmg = /damage|ダメージ/i.test(tx) && !/softened|attacks/i.test(tx);
        const tag = crit && !critShot ? 'critical' : lv && !lvShot ? 'levelup' : vic && !vicShot ? 'victory' : dmg && !dmgShot ? 'hit' : `msg${msgs}`;
        if (tag === 'critical') critShot = true; if (tag === 'levelup') { lvShot = true; vicShot = true; } if (tag === 'victory') vicShot = true; if (tag === 'hit') dmgShot = true;
        if (!(opts.only && !/critical|levelup|victory|hit/.test(tag))) await snap(`${prefix}-${tag}`, `battle message box: "${tx.slice(0, 90)}"`, 'battle messages in order, polled every 120 ms');
      }
      if (tx !== sameTx) { sameTx = tx; sameSince = Date.now(); }
      if (Date.now() - sameSince > 2500) { sameSince = Date.now(); await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); try { if (b && b._messageCallback) b.advanceMessage(); } catch (e) {} }); }   // messages advance by themselves; only a stuck one is pushed
      await page.waitForTimeout(100); continue;
    }
    if (process.env.CENSUS_DEBUG) C.log('other phase', s.phase, (await uiText()).slice(0, 80), await page.evaluate(() => [...document.querySelectorAll('#qok-ui [data-act]')].map(e => e.dataset.act).join(',')));
    await page.waitForTimeout(300); await tap('[data-act="battleAdvance"]', 300);
  }
  // the results (victory, experience, level up) may come as boxes on the field after the battle closes
  let fm = 0;
  for (let i = 0; i < 16; i++) {
    const w = await page.evaluate(() => { const g = window.__PHASER_GAME__, wm = g.scene.getScene('WorldMapScene'), c = document.getElementById('qok-quest-completion'); return { msg: !!(wm && wm.showingMessage), tx: wm && wm.messageText && wm.messageText.text || '', card: !!(c && !c.hidden), vic: g.scene.isActive('VictoryScene'), bat: g.scene.isActive('BattleScene') }; }).catch(() => ({}));
    if (process.env.CENSUS_DEBUG) C.log('after', JSON.stringify(w));
    if (w.msg && fm < 6) { fm++; const tx = String(w.tx).replace(/\s+/g, ' ').slice(0, 90); const lv = /level|レベル/i.test(tx);
      await snap(`${prefix}-field-${lv ? 'levelup' : 'msg' + fm}`, `field message after the battle: "${tx}"`, 'results box on the field'); await page.keyboard.press('z').catch(() => {}); await page.waitForTimeout(500); continue; }
    if (w.card) { await snap(`${prefix}-card`, 'quest card after the battle', 'card'); await page.locator('#qok-quest-completion .qqc-dismiss').tap({ timeout: 2000 }).catch(() => {}); continue; }
    await page.waitForTimeout(400);
  }
  await snap(`${prefix}-after`, 'field right after the battle (results gone)', 'battle over');
  if (process.env.CENSUS_DEBUG) C.log('LOG\n' + (await page.evaluate(() => window.__LOG)).join('\n'));
  C.log('fight done', prefix, JSON.stringify({ q, msgs, critShot, lvShot, vicShot, notepadShot }));
}

async function partFold() {
  await C.boot(page, { ...LG, mapId: 'overworld', x: 69, y: 258, activeQuests: ['kikisChallenge', 'owlsLesson', 'drakeCargo'] }); await page.waitForTimeout(1500);
  await snap('quests-open', 'field with the Quests panel open (three active quests, entries collapsed)', 'seeded save, panel at default');
  if (await page.locator('.qfq-title').count()) { await tap('.qfq-title'); await page.waitForTimeout(500); await snap('quests-entry-open', 'Quests panel, first entry expanded to show the objective', 'tap a quest title'); }
  await tap('#qfh-quest-toggle'); await page.waitForTimeout(600);
  await snap('quests-folded', 'Quests panel folded to its header bar', 'tap the Quests header');
  await C.boot(page, { ...LG, mapId: 'overworld', x: 69, y: 258, activeQuests: [] }); await page.waitForTimeout(1500);
  await snap('quests-empty', 'Quests panel with an empty activeQuests list in the save (the game still lists its story quest)', 'seeded save, no quests');
}
async function partQuestcard() {
  await C.boot(page, { ...LG, mapId: 'overworld', x: 69, y: 258 }); await page.waitForTimeout(1200);
  await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), Z = window.__QOK && window.__QOK.Z;
    w.showQuestCompleteNotification(Z ? Z('quest.owlsLesson.title') : 'Quest', { exp: 100, gold: 30, items: [{ itemId: 'potion', quantity: 3 }] }); });
  await page.waitForTimeout(900);
  await snap('quest-complete-card', 'Quest complete card with reward rows (EXP, gold, an item)', 'WorldMapScene.showQuestCompleteNotification as quests do on completion');
  await page.locator('#qok-quest-completion .qqc-dismiss').tap({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500);
}
async function partKeypad() { await fight('keypad', { grade: '3' }); }
async function partCrit() { await fight('keypadcrit', { grade: '3', wrongFirst: false, extras: false, only: true, weak: true, timer: true, stopAfterCrit: true }); }
async function partButtons() { await fight('buttons', { grade: '3', wrongFirst: true, extras: false }); }
async function partGrades() {
  for (const g of ['k', '6']) {
    await C.boot(page, { ...LG, mapId: 'overworld', x: 72, y: 270, mutate: s => { Object.assign(s.player, { quizDifficulty: g, level: 6, atk: 999, hp: 9999, maxHp: 9999 }); } });
    if (!(await encounter())) continue;
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 60000 && n < 3) {
      const s = await bstate(); if (!s.on) break;
      if (s.phase === 'playerMenu') { await tap('[data-act="battleMenu"][data-i="0"]', 1500); await page.waitForTimeout(600); continue; }
      if (s.q) { await page.waitForTimeout(500); n++; await snap(`quiz-grade${g}-${n}`, `quiz question at grade ${g.toUpperCase()}, ${s.kp ? 'keypad' : 'buttons'}`, 'Fight > quiz'); await answer(true); await page.waitForTimeout(900); continue; }
      if (s.phase === 'message') { await tap('[data-act="battleAdvance"]', 800); await page.waitForTimeout(400); continue; }
      await page.waitForTimeout(300);
    }
  }
}
(async () => {
  const o = await C.open(); page = o.page;
  const F = { fold: partFold, questcard: partQuestcard, keypad: partKeypad, buttons: partButtons, crit: partCrit, grades: partGrades };
  for (const p of PARTS) { C.log('PART', p, LANG.tag); try { await F[p](); } catch (e) { C.log('PART ERR', p, String(e).slice(0, 300)); try { await snap(p + '-error', 'state when the part failed: ' + String(e).slice(0, 120), 'error'); } catch (e2) {} } }
  await o.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
