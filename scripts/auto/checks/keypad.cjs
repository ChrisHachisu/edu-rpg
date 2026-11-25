'use strict';
// Battle number keypad + notepad (owner 2026-11-24, mockup https://claude.ai/artifact/WuEy19D5wsAHKaKW9sqrKD).
// Guards the locked design:
//   k1  the quiz shows a keypad (0-9, Delete, Clear, Notepad, Enter), not four choice buttons
//   k2  Enter is dimmed until something is typed, and reads Attack on the player's quiz
//   k3  typing the right answer with finger taps and pressing Attack lands as a correct answer
//   k4  the enemy's quiz pops the keypad with Enter reading Defend
//   k5  a wrong answer shows the typed value struck out next to the right one, then resolves wrong
//   k6  quiz time is 1.5x the frozen timer
//   k7  the menu's brace action reads Guard
//   k8  the notepad opens from its key, a finger stroke draws on it, its close button hides it
//   k9  a hardware keyboard types digits, Backspace deletes, Return submits (and never the hidden choice)
//   k10 the ± key shows for grade 6 only, and a negative answer can be entered
//   k11 localStorage qok-keypad=0 restores the four choice buttons
//   k12 the critical-hit window is 1.5x too (4.5 s; the frozen 3 s with the switch off)
//   k13 the typed answer sits on its own line above the result text
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5502/ node scripts/auto/checks/keypad.cjs [group ...]
// groups: flow g6 g1 off. UI_SHOTS=<dir> writes JPEG screenshots.
const U = require('./_uilib.cjs');
const { L, rec, tap, shot } = U;
const GROUP = U.runGroups(__filename, ['flow', 'g6', 'g1', 'off'], 'keypad');

async function st(page) {
  return page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'), q = b && b.quizQuestion;
    return { on: g.scene.isActive('BattleScene'), phase: b && b.phase, kp: !!document.querySelector('#qok-ui .kpad'), choices: document.querySelectorAll('[data-act="quizAns"]').length,
      right: q ? String((q.answers.find(a => a.isCorrect) || {}).text.en) : null, grade: q && q.gradeLevel, forPlayer: b && b.quizForPlayer,
      go: (document.querySelector('[data-k="go"]') || {}).textContent || '', goOff: !!(document.querySelector('[data-k="go"]') || {}).disabled,
      disp: (document.querySelector('#qok-kpdisp') || {}).textContent || '', secs: b && b.quizTimerSeconds, kpState: window.__QOK_KEYPAD__ && window.__QOK_KEYPAD__.state() }; });
}
async function encounter(page, maxMs = 45000) {
  await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
  const t0 = Date.now(); let dir = 1;
  while (Date.now() - t0 < maxMs) { if (await U.active(page, 'BattleScene')) return true; await L.stick(page, dir, 0, 900); dir = -dir; }
  return U.active(page, 'BattleScene');
}
async function start(page, grade, before) {
  await U.boot(page, { locale: 'en', mapId: 'overworld', x: 72, y: 270, mutate: s => { Object.assign(s.player, { level: 5, atk: 1, def: 0, hp: 9999, maxHp: 9999, quizDifficulty: grade, timerEnabled: true }); } });
  if (before) await page.evaluate(before);
  if (!(await encounter(page))) { rec('battle: a random encounter starts', false); return false; }
  await page.waitForTimeout(1500); return true;
}
// Advance messages until the phase is one of `want` (or the battle ends).
async function until(page, want, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await st(page); if (!s.on) return s;
    if (want.includes(s.phase) && (s.phase !== 'playerQuiz' && s.phase !== 'enemyQuiz' || s.kp || s.choices)) return s;
    if (s.phase === 'playerMenu' && !want.includes('playerMenu')) { await tap(page, '[data-act="battleMenu"][data-i="0"]', 2000); await page.waitForTimeout(500); continue; }
    if (s.phase === 'message') { if (!(await tap(page, '[data-act="battleAdvance"]', 800))) await page.mouse.click(195, 600).catch(() => {}); await page.waitForTimeout(400); continue; }
    await page.waitForTimeout(250);
  }
  return st(page);
}
const typeTaps = async (page, v) => { for (const c of String(v).replace('-', '')) await tap(page, `[data-act="kpKey"][data-k="${c}"]`, 2000); if (String(v).startsWith('-')) await tap(page, '[data-act="kpKey"][data-k="pm"]', 2000); };

async function flow(page) {
  if (!(await start(page, '4'))) return;
  let s = await until(page, ['playerMenu']);
  const guard = await page.evaluate(() => [...document.querySelectorAll('[data-act="battleMenu"]')].map(b => b.getAttribute('aria-label')));
  rec('k7 menu brace action reads Guard', guard[1] === 'Guard', guard);
  await tap(page, '[data-act="battleMenu"][data-i="0"]', 2000);
  s = await until(page, ['playerQuiz']);
  const keys = await page.evaluate(() => [...document.querySelectorAll('[data-act="kpKey"]')].map(b => b.getAttribute('data-k')).sort().join(','));
  await shot(page, 'k1-keypad-attack');
  rec('k1 the quiz is a keypad (0-9, del, clr, note, go), no choice buttons', s.kp && s.choices === 0 && keys === '0,1,2,3,4,5,6,7,8,9,clr,del,go,note', { keys, choices: s.choices });
  rec('k2 Enter dimmed while empty and reads Attack', s.goOff && /Attack/.test(s.go), { go: s.go, off: s.goOff });
  const frozen = await page.evaluate(() => { const q = window.__GAME_STATE__.quizManager; return q.__qokKpTimer ? null : 'unpatched'; });
  const base = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'), q = window.__GAME_STATE__.quizManager; localStorage.setItem('qok-keypad', '0'); const v = q.getTimerSeconds(b.getEnemyTier()); localStorage.removeItem('qok-keypad'); return v; });
  rec('k6 quiz time is 1.5x the frozen timer', !frozen && s.secs === Math.round(base * 1.5), { secs: s.secs, base });
  // k12 the critical window grows with the time: a right answer after 4 s is critical on the keypad, not after 5 s, and not on the four buttons
  const crit = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene');
    const hit = el => { const e = Object.create(b.engine); e.monsterHp = 1e9; const r = e.resolvePlayerAttack(true, 0.2, el); return !!(r && r.critical); };   // a copy: the real fight is untouched
    const on4 = hit(4), on5 = hit(5); localStorage.setItem('qok-keypad', '0'); const off4 = hit(4), off2 = hit(2); localStorage.removeItem('qok-keypad'); return { on4, on5, off4, off2 }; });
  rec('k12 the critical window is 4.5 s on the keypad (3 s on the four buttons)', crit.on4 && !crit.on5 && !crit.off4 && crit.off2, crit);
  // k8 notepad
  await tap(page, '[data-act="kpKey"][data-k="note"]', 2000); await page.waitForTimeout(300);
  const np = await page.evaluate(() => { const e = document.getElementById('qok-notepad'); if (!e || e.style.display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  let drew = false;
  if (np) {
    await page.mouse.move(np.x + 40, np.y + 50); await page.mouse.down(); await page.mouse.move(np.x + 160, np.y + 120, { steps: 10 }); await page.mouse.up();
    drew = await page.evaluate(() => { const c = document.querySelector('#qok-notepad canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 50; });
    await shot(page, 'k8-notepad');
    await page.locator('#qok-notepad [data-np="close"]').tap().catch(() => {}); await page.waitForTimeout(300);
  }
  const closed = await page.evaluate(() => { const e = document.getElementById('qok-notepad'); return !e || e.style.display === 'none'; });
  s = await st(page);
  rec('k8 notepad opens, draws with a finger, closes; quiz still live', !!np && drew && closed && s.phase === 'playerQuiz', { np, drew, closed, phase: s.phase });
  // k3 right answer by taps
  await tap(page, '[data-act="kpKey"][data-k="9"]', 2000); await tap(page, '[data-act="kpKey"][data-k="clr"]', 2000);
  const asked0 = await page.evaluate(() => window.__GAME_STATE__.quizManager.getStats());
  await typeTaps(page, s.right);
  const typed = (await st(page)).disp;
  await tap(page, '[data-act="kpKey"][data-k="go"]', 2000);
  // k13 the typed answer sits on its own line above "Correct!" (build 99 showed "4Correct!")
  const lay = await page.evaluate(async () => { const t0 = performance.now(); let el = null;
    while (performance.now() - t0 < 1500 && !(el = document.querySelector('#qok-ui .msg .kpres'))) await new Promise(r => setTimeout(r, 30));
    if (!el) return null; const m = el.parentElement, tn = [...m.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())[0]; if (!tn) return { text: null };
    const r = document.createRange(); r.selectNodeContents(tn); const a = el.getBoundingClientRect(), b = r.getBoundingClientRect();
    return { typed: el.textContent, text: tn.textContent, kpBottom: Math.round(a.bottom), textTop: Math.round(b.top), dx: Math.round(Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2)) }; });
  rec('k13 the typed answer is on its own line above the result text', !!lay && !!lay.text && lay.kpBottom <= lay.textTop + 1 && lay.dx <= 4, lay);
  await page.waitForTimeout(250);
  const asked1 = await page.evaluate(() => window.__GAME_STATE__.quizManager.getStats());
  rec('k3 typing the right answer + Attack counts as correct', typed === s.right && asked1.totalCorrect === asked0.totalCorrect + 1 && asked1.totalAsked === asked0.totalAsked + 1, { right: s.right, typed, asked0, asked1 });
  // k4 enemy quiz
  s = await until(page, ['enemyQuiz', 'playerMenu']);
  rec('k4 the enemy turn pops the keypad with Enter reading Defend', s.phase === 'enemyQuiz' && s.kp && /Defend/.test(s.go), { phase: s.phase, go: s.go });
  await shot(page, 'k4-keypad-defend');
  // k5 wrong answer
  const wrong = String(Number(s.right) + 1);
  await typeTaps(page, wrong);
  const c0 = await page.evaluate(() => window.__GAME_STATE__.quizManager.getStats());
  await tap(page, '[data-act="kpKey"][data-k="go"]', 2000); await page.waitForTimeout(200);
  const miss = await st(page); await shot(page, 'k5-miss');
  await page.waitForTimeout(1300);
  const c1 = await page.evaluate(() => window.__GAME_STATE__.quizManager.getStats());
  rec('k5 a miss shows typed vs right, then resolves as wrong', miss.disp.replace(/\s/g, '') === wrong + '→' + s.right && c1.totalAsked === c0.totalAsked + 1 && c1.totalCorrect === c0.totalCorrect, { disp: miss.disp, c0, c1 });
  // k9 keyboard
  s = await until(page, ['playerQuiz', 'enemyQuiz']);
  if (s.phase === 'playerQuiz' || s.phase === 'enemyQuiz') {
    const k0 = await page.evaluate(() => window.__GAME_STATE__.quizManager.getStats());
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);      // empty: must NOT confirm the hidden choice
    const still = (await st(page)).phase;
    await page.keyboard.press('7'); await page.keyboard.press('Backspace');
    for (const c of s.right.replace('-', '')) await page.keyboard.press(c);
    if (s.right.startsWith('-')) await page.keyboard.press('-');
    const kd = (await st(page)).disp;
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    const k1 = await page.evaluate(() => window.__GAME_STATE__.quizManager.getStats());
    rec('k9 keyboard: empty Return ignored, digits + Backspace + Return answer', still === s.phase && kd === s.right && k1.totalCorrect === k0.totalCorrect + 1, { still, kd, right: s.right });
  } else rec('k9 keyboard: a second quiz was reached', false, s);
}

async function g6(page) {
  if (!(await start(page, '6'))) return;
  let s = await until(page, ['playerQuiz']);
  let tries = 0, seen6 = 0, bad6 = 0;                                   // a grade 6 hero also meets grade 5 questions: judge only the grade 6 ones
  const look = async () => { if (s.grade === '6' && (s.phase === 'playerQuiz' || s.phase === 'enemyQuiz')) { seen6++; if (!(await page.evaluate(() => !!document.querySelector('[data-k="pm"]')))) bad6++; } };
  while ((s.phase === 'playerQuiz' || s.phase === 'enemyQuiz') && !s.right.startsWith('-') && tries++ < 12) {
    await look(); if (bad6) break;
    for (const sel of await U.quizTaps(page, 0)) await tap(page, sel, 2000);
    await page.waitForTimeout(1300); s = await until(page, ['playerQuiz', 'enemyQuiz']);
  }
  await look();
  rec('k10 grade 6 shows the ± key', seen6 > 0 && bad6 === 0, { grade6Questions: seen6, withoutKey: bad6, last: s.grade });
  if (s.right && s.right.startsWith('-')) {
    const c0 = await page.evaluate(() => window.__GAME_STATE__.quizManager.getStats());
    await typeTaps(page, s.right); const d = (await st(page)).disp;
    await tap(page, '[data-act="kpKey"][data-k="go"]', 2000); await page.waitForTimeout(250);
    const c1 = await page.evaluate(() => window.__GAME_STATE__.quizManager.getStats());
    rec('k10 a negative answer typed with ± counts as correct', d === s.right && c1.totalCorrect === c0.totalCorrect + 1, { right: s.right, d });
  } else console.log('[INFO] k10 no negative question came up in 12 tries; negative entry not exercised');
}

async function g1(page) {
  if (!(await start(page, '1'))) return;
  const s = await until(page, ['playerQuiz']);
  const pm1 = await page.evaluate(() => !!document.querySelector('[data-k="pm"]'));
  rec('k10 grade 1 has no ± key', s.kp && !pm1 && s.grade !== '6', { grade: s.grade, pm1 });
}

async function off(page) {
  if (!(await start(page, '4', () => localStorage.setItem('qok-keypad', '0')))) return;
  const s = await until(page, ['playerQuiz']);
  rec('k11 qok-keypad=0 restores the four choice buttons', !s.kp && s.choices === 4, { kp: s.kp, choices: s.choices });
  await page.evaluate(() => localStorage.removeItem('qok-keypad'));
}

(async () => {
  const o = await L.launch({ dpr: 2 }); const page = o.page;
  try {
    if (GROUP === 'flow') await flow(page);
    else if (GROUP === 'g6') await g6(page);
    else if (GROUP === 'g1') await g1(page);
    else if (GROUP === 'off') await off(page);
    else rec('group ' + GROUP, false, 'unknown');
  } catch (e) { rec(`${GROUP}: ran to the end`, false, String(e && e.stack || e).slice(0, 400)); }
  await o.browser.close();
  U.finish('keypad ' + GROUP);
})();
