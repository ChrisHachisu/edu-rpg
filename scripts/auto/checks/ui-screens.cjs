'use strict';
// Overlay screens check (track F1, census 2026-11-23). Guards:
//   m4   the quiz header is readable for ages 6-8: sentence case, at least 15 px, above the question
//        (day 4, UE-12: the header is now the short Attack / Defend tag .qtag; the story line .qprompt returns with qok-quiz-tag=0)
//   m6   battle messages in Japanese break only at phrase spaces / after punctuation (was "26/の ダメージ")
//   nit  equip tab: the selected slot row's text is readable on its highlight (was gold on gold)
//   nit  status tab on a fresh save shows a dash, not "0/0 (0%)"
//   8a   New Game+ on a cleared slot, tapped with a finger, opens the New Game+ setup (census report UNVERIFIED)
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5502/ node scripts/auto/checks/ui-screens.cjs [group ...]
// groups: battle menu ngplus. UI_SHOTS=<dir> writes JPEG screenshots.
// Real throughout: Continue from a seeded save, a random encounter walked into with the stick, finger
// taps on Fight / the answers / the field tab bar / the title's slot buttons.
const U = require('./_uilib.cjs');
const { L, rec, tap, breaks, shot } = U;
const GROUP = U.runGroups(__filename, ['battle', 'menu', 'ngplus'], 'ui-screens');

async function encounter(page, maxMs = 45000) {
  await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
  const t0 = Date.now(); let dir = 1;
  while (Date.now() - t0 < maxMs) { if (await U.active(page, 'BattleScene')) return true; await L.stick(page, dir, 0, 900); dir = -dir; }
  return U.active(page, 'BattleScene');
}
async function battle(page) {
  await U.boot(page, { locale: 'ja', mapId: 'overworld', x: 72, y: 270, mutate: s => { Object.assign(s.player, { level: 5, atk: 4, def: 0, hp: 9999, maxHp: 9999, quizDifficulty: '1' }); } });
  if (!(await encounter(page))) return rec('battle: a random encounter starts', false);
  await page.waitForTimeout(2000);
  let quizSeen = 0, bad = [], multi = 0, msgs = 0; const t0 = Date.now();
  while (Date.now() - t0 < 100000) {
    const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { on: g.scene.isActive('BattleScene'), phase: b && b.phase, q: !!document.querySelector('#qok-ui .kpad, [data-act="quizAns"]') }; });
    if (!s.on) break;
    if (s.phase === 'playerMenu') { await tap(page, '[data-act="battleMenu"][data-i="0"]', 2000); await page.waitForTimeout(600); continue; }
    if (s.q) {
      await page.waitForTimeout(400);
      if (!quizSeen) {
        const m = await page.evaluate(() => { const p = document.querySelector('#qok-ui .qtag, #qok-ui .qprompt'), q = document.querySelector('#qok-ui .qq'), b = document.querySelector('#qok-ui .kpk, #qok-ui .qbtn'); const cs = getComputedStyle(p);
          return { size: parseFloat(cs.fontSize), transform: cs.textTransform, spacing: cs.letterSpacing, text: p.textContent, pBottom: p.getBoundingClientRect().bottom, qTop: q.getBoundingClientRect().top, btn: parseFloat(getComputedStyle(b).fontSize) }; });
        await shot(page, 'm4-quiz-ja-kana');
        rec('m4 quiz header: sentence case, >= 15 px, clear of the question', m.size >= 15 && m.transform === 'none' && m.pBottom <= m.qTop + 1, m);
      }
      quizSeen++;
      const idx = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return ((b.quizQuestion && b.quizQuestion.answers) || []).findIndex(x => x.isCorrect); });
      for (const sel of await U.quizTaps(page, idx)) await tap(page, sel, 2000);
      await page.waitForTimeout(600); continue;
    }
    if (s.phase === 'message') {
      const r = await breaks(page, '#qok-ui .msg');
      for (const x of r) { msgs++; if (x.breaks.length) multi++; bad.push(...x.breaks.filter(b => !b.good).map(b => b.ctx + ' <' + x.text.slice(0, 50) + '>')); if (x.breaks.length && multi === 1) await shot(page, 'm6-battle-message-ja-kana'); }
      if (!(await tap(page, '[data-act="battleAdvance"]', 1200))) await page.mouse.click(195, 600).catch(() => {});
      await page.waitForTimeout(450); continue;
    }
    await page.waitForTimeout(300);
  }
  rec('battle: the quiz was reached with Fight', quizSeen > 0, { quizSeen });
  rec('m6 battle messages (ja-kana): Japanese breaks only at spaces/punctuation', multi > 0 && bad.length === 0, { messages: msgs, multiLine: multi, bad: [...new Set(bad)].slice(0, 6) });
}

async function menu(page) {
  await U.boot(page, { locale: 'en', all: false, mapId: 'overworld', x: 69, y: 258, inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'ironSword', quantity: 1 }] });
  await page.waitForTimeout(1000);
  const open = async i => { await tap(page, `#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200); if (!(await U.active(page, 'MenuScene'))) { await tap(page, `#fieldTabs [data-fi="${i}"]`); await page.waitForTimeout(1200); } await tap(page, `[data-act="tab"][data-i="${i}"]`, 1500); await page.waitForTimeout(700); };
  await open(0);
  const acc = await page.evaluate(() => { const ui = document.getElementById('qok-ui'); const row = [...ui.querySelectorAll('.row')].find(r => /Accuracy/.test(r.textContent)); return row ? row.textContent : null; });
  await shot(page, 'nit-status-fresh-en');
  rec('nit status tab, fresh save: accuracy shows a dash, not 0/0 (0%)', !!acc && !/0\/0/.test(acc) && /—|–|-/.test(acc), acc);
  await tap(page, '[data-act="close"]', 2000); await page.waitForTimeout(900);
  await open(2);
  const c = await page.evaluate(() => {
    const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const row = document.querySelector('#qok-ui [data-act="equipSlot"][data-i="0"]'); if (!row) return null;
    const label = row.querySelector('span'); const fg = parse(getComputedStyle(label).color);
    // effective background: the row's translucent highlight over the nearest opaque ancestor
    let bg = { r: 0, g: 0, b: 0, a: 0 }, layers = []; for (let e = row; e; e = e.parentElement) { const b = parse(getComputedStyle(e).backgroundColor); if (b && b.a > 0) { layers.push(b); if (b.a >= 0.99) break; } }
    let base = { r: 21, g: 22, b: 28 }; for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; base = { r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a) }; }
    const L1 = lum(fg), L2 = lum(base); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    return { selected: !!row.getAttribute('style') && /outline/.test(row.getAttribute('style')), fg: getComputedStyle(label).color, bg: base, ratio: +ratio.toFixed(2) };
  });
  await shot(page, 'nit-equip-selected-en');
  rec('nit equip tab: the selected slot row reads (contrast >= 4.5:1 on its highlight)', !!c && c.selected && c.ratio >= 4.5, c);
}

async function ngplus(page) {
  const base = U.seed({ locale: 'en', mapId: 'overworld', x: 69, y: 256 }); base.playtime = 4000;
  const s2 = JSON.parse(JSON.stringify(base)); s2.player.name = 'Sora';
  const clear = { t: Date.now(), count: 1, ng: { inventory: [{ itemId: 'herb', quantity: 3 }], equipment: {}, gold: 900, heroName: 'Sora', heroColor: 'gray' } };
  await page.goto(L.URL_, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([a, b, c]) => { localStorage.clear(); localStorage.setItem('edu-rpg-locale', 'en'); localStorage.setItem('qok-slots-v1', '1'); localStorage.setItem('qok-active-slot', '1');
    localStorage.setItem('edu-rpg-save', a); localStorage.setItem('qok-slot-1-save', a); localStorage.setItem('qok-slot-2-save', b); localStorage.setItem('qok-slot-2-clear', c); },
  [JSON.stringify(base), JSON.stringify(s2), JSON.stringify(clear)]);
  await page.reload({ waitUntil: 'load' }); await L.toTitle(page); await page.waitForTimeout(1200);
  await tap(page, '[data-act="titleSlots"]'); await page.waitForTimeout(600);
  await tap(page, '[data-act="slotPick"][data-i="2"]'); await page.waitForTimeout(600);
  // the census's path: open Delete, then cancel with the card's own Cancel button
  await tap(page, '[data-act="slotDelAsk"]'); await page.waitForTimeout(500);
  await tap(page, 'button[data-act="slotDelCancel"]'); await page.waitForTimeout(500);
  const ok = await tap(page, '[data-act="slotNgPlus"]'); await page.waitForTimeout(1500);
  const s = await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); return { mode: t && t.mode, ngPlus: !!(t && t.ngPlus), start: !!document.querySelector('[data-act="introStart"]'), ngData: !!(window.__GAME_STATE__ && window.__GAME_STATE__.ngPlusData) }; });
  await shot(page, '8a-ngplus-setup-en');
  rec('8a New Game+ tapped on a cleared slot opens the New Game+ setup within 1.5 s', ok && s.mode === 'create' && s.ngPlus && s.start && s.ngData, { tapped: ok, ...s });
}

(async () => {
  const o = await L.launch({ dpr: 2 }); const page = o.page;
  try {
    if (GROUP === 'battle') await battle(page);
    else if (GROUP === 'menu') await menu(page);
    else if (GROUP === 'ngplus') await ngplus(page);
    else rec('group ' + GROUP, false, 'unknown');
  } catch (e) { rec(`${GROUP}: ran to the end`, false, String(e && e.stack || e).slice(0, 400)); }
  await o.browser.close();
  U.finish('ui-screens ' + GROUP);
})();
