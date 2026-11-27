'use strict';
// Honest player, day 4: economy and pacing tables per grade, read from the run logs of run.cjs / chain.sh.
//   HONEST_PROFILES=gk,g2,g4,g5 node scripts/auto/honest/day4.cjs <runsDir> [variant: main|savvy] [outFile.md]
// Per profile: (1) each town: level and gold on arrival against the shop (cheapest upgrade, best upgrade, cheapest heal item);
// (2) battle minutes and steps per act (walking time is not modelled); (3) each boss: win rate, expected losses before the first win,
// longest run of losses in a row among the tries (a try is a free retry from the door), chance of three losses in a row;
// (4) stretches where random fights are trivial. Needs run logs made after the day 4 inpage.js (goldShop / cheapUp / bestUp / cheapHeal).
const fs = require('fs'), path = require('path');
const DIR = process.argv[2], VAR = process.argv[3] || 'main', OUTF = process.argv[4];
const W = require('./world.cjs').build();
const PROFILES = (process.env.HONEST_PROFILES || 'g1,g3,g6').split(',');
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, sum = a => a.reduce((x, y) => x + y, 0);
const r0 = v => v == null || isNaN(v) ? '-' : Math.round(v).toString(), r1 = v => v == null || isNaN(v) ? '-' : (Math.round(v * 10) / 10).toString(), pct = v => v == null || isNaN(v) ? '-' : Math.round(v * 100) + '%';
const T = (head, lines) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${lines.map(l => `| ${l.join(' | ')} |`).join('\n')}\n`;
const price = s => s ? +String(s).split(':')[1] : null, name = s => s ? String(s).split(':')[0] : null;
const mode = a => { const o = {}; for (const x of a.filter(Boolean)) o[x] = (o[x] || 0) + 1; const e = Object.entries(o).sort((x, y) => y[1] - x[1])[0]; return e ? e[0] : null; };
const NAME = p => p === 'gk' ? 'kindergarten' : 'grade ' + p.slice(1);
function load(p) {
  const out = [];
  for (const d of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) { const m = /^(g[k\d])(?:-([a-z]+))?-r(\d+)$/.exec(d); if (!m || m[1] !== p || (m[2] || 'main') !== VAR) continue;
    const f = path.join(DIR, d, 'events.jsonl'); if (!fs.existsSync(f)) continue; let ck = null; try { ck = JSON.parse(fs.readFileSync(path.join(DIR, d, 'ckpt.json'), 'utf8')); } catch (e) {}
    out.push({ rep: +m[3], done: !!(ck && ck.done), deaths: ck ? ck.meta.deaths : null, forced: ck ? ck.meta.forced : [], events: fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) }); }
  return out;
}
const fightSec = fs_ => sum(fs_.map(f => f.sec || 0));
let md = '';
const J = { variant: VAR, profiles: {} };
for (const p of PROFILES) {
  const runs = load(p); if (!runs.length) continue; const R = runs.length, jp = J.profiles[p] = { runs: R, finished: runs.filter(r => r.done).length, towns: [], acts: [], bosses: [], trivial: [] };
  md += `\n## ${NAME(p)} (${R} runs, ${jp.finished} finished, ${VAR})\n\n`;
  // ---- towns
  const tl = [];
  for (const st of W.stops) { const E = runs.map(r => r.events.find(e => e.n === st.n)).filter(Boolean); const T_ = E.map(e => e.town).filter(Boolean); if (!T_.length) continue;
    const gs = T_.map(t => t.goldShop != null ? t.goldShop : null).filter(x => x != null), cu = mode(T_.map(t => t.cheapUp)), bu = mode(T_.map(t => t.bestUp)), ch = mode(T_.map(t => t.cheapHeal));
    const affC = cu ? gs.filter(g => g >= price(cu)).length : null, affB = bu ? gs.filter(g => g >= price(bu)).length : null, healN = ch && gs.length ? mean(gs.map(g => Math.floor(g / price(ch)))) : null;
    const row = { n: st.n, town: st.t === 'isle' ? st.village : st.id, level: mean(T_.map(t => t.level)), gold0: mean(T_.map(t => t.gold0)), goldShop: mean(gs), cheapUp: cu, bestUp: bu, cheapHeal: ch, nShop: gs.length, affC, affB, healN, noUp: T_.filter(t => t.upgrades > 0 && t.affordable === 0).length, nUp: T_.filter(t => t.upgrades > 0).length, cantHeal: T_.filter(t => t.cantHeal).length, bought: T_.flatMap(t => t.bought) };
    jp.towns.push(row);
    tl.push([`${st.n} ${row.town}`, r1(row.level), r0(row.gold0), r0(row.goldShop), cu ? `${name(cu)} ${price(cu)}` : '(none left)', cu ? `${affC}/${gs.length}` : '-', bu ? `${name(bu)} ${price(bu)}` : '-', bu ? `${affB}/${gs.length}` : '-', ch ? `${name(ch)} ${price(ch)} x${r0(healN)}` : '-', row.cantHeal ? `${row.cantHeal}/${T_.length}` : '', row.nUp ? `${row.noUp}/${row.nUp}` : '', [...new Set(row.bought.filter(b => !/^(herb|potion|hiPotion|elixir)$/.test(b)))].join(', ') || '-']); }
  md += `### Towns: level and gold on arrival against the shop\n\n"gold at shop" = after the healer and after selling outgrown gear, before buying. "cheapest/best upgrade affordable" = runs (of those with data) whose purse covers it. "heal x" = how many of the shop's cheapest heal item the purse buys.\n\n` + T(['stop', 'level', 'gold on arrival', 'gold at shop', 'cheapest upgrade', 'affordable', 'best upgrade (ATK+DEF)', 'affordable', 'cheapest heal', 'healer unpaid', 'no upgrade affordable', 'bought'], tl);
  // ---- acts
  const al = [];
  for (let act = 1; act <= 5; act++) { let sec = 0, steps = 0, fights = 0, deaths = 0, bossSec = 0, bossTries = 0; const lv = [];
    for (const r of runs) for (const e of r.events.filter(x => x.act === act && !x.optional)) {
      for (const l of [e.leg, e.isleLeg1, e.isleLeg2]) if (l) { sec += fightSec(l.fights || []); steps += l.steps || 0; fights += (l.fights || []).length; deaths += l.deaths || 0; }
      const d = e.dungeon && typeof e.dungeon === 'object' ? e.dungeon : null; if (d) { sec += fightSec(d.fights || []); steps += d.steps || 0; fights += (d.fights || []).length; deaths += d.deaths || 0;
        if (d.boss) { const win = d.boss.tries.filter(t => t.res === 'win'), lose = d.boss.tries.filter(t => t.res === 'loss'); const wr = d.boss.tries.length ? win.length / d.boss.tries.length : 0;       // expected seconds on the boss: losses before the first win, then the win
          bossSec += (win.length ? mean(win.map(t => t.sec || 0)) : 0) + (wr > 0 && lose.length ? (1 - wr) / wr * mean(lose.map(t => t.sec || 0)) : 0); bossTries += wr > 0 ? 1 / wr : 0; } }
      if (e.after) lv.push(e.after.level); }
    al.push([act, r1((sec + bossSec) / 60 / R), r1(sec / 60 / R), r1(bossSec / 60 / R), r0(steps / R), r1(fights / R), r1(deaths / R), r1(mean(runs.map(r => { const es = r.events.filter(x => x.act === act && x.after); return es.length ? es[es.length - 1].after.level : null; }).filter(x => x != null)))]);
    jp.acts.push({ act, minutes: (sec + bossSec) / 60 / R, minutesRandom: sec / 60 / R, minutesBoss: bossSec / 60 / R, steps: steps / R, fights: fights / R, deaths: deaths / R }); }
  const tot = jp.acts.reduce((a, x) => a + x.minutes, 0);
  md += `\n### Battle minutes per act (random fights + expected boss time incl. retries; walking, menus and dungeon puzzles not included)\n\n` + T(['act', 'battle minutes', 'of it random fights', 'of it bosses', 'walk steps (model)', 'random fights', 'deaths to random fights', 'level leaving the act'], al) + `\nTotal battle minutes: ${r1(tot)} (${r1(tot / 60)} h). Deaths to random fights over all runs: ${sum(runs.map(r => r.deaths || 0))}. Forced passes: ${runs.map(r => r.forced.join(',') || '-').join(' / ')}.\n`;
  // ---- bosses
  const bl = [];
  for (const st of W.stops) { const E = runs.map(r => r.events.find(e => e.n === st.n)).filter(Boolean); const B = E.map(e => e.dungeon && e.dungeon.boss).filter(Boolean); if (!B.length) continue;
    const tries = B.flatMap(b => b.tries), win = tries.filter(t => t.res === 'win'), rate = win.length / tries.length; let streak = 0, cur = 0; for (const b of B) { cur = 0; for (const t of b.tries) { if (t.res !== 'win') { cur++; streak = Math.max(streak, cur); } else cur = 0; } }
    const row = { n: st.n, boss: B[0].id, optional: !!st.optional, tries: tries.length, rate, level: mean(B.map(b => b.at.level)), lossesBeforeWin: rate > 0 ? (1 - rate) / rate : null, longestLossRun: streak, p3: Math.pow(1 - rate, 3), rounds: mean(win.map(t => t.rounds)), sec: mean(win.map(t => t.sec)), items: mean(tries.map(t => t.items || 0)), margin: mean(win.map(t => t.hpEnd / t.maxHp)), perRun: B.map(b => b.wins + '/' + b.n).join(' ') };
    jp.bosses.push(row);
    bl.push([`${st.n} ${row.boss}${st.optional ? ' (opt.)' : ''}`, r1(row.level), `${win.length}/${tries.length} ${pct(rate)}`, row.perRun, r1(row.lossesBeforeWin), `${streak}`, pct(row.p3), r1(row.rounds), r0(row.sec), r1(row.items), pct(row.margin)]); }
  md += `\n### Bosses\n\n"deaths per boss" = expected lost tries before the first win, (1-rate)/rate. "longest loss run" = most losses in a row among the tries in order. "P(3 losses in a row)" = (1-rate)^3.\n\n` + T(['boss', 'level', 'wins', 'per run', 'deaths per boss', 'longest loss run', 'P(3 losses in a row)', 'rounds (wins)', 'seconds (wins)', 'heal items', 'HP left (wins)'], bl);
  // ---- trivial stretches
  let easy = [], list = [];
  const rowsD = W.stops.filter(s => !s.optional && (s.t === 'dungeon' || s.t === 'isle'));
  for (const st of rowsD) { const E = runs.map(r => r.events.find(e => e.n === st.n)).filter(Boolean).map(e => e.dungeon).filter(d => d && d.fights); if (!E.length) continue;
    const fights = E.flatMap(d => d.fights), lostPct = mean(fights.map(f => (f.taken || 0) / f.maxHp)), deaths = sum(E.map(d => d.deaths)), id = st.t === 'isle' ? st.dungeon : st.id, br = jp.bosses.find(b => b.n === st.n);
    const triv = lostPct < 0.03 && deaths === 0; if (triv) easy.push(`${id} (${pct(lostPct)}/fight, ${r1(mean(E.map(d => sum(d.fights.map(f => f.sec || 0)) / 60)))} min)`); else { if (easy.length >= 3) list.push(easy.slice()); easy = []; } }
  if (easy.length >= 3) list.push(easy.slice()); jp.trivial = list;
  md += `\n### Trivial stretches (3 or more dungeons in a row costing under 3% of max HP per random fight, no deaths; measured, not changed)\n\n` + (list.length ? list.map(l => '- ' + l.join(', ')).join('\n') : '(none)') + '\n';
}
if (OUTF) { fs.writeFileSync(OUTF, md); fs.writeFileSync(OUTF.replace(/\.md$/, '.json'), JSON.stringify(J)); }
else process.stdout.write(md);
