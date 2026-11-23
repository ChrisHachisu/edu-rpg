'use strict';
// Honest player, part 5: the after report. Puts the numbers of the fixed build next to the numbers of build 98.
//   node scripts/auto/honest/report.cjs /home/user/work/honest/runs-after /home/user/work/honest/after-out/    (the after tables)
//   node scripts/auto/honest/report-after.cjs [beforeResults.json] [afterResults.json] [balanceRowsDir] [outDir]
// REPORT-after.md = after.txt (hand-written: verdicts, options, limits; kept next to this script) + generated tables.
// The "changed numbers" table is read from the table in public/battle-recovery.js and the bundle's monster table,
// so it cannot drift from the game.
const fs = require('fs'), path = require('path');
const BEFORE = process.argv[2] || '/mnt/project-files/edu-rpg/autoloop/honest/results.json';
const AFTER = process.argv[3] || '/home/user/work/honest/after-out/results.json';
const ROWS = process.argv[4] || '/home/user/work/honest/balance-final';
const OUT = process.argv[5] || '/mnt/project-files/edu-rpg/autoloop/honest/';
const WORLD = require('./world.cjs'), W = WORLD.build(), TB = WORLD.tables();
const B = JSON.parse(fs.readFileSync(BEFORE, 'utf8')), A = JSON.parse(fs.readFileSync(AFTER, 'utf8'));
const PROFILES = ['g1', 'g3', 'g6'], PNAME = { g1: 'grade 1', g3: 'grade 3', g6: 'grade 6' };
const sum = a => a.reduce((x, y) => x + y, 0);
const r1 = v => v == null || isNaN(v) ? '–' : (Math.round(v * 10) / 10).toString(), r0 = v => v == null || isNaN(v) ? '–' : Math.round(v).toString(), pct = v => v == null || isNaN(v) ? '–' : Math.round(v * 100) + '%';
const T = (head, lines) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${lines.map(l => `| ${l.join(' | ')} |`).join('\n')}\n`;
const ba = (b, a) => b === a ? `${a}` : `${b} → ${a}`;
const row = (R, v, p, n) => ((R.rows[v] || {})[p] || []).find(x => x.n === n);

// ---------------------------------------------------------------- the table in the game
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'public', 'battle-recovery.js'), 'utf8');
const m = src.match(/var BALANCE = (\{[\s\S]*?\n {2}\});/); if (!m) throw new Error('BALANCE table not found in public/battle-recovery.js');
const BAL = (0, eval)('(' + m[1] + ')');
const GR = ['k', '1', '2', '3', '4', '5', '6'], GSCALE = g => ['k', '1', '2'].includes(g) ? 0.85 : ['5', '6'].includes(g) ? 1.3 : 1;
function shipped(mon) { const ab = mon.bossAbilities || [], f = t => ab.find(a => a.type === t), rg = f('regen'), po = f('poison'), ra = f('rage'), ch = f('charge');
  return { hp: mon.baseHp, atk: mon.baseAtk, def: mon.baseDef, regen: rg ? rg.healFraction : null, poison: po ? po.poisonFraction : null, rage: ra ? (ra.atkMultiplier == null ? 1.5 : ra.atkMultiplier) : null, rageAt: ra ? ra.hpThreshold : null, charge: ch ? (ch.chargeMultiplier == null ? 2 : ch.chargeMultiplier) : null, chargeEvery: ch ? ch.chargeInterval : null }; }
function tunedFor(id, g) { const s = shipped(TB.monsters[id]), t = BAL.bosses[id] || {}, o = (t.grade && t.grade[g]) || {}, c = Object.assign({}, s);
  for (const k of ['hp', 'atk', 'def', 'regen', 'poison', 'rage', 'rageAt', 'charge', 'chargeEvery']) { const v = o[k] != null ? o[k] : t[k]; if (v != null && s[k] != null) c[k] = v; }
  if (o.scale != null) { c.hp = Math.max(1, Math.round(c.hp * o.scale)); c.atk = Math.max(1, Math.round(c.atk * o.scale)); c.def = Math.max(0, Math.round(c.def * o.scale)); }
  return c; }
const LABEL = { hp: 'HP (base)', atk: 'attack (base)', def: 'defence (base)', regen: 'regen per turn (share of base HP)', poison: 'poison per turn (share of hero max HP)', rage: 'rage attack multiplier', rageAt: 'rage starts at (share of HP)', charge: 'charge attack multiplier', chargeEvery: 'turns between charges' };
function changedNumbers() {
  const lines = [];
  for (const id of Object.keys(BAL.bosses)) { const s = shipped(TB.monsters[id]);
    for (const k of Object.keys(LABEL)) { const per = GR.map(g => tunedFor(id, g)[k]); if (per.every(v => v === s[k])) continue;
      const groups = [['grades K-2', per[0]], ['grades 3-4', per[3]], ['grades 5-6', per[5]]], same = groups.every(x => x[1] === groups[0][1]);
      lines.push([id, LABEL[k], s[k], same ? groups[0][1] : groups.map(x => `${x[1]}${x[1] === s[k] ? ' (unchanged)' : ''} ${x[0]}`).join('; ')]); } }
  return T(['boss', 'value', 'before (shipped)', 'after (table)'], lines);
}
function zoneLines() {
  const names = z => TB.zones[z].monsters.map(x => `${x.monsterId} ${x.weight}`).join(', ');
  const lines = Object.entries(BAL.dungeonZones).map(([id, z]) => [id, `${z.from}: ${names(z.from)}`, `${z.to}: ${names(z.to)}`]);
  const s = BAL.starterPlains; lines.push([`overworld, x < ${s.xMax} and ${s.yMin} < y <= ${s.yMax} (Greenhollow's door and the road south)`, `${s.from}: ${names(s.from)}`, `${s.to}: ${names(s.to)}`]);
  return T(['where', 'before: zone and monsters (weight)', 'after: zone and monsters (weight)'], lines);
}

// ---------------------------------------------------------------- side by side
function target(id, p) { return id === 'demonKing' ? '55-80%' : id === 'mosswarden' ? '>= 85%' : p === 'g6' ? '>= 65%' : '>= 80%'; }
function inBand(id, p, rate) { return id === 'demonKing' ? rate >= 0.55 && rate <= 0.80 : rate >= (id === 'mosswarden' ? 0.85 : p === 'g6' ? 0.65 : 0.80); }
function bossGlance() {
  const head = ['stop', 'act', 'boss'], lines = []; for (const p of PROFILES) head.push(`${PNAME[p]} before`, `${PNAME[p]} after`, 'target');
  for (const st of W.stops) { const cells = []; let any = null;
    for (const p of PROFILES) { const b = row(B, 'main', p, st.n), a = row(A, 'main', p, st.n); any = any || (a && a.boss && a) || (b && b.boss && b);
      const f = r => r && r.boss ? `${pct(r.boss.rate)} (${r.boss.wins}/${r.boss.n}, L${r1(r.boss.lvl)})` : r && r.gateBlocked ? 'gate closed' : '–';
      const id = any && any.boss.id, ok = a && a.boss && id ? inBand(id, p, a.boss.rate) : null;
      cells.push(f(b), (ok === false ? '**' : '') + f(a) + (ok === false ? '**' : ''), id ? target(id, p) : ''); }
    if (any) lines.push([st.n, st.act, any.boss.id + (any.optional ? ' (optional)' : ''), ...cells]); }
  return T(head, lines);
}
function variantGlance(v) {
  const head = ['stop', 'boss'], lines = []; for (const p of PROFILES) head.push(`${PNAME[p]} before`, `${PNAME[p]} after`);
  for (const st of W.stops) { const cells = []; let any = null;
    for (const p of PROFILES) { const b = row(B, v, p, st.n), a = row(A, v, p, st.n); any = any || (a && a.boss && a) || (b && b.boss && b);
      const f = r => r && r.boss ? `${pct(r.boss.rate)} (${r.boss.wins}/${r.boss.n})${Object.keys(r.boss.lost || {}).length ? ' reward lost: ' + Object.keys(r.boss.lost).join(',') : ''}${r.gateBlocked ? ' gate closed' : ''}` : r && r.gateBlocked ? 'gate closed' : '–';
      cells.push(f(b), f(a)); }
    if (any) lines.push([st.n, any.boss.id + (any.optional ? ' (optional)' : ''), ...cells]); }
  return T(head, lines);
}
function story() {
  const lines = [];
  for (const v of ['main', 'savvy', 'nosell']) for (const p of PROFILES) { const cell = R => { const rows = (R.rows[v] || {})[p]; if (!rows) return null; const ds = rows.filter(r => r.dungeon), runs = ((R.meta.runs[v] || {})[p]) || [];
      return { n: runs.length, fights: r1(sum(ds.map(r => r.dungeon.fights)) + sum(rows.map(r => r.leg ? r.leg.fights : 0))), deaths: sum(ds.map(r => r.dungeon.deaths)) + sum(rows.map(r => r.leg ? r.leg.deaths : 0)), min: r1(sum(ds.map(r => r.dungeon.minutes || 0)) + sum(rows.map(r => r.leg ? r.leg.sec / 60 : 0))),
        lvl: r1((rows[rows.length - 1].after || {}).level), gold: r0((rows[rows.length - 1].after || {}).gold), forced: [...new Set(runs.flatMap(r => r.forced || []))].join(', ') || '–' }; };
    const b = cell(B), a = cell(A); if (!b && !a) continue; const x = k => ba(b ? b[k] : '–', a ? a[k] : '–');
    lines.push([v, PNAME[p], x('n'), x('fights'), `${b ? b.deaths : '–'} → ${a ? a.deaths : '–'}${b && a && b.n !== a.n ? ` (per run ${r1(b.deaths / b.n)} → ${r1(a.deaths / a.n)})` : ''}`, x('min'), x('lvl'), x('gold'), b ? b.forced : '–', a ? a.forced : '–']); }
  return T(['variant', 'profile', 'runs', 'random fights per run', 'deaths to random fights (all runs)', 'minutes of random battles per run', 'final level', 'gold at the end', 'walls passed only by forcing: before', 'after'], lines);
}
function acts() {
  let s = '';
  for (let act = 1; act <= 5; act++) {
    const dl = [], bl = [], tl = [];
    for (const st of W.stops.filter(x => x.act === act)) for (const p of PROFILES) { const b = row(B, 'main', p, st.n), a = row(A, 'main', p, st.n); if (!a && !b) continue; const r = a || b;
      if (r.dungeon) { const x = f => ba(b && b.dungeon ? f(b.dungeon) : '–', a && a.dungeon ? f(a.dungeon) : '–');
        dl.push([`${st.n} ${r.id}${r.optional ? ' (optional)' : ''}`, PNAME[p], ba(b && b.dungeon ? b.dungeon.zone : '–', a && a.dungeon ? (BAL.dungeonZones[r.id] && BAL.dungeonZones[r.id].from === a.dungeon.zone ? BAL.dungeonZones[r.id].to : a.dungeon.zone) : '–'), x(d => r1(d.lvl)), x(d => r1(d.fights)), x(d => pct(d.lostPct)), x(d => pct(d.maxHitPct)), x(d => r1(d.rounds)), `${b && b.dungeon ? b.dungeon.deaths + '/' + b.reps : '–'} → ${a && a.dungeon ? a.dungeon.deaths + '/' + a.reps : '–'}`, x(d => r1(d.items)), x(d => r1(d.chests)), x(d => r1(d.xpPerFight)), x(d => r1(d.lvlLeave)), x(d => r0(d.goldLeave)), x(d => r1(d.minutes))]); }
      if (r.boss) { const x = f => ba(b && b.boss ? f(b.boss) : '–', a && a.boss ? f(a.boss) : '–');
        bl.push([`${st.n} ${r.boss.id}${r.optional ? ' (optional)' : ''}`, PNAME[p], x(q => `${q.wins}/${q.n} (${pct(q.rate)})`), x(q => r1(q.lvl)), x(q => `${q.mhp} / ${q.matk} / ${q.mdef}`), x(q => r1(q.rounds)), x(q => pct(q.margin)), x(q => pct(q.maxHitPct)), x(q => r1(q.items)), x(q => r0(q.sec))]); }
      if (r.town) { const x = f => ba(b && b.town ? f(b.town) : '–', a && a.town ? f(a.town) : '–'), lg = q => q && q.leg ? `${r1(q.leg.fights)} / ${q.leg.deaths}` : '–';
        tl.push([`${st.n} ${r.place}${st.t === 'isle' ? ' village' : ''}`, PNAME[p], x(t => r1(t.level)), x(t => r0(t.gold0)), x(t => Object.keys(t.bought).join(', ') || '–'), x(t => r0(t.gold1)), x(t => r1(t.bag)), ba(lg(b), lg(a))]); }
    }
    s += `\n### Act ${act}\n\nDungeons, random encounters on the route (before → after; one value = unchanged)\n\n` + T(['stop', 'profile', 'monster table', 'level on arrival', 'fights', 'HP lost per fight (of max)', 'biggest hit (of max HP)', 'rounds per fight', 'deaths / runs', 'heal items used', 'chests opened', 'XP per fight', 'level on leaving', 'gold on leaving', 'minutes of battle'], dl);
    s += `\nBosses (20 tries per run, each from the record she walked in with)\n\n` + T(['stop', 'profile', 'wins', 'level', 'boss HP / ATK / DEF', 'rounds (wins)', 'HP left (wins)', 'biggest hit seen (of max HP)', 'heal items per try', 'seconds per try'], bl);
    s += `\nTowns and the walk there\n\n` + T(['stop', 'profile', 'level', 'gold on arrival', 'gear bought', 'gold on leaving', 'bag stacks', 'walk: fights / deaths'], tl);
  }
  return s;
}
function flagsCount() {
  const lines = []; for (const v of ['main', 'savvy', 'nosell']) for (const sev of ['blocker', 'major', 'polish']) { const f = R => R.flags.filter(x => x.variant === v && x.sev === sev), b = f(B), a = f(A); if (!b.length && !a.length) continue;
    const kinds = l => { const o = {}; for (const x of l) o[x.kind] = (o[x.kind] || 0) + 1; return Object.entries(o).map(([k, n]) => `${k} ${n}`).join(', ') || '–'; };
    lines.push([v, sev, b.length, a.length, kinds(b), kinds(a)]); }
  let s = T(['variant', 'severity', 'flags before', 'flags after', 'kinds before', 'kinds after'], lines);
  for (const v of ['main', 'savvy', 'nosell']) { const g = A.flags.filter(x => x.variant === v && (x.sev === 'blocker' || x.sev === 'major')); s += `\n**Blocker and major flags left after (${v})**\n\n`; if (!g.length) { s += '(none)\n'; continue; }
    const by = {}; for (const x of g) { const k = x.sev + '|' + x.kind + '|' + x.where + '|' + (x.monster || x.boss || x.text.replace(/\d+/g, '#')); (by[k] = by[k] || []).push(x); }
    for (const xs of Object.values(by)) s += `- ${xs[0].sev} [${xs[0].kind}] ${xs[0].where}: ` + xs.map(x => `${PNAME[x.profile]}: ${x.text}`).join(' / ') + '\n'; }
  return s;
}
function checkRows() {
  const lines = []; let meta = '';
  for (const id of Object.keys(TB.monsters)) for (const p of PROFILES) { const f = path.join(ROWS, `rows-${p}.json`); if (!fs.existsSync(f)) continue; const r = JSON.parse(fs.readFileSync(f, 'utf8')).find(x => x.boss === id); if (!r) continue;
    meta = `balance table version ${r.balance.version}`;
    lines.push({ n: W.stops.findIndex(s => { const d = W.dungeons[s.t === 'isle' ? s.dungeon : s.id]; return d && d.bossId === id; }), l: [id, PNAME[p], `L${r.level}, ${r.maxHp} HP, DEF ${r.def}`, `${r.mhp} / ${r.matk} / ${r.mdef}`, `${r.wins}/${r.n} (${pct(r.wins / r.n)})`, target(id, p), r.roundsMedian, r0(r.secMedian), r.itemsMedian, pct(r.worstPct)] }); }
  lines.sort((x, y) => x.n - y.n || 0);
  return (meta ? meta + '\n\n' : '') + T(['boss', 'profile', 'hero at the door', 'boss HP / ATK / DEF', 'wins', 'target', 'median rounds', 'median seconds', 'median heal items', 'worst possible hit (of max HP)'], lines.map(x => x.l));
}

// ---------------------------------------------------------------- write
const hand = fs.existsSync(path.join(__dirname, 'after.txt')) ? fs.readFileSync(path.join(__dirname, 'after.txt'), 'utf8') : '# Honest player: after the fixes\n\n(after.txt not written yet; the tables below are generated)\n';
let md = hand.trimEnd() + '\n\n---\n\n# Generated tables\n\n';
md += `Generated ${new Date().toISOString()} by \`scripts/auto/honest/report-after.cjs\`. Before = build 98 (port 5500), runs: ${Object.entries(B.meta.runs).map(([v, o]) => `${v} ` + Object.entries(o).map(([p, l]) => `${p} x${l.length}`).join(' ')).join('; ')}. After = the fixed build (port 5504), runs: ${Object.entries(A.meta.runs).map(([v, o]) => `${v} ` + Object.entries(o).map(([p, l]) => `${p} x${l.length}`).join(' ')).join('; ')}. Cells read "before → after"; a single value means no change.\n`;
md += `\n## Every changed number\n\nBoss numbers (the table \`BALANCE.bosses\` in \`public/battle-recovery.js\`, version ${BAL.version}). Base numbers are before the grade scale the engine applies (x0.85 grades K-2, x1.3 grades 5-6). \`localStorage['qok-balance']='0'\` restores the "before" column.\n\n` + changedNumbers();
md += `\nMonster tables (same switch)\n\n` + zoneLines();
md += `\n## Boss win rates at a glance: before and after\n\nReference policy (never defends, sells outgrown gear). Wins over all tries of all runs (tries, mean level at the boss door). Bold = outside the target after.\n\n` + bossGlance();
if (fs.existsSync(path.join(ROWS, 'rows-g1.json'))) md += `\n## The permanent check (scripts/auto/checks/balance.cjs), last run on the fixed build\n\nOne hero per profile (the door records in \`scripts/auto/checks/balance-doors.json\`), 40 tries per boss, 100 for the Demon King. The "worst possible hit" is the engine's formula for a wrong defence answer, the top damage roll, rage and charge together.\n\n` + checkRows();
md += `\n## Whole story at a glance: before and after\n\n` + story();
md += `\n## Savvy variant (heals at half HP against a boss, defends when a charge is announced): boss wins before and after\n\n` + variantGlance('savvy');
md += `\n## Nosell variant (never sells; the bag fills): boss wins before and after\n\n` + variantGlance('nosell');
md += `\n## Automatic flags: before and after\n\n` + flagsCount();
md += `\n## Reference variant, act by act\n` + acts();
try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}
fs.writeFileSync(path.join(OUT, 'REPORT-after.md'), md);
fs.writeFileSync(path.join(OUT, 'results-after.json'), JSON.stringify({ meta: A.meta, balance: BAL, profiles: A.profiles, policy: A.policy, rows: A.rows, flags: A.flags }));
console.log('wrote', path.join(OUT, 'REPORT-after.md'), md.length, 'bytes');
