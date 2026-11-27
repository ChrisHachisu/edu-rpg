'use strict';
// Honest player, day 4 (quiz bank v2): per-question solve time of the simulated child, and the per-kind table of the critical-hit class.
//   NODE_PATH=... PROBE_URL=... node scripts/auto/honest/effortref.cjs [--n 400] [--out scripts/auto/honest/effort-ref.json]
// Draws real questions from the game's own quiz manager, for every grade and act, on both banks (qok-quiz2=0 is the old bank), and rates each with the
// effort model of scripts/auto/checks/quiz-content.cjs (steps of work x seconds per step for the grade, plus reading time; a JUDGEMENT table, not
// stopwatch data: CURRICULUM.md "What rests on judgement"). Output:
//   ref[grade]         mean effort of the OLD bank over all acts = the anchor: the child's day 1 mean answer time (profiles.cjs t) belongs to a
//                      question of that effort, so a question of effort e takes t * e / ref[grade]
//   rows[grade][act]   for the NEW bank, mean effort of each plan row (kind) = the critical-hit class
//   stats              per bank, grade, act: mean, share over 6 s, share the model cannot read
const fs = require('fs'), path = require('path');
process.env.QUIZ_CONTENT_LIB = '1';
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5562/';
process.env.PROBE_OUT = process.env.PROBE_OUT || '/home/user/work/d4/b/probe-out';
const Q = require('../checks/quiz-content.cjs'), L = require('../../acts/probe/lib.cjs');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 400), OUT = arg('out', path.join(__dirname, 'effort-ref.json'));
const GR = ['k', '1', '2', '3', '4', '5', '6'];
const ZONES = { 1: ['greenhollow-plains', 'whispering-woods', 'crystal-coast', 'misty-grotto', 'crystal-cave', 'sunken-cellar', 'whispering-woods-cave', 'coastal-reef'], 2: ['coral-tunnels', 'iron-mountains', 'shadow-cave', 'storm-nest', 'frozen-lake', 'frostpeak-cavern', 'iron-mine', 'haunted-forest'],
  3: ['scorched-wastes', 'desert-tomb', 'bandit-hideout', 'oasis-depths', 'scorched-ruins'], 4: ['magma-tunnels', 'sunken-ruins', 'volcanic-forge', 'ember-mines', 'obsidian-cavern'], 5: ['demons-threshold', 'demon-castle', 'stormreach-isles', 'frostfall-peaks', 'sunken-temple', 'twilight-realm'] };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
(async () => {
  const res = { made: new Date().toISOString().slice(0, 10), n: N, model: 'quiz-content.cjs effort() (judgement table)', stats: {}, ref: {}, rows: {}, raw: {} };
  const o = await L.launch(), page = o.page;
  try {
    for (const bank of ['old', 'new']) for (const g of GR) {
      const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'newgame', 'g' + g + '.json'), 'utf8'));
      await L.bootSave(page, { version: 4, timestamp: Date.now(), player: { ...st, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: {} }, { settle: 600, extra: bank === 'old' ? { 'qok-quiz2': '0' } : {} });
      const qs = await page.evaluate(a => { const qm = window.__GAME_STATE__.quizManager, out = []; for (const act of [1, 2, 3, 4, 5]) for (let i = 0; i < a.n; i++) { const zs = a.z[act], z = zs[i % zs.length], q = qm.getQuestion(z, Math.random() < 0.1);
        out.push({ act, en: q.questionText.en, row: q.qz2 ? q.qz2.row : null, cat: q.category }); } return { out, on: window.__QOK_QUIZ2__ ? window.__QOK_QUIZ2__.on() : null, grade: qm.getEffectiveGrade ? qm.getEffectiveGrade() : qm.difficulty }; }, { n: N, z: ZONES });
      if ((bank === 'new') !== !!qs.on) throw new Error('bank mismatch ' + bank + ' ' + qs.on);
      const per = {}; for (const q of qs.out) { const p = Q.solve(q.en, 'en'); q.e = p.ok ? Q.effort(g, p) : null; (per[q.act] = per[q.act] || []).push(q); }
      res.stats[bank] = res.stats[bank] || {}; res.stats[bank][g] = {};
      for (const act of [1, 2, 3, 4, 5]) { const v = per[act], ok = v.filter(q => q.e != null).map(q => q.e); res.stats[bank][g][act] = { n: v.length, parsed: ok.length / v.length, mean: mean(ok), slow: ok.filter(e => e > 6).length / ok.length, fast: ok.filter(e => e < 3).length / ok.length };
        if (bank === 'new') { const rr = {}; for (const q of v) if (q.e != null) (rr[q.row] = rr[q.row] || []).push(q.e); res.rows[g] = res.rows[g] || {}; res.rows[g][act] = Object.fromEntries(Object.entries(rr).map(([k, a]) => [k, { n: a.length, mean: mean(a) }])); } }
      if (bank === 'old') res.ref[g] = mean(qs.out.map(q => q.e).filter(e => e != null));
      res.raw[bank + g] = qs.out.slice(0, 40).map(q => [q.act, q.en, q.e && Math.round(q.e * 10) / 10]);
      console.log(bank, g, 'grade', qs.grade, 'mean', res.stats[bank][g] && Object.values(res.stats[bank][g]).map(s => s.mean && s.mean.toFixed(1)).join(' '), 'parsed', Object.values(res.stats[bank][g]).map(s => Math.round(s.parsed * 100)).join(' '));
    }
  } finally { await o.browser.close(); }
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); console.log('wrote', OUT);
})().catch(e => { console.error(e); process.exit(1); });
