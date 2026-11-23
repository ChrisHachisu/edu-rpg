'use strict';
// Honest player, what-if: one boss, tried from the record a run walked in with, under changed play or level.
//   NODE_PATH=/opt/node-tools/node_modules node scripts/auto/honest/whatif.cjs --run g1-r1 --dungeon demonCastle [--tries 20] [--set final|early]
// --run names a folder in $HONEST_DIR. The record is that run's door-<boss>.json (run.cjs writes one at every boss door) or,
// without one, its last checkpoint (= the Demon King's door in a finished run). She rests to full HP first.
// The scenarios that change the record (levels, herbs) are NOT honest play; they are labelled and only answer "what would it take".
const fs = require('fs'), path = require('path');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5500/';
process.env.PROBE_OUT = process.env.PROBE_OUT || '/home/user/work/honest/probe-out';
const DIR = process.env.HONEST_DIR || '/home/user/work/honest/runs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const RUN = arg('run', 'g1-r1'), DUNGEON = arg('dungeon', 'demonCastle'), TRIES = +arg('tries', 20);
const PROFILES = { g1: { grade: '1', p: 0.70, t: 6, sd: 0.35 }, g3: { grade: '3', p: 0.80, t: 4, sd: 0.35 }, g6: { grade: '6', p: 0.90, t: 3, sd: 0.35 } };
const prof = PROFILES[RUN.slice(0, 2)];
const BASE = { healAt: 0.35, fleeAt: 0.2, bossHealAt: 0, defendCharge: false };
const SET = arg('set', DUNGEON === 'demonCastle' ? 'final' : 'early');
const EARLY = [
  { id: 'as-played', note: 'the brief\'s policy (heal under 35% HP, never defends)', pol: BASE },
  { id: 'heal-at-50', note: 'heals under 50% HP against the boss', pol: { ...BASE, bossHealAt: 0.5 } },
  { id: 'perfect-quiz', note: 'as played, but every answer right in 2 s', pol: BASE, prof: { p: 1, t: 2, sd: 0.05 } },
  { id: 'plus-6-herbs', note: 'NOT honest: 6 more herbs in the bag (60 gold she does not have)', pol: BASE, herbs: 6 },
  { id: 'plus-2-levels', note: 'NOT honest: two more levels (the game\'s own addExp)', pol: BASE, plus: 2 },
  { id: 'plus-4-levels', note: 'NOT honest: four more levels', pol: BASE, plus: 4 },
];
const FINAL = [
  { id: 'as-played', note: 'the brief\'s policy (heal under 35% HP, never defends)', pol: BASE },
  { id: 'heal-at-50', note: 'heals under 50% HP against the boss', pol: { ...BASE, bossHealAt: 0.5 } },
  { id: 'defend-charge', note: 'defends on the turn after "is gathering power"', pol: { ...BASE, defendCharge: true } },
  { id: 'savvy', note: 'both: heal under 50% and defend the charge', pol: { ...BASE, bossHealAt: 0.5, defendCharge: true } },
  { id: 'savvy-heal-at-70', note: 'defend the charge and heal under 70%', pol: { ...BASE, bossHealAt: 0.7, defendCharge: true } },
  { id: 'perfect-quiz', note: 'as played, but every answer right in 2 s (the ceiling of the brief\'s policy)', pol: BASE, prof: { p: 1, t: 2, sd: 0.05 } },
  { id: 'level-30', note: 'NOT honest: XP raised to the level cap with the game\'s own addExp, the brief\'s policy', pol: BASE, level: 30 },
  { id: 'level-30-savvy', note: 'NOT honest: level cap, heal under 50% and defend the charge', pol: { ...BASE, bossHealAt: 0.5, defendCharge: true }, level: 30 },
];
const L = require('../../acts/probe/lib.cjs');
const W = require('./world.cjs').build();
const INPAGE = fs.readFileSync(path.join(__dirname, 'inpage.js'), 'utf8');
(async () => {
  const D = W.dungeons[DUNGEON]; if (!D || !D.bossId) throw new Error('no boss in ' + DUNGEON);
  const door = path.join(DIR, RUN, 'door-' + D.bossId + '.json'), SCEN = SET === 'early' ? EARLY : FINAL;
  const rec = fs.existsSync(door) ? JSON.parse(fs.readFileSync(door, 'utf8')) : JSON.parse(fs.readFileSync(path.join(DIR, RUN, 'ckpt.json'), 'utf8')).record;
  const o = await L.launch(); const page = o.page, out = { run: RUN, dungeon: DUNGEON, boss: D.bossId, tries: TRIES, record: fs.existsSync(door) ? door : 'ckpt.json', scenarios: [] };
  try {
    await L.bootSave(page, { version: 4, timestamp: Date.now(), player: { ...rec.state, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: rec.quizStats || {} }, { settle: 1500 });
    await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
    await page.evaluate(INPAGE);
    const base = await page.evaluate(() => { const p = window.__GAME_STATE__.player; p.fullHeal(); return window.__HON.snapshot(); });   // she rests first: full HP at the door
    for (const sc of SCEN) {
      await page.evaluate(a => { window.__HON.restore(a.base); window.__HON.init({ seed: a.seed, profile: a.prof, policy: a.pol });
        const p = window.__GAME_STATE__.player, target = a.level || (a.plus ? p.state.level + a.plus : 0);
        if (target) { for (let i = 0; i < 400 && p.state.level < target; i++) p.addExp(Math.max(1, p.state.expToNext - p.state.exp)); p.fullHeal(); }
        if (a.herbs) p.addItem('herb', a.herbs); },
        { base, seed: 4242, prof: { ...prof, ...(sc.prof || {}) }, pol: sc.pol, level: sc.level || 0, plus: sc.plus || 0, herbs: sc.herbs || 0 });
      const at = await page.evaluate(() => window.__HON.status());
      const b = await page.evaluate(a => window.__HON.bossTrials(a[0], a[1], a[2]), [D.bossId, D.zone, TRIES]);
      const wins = b.tries.filter(t => t.res === 'win'), loss = b.tries.filter(t => t.res === 'loss'), mean = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : null;
      const row = { id: sc.id, note: sc.note, level: at.level, maxHp: at.maxHp, atk: at.atk, def: at.def, heals: at.heals, wins: b.wins, n: b.tries.length, rounds: mean(b.tries.map(t => t.rounds || 0)), hpLeftWins: mean(wins.map(t => t.hpEnd / t.maxHp)), bossLeftLoss: mean(loss.map(t => t.mhpEnd / t.mhp)),
        items: mean(b.tries.map(t => t.items || 0)), defends: mean(b.tries.map(t => t.defends || 0)), maxHit: Math.max(...b.tries.map(t => t.maxHit || 0)), sec: mean(b.tries.map(t => t.sec)), mhp: b.tries[0].mhp, matk: b.tries[0].matk, mdef: b.tries[0].mdef };
      out.scenarios.push(row); console.log(JSON.stringify(row));
    }
    const f = path.join(DIR, `whatif-${RUN}-${DUNGEON}.json`); fs.writeFileSync(f, JSON.stringify(out, null, 1)); console.log('wrote', f);
  } finally { await o.browser.close(); }
})().catch(e => { console.error('ERR', e && e.stack || e); process.exit(1); });
