'use strict';
// Honest player, day 4 B2: a corpus of real questions for the independent child-time model (childmodel.cjs) and the timer checks.
//   NODE_PATH=... PROBE_URL=... node scripts/auto/honest/corpus.cjs [--n 400] [--out <file.json>]
// Draws questions from the running game's own quiz manager for every grade and act (new bank), n ordinary and n boss draws each, and
// stores the text, the right answer, the plan row (qz2.row) and the act. No time model is applied here: the file is facts only.
const fs = require('fs'), path = require('path');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5577/';
process.env.PROBE_OUT = process.env.PROBE_OUT || '/home/user/work/d4/b2/probe-out';
const L = require('../../acts/probe/lib.cjs');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 400), OUT = arg('out', path.join(__dirname, 'corpus.json'));
const GR = ['k', '1', '2', '3', '4', '5', '6'];
const ZONES = { 1: ['greenhollow-plains', 'whispering-woods', 'crystal-coast', 'misty-grotto', 'crystal-cave', 'sunken-cellar', 'whispering-woods-cave', 'coastal-reef'], 2: ['coral-tunnels', 'iron-mountains', 'shadow-cave', 'storm-nest', 'frozen-lake', 'frostpeak-cavern', 'iron-mine', 'haunted-forest'],
  3: ['scorched-wastes', 'desert-tomb', 'bandit-hideout', 'oasis-depths', 'scorched-ruins'], 4: ['magma-tunnels', 'sunken-ruins', 'volcanic-forge', 'ember-mines', 'obsidian-cavern'], 5: ['demons-threshold', 'demon-castle', 'stormreach-isles', 'frostfall-peaks', 'sunken-temple', 'twilight-realm'] };
(async () => {
  const res = { made: new Date().toISOString(), n: N, bank: 'new', q: {} };
  const o = await L.launch(), page = o.page;
  try {
    for (const g of GR) {
      const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'newgame', 'g' + g + '.json'), 'utf8'));
      await L.bootSave(page, { version: 4, timestamp: Date.now(), player: { ...st, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: {} }, { settle: 600 });
      const qs = await page.evaluate(a => { const qm = window.__GAME_STATE__.quizManager, out = [];
        for (const act of [1, 2, 3, 4, 5]) for (const boss of [0, 1]) for (let i = 0; i < a.n; i++) { const zs = a.z[act], z = zs[i % zs.length]; qm.consecutiveWrong = 0; const q = qm.getQuestion(z, !!boss);
          out.push([act, boss, q.qz2 ? q.qz2.row : null, q.questionText.en, String((q.answers.find(x => x.isCorrect) || {}).text.en), String(q.gradeLevel)]); }
        return { out, on: window.__QOK_QUIZ2__ ? window.__QOK_QUIZ2__.on() : null, cls: window.__QOK_CRITCLASS__ ? { table: window.__QOK_CRITCLASS__.table, neg: window.__QOK_CRITCLASS__.neg, v: window.__QOK_CRITCLASS__.version } : null }; }, { n: N, z: ZONES });
      if (!qs.on) throw new Error('new bank is not on');
      res.q[g] = qs.out; res.cls = qs.cls; console.log(g, qs.out.length, 'questions');
    }
  } finally { await o.browser.close(); }
  fs.writeFileSync(OUT, JSON.stringify(res)); console.log('wrote', OUT, fs.statSync(OUT).size);
})().catch(e => { console.error(e); process.exit(1); });
