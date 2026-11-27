'use strict';
// Honest player, part 4: turn the run logs into REPORT.md + results.json.
//   node scripts/auto/honest/report.cjs [runsDir] [outDir]
// REPORT.md = findings.txt (hand-written ranking, kept next to this script) + the generated tables and flag lists.
const fs = require('fs'), path = require('path');
const DIR = process.argv[2] || process.env.HONEST_DIR || '/home/user/work/honest/runs';
const OUT = process.argv[3] || '/mnt/project-files/edu-rpg/autoloop/honest/';
const W = require('./world.cjs').build();
const PROFILES = (process.env.HONEST_PROFILES || 'g1,g3,g6').split(','), PNAME = Object.fromEntries(PROFILES.map(p => [p, p === 'gk' ? 'kindergarten' : 'grade ' + p.slice(1)]));   // HONEST_PROFILES=gk,g2,g4,g5 for day 4
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, sum = a => a.reduce((x, y) => x + y, 0);
const r1 = v => v == null ? '–' : (Math.round(v * 10) / 10).toString(), r0 = v => v == null ? '–' : Math.round(v).toString(), pct = v => v == null ? '–' : Math.round(v * 100) + '%';
const rng = a => a.length ? (Math.min(...a) === Math.max(...a) ? '' + a[0] : `${Math.min(...a)}–${Math.max(...a)}`) : '–';

// ---------------------------------------------------------------- load
const runs = {};      // variant -> profile -> [ { rep, events, done } ]
for (const d of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) {
  const m = /^(g[k\d])(?:-([a-z]+))?-r(\d+)$/.exec(d); if (!m) continue; const f = path.join(DIR, d, 'events.jsonl'); if (!fs.existsSync(f)) continue;
  const events = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  let ck = null; try { ck = JSON.parse(fs.readFileSync(path.join(DIR, d, 'ckpt.json'), 'utf8')); } catch (e) {}
  const v = m[2] || 'main'; ((runs[v] = runs[v] || {})[m[1]] = runs[v][m[1]] || []).push({ rep: +m[3], events, done: !!(ck && ck.done), forced: ck ? ck.meta.forced : [], next: ck ? ck.next : null });
}
const worst = (matk, def) => Math.floor(Math.max(Math.ceil(matk * 0.25), matk - Math.floor(def / 2)) * 1.15);   // the engine's top roll, wrong answer, no ability

// ---------------------------------------------------------------- aggregate one variant x profile
function aggregate(list) {
  const rows = [];
  for (const s of W.stops) {
    const evs = list.map(r => r.events.find(e => e.n === s.n)).filter(Boolean); if (!evs.length) continue;
    const row = { n: s.n, act: s.act, t: s.t, id: s.t === 'isle' ? s.dungeon : s.id, place: s.id, door: s.door, optional: s.optional || undefined, reps: evs.length };
    const legs = evs.flatMap(e => [e.leg, e.isleLeg1, e.isleLeg2].filter(Boolean));
    if (legs.length) { const lf = legs.flatMap(l => l.fights); row.leg = { steps: mean(evs.map(e => sum([e.leg, e.isleLeg1, e.isleLeg2].filter(Boolean).map(l => l.steps)))), fights: lf.length / evs.length, deaths: sum(legs.map(l => l.deaths)), monsters: count(lf.map(f => f.m)),
      lostPct: mean(lf.map(f => (f.taken || 0) / f.maxHp)), twoTurn: twoTurn(lf), sec: sum(lf.map(f => f.sec || 0)) / evs.length, forced: legs.filter(l => l.forced).length }; }
    if (evs.some(e => e.gateBlocked)) row.gateBlocked = [...new Set(evs.flatMap(e => e.gateBlocked || []))];
    row.errors = [...new Set(evs.flatMap(e => (e.errors || []).map(x => x.m)))];
    if (evs[0].town) { const T = evs.map(e => e.town);
      row.town = { shop: T[0].id, gold0: mean(T.map(t => t.gold0)), gold1: mean(T.map(t => t.gold1)), level: mean(T.map(t => t.level)), bought: count(T.flatMap(t => t.bought.filter(b => !/^(herb|potion|hiPotion|elixir)$/.test(b)))), healsBought: mean(T.map(t => t.bought.filter(b => /^(herb|potion|hiPotion|elixir)$/.test(b)).length)),
        sold: mean(T.map(t => (t.sold || []).length)), noUpgradeAffordable: T.filter(t => t.upgrades > 0 && t.affordable === 0).length, nothingToBuy: T.filter(t => t.upgrades === 0).length, cantHeal: T.filter(t => t.cantHeal).length, tooDear: count(T.flatMap(t => t.tooDear || [])),
        bagFull: count(T.flatMap(t => t.bagFull || [])), bag: mean(T.map(t => t.bag1 || 0)), questDone: count(T.map(t => t.questDone).filter(Boolean)), questNotReady: T.filter(t => t.questNotReady).length, questRefused: count(T.map(t => t.questRefused).filter(Boolean)), questLost: count(T.flatMap(t => t.questLost || [])), healStock: mean(T.map(t => t.healStock)) }; }
    const D = evs.map(e => e.dungeon || e.visit).filter(Boolean);
    if (D.length && evs[0].dungeon) {
      const fights = D.map(d => d.fights), all = fights.flat(), wd = W.dungeons[row.id];
      row.dungeon = { zone: wd.zone, floors: wd.floors.length, routeSteps: sum(wd.floors.map(f => f.routeSteps)), lvl: mean(D.map(d => d.arrive.level)), lvlRange: rng(D.map(d => d.arrive.level)), hp: mean(D.map(d => d.arrive.maxHp)), atk: mean(D.map(d => d.arrive.atk)), def: mean(D.map(d => d.arrive.def)),
        fights: mean(fights.map(f => f.length)), lost: mean(all.map(f => f.taken || 0)), lostPct: mean(all.map(f => (f.taken || 0) / f.maxHp)), maxHitPct: all.length ? Math.max(...all.map(f => (f.maxHit || 0) / f.maxHp)) : null,
        rounds: mean(all.map(f => f.rounds || 0)), secPerFight: mean(all.map(f => f.sec || 0)), minutes: mean(fights.map(f => sum(f.map(x => x.sec || 0)) / 60)),
        deaths: sum(D.map(d => d.deaths)), deathReps: D.filter(d => d.deaths > 0).length, attempts: mean(D.map(d => d.attempts)), forced: D.filter(d => d.forced).length, fled: sum(all.map(f => f.res === 'fled' ? 1 : 0)), stuck: sum(all.map(f => f.res === 'stuck' ? 1 : 0)),
        items: mean(D.map(d => sum(d.fights.map(f => f.items || 0)) + (d.fieldItems || 0))), crystals: mean(D.map(d => d.crystals)), chests: mean(D.map(d => d.chests)), chestGold: mean(D.map(d => d.chestGold)), lostItems: count(D.flatMap(d => d.lostItems || [])),
        goldLeave: mean(D.map(d => d.leave.gold)), lvlLeave: mean(D.map(d => d.leave.level)), xpPerFight: mean(all.map(f => f.xp || 0)), goldPerFight: mean(all.map(f => f.gold || 0)), toNext: mean(D.map(d => d.arrive.expToNext - d.arrive.exp)),
        monsters: count(all.map(f => f.m)), twoTurn: twoTurn(all), longest: all.length ? Math.max(...all.map(f => f.rounds || 0)) : 0, hidden: sum(all.map(f => f.hidden || 0)) };
      const B = D.map(d => d.boss).filter(Boolean), tries = B.flatMap(b => b.tries), wins = tries.filter(t => t.res === 'win'), losses = tries.filter(t => t.res === 'loss');
      if (B.length) row.boss = { id: B[0].id, n: tries.length, wins: wins.length, rate: tries.length ? wins.length / tries.length : null, perRep: B.map(b => b.wins + '/' + b.n).join(' '), lvl: mean(B.map(b => b.at.level)), hp: mean(B.map(b => b.at.maxHp)), hpIn: mean(B.map(b => b.at.hp / b.at.maxHp)), atk: mean(B.map(b => b.at.atk)), def: mean(B.map(b => b.at.def)), healsIn: mean(B.map(b => b.at.heals)),
        mhp: tries[0] && tries[0].mhp, matk: tries[0] && tries[0].matk, mdef: tries[0] && tries[0].mdef, rounds: mean(wins.map(t => t.rounds)), roundsAll: mean(tries.map(t => t.rounds)), margin: mean(wins.map(t => t.hpEnd / t.maxHp)), minHp: mean(wins.map(t => (t.minHp || 0) / t.maxHp)),
        items: mean(tries.map(t => t.items || 0)), sec: mean(tries.map(t => t.sec)), maxHitPct: tries.length ? Math.max(...tries.map(t => (t.maxHit || 0) / t.maxHp)) : null, lossLeft: mean(losses.map(t => (t.mhpEnd || 0) / t.mhp)), stuck: tries.filter(t => t.res === 'stuck').length, longest: tries.length ? Math.max(...tries.map(t => t.rounds || 0)) : 0,
        forced: B.filter(b => b.forced).length, lost: count(B.flatMap(b => (b.reward && b.reward.lost) || [])), hidden: sum(tries.map(t => t.hidden || 0)), defends: mean(tries.map(t => t.defends || 0)) };
    } else if (D.length) { const all = D.flatMap(d => d.fights); row.visit = { fights: all.length / D.length, deaths: sum(D.map(d => d.deaths)), lostPct: mean(all.map(f => (f.taken || 0) / f.maxHp)) }; }
    const A = evs.map(e => e.after).filter(Boolean); if (A.length) row.after = { level: mean(A.map(a => a.level)), gold: mean(A.map(a => a.gold)), maxHp: mean(A.map(a => a.maxHp)), atk: mean(A.map(a => a.atk)), def: mean(A.map(a => a.def)), heals: mean(A.map(a => a.heals)) };
    rows.push(row);
  }
  return rows;
}
function count(a) { const o = {}; for (const x of a) o[x] = (o[x] || 0) + 1; return o; }
function twoTurn(fs_) { const o = {}; for (const f of fs_) { if (f.boss || !f.matk) continue; const w = worst(f.matk, f.def); if (2 * w >= f.maxHp) { const k = f.m; o[k] = o[k] || { n: 0, worst: 0, maxHp: f.maxHp }; o[k].n++; if (w / f.maxHp > o[k].worst / o[k].maxHp) { o[k].worst = w; o[k].maxHp = f.maxHp; } } } return o; }

// ---------------------------------------------------------------- flags
function flags(v, p, rows) {
  const out = [], add = (sev, kind, where, text, data) => out.push({ sev, kind, variant: v, profile: p, where, text, ...data });
  let prevBoss = null, easy = [];
  for (const r of rows) {
    if (r.gateBlocked && !r.optional) add('blocker', 'gate', r.id, `story gate closed: ${r.gateBlocked.join('; ')}`, {});
    if (r.errors && r.errors.length) add('major', 'error', r.id, `page errors: ${r.errors.slice(0, 3).join(' | ')}`, {});
    if (r.leg) { for (const [m, t] of Object.entries(r.leg.twoTurn)) add('major', 'two-turn', `walk to ${r.place}`, `${m} can take ${t.worst} of ${t.maxHp} HP in one enemy turn (2 turns kill from full) on the way to ${r.place}; met ${t.n}x`, { monster: m });
      if (r.leg.deaths) add('major', 'death-walk', `walk to ${r.place}`, `${r.leg.deaths} deaths over ${r.reps} runs on the overworld walk to ${r.place}`, {}); }
    if (r.town) { if (r.town.noUpgradeAffordable === r.reps && r.reps > 0) add('polish', 'afford', r.place, `arrives with ${r0(r.town.gold0)} gold (before the healer is paid) and can pay for none of the shop's upgrades (${Object.keys(r.town.tooDear).slice(0, 4).join(', ')}) in ${r.town.noUpgradeAffordable}/${r.reps} runs`, {});
      if (r.town.cantHeal) add('major', 'afford-heal', r.place, `could not pay the healer in ${r.town.cantHeal}/${r.reps} runs`, {});
      if (Object.keys(r.town.bagFull).length) add('major', 'bag-shop', r.place, `shop refused ${Object.entries(r.town.bagFull).map(([it, n]) => `${it} (${n}/${r.reps})`).join(', ')}: bag full`, {});
      for (const [it, n] of Object.entries(r.town.questLost)) add('blocker', 'bag', r.place, `quest reward ${it} vanished: bag full (${n}/${r.reps} runs)`, {}); }
    if (r.dungeon) { const d = r.dungeon;
      for (const [m, t] of Object.entries(d.twoTurn)) add('major', 'two-turn', r.id, `${m} can take ${t.worst} of ${t.maxHp} HP in one enemy turn (2 turns kill from full); met ${t.n}x`, { monster: m });
      if (d.deaths) add(d.forced ? 'blocker' : 'major', 'death', r.id, `${d.deaths} deaths to random encounters over ${r.reps} runs (${d.deathReps} runs affected${d.forced ? `, ${d.forced} gave up after the death cap` : ''})`, {});
      if (d.stuck) add('blocker', 'stuck', r.id, `${d.stuck} random fights did not end`, {});
      if (d.longest >= 20) add('polish', 'long', r.id, `a random fight lasted ${d.longest} rounds`, {});
      for (const [it, n] of Object.entries(d.lostItems)) add(it === 'holyAmulet' ? 'blocker' : 'polish', 'bag', r.id, `chest item ${it} vanished: bag full (${n}x over ${r.reps} runs)`, {});
      if (d.lvlLeave - d.lvl < 0.34 && !r.optional) add('polish', 'xp', r.id, `gains ${r1(d.lvlLeave - d.lvl)} levels in the whole dungeon incl. the boss (needs ${r0(d.toNext)} XP on arrival, ${r1(d.xpPerFight)} XP per fight)`, {});
    }
    if (r.boss) { const b = r.boss;
      if (b.rate < 0.2) add('blocker', 'boss', r.id, `${b.id}: ${b.wins}/${b.n} wins (${pct(b.rate)}) at level ${r1(b.lvl)}; on a loss the boss keeps ${pct(b.lossLeft)} of its HP`, { boss: b.id, rate: b.rate });
      else if (b.rate < 0.6) add('major', 'boss', r.id, `${b.id}: ${b.wins}/${b.n} wins (${pct(b.rate)}) at level ${r1(b.lvl)}`, { boss: b.id, rate: b.rate });
      if (b.stuck) add('blocker', 'stuck', r.id, `${b.id}: ${b.stuck} tries did not end`, {});
      if (b.longest >= 40) add('major', 'long', r.id, `${b.id}: a try lasted ${b.longest} rounds (${r0(b.sec)} s of play on average)`, {});
      for (const [it, n] of Object.entries(b.lost)) add('blocker', 'bag', r.id, `boss reward ${it} vanished: bag full (${n}/${r.reps} runs)`, {});
      if (!r.optional) { if (prevBoss && prevBoss.rate - b.rate >= 0.4) add('major', 'cliff', r.id, `difficulty cliff: ${prevBoss.id} ${pct(prevBoss.rate)} -> ${b.id} ${pct(b.rate)}`, {});
        const triv = b.rate === 1 && b.margin >= 0.6 && r.dungeon.deaths === 0 && r.dungeon.lostPct < 0.12; if (triv) easy.push(r.id); else { if (easy.length >= 3) add('polish', 'trivial', easy[0], `trivially easy stretch: ${easy.join(', ')} (boss 100% with >= 60% HP left, < 12% HP lost per fight, no death)`, {}); easy = []; }
        prevBoss = b; }
    }
  }
  if (easy.length >= 3) add('polish', 'trivial', easy[0], `trivially easy stretch: ${easy.join(', ')} (boss 100% with >= 60% HP left, < 12% HP lost per fight, no death)`, {});
  return out;
}

// ---------------------------------------------------------------- write
const agg = {}, allFlags = [];
for (const v of Object.keys(runs)) { agg[v] = {}; for (const p of PROFILES) if (runs[v][p]) { agg[v][p] = aggregate(runs[v][p]); allFlags.push(...flags(v, p, agg[v][p])); } }
const meta = { generated: new Date().toISOString(), runsDir: DIR, world: { wander: W.wander, chestDetour: W.chestDetour }, runs: Object.fromEntries(Object.entries(runs).map(([v, o]) => [v, Object.fromEntries(Object.entries(o).map(([p, l]) => [p, l.map(r => ({ rep: r.rep, stops: r.events.length, done: r.done, forced: r.forced }))]))])) };
const results = { meta, profiles: Object.fromEntries(PROFILES.map(p => [p, { quizDifficulty: require('./profiles.cjs').PROFILES[p].grade, pCorrect: require('./profiles.cjs').PROFILES[p].p, meanAnswerSec: require('./profiles.cjs').PROFILES[p].t, sd: 0.35 }])),
  policy: { healAtHpFraction: 0.35, fleeAtHpFraction: 0.2, fleeOnlyWithoutHealItems: true, neverFleesBoss: true, wander: W.wander, chestDetourSteps: W.chestDetour, bossTries: 20, deathCap: 6, healStock: 6, itemShareOfGold: 0.5 }, rows: agg, flags: allFlags };

let md = '';
const T = (head, lines) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${lines.map(l => `| ${l.join(' | ')} |`).join('\n')}\n`;
function tables(v) {
  let s = '';
  for (let act = 1; act <= 5; act++) {
    s += `\n### Act ${act}\n\nDungeons (random encounters on the route, every floor)\n\n`;
    const lines = [], blines = [], tl = [];
    for (const st of W.stops.filter(x => x.act === act)) for (const p of PROFILES) { const r = (agg[v][p] || []).find(x => x.n === st.n); if (!r) continue;
      if (r.dungeon) { const d = r.dungeon; lines.push([`${st.n} ${r.id}${r.optional ? ' (optional)' : ''}`, PNAME[p], `${r1(d.lvl)} (${d.lvlRange})`, `${r0(d.hp)} / ${r0(d.atk)} / ${r0(d.def)}`, r1(d.fights), `${r1(d.lost)} (${pct(d.lostPct)})`, pct(d.maxHitPct), r1(d.rounds), `${d.deaths}${d.forced ? ' (gave up ' + d.forced + ')' : ''}`, r1(d.items), r1(d.crystals), `${r1(d.chests)} (+${r0(d.chestGold)}g)`, r1(d.xpPerFight), `${r1(d.lvlLeave)}`, r0(d.goldLeave), r1(d.minutes)]); }
      if (r.boss) { const b = r.boss; blines.push([`${st.n} ${b.id}${r.optional ? ' (optional)' : ''}`, PNAME[p], `${b.wins}/${b.n} (${pct(b.rate)})`, r1(b.lvl), `${r0(b.hp)} / ${r0(b.atk)} / ${r0(b.def)}`, `${b.mhp} / ${b.matk} / ${b.mdef}`, pct(b.hpIn), r1(b.rounds), pct(b.margin), pct(b.minHp), pct(b.maxHitPct), r1(b.items), b.rate < 1 ? pct(b.lossLeft) : '–', r0(b.sec), b.rate < 0.2 ? '**BLOCKER**' : b.rate < 0.6 ? '**below 60%**' : '']); }
      if (r.town) { const t = r.town; tl.push([`${st.n} ${r.place}${st.t === 'isle' ? ' village' : ''}`, PNAME[p], r1(t.level), r0(t.gold0), Object.entries(t.bought).map(([k, n]) => `${k}${n < r.reps ? ' (' + n + '/' + r.reps + ')' : ''}`).join(', ') || '–', r1(t.healsBought), Object.keys(t.tooDear).join(', ') || '–', t.noUpgradeAffordable ? `${t.noUpgradeAffordable}/${r.reps}` : '', t.nothingToBuy === r.reps ? 'yes' : '', r0(t.gold1), r1(t.bag), Object.keys(t.questDone).join(',') + (t.questNotReady ? ` (not ready ${t.questNotReady}/${r.reps})` : '') + (Object.keys(t.questRefused).length ? ` (refused: ${Object.keys(t.questRefused).join(',')})` : ''), r.leg ? `${r1(r.leg.fights)} / ${r.leg.deaths}` : '–']); }
    }
    s += T(['stop', 'profile', 'level on arrival (range)', 'max HP / ATK / DEF', 'fights', 'HP lost per fight (of max)', 'biggest hit (of max HP)', 'rounds per fight', 'deaths', 'heal items used', 'crystal rests', 'chests (gold)', 'XP per fight', 'level on leaving', 'gold on leaving', 'minutes of battle'], lines);
    s += `\nBosses (${results.policy.bossTries} tries per run, each from the record she walked in with)\n\n`;
    s += T(['stop', 'profile', 'wins', 'level', 'hero max HP / ATK / DEF', 'boss HP / ATK / DEF', 'HP on entry', 'rounds (wins)', 'HP left (wins)', 'lowest HP (wins)', 'biggest hit (of max HP)', 'heal items per try', 'boss HP left on a loss', 'seconds per try', 'flag'], blines);
    s += `\nTowns (gold, what she could pay for) and the walk there\n\n`;
    s += T(['stop', 'profile', 'level', 'gold on arrival', 'gear bought', 'heal items bought', 'too dear', 'no upgrade affordable', 'nothing left to buy', 'gold on leaving', 'bag stacks', 'quest', 'walk: fights / deaths'], tl);
  }
  return s;
}
const fl = v => { const f = allFlags.filter(x => x.variant === v); let s = ''; for (const sev of v === 'main' ? ['blocker', 'major', 'polish'] : ['blocker', 'major']) { const g = f.filter(x => x.sev === sev); if (!g.length) continue; s += `\n**${sev}**\n\n`;
    const byText = {}; for (const x of g) { const k = x.kind + '|' + x.where + '|' + (x.monster || x.boss || x.text.replace(/\d+/g, '#')); (byText[k] = byText[k] || []).push(x); }
    for (const xs of Object.values(byText)) s += `- [${xs[0].kind}] ${xs[0].where}: ` + xs.map(x => `${PNAME[x.profile]}: ${x.text}`).join(' / ') + '\n'; } return s || '\n(none)\n'; };
const findings = fs.existsSync(path.join(__dirname, 'findings.txt')) ? fs.readFileSync(path.join(__dirname, 'findings.txt'), 'utf8') : '# Honest player: difficulty report\n\n(findings.txt not written yet; the tables below are generated)\n';
md += findings.trimEnd() + '\n\n---\n\n# Generated tables\n\n';
md += `Generated ${meta.generated} by \`scripts/auto/honest/report.cjs\` from \`${DIR}\`. Runs: ` + Object.entries(meta.runs).map(([v, o]) => `${v}: ` + Object.entries(o).map(([p, l]) => `${p} x${l.length}${l.some(r => !r.done) ? ' (' + l.filter(r => !r.done).length + ' unfinished)' : ''}`).join(', ')).join('; ') + '.\n';
md += `\nEvery number is a mean over the runs of that profile unless it says otherwise. "HP lost per fight" counts enemy hits and poison. "Minutes of battle" is an estimate: thinking time + 2.8 s of the game's own pauses per answer + 5 s per fight.\n`;
{ // one line per boss, every variant side by side
  const vs = ['main', ...Object.keys(agg).filter(x => x !== 'main').sort()].filter(v => agg[v]), head = ['stop', 'act', 'boss'], lines = [];
  for (const v of vs) for (const p of PROFILES) if (agg[v][p]) head.push(`${PNAME[p]}${v === 'main' ? '' : ' ' + v}`);
  for (const st of W.stops) { const cells = []; let any = null;
    for (const v of vs) for (const p of PROFILES) if (agg[v][p]) { const r = agg[v][p].find(x => x.n === st.n); if (r && r.boss) { any = r; const b = r.boss; cells.push(`${b.rate < 0.2 ? '**' : ''}${pct(b.rate)}${b.rate < 0.2 ? '**' : ''} (${b.wins}/${b.n}, L${r1(b.lvl)})`); } else cells.push(r && r.gateBlocked ? 'gate closed' : '–'); }
    if (any) lines.push([st.n, st.act, any.boss.id + (any.optional ? ' (optional)' : ''), ...cells]); }
  md += `\n## Boss win rates at a glance\n\nWins over all tries of all runs (tries, mean level at the boss door). Bold = below 20%.\n\n` + T(head, lines);
  const dl = []; for (const v of vs) for (const p of PROFILES) if (agg[v][p]) { const rows = agg[v][p], ds = rows.filter(r => r.dungeon), n = runs[v][p].length;
    dl.push([v, PNAME[p], n, r1(sum(ds.map(r => r.dungeon.fights)) + sum(rows.map(r => r.leg ? r.leg.fights : 0))), sum(ds.map(r => r.dungeon.deaths)) + sum(rows.map(r => r.leg ? r.leg.deaths : 0)), r1(sum(ds.map(r => r.dungeon.minutes || 0)) + sum(rows.map(r => r.leg ? r.leg.sec / 60 : 0))), r1((rows[rows.length - 1].after || {}).level), r0((rows[rows.length - 1].after || {}).gold), runs[v][p].filter(r => r.done).length + '/' + n, [...new Set(runs[v][p].flatMap(r => r.forced || []))].join(', ') || '–']); }
  md += `\n## Whole story at a glance\n\n` + T(['variant', 'profile', 'runs', 'random fights per run', 'deaths to random fights (all runs)', 'minutes of random battles per run', 'final level', 'gold at the end', 'runs finished', 'walls passed only by forcing'], dl);
}
for (const v of ['main', ...Object.keys(agg).filter(x => x !== 'main')]) { if (!agg[v]) continue;
  md += `\n## Variant: ${v}${v === 'main' ? ' (sells outgrown gear; the reference)' : v === 'nosell' ? ' (never sells: the brief\'s literal policy)' : v === 'savvy' ? ' (heals at half HP against a boss, defends when a charge is announced)' : ''}\n`;
  md += `\n### Automatic flags (${v})\n` + fl(v);
  if (v === 'main') md += tables(v);
  else { md += `\n### Bosses (${v})\n\n`; const bl = []; for (const st of W.stops) for (const p of PROFILES) { const r = (agg[v][p] || []).find(x => x.n === st.n); if (r && r.boss) { const b = r.boss, m = ((agg.main || {})[p] || []).find(x => x.n === st.n); bl.push([`${st.n} ${b.id}`, PNAME[p], `${b.wins}/${b.n} (${pct(b.rate)})`, m && m.boss ? pct(m.boss.rate) : '–', r1(b.lvl), `${r0(b.hp)} / ${r0(b.atk)} / ${r0(b.def)}`, r1(b.rounds), pct(b.margin), r1(b.items), r.gateBlocked ? r.gateBlocked.join('; ') : '', Object.keys(b.lost).join(',')]); } }
    md += T(['stop', 'profile', 'wins', 'main variant', 'level', 'hero max HP / ATK / DEF', 'rounds (wins)', 'HP left (wins)', 'heal items per try', 'gate', 'reward lost'], bl); }
}
try { fs.mkdirSync(OUT, { recursive: true }); } catch (e) {}
fs.writeFileSync(path.join(OUT, 'REPORT.md'), md); fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results));
console.log('wrote', path.join(OUT, 'REPORT.md'), md.length, 'bytes;', path.join(OUT, 'results.json'), JSON.stringify(results).length, 'bytes; flags', allFlags.length);
