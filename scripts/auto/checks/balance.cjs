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
// gk g1 g2 g3 g4 g5 g6   (gk = kindergarten)   A reduced boss sampler. The hero is the one an honest playthrough brought to each
//                boss door (scripts/auto/checks/balance-doors.json: level, gear, bag and HP as she
//                arrived, no grinding). She fights each boss BALANCE_TRIES times (default 40; the
//                Demon King BALANCE_TRIES_DK, default 100) in the real BattleScene with the
//                reference policy: answers right 65 / 70 / 75 / 80 / 83 / 87 / 90 % of the time (K to 6, scripts/auto/honest/profiles.cjs; grades K, 2, 4, 5 are interpolated), never defends, drinks
//                under 35 % HP. Targets (the lead's, 2026-11-23):
//                  (Doors of g1, g3, g6 come from the day 1 four-button playthroughs, r1; those of gk, g2, g4, g5 from day 4
//                  playthroughs with the keypad child, the median-level run per door: see 'sources' in the json.)
//                  Mosswarden            win rate >= 85 % at every grade
//                  every other boss      >= 80 % at grades K to 4, >= 65 % at grades 5 and 6 (the grades where the
//                                        engine scales monsters x1.3; grades 4 and 5 are the day 4 extension: NEEDS-CONSULT)
//                  Demon King            55-80 % at every grade, median <= 25 rounds,
//                                        median <= 6.5 minutes of play, median <= 8 heal items
//                  every boss            the worst single hit (wrong defence answer, top damage
//                                        roll, rage and charge together) <= 85 % of her max HP
//                  Celestial Guardian, Frost Monarch   median <= 12 rounds
//                Careful play (rows "careful"): the Demon King again, BALANCE_TRIES_CAREFUL tries (default
//                40), with the hero exactly as the careful ("savvy") playthrough brought her to its door
//                (balance-doors.json savvyDoors: that run drank more on the way, so fewer potions) and the
//                careful policy: heals under 50 % HP against a boss, defends the turn after a charge is
//                announced. Target (owner rule P8, 2026-11-24): >= 55 % at every grade (fails on the
//                2026-11-23d table: about 13 % at grade 6, where defend and heal turns still took 5 %
//                poison); the soft ceiling of about 90 % is reported as [INFO], not failed.
//                A win rate is a sample, so a row PASSES when the 95 % Wilson interval of the
//                measured rate overlaps the target band, and FAILS only when the whole interval
//                lies outside it. With 40 tries that fails a ">= 85 %" boss at 29/40 or fewer and
//                a ">= 65 %" boss at 20/40 or fewer; with 100 tries the Demon King fails at 45 or
//                fewer and at 88 or more wins. The other limits are exact.
// zones          Item C: in each dungeon of the table the scene's own step rolls the monsters of
//                that dungeon's table; the fields at Greenhollow's door roll the starter table;
//                and localStorage['qok-balance']='0' puts the shipped zones and boss numbers back.
const fs = require('fs'), path = require('path'), os = require('os');
const OUT = process.env.BALANCE_OUT || path.join(os.tmpdir(), 'qok-balance');
fs.mkdirSync(OUT, { recursive: true });
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(OUT, 'probe-out');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5504/';
const GROUPS = ['gk', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'zones'];
const GROUP_MS = 470000;
const TRIES = +(process.env.BALANCE_TRIES || 40), TRIES_DK = +(process.env.BALANCE_TRIES_DK || 100), TRIES_CAREFUL = +(process.env.BALANCE_TRIES_CAREFUL || 40);
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

async function bosses(profile) {
  const S = require('../honest/sampler.cjs');
  const fx = JSON.parse(fs.readFileSync(DOORS, 'utf8')), set = fx.doors[profile];
  if (!set) { rec(false, 'door records for ' + profile, DOORS); return; }
  const only = process.env.BALANCE_BOSSES ? process.env.BALANCE_BOSSES.split(',') : null;
  const doors = Object.keys(set).filter(b => !only || only.includes(b)).map(b => ({ boss: b, zone: set[b].zone, record: set[b].record, from: set[b].from, tries: b === 'demonKing' ? TRIES_DK : TRIES }));
  info(`${doors.length} bosses, ${TRIES} tries each (Demon King ${TRIES_DK}), hero as in ${fx.source}; pass = the 95% interval of the win rate overlaps the band`);
  const rows = await S.sample({ profile, doors, balanceOff: process.env.BALANCE_OFF === '1', seed: +(process.env.BALANCE_SEED || 20261123) });
  fs.writeFileSync(path.join(OUT, `rows-${profile}.json`), JSON.stringify(rows, null, 1));
  if (rows[0]) info(`balance table ${rows[0].balance.balance ? (rows[0].balance.on ? 'on, version ' + rows[0].balance.version : 'present, switched off') : 'absent (unfixed build)'}`);
  judge(rows, profile, false);
  // careful play against the Demon King, from the careful playthrough's own door record
  const sd = fx.savvyDoors && fx.savvyDoors[profile] && fx.savvyDoors[profile].demonKing;
  if (only && !only.includes('demonKing')) return;
  if (!sd) { rec(false, 'careful door record for ' + profile, DOORS + ' savvyDoors'); return; }
  info(`careful policy (heal under 50%, defend the charge): Demon King ${TRIES_CAREFUL} tries, hero as in ${sd.from}`);
  const crow = await S.sample({ profile, doors: [{ boss: 'demonKing', zone: sd.zone, record: sd.record, from: sd.from, tries: TRIES_CAREFUL }], policy: 'savvy', balanceOff: process.env.BALANCE_OFF === '1', seed: +(process.env.BALANCE_SEED || 20261123) + 500 });
  fs.writeFileSync(path.join(OUT, `rows-${profile}-careful.json`), JSON.stringify(crow, null, 1));
  judge(crow, profile, true);
}
function judge(rows, profile, careful) {
  for (const r of rows) {
    const [lo, hi] = careful ? [0.55, 1] : band(r.boss, profile), [wl, wh] = wilson(r.wins, r.n), rate = r.wins / r.n, bad = [];
    if (wh < lo) bad.push(`win rate below ${pct(lo)}`);
    if (wl > hi) bad.push(`win rate above ${pct(hi)}`);
    if (r.worstPct > HIT_CAP) bad.push(`worst hit ${pct(r.worstPct)} of max HP (limit ${pct(HIT_CAP)})`);
    if (ROUND_CAP[r.boss] && r.roundsMedian > ROUND_CAP[r.boss]) bad.push(`median ${r.roundsMedian} rounds (limit ${ROUND_CAP[r.boss]})`);
    if (!careful && r.boss === 'demonKing' && r.secMedian > DK_SEC) bad.push(`median ${Math.round(r.secMedian)} s (limit ${DK_SEC})`);
    if (!careful && r.boss === 'demonKing' && r.itemsMedian > DK_ITEMS) bad.push(`median ${r.itemsMedian} heal items (limit ${DK_ITEMS})`);
    if (r.stuck) bad.push(`${r.stuck} fights did not end`);
    if (careful && r.secMedian > DK_SEC) info(`careful ${r.boss}: median ${Math.round(r.secMedian)} s, longer than the reference limit ${DK_SEC} s (not failed: defend and heal turns are turns)`);
    if (careful) { const hi2 = 0.90; if (wl > hi2) info(`careful ${r.boss}: win rate ${pct(rate)} (95% ${pct(wl)}-${pct(wh)}) lies above the soft ceiling ${pct(hi2)}`); }
    rec(!bad.length, `${careful ? 'careful ' : ''}${r.boss.padEnd(19)} L${r.level} | wins ${String(r.wins).padStart(3)}/${r.n} ${pct(rate).padStart(4)} (95% ${pct(wl)}-${pct(wh)}; band ${pct(lo)}${hi < 1 ? '-' + pct(hi) : '+'}) | rounds ${r.roundsMedian} | ${Math.round(r.secMedian)} s | items ${r.itemsMedian} | worst hit ${pct(r.worstPct)}`, bad.join('; '));
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
