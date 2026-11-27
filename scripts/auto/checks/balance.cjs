'use strict';
// Boss balance and monster-table check (track H, "honest player").
// Guards: the balance table and the zone corrections in public/battle-recovery.js
//         (block "QOK balance + bag (autoloop 2026-11-23)").
// Report: /mnt/project-files/edu-rpg/autoloop/honest/REPORT-after.md
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5504/ \
//     node scripts/auto/checks/balance.cjs [gk] [g1] [g2] [g3] [g4] [g5] [g6] [zones]
//
// With no group all of them run, one after another, each in its own process (one Chromium at a time,
// each under ~8 minutes; the whole check takes about 25-35 minutes for the eight groups). HONEST_DIST (default
// /home/user/work/dist) is a built copy of the game: the bundle and the floor data are read from it. Output: [PASS]/[FAIL]/[INFO]
// lines, one summary line, exit 1 on a FAIL.
//
// gk g1 g2 g3 g4 g5 g6   (gk = kindergarten)   A reduced boss sampler. At each boss door stand THREE heroes: the one an honest
//                playthrough brought there (scripts/auto/checks/balance-doors.json: level, gear, bag and HP as she arrived, no
//                grinding), one two levels under her and one two levels over (scripts/auto/honest/heroes.cjs, the bundle's own
//                level table). Each fights the boss BALANCE_TRIES times (default 14, so 42 a boss; the Demon King
//                BALANCE_TRIES_DK, default 34, so 102) in the real BattleScene with the reference policy (never defends, drinks
//                under 35 % HP). The child is the independent median child of scripts/auto/honest/childmodel.cjs (day 4 B2):
//                her right answers start from 65 / 70 / 75 / 80 / 83 / 87 / 90 % (K to 6, scripts/auto/honest/profiles.cjs) and
//                drop on harder kinds; her thinking time comes from that file's kind table. ALL OF IT IS ASSUMED, none measured.
//                Targets (the lead's, 2026-11-23; unchanged):
//                  Mosswarden            win rate >= 85 % at every grade
//                  every other boss      >= 80 % at grades K to 4, >= 65 % at grades 5 and 6 (the grades where the
//                                        engine scales monsters x1.3; grades 4 and 5 are the day 4 extension: NEEDS-CONSULT)
//                  Demon King            55-80 % at every grade, median <= 25 rounds,
//                                        won fights: median <= 6.5 minutes of play; median <= 8 heal items
//                  every boss            the worst single hit (wrong defence answer, top damage
//                                        roll, rage and charge together) <= 85 % of the typical hero's max HP
//                                        (the under-levelled hero's share is printed beside it)
//                  Celestial Guardian, Frost Monarch   median <= 12 rounds
//                Careful play (rows "careful"): the Demon King again, BALANCE_TRIES_CAREFUL tries a hero (default 14),
//                from the careful ("savvy") playthrough's door record (balance-doors.json savvyDoors) and the
//                careful policy: heals under 50 % HP against a boss, defends the turn after a charge is
//                announced. Target (owner rule P8, 2026-11-24): >= 55 % at every grade; the soft ceiling of about
//                90 % is reported as [INFO], not failed.
//                No-guess child (rows "noguess", day 4 B2): no lucky pick among four buttons. Own band: Demon King
//                40-80 % with the same time limit; every other boss ten points under its reference band.
//                PASS RULE (day 4 B2): a row passes only when the measured rate itself lies inside the band. The
//                95 % Wilson interval is printed for the reader and never used to pass (until day 4 a row passed
//                when the interval touched the band: 46 to 87 wins of 100 for the Demon King).
//                Seed 771204, never used by a tuning run. The other limits are exact.
// zones          Item C: in each dungeon of the table the scene's own step rolls the monsters of
//                that dungeon's table; the fields at Greenhollow's door roll the starter table;
//                and localStorage['qok-balance']='0' puts the shipped zones and boss numbers back.
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.env.BALANCE_OUT || path.join(os.tmpdir(), 'qok-balance');
fs.mkdirSync(OUT, { recursive: true });
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(OUT, 'probe-out');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5504/';
const GROUPS = ['gk', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'zones'];
const GROUP_MS = +(process.env.BALANCE_GROUP_MS || 3600000);   // a group takes 3-6 minutes alone on the box, 8 with BALANCE_NOGUESS=1; the box is shared at times
const TRIES = +(process.env.BALANCE_TRIES || 14), TRIES_DK = +(process.env.BALANCE_TRIES_DK || 34), TRIES_CAREFUL = +(process.env.BALANCE_TRIES_CAREFUL || 14);   // per hero; three heroes a row (42 / 102 / 42 tries pooled)
const DOORS = path.join(__dirname, 'balance-doors.json');

// ---------------------------------------------------------------- runner (no group named)
if (!process.argv.includes('--group')) {
  const { spawnSync } = require('child_process');
  const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const list = want.length ? want : GROUPS; let pass = 0, fail = 0; const bad = [];
  for (const g of list) {
    if (!GROUPS.includes(g)) { console.log(`[FAIL] ${g}: no such group (${GROUPS.join(', ')})`); fail++; bad.push(g); continue; }
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [__filename, '--group', g], { encoding: 'utf8', timeout: GROUP_MS, maxBuffer: 64 << 20, env: process.env });
    const out = (r.stdout || '') + (r.stderr ? r.stderr.split('\n').filter(l => /ERR|Error/.test(l)).join('\n') : '');
    process.stdout.write(out.endsWith('\n') || !out ? out : out + '\n');
    const p = (out.match(/^\[PASS\]/gm) || []).length, f = (out.match(/^\[FAIL\]/gm) || []).length;
    pass += p; fail += f;
    if (r.error || r.status !== 0 && !f) { console.log(`[FAIL] ${g}: group did not finish (${r.error ? r.error.code || r.error.message : 'exit ' + r.status})`); fail++; }
    if (f || r.error || r.status !== 0) bad.push(g);
    console.log(`[INFO] ${g}: ${p} pass, ${f} fail, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  console.log(`balance: ${pass} pass, ${fail} fail${bad.length ? ' (failing: ' + bad.join(', ') + ')' : ''}`);
  process.exit(fail ? 1 : 0);
}

// ---------------------------------------------------------------- one group
const GROUP = process.argv[process.argv.indexOf('--group') + 1];
let nPass = 0, nFail = 0;
const rec = (ok, name, detail) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${GROUP} ${name}${detail ? ' | ' + detail : ''}`); ok ? nPass++ : nFail++; };
const info = t => console.log(`[INFO] ${GROUP} ${t}`);
const pct = v => v == null ? '-' : Math.round(v * 100) + '%';
function wilson(k, n, z = 1.96) { if (!n) return [0, 1]; const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; }
function band(boss, profile) { return boss === 'demonKing' ? [0.55, 0.80] : boss === 'mosswarden' ? [0.85, 1] : [profile === 'g6' || profile === 'g5' ? 0.65 : 0.80, 1]; }
const ROUND_CAP = { celestialGuardian: 12, frostMonarch: 12, demonKing: 25 };
const HIT_CAP = 0.85, DK_SEC = 390, DK_ITEMS = 8;

// Day 4 B2 (review findings 1, 3, 7). What changed in this check, and why:
//   * the child: the INDEPENDENT median child of scripts/auto/honest/childmodel.cjs (HONEST_CHILD, default 'median'): her thinking time and
//     the drop of her right answers on harder kinds come from that file's own table, not from the effort table that sets the game's
//     timers. Every number in it is an assumption; nothing here is evidence about real children. HONEST_CHILD=effort gives the old model.
//   * out of sample: seed 771204, which no tuning run used (tuning used 20261123, 20261127 and 5550xx), and THREE heroes at every door:
//     the typical one of balance-doors.json, one two levels under and one two levels over (scripts/auto/honest/heroes.cjs).
//   * a row is one boss, its tries pooled over the three heroes; it PASSES only when the measured rate itself lies inside the band. The
//     95% Wilson interval is printed, never used to pass. Each hero's own count is printed after it.
//   * Demon King time: the median of the WON fights must be inside the limit (lost fights are shorter and used to pull the median down);
//     the median of the lost fights is printed beside it.
//   * the no-guess child (no lucky pick among four buttons: her share right is (p - 0.25) / 0.75) is a real row with its own band, stated
//     here: Demon King 40-80% on the first try with the same time limit; every other boss ten points under its reference band (typical hero).
//     BALANCE_NOGUESS=0 leaves these rows out.
const HEROES = [-2, 0, 2], HNAME = { '-2': 'two levels under', 0: 'typical', 2: 'two levels over' };
const SEED = +(process.env.BALANCE_SEED || 771204);
const TRIES_NG = +(process.env.BALANCE_TRIES_NOGUESS || 14), TRIES_NG_DK = +(process.env.BALANCE_TRIES_NOGUESS_DK || 20);
function pool(rows) {   // rows of one boss, one per hero -> one pooled row (medians over all tries are taken from the per-hero lists)
  const all = [].concat(...rows.map(r => r.trials || [])), S = require('../honest/sampler.cjs'), w = all.filter(t => t.res === 'win'), l = all.filter(t => t.res === 'loss');
  const typ = rows.find(r => r.heroShift === 0) || rows[0], sum = k => rows.reduce((x, r) => x + (r[k] || 0), 0), wavg = k => rows.reduce((x, r) => x + (r[k] || 0) * r.q, 0) / Math.max(1, sum('q'));
  return { boss: typ.boss, level: typ.level, n: all.length, wins: w.length, per: rows.map(r => `${HNAME[r.heroShift]} L${r.level} ${r.wins}/${r.n}`).join(', '),
    worstPct: typ.worstPct, worstUnder: Math.max(...rows.map(r => r.worstPct)), roundsMedian: S.median(all.map(t => t.rounds || 0)), secWins: S.median(w.map(t => t.sec || 0)), secLoss: S.median(l.map(t => t.sec || 0)), secAll: S.median(all.map(t => t.sec || 0)),
    itemsMedian: S.median(all.map(t => t.items || 0)), stuck: all.filter(t => t.res === 'stuck').length, critPerRound: all.reduce((x, t) => x + (t.crit || 0), 0) / Math.max(1, all.reduce((x, t) => x + (t.rounds || 0), 0)),
    toRate: all.reduce((x, t) => x + (t.to || 0), 0) / Math.max(1, all.reduce((x, t) => x + (t.q || 0), 0)), answerSec: wavg('answerSec'), pRight: wavg('pRight'), balance: typ.balance, child: typ.child };
}
async function sampleHeroes(S, H, profile, set, names, triesOf, o) {
  const doors = []; for (const b of names) for (const h of (o.heroes || HEROES)) doors.push({ boss: b, zone: set[b].zone, record: h ? H.shift(set[b].record, h) : set[b].record, from: set[b].from, tries: triesOf(b), heroShift: h });
  const rows = await S.sample({ profile, doors, policy: o.policy || 'reference', balanceOff: process.env.BALANCE_OFF === '1', seed: o.seed, keepTrials: true });
  rows.forEach((r, i) => { r.heroShift = doors[i].heroShift; });
  return names.map(b => pool(rows.filter(r => r.boss === b)));
}
async function bosses(profile) {
  const S = require('../honest/sampler.cjs'), H = require('../honest/heroes.cjs');
  if (!process.env.HONEST_CHILD) process.env.HONEST_CHILD = 'median'; else if (process.env.HONEST_CHILD === 'effort') delete process.env.HONEST_CHILD;
  const fx = JSON.parse(fs.readFileSync(DOORS, 'utf8')), set = fx.doors[profile];
  if (!set) { rec(false, 'door records for ' + profile, DOORS); return; }
  const only = process.env.BALANCE_BOSSES ? process.env.BALANCE_BOSSES.split(',') : null;
  const names = Object.keys(set).filter(b => !only || only.includes(b)), triesOf = b => b === 'demonKing' ? TRIES_DK : TRIES;
  info(`${names.length} bosses, three heroes each (two levels under, typical, two levels over), ${TRIES} tries a hero (Demon King ${TRIES_DK}); child: ${process.env.HONEST_CHILD || 'effort model (day 4 morning)'}; seed ${SEED}; pass = the measured rate itself is inside the band`);
  const rows = await sampleHeroes(S, H, profile, set, names, triesOf, { seed: SEED });
  fs.writeFileSync(path.join(OUT, `rows-${profile}.json`), JSON.stringify(rows, null, 1));
  if (rows[0]) info(`balance table ${rows[0].balance.balance ? (rows[0].balance.on ? 'on, version ' + rows[0].balance.version : 'present, switched off') : 'absent (unfixed build)'}${rows[0].balance.dkHard ? ', qok-dk-k1=hard' : ''}; class ${rows[0].balance.cls ? (rows[0].balance.cls.on ? 'on, timer cap ' + rows[0].balance.cls.timerCap : 'off') : 'absent'}`);
  judge(rows, profile, 'ref');
  // the no-guess child: real rows, own band
  if (process.env.BALANCE_NOGUESS !== '0') {
    const keep = process.env.HONEST_KEYPAD; process.env.HONEST_KEYPAD = 'noguess';
    try {
      const out = [];
      if (names.includes('demonKing')) out.push(...await sampleHeroes(S, H, profile, set, ['demonKing'], () => TRIES_NG_DK, { seed: SEED + 900 }));
      const rest = names.filter(b => b !== 'demonKing');
      if (rest.length && TRIES_NG > 0) out.push(...await sampleHeroes(S, H, profile, set, rest, () => TRIES_NG, { seed: SEED + 950, heroes: [0] }));
      fs.writeFileSync(path.join(OUT, `rows-${profile}-noguess.json`), JSON.stringify(out, null, 1));
      judge(out, profile, 'noguess');
    } finally { if (keep === undefined) delete process.env.HONEST_KEYPAD; else process.env.HONEST_KEYPAD = keep; }
  }
  // careful play against the Demon King, from the careful playthrough's own door record
  const sd = fx.savvyDoors && fx.savvyDoors[profile] && fx.savvyDoors[profile].demonKing;
  if (only && !only.includes('demonKing')) return;
  if (!sd) { rec(false, 'careful door record for ' + profile, DOORS + ' savvyDoors'); return; }
  info(`careful policy (heal under 50%, defend the charge): Demon King ${TRIES_CAREFUL} tries a hero, hero as in ${sd.from}`);
  const crow = await sampleHeroes(S, H, profile, { demonKing: sd }, ['demonKing'], () => TRIES_CAREFUL, { seed: SEED + 500, policy: 'savvy' });
  fs.writeFileSync(path.join(OUT, `rows-${profile}-careful.json`), JSON.stringify(crow, null, 1));
  judge(crow, profile, 'careful');
}
function bandOf(boss, profile, kind) {
  if (kind === 'careful') return [0.55, 1];
  if (kind === 'noguess') return boss === 'demonKing' ? [0.40, 0.80] : [band(boss, profile)[0] - 0.10, 1];
  return band(boss, profile);
}
function judge(rows, profile, kind) {
  const careful = kind === 'careful', tag = kind === 'ref' ? '' : kind + ' ';
  for (const r of rows) {
    const [lo, hi] = bandOf(r.boss, profile, kind), [wl, wh] = wilson(r.wins, r.n), rate = r.wins / r.n, bad = [], sec = r.wins ? r.secWins : r.secAll;
    if (rate < lo) bad.push(`win rate below ${pct(lo)}`);
    if (rate > hi) bad.push(`win rate above ${pct(hi)}`);
    if (r.worstPct > HIT_CAP) bad.push(`worst hit ${pct(r.worstPct)} of max HP (limit ${pct(HIT_CAP)})`);
    if (ROUND_CAP[r.boss] && r.roundsMedian > ROUND_CAP[r.boss]) bad.push(`median ${r.roundsMedian} rounds (limit ${ROUND_CAP[r.boss]})`);
    if (!careful && r.boss === 'demonKing' && sec > DK_SEC) bad.push(r.wins ? `won fights take a median ${Math.round(sec)} s (limit ${DK_SEC})` : `no fight was won; the lost fights take a median ${Math.round(sec)} s (limit for a won fight ${DK_SEC})`);
    if (!careful && r.boss === 'demonKing' && r.itemsMedian > DK_ITEMS) bad.push(`median ${r.itemsMedian} heal items (limit ${DK_ITEMS})`);
    if (r.stuck) bad.push(`${r.stuck} fights did not end`);
    if (careful && sec > DK_SEC) info(`careful ${r.boss}: won fights take a median ${Math.round(sec)} s, longer than the reference limit ${DK_SEC} s (not failed: defend and heal turns are turns)`);
    if (careful) { const hi2 = 0.90; if (rate > hi2) info(`careful ${r.boss}: win rate ${pct(rate)} (95% ${pct(wl)}-${pct(wh)}) lies above the soft ceiling ${pct(hi2)}`); }
    if (r.worstUnder > HIT_CAP && r.worstPct <= HIT_CAP) info(`${tag}${r.boss}: the hero two levels under can take ${pct(r.worstUnder)} of her max HP in one hit (limit ${pct(HIT_CAP)} is judged on the typical hero)`);
    rec(!bad.length, `${tag}${r.boss.padEnd(19)} L${r.level} | wins ${String(r.wins).padStart(3)}/${r.n} ${pct(rate).padStart(4)} (band ${pct(lo)}${hi < 1 ? '-' + pct(hi) : '+'}; 95% ${pct(wl)}-${pct(wh)}; ${r.per}) | rounds ${r.roundsMedian} | won ${r.wins ? Math.round(r.secWins) : '-'} s, lost ${r.n - r.wins - r.stuck ? Math.round(r.secLoss) : '-'} s | items ${r.itemsMedian} | worst hit ${pct(r.worstPct)} (under-levelled ${pct(r.worstUnder)}) | crit ${pct(r.critPerRound)} | timeouts ${(r.toRate * 100).toFixed(1)}% | answer ${r.answerSec ? r.answerSec.toFixed(1) : '-'} s`, bad.join('; '));
  }
}

async function zones() {
  const L = require('../../acts/probe/lib.cjs'), W = require('../honest/world.cjs');
  const DIST = process.env.HONEST_DIST || '/home/user/work/dist';
  const T = W.tables(), fx = JSON.parse(fs.readFileSync(DOORS, 'utf8'));
  const A2 = JSON.parse(fs.readFileSync(path.join(DIST, 'acts-dungeons/manifest.json'), 'utf8')).floors, A1 = JSON.parse(fs.readFileSync(path.join(DIST, 'act1-dungeon-floors.json'), 'utf8')).floors;
  const ids = z => T.zones[z].monsters.map(m => m.monsterId);
  const hero = fx.doors.g3.demonKing.record;
  const seed = (position, state) => ({ version: 4, timestamp: Date.now(), player: { ...(state || hero.state), position }, playtime: 0, quizStats: {} });
  // the scene's own step, with the battle start caught: which monsters does this spot roll?
  const roll = page => page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), em = window.__GAME_STATE__.encounterManager, got = {};
    try { delete em.onStep; } catch (e) {}
    const start = w.startBattle; w.startBattle = m => { got[m.id] = (got[m.id] || 0) + 1; };
    try { for (let i = 0, n = 0; i < 3000 && n < 40; i++) { em.stepsSinceLastEncounter = 60; const b = Object.values(got).reduce((a, x) => a + x, 0); w.onStep(); if (Object.values(got).reduce((a, x) => a + x, 0) > b) n++; } }
    finally { w.startBattle = start; em.onStep = () => null; }
    const B = window.__QOK_BALANCE__;
    return { map: w.currentMapId, x: w.heroTileX, y: w.heroTileY, zone: w.currentEncounterZone, got, balance: !!B, on: B ? B.on() : false }; });
  const o = await L.launch(), page = o.page;
  try {
    // the table itself, read from the page (so the check follows the table)
    await L.bootSave(page, seed({ mapId: 'overworld', x: 69, y: 256, floor: 1 }, fx.doors.g1.mosswarden.record.state), { settle: 1500 });
    const table = await page.evaluate(() => { const B = window.__QOK_BALANCE__; return B ? { dz: B.table.dungeonZones, sp: B.table.starterPlains, v: B.table.version } : null; });
    rec(!!table, 'the balance table is installed', table ? 'version ' + table.v : 'window.__QOK_BALANCE__ is missing');
    const DZ = table ? table.dz : { hauntedForest: { from: 'whispering-woods', to: 'haunted-forest' } };
    // Greenhollow's doorstep
    const g = await roll(page), starter = ids('greenhollow-plains');
    rec(g.map === 'overworld' && Object.keys(g.got).length > 0 && Object.keys(g.got).every(m => starter.includes(m)), `Greenhollow's doorstep (69,256) rolls the starter table (${starter.join(', ')})`, JSON.stringify(g.got));
    // every dungeon in the table
    for (const id of Object.keys(DZ)) {
      const f = A2[id + '-f1'] || A1[id + '-f1'], at = f && ((f.land && f.land.mouth) || f.assets.find(a => a.kind === 'mouth'));
      if (!at) { rec(false, `${id}: floor 1 not found in the floor data`); continue; }
      await L.bootSave(page, seed({ mapId: id, x: at.x, y: at.y, floor: 1 }), { settle: 1200 });
      const r = await roll(page), want = ids(DZ[id].to), n = Object.values(r.got).reduce((a, x) => a + x, 0);
      rec(r.map === id && n > 0 && Object.keys(r.got).every(m => want.includes(m)), `${id} rolls its own table ${DZ[id].to} (${want.join(', ')})`, `${n} encounters: ${JSON.stringify(r.got)}`);
    }
    // the switch: shipped zones and shipped boss numbers
    if (!table) { rec(false, 'switch off (qok-balance=0): not tested, there is no table to switch'); return; }
    const hf = A2['hauntedForest-f1'].land.mouth;
    await L.bootSave(page, seed({ mapId: 'hauntedForest', x: hf.x, y: hf.y, floor: 1 }), { settle: 1200, extra: { 'qok-balance': '0' } });
    const off = await roll(page), old = ids('whispering-woods');
    rec(off.balance && !off.on && Object.keys(off.got).length > 0 && Object.keys(off.got).every(m => old.includes(m)), `switch off (qok-balance=0): hauntedForest rolls the shipped table whispering-woods again`, JSON.stringify(off.got));
    const same = await page.evaluate(() => { const B = window.__QOK_BALANCE__, em = window.__GAME_STATE__.encounterManager, w = console.warn; console.warn = () => {};
      try { const out = {}; for (const id of Object.keys(B.table.bosses)) { const m = em.rollEncounter({ monsters: [{ monsterId: id, weight: 1 }] }); out[id] = B.tuned(m, '6') === m && B.tuned(m, '1') === m; } return out; } finally { console.warn = w; } });
    rec(Object.keys(same).length > 0 && Object.values(same).every(Boolean), 'switch off: every boss in the table fights with its shipped numbers', Object.keys(same).filter(k => !same[k]).join(', ') || Object.keys(same).length + ' bosses');
    // Day 4 B2 (review finding 5): every earlier table can be chosen, and the old bank picks the table tuned for it. Expected numbers are
    // written out here (Demon King hp / rage / charge by grade K to 6, and the Celestial Guardian's regen at grade 5), not read from the game.
    const WANT = {
      '2026-11-27c': { dk: ['900/1.6/1.5', '1050/1.6/1.5', '1300/1.75/1.6', '1400/1.5/1.6', '1400/1.5/1.6', '1250/1.3/1.45', '1400/1.3/1.45'], cg5: 0.02 },
      '2026-11-27b': { dk: ['900/1.7/1.6', '1050/1.7/1.6', '1300/1.75/1.6', '1400/1.5/1.6', '1400/1.5/1.6', '1250/1.35/1.45', '1400/1.3/1.45'], cg5: 0.02 },
      '2026-11-27a': { dk: ['1300/1.6/1.5', '1500/1.6/1.5', '1500/1.7/1.6', '1500/1.5/1.6', '1500/1.5/1.6', '1400/1.3/1.45', '1400/1.3/1.45'], cg5: 0.03 },
    };
    const HARD = ['900/1.7/1.6', '1050/1.7/1.6'].concat(WANT['2026-11-27c'].dk.slice(2));
    const readTable = ls => page.evaluate(ls => { const B = window.__QOK_BALANCE__, em = window.__GAME_STATE__.encounterManager, w = console.warn, keys = ['qok-balance', 'qok-quiz2', 'qok-dk-k1'], keep = keys.map(k => localStorage.getItem(k)); console.warn = () => {};
      try { keys.forEach(k => localStorage.removeItem(k)); for (const k in ls) localStorage.setItem(k, ls[k]);
        const dk = em.rollEncounter({ monsters: [{ monsterId: 'demonKing', weight: 1 }] }), cg = em.rollEncounter({ monsters: [{ monsterId: 'celestialGuardian', weight: 1 }] }), ab = (m, t) => (m.bossAbilities.find(a => a.type === t) || {});
        return { which: B.which ? B.which() : null, shipped: B.tuned(dk, '3') === dk, dk: ['k', '1', '2', '3', '4', '5', '6'].map(g => { const m = B.tuned(dk, g); return m.baseHp + '/' + ab(m, 'rage').atkMultiplier + '/' + ab(m, 'charge').chargeMultiplier; }), cg5: ab(B.tuned(cg, '5'), 'regen').healFraction };
      } finally { console.warn = w; keys.forEach((k, i) => keep[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, keep[i])); } }, ls);
    const same2 = (got, v) => got.which === v && JSON.stringify(got.dk) === JSON.stringify(WANT[v].dk) && got.cg5 === WANT[v].cg5;
    let t = await readTable({});
    rec(same2(t, '2026-11-27c'), 'no switch, quiz bank v2: table 2026-11-27c (Demon King K and 1 with the gentler hits: rage 1.6, charge 1.5)', JSON.stringify(t));
    t = await readTable({ 'qok-balance': '27c' }); rec(same2(t, '2026-11-27c'), 'qok-balance=27c: table 2026-11-27c', JSON.stringify(t.dk));
    t = await readTable({ 'qok-balance': '27b' }); rec(same2(t, '2026-11-27b'), 'qok-balance=27b: the table of the afternoon of 2026-11-27 (Demon King K and 1: rage 1.7, charge 1.6)', JSON.stringify(t.dk));
    t = await readTable({ 'qok-balance': '27a' }); rec(same2(t, '2026-11-27a'), 'qok-balance=27a: the table of the morning of 2026-11-27 (Demon King hp 1300 / 1500, Celestial Guardian regen 0.03 at grade 5)', JSON.stringify(t));
    t = await readTable({ 'qok-quiz2': '0' }); rec(same2(t, '2026-11-27a'), 'qok-quiz2=0 (old bank), no other switch: table 2026-11-27a is picked by itself', JSON.stringify(t));
    t = await readTable({ 'qok-quiz2': '0', 'qok-balance': '27c' }); rec(same2(t, '2026-11-27c'), 'qok-quiz2=0 with qok-balance=27c: the named table wins', JSON.stringify(t.dk));
    t = await readTable({ 'qok-balance': '0' }); rec(t.which === '0' && t.shipped, 'qok-balance=0: the shipped Demon King', JSON.stringify(t));
    t = await readTable({ 'qok-dk-k1': 'hard' }); rec(t.which === '2026-11-27c' && JSON.stringify(t.dk) === JSON.stringify(HARD), 'qok-dk-k1=hard: grades K and 1 get rage 1.7 and charge 1.6 back, nothing else moves', JSON.stringify(t.dk));
    t = await readTable({ 'qok-dk-k1': 'hard', 'qok-balance': '27a' }); rec(same2(t, '2026-11-27a'), 'qok-dk-k1=hard does nothing on an older table', JSON.stringify(t.dk));
    await L.bootSave(page, seed({ mapId: 'overworld', x: 69, y: 256, floor: 1 }, fx.doors.g1.mosswarden.record.state), { settle: 1200, extra: { 'qok-balance': '0' } });
    const goff = await roll(page);
    rec(Object.keys(goff.got).some(m => !starter.includes(m)), `switch off: Greenhollow's doorstep rolls the shipped table again`, JSON.stringify(goff.got));
  } finally { await o.browser.close(); }
}

(async () => {
  if (GROUP === 'zones') await zones(); else await bosses(GROUP);
  console.log(`${GROUP}: ${nPass} pass, ${nFail} fail`);
  process.exit(nFail ? 1 : 0);
})().catch(e => { console.log(`[FAIL] ${GROUP} crashed: ${e && e.stack || e}`); process.exit(1); });
