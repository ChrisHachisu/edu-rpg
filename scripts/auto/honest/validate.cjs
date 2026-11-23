'use strict';
// Validation of the fast driver: the same monster is fought (a) through the DOM buttons in real time, as a
// player taps them, and (b) by the in-page driver. Both runs trace the arguments the BattleEngine receives.
// The fast driver is faithful if its (correct, timeRatio, elapsed) arguments equal what real taps produce for
// the same think time, and the call grammar (P, E, T ...) is the same.
const fs = require('fs'), path = require('path');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5500/'; process.env.PROBE_OUT = '/home/user/work/honest/probe-out';
const L = require('../../acts/probe/lib.cjs');
const INPAGE = fs.readFileSync(path.join(__dirname, 'inpage.js'), 'utf8');
(async () => {
  const grade = process.argv[2] || 'g3', mon = process.argv[3] || 'mushroom', THINK = +(process.argv[4] || 4);
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'newgame', grade + '.json'), 'utf8'));
  const o = await L.launch(); const page = o.page; const out = { grade, mon, think: THINK };
  try {
    await L.bootSave(page, { version: 4, timestamp: Date.now(), player: { ...st, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: {} }, { settle: 1500 });
    await page.evaluate(INPAGE);
    // (a) real taps, real time
    await page.evaluate(m => { const g = window.__PHASER_GAME__, wm = g.scene.getScene('WorldMapScene'); window.__VT = []; wm.currentEncounterZone = 'whispering-woods'; wm.scene.launch('BattleScene', { monster: window.__HON.monster(m), zone: 'whispering-woods' }); wm.scene.pause(); }, mon);
    await page.waitForFunction(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return b && b.engine && b.engine.__qokWrongFinishPatched; }, { timeout: 20000 });
    await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'), e = b.engine, tr = window.__VT, r3 = v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v, hp = () => window.__GAME_STATE__.player.state.hp;
      const rp = e.resolvePlayerAttack, re = e.resolveEnemyAttack, pt = e.processTurnAbilities;
      e.resolvePlayerAttack = function (c, ratio, el) { const m0 = this.monsterHp, r = rp.apply(this, arguments); tr.push(['P', !!c, r3(ratio), r3(el), m0 - this.monsterHp, r && r.state]); return r; };
      e.resolveEnemyAttack = function (c, ratio) { const h0 = hp(), r = re.apply(this, arguments); tr.push(['E', !!c, r3(ratio), h0 - hp(), r && r.state]); return r; };
      e.processTurnAbilities = function () { const h0 = hp(), m0 = this.monsterHp, r = pt.apply(this, arguments); tr.push(['T', h0 - hp(), this.monsterHp - m0, r.length]); return r; }; });
    const tap = async sel => { const loc = page.locator(sel).first(); const dl = Date.now() + 5000; while (Date.now() < dl) { const b = await loc.boundingBox().catch(() => null); if (b && b.width > 4) { await loc.tap({ timeout: 3000 }).catch(() => {}); return true; } await page.waitForTimeout(100); } return false; };
    const t0 = Date.now(); let k = 0; const timers = [];
    while (Date.now() - t0 < 150000) {
      const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { active: g.scene.isActive('BattleScene'), phase: b.phase, T: b.quizTimerSeconds, over: g.scene.isActive('GameOverScene') }; });
      if (!s.active || s.over) break;
      if (s.phase === 'playerMenu') { await tap('[data-act="battleMenu"][data-i="0"]'); await page.waitForTimeout(300); }
      else if (s.phase === 'playerQuiz' || s.phase === 'enemyQuiz') { timers.push(s.T);
        // wait until the game's own timer bar says THINK seconds have passed, then tap (right, wrong, right, ...)
        await page.waitForFunction(th => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return b.quizTimerBar && (1 - b.quizTimerBar.displayWidth / b.quizTimerBarFullWidth) * b.quizTimerSeconds >= th; }, THINK, { timeout: 30000, polling: 20 });
        const idx = await page.evaluate(wrong => { const a = window.__PHASER_GAME__.scene.getScene('BattleScene').quizQuestion.answers; return a.findIndex(x => wrong ? !x.isCorrect : !!x.isCorrect); }, k % 3 === 1); k++;
        await tap(`[data-act="quizAns"][data-i="${idx}"]`); await page.waitForTimeout(500); }
      else { await tap('[data-act="battleAdvance"]'); await page.waitForTimeout(250); }
    }
    await page.waitForTimeout(1500);
    out.real = await page.evaluate(() => window.__VT); out.realTimers = timers; out.realEnd = await page.evaluate(() => ({ scenes: window.__PHASER_GAME__.scene.getScenes(true).map(s => s.scene.key), hp: window.__GAME_STATE__.player.state.hp, exp: window.__GAME_STATE__.player.state.exp }));
    // (b) the fast driver, same think time (no spread), 2 of 3 right in expectation
    await page.evaluate(() => { const s = window.__GAME_STATE__.player; s.fullHeal(); });
    await page.evaluate(c => window.__HON.init(c), { seed: 7, profile: { p: 0.67, t: THINK, sd: 0 } });
    const f = await page.evaluate(m => window.__HON.fight(m, 'whispering-woods', { trace: true }), mon);
    out.fast = f.trace; out.fastLog = { res: f.res, rounds: f.rounds, q: f.q, ok: f.ok, ms: f.ms, tier: f.tier };
    console.log(JSON.stringify(out, null, 0).replace(/\],\[/g, '],\n ['));
    console.log('errors', JSON.stringify(o.errors.slice(0, 5)));
  } finally { await o.browser.close(); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
