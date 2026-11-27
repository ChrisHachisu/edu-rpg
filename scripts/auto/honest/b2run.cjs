'use strict';
// Honest player, day 4 B2: run a list of boss samples one after another (ONE Chromium at a time), each with its own child, hero shift,
// switches and seed, and append one JSON line per row to a file. Waits while the box is busy (1-minute load over B2_LOAD, default 10).
//   NODE_PATH=... PROBE_URL=... HONEST_DIST=... node scripts/auto/honest/b2run.cjs <jobs.json> <out.jsonl>
// jobs.json: [{ id, profile, child (slow|median|fast|effort), keypad (same|noguess), bosses: [..] | 'all', hero: -2|0|2, tries, policy, seed, ls: {...}, over: {...}, door: <file> }]
// A job whose id already stands in the output file is skipped, so a stopped run can be started again.
const fs = require('fs'), path = require('path'), os = require('os');
const [JOBS, OUT] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(JOBS, 'utf8')), fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'checks', 'balance-doors.json'), 'utf8'));
const done = new Set(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).job) : []);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const S = require('./sampler.cjs'), H = require('./heroes.cjs');
  for (const j of jobs) {
    if (done.has(j.id)) continue;
    for (let w = 0; os.loadavg()[0] > +(process.env.B2_LOAD || 10) && w < 30; w++) { console.log(new Date().toISOString(), 'load', os.loadavg()[0].toFixed(1), 'waiting'); await sleep(120000); }
    if (j.child && j.child !== 'effort') process.env.HONEST_CHILD = j.child; else delete process.env.HONEST_CHILD;
    process.env.HONEST_KEYPAD = j.keypad || 'same';
    if (j.acc === 'flat') process.env.HONEST_CHILD_ACC = 'flat'; else delete process.env.HONEST_CHILD_ACC;
    const set = j.policy === 'savvy' ? Object.fromEntries(Object.entries(fx.savvyDoors[j.profile]).map(([k, v]) => [k, v])) : fx.doors[j.profile];
    const names = j.bosses === 'all' ? Object.keys(set) : j.bosses, t0 = Date.now();
    const doors = []; for (const b of names) for (const h of (j.heroes || [j.hero || 0])) { let rec = set[b].record, from = set[b].from; if (j.door) { const r = JSON.parse(fs.readFileSync(j.door.replace('<boss>', b), 'utf8')); rec = { state: r.state, quizStats: r.quizStats || {} }; from = j.door; }
      doors.push({ boss: b, zone: set[b].zone, record: h ? H.shift(rec, h) : rec, from: from + (h ? (h > 0 ? ' +' : ' ') + h + ' levels' : ''), tries: j.triesBy && j.triesBy[b] != null ? j.triesBy[b] : j.tries, heroShift: h }); }
    let rows; try { rows = await S.sample({ profile: j.profile, doors, policy: j.policy || 'reference', seed: j.seed, extra: j.ls || null, over: j.over || null, keepTrials: true }); rows.forEach((r, i) => { r.heroShift = doors[i].heroShift; }); }
    catch (e) { console.log(new Date().toISOString(), 'JOB FAILED', j.id, String(e && e.message || e).slice(0, 200)); continue; }
    fs.appendFileSync(OUT, JSON.stringify({ job: j.id, cfg: j, sec: Math.round((Date.now() - t0) / 1000), rows }) + '\n');
    console.log(new Date().toISOString(), j.id, Math.round((Date.now() - t0) / 1000) + ' s', rows.map(r => `${r.boss} L${r.level} ${r.wins}/${r.n}`).join(', ').slice(0, 300));
  }
  console.log('b2run done');
})().catch(e => { console.error('ERR', e && e.stack || e); process.exit(1); });
