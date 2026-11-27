'use strict';
// Battle number keypad + notepad (owner 2026-11-24, mockup https://claude.ai/artifact/WuEy19D5wsAHKaKW9sqrKD).
// Guards the locked design:
//   k1  the quiz shows a keypad (0-9, Delete, Clear, Notepad, Enter), not four choice buttons
//   k2  Enter is dimmed until something is typed, and reads Attack on the player's quiz
//   k3  typing the right answer with finger taps and pressing Attack lands as a correct answer
//   k4  the enemy's quiz pops the keypad with Enter reading Defend
//   k5  a wrong answer shows the typed value struck out next to the right one, then resolves wrong
//   k6  quiz time, in literal seconds for nine named questions (three grade bands: a class-1 question, a middle one and one at the
//       cap), on the keypad, on the four buttons, with qok-crit-class=0 and with qok-timer-cap=2
//   k7  the menu's brace action reads Guard
//   k8  the notepad opens from its key, a finger stroke draws on it, its close button hides it
//   k9  a hardware keyboard types digits, Backspace deletes, Return submits (and never the hidden choice)
//   k10 the ± key shows for grade 6 only, and a negative answer can be entered
//   k11 localStorage qok-keypad=0 restores the four choice buttons
//   k12 the critical-hit window, in literal seconds for the same nine questions and switches (4.5 s on the keypad and 3 s on the four
//       buttons for a class-1 question; never over twice that)
//   k13 the typed answer sits on its own line above the result text
//   k14 the speed bonus and the sure defence are the first half of the quiz timer, so they grow with it (literal seconds)
//   k15 no question at any grade, act, row, monster tier or answer streak has less quiz time or a shorter critical window than on
//       builds up to 99, and the class table cannot push either past its cap or under 1 whatever it holds
// Day 4 B2: until then k6 and k12 took their expected values from the code under test (the live question's own class factor). The
// numbers below are written out by hand from the rule: timer = round(1.5 x max(frozen, round(frozen x class))) on the keypad, frozen =
// max(5, round(base[grade] x tier)) with no answer streak; window = 4.5 s x class on the keypad, 3 s x class on the four buttons.
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

// ---- k6, k12, k14, k15: the timing rules in absolute numbers (day 4 B2). Runs inside a live battle: the quiz manager's timer patch and the
// engine's critical-window patch are the game's own; only the question in front of them is swapped for a named one and put back.
// [grade, act, row, name, raw class in the table, four-button timer normal / final boss, keypad timer normal / final boss,
//  keypad timer with qok-timer-cap=2 normal / final boss, critical window keypad / four buttons]; with qok-crit-class=0 every row is the frozen value.
const FROZEN = { 1: [25, 19], 3: [18, 14], 4: [16, 12], 5: [16, 12], 6: [14, 11] };   // four-button seconds, normal monster / Demon King
const NAMED = [
  ['1', 1, 0, 'grade 1 Act 1, add within 10 (1 + 5): class 1',                           [25, 19], [38, 29], [38, 29], 4.5,   3],
  ['1', 3, 0, 'grade 1 Act 3, add with carrying (8 + 7): class 1.45',                    [36, 28], [54, 42], [54, 42], 6.525, 4.35],
  ['1', 4, 2, 'grade 1 Act 4, three numbers crossing 10 (18 − 7 + 9): at the cap',       [66, 50], [99, 75], [75, 57], 9,     6],
  ['3', 1, 0, 'grade 3 Act 1, times tables (7 × 8): class 1',                            [18, 14], [27, 21], [27, 21], 4.5,   3],
  ['4', 2, 0, 'grade 4 Act 2, two-digit ÷ one-digit (92 ÷ 2): class 1.65',               [26, 20], [39, 30], [39, 30], 7.425, 4.95],
  ['4', 3, 2, 'grade 4 Act 3, two-digit × two-digit (21 × 13): at the cap',              [44, 33], [66, 50], [48, 36], 9,     6],
  ['6', 1, 1, 'grade 6 Act 1, fraction × whole number (3/8 × 64): class 1',              [14, 11], [21, 17], [21, 17], 4.5,   3],
  ['5', 4, 3, 'grade 5 Act 4, area of a triangle: class 1.65',                           [26, 20], [39, 30], [39, 30], 7.425, 4.95],
  ['5', 5, 3, 'grade 5 Act 5, average of three numbers (69, 73, 74): at the cap',        [40, 30], [60, 45], [48, 36], 9,     6],
];
async function timing(page) {
  const got = await page.evaluate(NAMED => {
    const b = window.__PHASER_GAME__.scene.getScene('BattleScene'), qm = window.__GAME_STATE__.quizManager, C = window.__QOK_CRITCLASS__;
    if (!qm.__qokKpTimer || !b.engine || !b.engine.__qokWrongFinishPatched || !C) return { err: 'timer or engine patch missing: ' + [!!qm.__qokKpTimer, !!(b.engine && b.engine.__qokWrongFinishPatched), !!C] };
    const keep = { q: b.quizQuestion, d: qm.difficulty, c: qm.consecutiveCorrect, w: qm.consecutiveWrong, rnd: Math.random }, KEYS = ['qok-keypad', 'qok-crit-class', 'qok-timer-cap'], keepLs = KEYS.map(k => localStorage.getItem(k));
    const ls = o => { KEYS.forEach(k => localStorage.removeItem(k)); for (const k in o) localStorage.setItem(k, o[k]); };
    const ask = (g, act, row) => { b.quizQuestion = { gradeLevel: g, qz2: { act, row }, answers: [], questionText: { en: '' } }; qm.difficulty = g; qm.consecutiveCorrect = 0; qm.consecutiveWrong = 0; };
    const timers = () => [qm.getTimerSeconds('normal'), qm.getTimerSeconds('finalBoss')];
    const attack = (ratio, el) => { const e = Object.create(b.engine); e.monsterHp = 1e9; return e.resolvePlayerAttack(true, ratio, el) || {}; };   // a copy: the real fight is untouched
    const windowS = () => { let lo = 0, hi = 40; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (attack(0.2, m).critical) lo = m; else hi = m; } return Math.round(lo * 1000) / 1000; };   // the last second that is still critical
    const out = { named: [] };
    try {
      for (const [g, act, row] of NAMED) { ask(g, act, row); const o = {};
        ls({}); o.kp = timers(); o.wKp = windowS();
        ls({ 'qok-keypad': '0' }); o.four = timers(); o.wFour = windowS();
        ls({ 'qok-timer-cap': '2' }); o.kpCap2 = timers(); o.wCap2 = windowS();
        ls({ 'qok-crit-class': '0' }); o.kpOff = timers(); o.wKpOff = windowS();
        ls({ 'qok-crit-class': '0', 'qok-keypad': '0' }); o.fourOff = timers(); o.wFourOff = windowS();
        out.named.push(o); }
      // k14: speed bonus (attack) and sure defence (0.6x instead of 0.8x damage) at exactly half of the timer, on the cap question of grade 4
      ls({}); ask('4', 3, 2); const T = qm.getTimerSeconds('normal');
      out.half = { T, at: T / 2, bonusAtHalf: !!attack(0.5, 999).speedBonus, bonusJustAfter: !!attack(0.499, 999).speedBonus, critBeatsBonus: !!attack(0.9, 1).critical };
      Math.random = () => 0.5;
      const defend = (right, ratio) => { const e = Object.create(b.engine), fake = { totalDef: 0, isAlive: true, state: { name: 'x' }, hit: 0, takeDamage(n) { this.hit += n; } }; e.player = fake; e.monster = Object.assign({}, b.engine.monster, { baseAtk: 1000, bossAbilities: [] }); e.monsterHp = e.monster.baseHp; e.isCharging = false;   /* a big hit, so whole-number rounding cannot blur 0.6 and 0.8 */ e.isDefending = false; e.rageActive = true; e.resolveEnemyAttack(right, ratio); return fake.hit; };
      out.def = { wrong: defend(false, 0.9), sure: defend(true, 0.5), late: defend(true, 0.499) };
      Math.random = keep.rnd;
      // k15: every grade, act, row (also an unknown row, a negative-number row and an old-bank question), tier and streak
      const BASE = { k: 30, 1: 25, 2: 22, 3: 18, 4: 16, 5: 16, 6: 14 }, TIER = { weak: 1.5, normal: 1, strong: 0.85, midBoss: 0.9, boss: 0.85, lateBoss: 0.8, finalBoss: 0.75 };
      let n = 0, longer = 0, bad = [], offBad = [], winBad = [], maxT = 0, maxW = 0;
      for (const g of Object.keys(BASE)) for (let act = 1; act <= 5; act++) for (let row = -2; row <= 12; row++) {
        ask(g, act, row); if (row === 12) b.quizQuestion = { gradeLevel: g, answers: [], questionText: { en: '' } };   // an old-bank question carries no qz2
        const q = b.quizQuestion;
        ls({}); const wK = windowS(); ls({ 'qok-keypad': '0' }); const wF = windowS(); if (wK < 4.5 - 1e-3 || wF < 3 - 1e-3 || wK > 9 + 1e-3 || wF > 6 + 1e-3) winBad.push([g, act, row, wK, wF]); if (wK > maxW) maxW = wK;
        for (const tier of Object.keys(TIER)) for (let streak = 0; streak <= 9; streak += 3) { qm.consecutiveCorrect = streak; const fz = Math.max(5, Math.round(BASE[g] * TIER[tier] + Math.min(3, Math.floor(streak / 3))));
          ls({}); const tk = qm.getTimerSeconds(tier); ls({ 'qok-keypad': '0' }); const tf = qm.getTimerSeconds(tier);
          ls({ 'qok-crit-class': '0' }); const ok = qm.getTimerSeconds(tier); ls({ 'qok-crit-class': '0', 'qok-keypad': '0' }); const of = qm.getTimerSeconds(tier);
          n++; if (tk > Math.round(fz * 1.5)) longer++; if (tk > maxT) maxT = tk;
          if (tf < fz || tk < Math.round(fz * 1.5) || tf > fz * 3 + 1 || tk > Math.round((fz * 3 + 1) * 1.5)) bad.push([g, act, row, tier, streak, fz, tf, tk]);
          if (of !== fz || ok !== Math.round(fz * 1.5)) offBad.push([g, act, row, tier, streak, fz, of, ok]); }
        b.quizQuestion = q; }
      out.all = { n, longer, bad: bad.slice(0, 5), nBad: bad.length, offBad: offBad.slice(0, 5), nOffBad: offBad.length, winBad: winBad.slice(0, 5), nWinBad: winBad.length, maxT, maxW };
      // the clamp does not trust the table: poison one cell and read the factors and the seconds back
      ls({}); ask('4', 3, 2); const cell = C.table['4'][2], was = cell[2], probe = v => { cell[2] = v; return { crit: C.mult(b.quizQuestion), timer: C.timerMult ? C.timerMult(b.quizQuestion) : null, four: (ls({ 'qok-keypad': '0' }), qm.getTimerSeconds('normal')), win: (ls({}), windowS()) }; };
      out.clamp = { big: probe(9), small: probe(0.2), text: probe('x'), neg: probe(-3), nan: probe(NaN) }; cell[2] = was; out.clamp.back = probe(was);
    } finally { Math.random = keep.rnd; b.quizQuestion = keep.q; qm.difficulty = keep.d; qm.consecutiveCorrect = keep.c; qm.consecutiveWrong = keep.w; KEYS.forEach((k, i) => keepLs[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, keepLs[i])); }
    return out;
  }, NAMED);
  if (got.err) { rec('k6 quiz time in literal seconds', false, got.err); rec('k12 critical window in literal seconds', false, got.err); return; }
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b), near = (a, b) => Math.abs(a - b) <= 0.01, bad6 = [], bad12 = [];
  NAMED.forEach(([g, act, row, name, four, kp, kpCap2, wKp, wFour], i) => { const o = got.named[i], fz = FROZEN[g], fzK = fz.map(v => Math.round(v * 1.5));
    if (!eq(o.four, four) || !eq(o.kp, kp) || !eq(o.kpCap2, kpCap2) || !eq(o.fourOff, fz) || !eq(o.kpOff, fzK)) bad6.push({ name, got: { four: o.four, keypad: o.kp, cap2: o.kpCap2, fourOff: o.fourOff, keypadOff: o.kpOff }, want: { four, keypad: kp, cap2: kpCap2, fourOff: fz, keypadOff: fzK } });
    if (!near(o.wKp, wKp) || !near(o.wFour, wFour) || !near(o.wCap2, wKp) || !near(o.wKpOff, 4.5) || !near(o.wFourOff, 3)) bad12.push({ name, got: { keypad: o.wKp, four: o.wFour, cap2: o.wCap2, keypadOff: o.wKpOff, fourOff: o.wFourOff }, want: { keypad: wKp, four: wFour, keypadOff: 4.5, fourOff: 3 } }); });
  rec('k6 quiz time in literal seconds: nine named questions x (keypad, four buttons, qok-timer-cap=2, qok-crit-class=0), normal monster and Demon King', !bad6.length, bad6.length ? bad6 : NAMED.map((q, i) => q[3].split(':')[0].replace(/ \(.*\)/, '') + ' ' + got.named[i].kp.join('/') + ' s').join('; '));
  rec('k12 critical window in literal seconds: the same nine questions and switches (4.5 s keypad / 3 s four buttons at class 1, 9 s / 6 s at the cap)', !bad12.length, bad12.length ? bad12 : NAMED.map((q, i) => got.named[i].wKp + '/' + got.named[i].wFour).join('; '));
  const h = got.half, d = got.def;
  rec('k14 the speed bonus lasts the first half of the timer: 33 s of the 66 s of grade 4 two-digit × two-digit (12 s of 24 s on builds up to 99)', h.T === 66 && h.at === 33 && h.bonusAtHalf && !h.bonusJustAfter && h.critBeatsBonus, h);
  rec('k14 the sure defence (0.6x damage) lasts the same first half; after it a right answer still softens the hit (0.8x)', d.wrong > 0 && Math.abs(d.sure / d.wrong - 0.6) < 0.02 && Math.abs(d.late / d.wrong - 0.8) < 0.02, d);
  const a = got.all;
  rec(`k15 no question has less quiz time or a shorter critical window than on builds up to 99 (${a.n} grade x act x row x tier x streak cases; ${a.longer} are longer; the longest timer is ${a.maxT} s, the longest window ${a.maxW} s)`, a.n >= 7 * 5 * 15 * 7 * 4 && a.nBad === 0 && a.nWinBad === 0 && a.longer > 0, a.nBad || a.nWinBad ? a : '');
  rec('k15 with qok-crit-class=0 every case is exactly the frozen timer (x1.5 on the keypad)', a.nOffBad === 0, a.nOffBad ? a.offBad : '');
  const c = got.clamp, cl = (o, crit, timer, four, win) => o.crit === crit && o.timer === timer && o.four === four && near(o.win, win);
  rec('k15 the clamp: a table cell of 9 gives window x2 and timer x3; 0.2, text, a negative and NaN give x1', cl(c.big, 2, 3, 48, 9) && cl(c.small, 1, 1, 16, 4.5) && cl(c.text, 1, 1, 16, 4.5) && cl(c.neg, 1, 1, 16, 4.5) && cl(c.nan, 1, 1, 16, 4.5) && cl(c.back, 2, 2.75, 44, 9), c);
}

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
  await timing(page);
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
  await shot(page, 'k13-typed-answer');
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
