'use strict';
// Testers' "Jump to" menu, part 1: write public/acts-hifi/jump-points.json (never edit it by hand).
//   HONEST_DIR=/home/user/work/honest/runs node scripts/auto/jump/build.cjs [--profile g3] [--out <file>]
// Inputs
//   * the honest-player runs (scripts/auto/honest/run.cjs) under $HONEST_DIR: one folder per run, events.jsonl
//     holds the hero at every story stop (status on arrival at a dungeon, at its boss door, after each stop).
//     The profile's MEDIAN run (finished runs, by final experience) gives every record.
//   * the story itinerary, doors and bundle tables of scripts/auto/honest/world.cjs (the bundle is read from
//     $HONEST_DIST, default /home/user/work/dist: any dist built by scripts/acts/build_cloud_dist.sh);
//   * the floors and landing cells the census used (scripts/auto/census/dungeons.cjs), read from public/.
// Output: { acts: [{ act, places: [{ id, kind, map, hosted?, points: [{ id, kind, floor?, tower?, r, pos, flags? }] }] }],
//           records: [player state without position] }. The menu (public/ui-overhaul.js, TESTERS JUMP) names
// places in the active language and builds the save record: records[r] + pos + flags.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const HONEST = process.env.HONEST_DIR || '/home/user/work/honest/runs';
const PROFILE = arg('profile', 'g3');
const OUT = arg('out', path.join(ROOT, 'public/acts-hifi/jump-points.json'));
const WORLD = require('../honest/world.cjs');
const W = WORLD.build(), T = W.tables;
const J = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

// ---------------------------------------------------------------- the median run
const runs = fs.readdirSync(HONEST).filter(d => new RegExp(`^${PROFILE}-r\\d+$`).test(d)).map(d => {
  const ev = fs.readFileSync(path.join(HONEST, d, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  let ck = null; try { ck = JSON.parse(fs.readFileSync(path.join(HONEST, d, 'ckpt.json'), 'utf8')); } catch (e) {}
  const last = ev.length ? ev[ev.length - 1].after || {} : {};
  return { d, ev, done: !!(ck && ck.done), stops: ev.length, exp: last.exp || 0, level: last.level || 0 };
});
if (!runs.length) throw new Error(`no ${PROFILE} runs under ${HONEST}`);
const pool = runs.filter(r => r.done).length ? runs.filter(r => r.done) : runs.filter(r => r.stops === Math.max(...runs.map(x => x.stops)));
pool.sort((a, b) => a.exp - b.exp || a.d.localeCompare(b.d));
const RUN = pool[Math.floor((pool.length - 1) / 2)];
const EV = {}; for (const e of RUN.ev) EV[e.n] = e;
const NEWGAME = JSON.parse(fs.readFileSync(path.join(__dirname, '../honest/newgame', PROFILE + '.json'), 'utf8'));

// ---------------------------------------------------------------- floors and landing cells (census rules)
const A1F = J('public/act1-dungeon-floors.json').floors, DMAN = J('public/acts-dungeons/manifest.json'), MAN = J('public/acts-hifi/manifest.json');
const A1IDS = ['sunkenCellar', 'whisperingWoodsCave', 'coastalReef', 'mistyGrotto', 'crystalCave'];
const TOWERS = { stormNest: 1, stormreachSpire: 1, demonCastle: 1 };      // floors climb (1F, 2F); every other dungeon descends (B1F)
// Dungeons the engine still generates (Crystal Cave): their floors and cells come from the running game
// (calibrate.cjs -> engine-cells.json), not from the authored floors it does not use.
const ENGINE = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-cells.json'), 'utf8')).dungeons; } catch (e) { return {}; } })();
function floorsOf(id) {
  if (ENGINE[id]) return Object.keys(ENGINE[id].floors).map(Number).sort((a, b) => a - b).map(n => ({ n, engine: ENGINE[id].floors[n] }));
  if (A1IDS.includes(id)) return Object.keys(A1F).filter(k => A1F[k].dungeonId === id).sort((a, b) => A1F[a].floor - A1F[b].floor).map(k => ({ n: A1F[k].floor, f: A1F[k] }));
  const d = DMAN.dungeons[id]; return d ? d.authoredFloors.map(n => ({ n, f: DMAN.floors[`${id}-f${n}`] })) : [];
}
const walk = (f, x, y) => { const r = f.rows[y]; return !!r && x >= 0 && x < r.length && r[x] === '.'; };
function nearestWalk(f, x, y) {
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const a = x + dx, b = y + dy;
    if (walk(f, a, b) && walk(f, a + 1, b) && walk(f, a - 1, b) && walk(f, a, b + 1) && walk(f, a, b - 1)) return [a, b];
  }
  return null;
}
function landing(f) {
  if (f.land) { const l = f.land.fromPrev || f.land.mouth; if (l) return [l.x, l.y]; }
  const up = (f.assets || []).find(a => a.kind === 'stairsUp') || (f.assets || []).find(a => a.kind === 'mouth');
  if (!up) return null;
  // the first walkable cell two steps from the stairs along the floor (one step away still trips the stair
  // trigger: the game nudges her back onto it), preferring cells with open ground around them
  const seen = new Set([up.x + ',' + up.y]), q = [[up.x, up.y, 0]], cand = [];
  for (let h = 0; h < q.length && h < 4000; h++) { const [x, y, d] = q[h];
    if (d >= 2) { cand.push([x, y, d]); if (cand.length > 12) break; }
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const a = x + dx, b = y + dy, k = a + ',' + b; if (seen.has(k) || !walk(f, a, b)) continue; seen.add(k); q.push([a, b, d + 1]); } }
  const open = ([x, y]) => [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => walk(f, x + dx, y + dy)).length;
  cand.sort((a, b) => a[2] - b[2] || open(b) - open(a));
  return cand.length ? [cand[0][0], cand[0][1]] : nearestWalk(f, up.x, up.y + 1);
}
// The boss door: three steps from the boss along the floor (a step or two closer and the first move can wake it),
// on the cell with the most open ground around it, preferring the side she comes from (below).
function bossCell(f) {
  const b = (f.assets || []).find(a => a.kind === 'boss'); if (!b) return null;
  const seen = new Set([b.x + ',' + b.y]), q = [[b.x, b.y, 0]], c = [];
  for (let h = 0; h < q.length; h++) { const [x, y, d] = q[h]; if (d === 3) { c.push([x, y]); continue; }
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const a = x + dx, e = y + dy, k = a + ',' + e; if (seen.has(k) || !walk(f, a, e)) continue; seen.add(k); q.push([a, e, d + 1]); } }
  const sides = ([x, y]) => [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => walk(f, x + dx, y + dy)).length;
  c.sort((p, r) => sides(r) - sides(p) || (r[1] - p[1]) || Math.abs(p[0] - b.x) - Math.abs(r[0] - b.x));
  return c[0] || nearestWalk(f, b.x, b.y + 3) || nearestWalk(f, b.x, b.y + 2);
}

// ---------------------------------------------------------------- doors
const A1DOORS = {}; { const m = /var LANDMARKS = (\[.*?\]);/.exec(fs.readFileSync(path.join(ROOT, 'public/act1-world-map.js'), 'utf8')); for (const l of JSON.parse(m[1])) A1DOORS[l.mapId] = [l.exit.x, l.exit.y]; }
function doorExit(name) { const l = MAN.landmarks.find(x => x.name === name); if (l) return l.exit; if (A1DOORS[name]) return A1DOORS[name]; throw new Error('no door ' + name); }
const ISLE_EXIT = { stormreachSpire: 'stormreachIsles', frostfallCavern: 'frostfallPeaks', sunkenTempleDungeon: 'sunkenTempleIsle', twilightDungeon: 'twilightRealm' };
// A town record keeps the hero's cell in the PAINTED town (act1-hifi/adapter.js townSavePosition: 65-cell grid) and
// Continue resumes there, so the gate is the town's own arrival cell (startCell). A town with no painted plate (the
// four portal-isle villages) is the bundle's 16x16 map: one cell inside its exit.
function townCell(map, hosted) {
  const f = path.join(ROOT, 'public/act1-hifi/town', (hosted || map) + '-town.json');
  if (fs.existsSync(f)) { const t = JSON.parse(fs.readFileSync(f, 'utf8')); if (t.startCell) return t.startCell; }
  const c = (T.maps[map].connections || [])[0]; return c ? [c.fromX, Math.max(0, c.fromY - 1)] : [8, 14];
}

// ---------------------------------------------------------------- hero records
const GEAR = ['weapon', 'armor', 'shield', 'helmet', 'accessory'];
const ACT1_TOWNS = { greenhollow: 1, millbrook: 1, portSapphire: 1 };
const AUTO = ['stormPass', 'kikisRescue', 'shadowGate', 'desertGate', 'magmaPath', 'volcanicGate', 'portalRelics', 'finalBattle'];      // acts-runtime.js "quests" AUTO / AUTO_END
const AUTO_END = { stormPass: 1, shadowGate: 1, desertGate: 1, magmaPath: 1, volcanicGate: 1, portalRelics: 1, finalBattle: 1 };
const VISIT_BOSS = { hauntedForest: 'phantomStag', voidRift: 'nullDevourer' };
const done = (n, pred) => W.stops.filter(s => s.n < n && !s.optional && pred(s));
// What the story has settled before stop n: bosses down, towns entered, dungeons walked.
function story(n) {
  const bosses = new Set(), towns = new Set(), visited = new Set();
  for (const s of done(n, () => true)) {
    if (s.t === 'town') towns.add(s.hosted || s.id);
    if (s.t === 'isle') towns.add(s.village);
    if (s.t === 'visit') visited.add(s.id);
    const dId = s.t === 'dungeon' ? s.id : s.t === 'isle' ? s.dungeon : null;
    if (dId) { visited.add(dId); const e = EV[s.n], b = e && e.dungeon && e.dungeon.boss; if (!b || b.wins > 0 || b.forced) bosses.add(W.dungeons[dId].bossId); }
  }
  return { bosses, towns, visited, windCleared: done(n + 1, s => s.gate === 'wind-canyon').length > 0 };
}
function fromStatus(st, n, extra = {}) {
  const g = { atk: 0, def: 0 }; for (const k of GEAR) { const id = st.eq && st.eq[k]; const s = id && T.items[id] && T.items[id].stats; if (s) { g.atk += s.atk || 0; g.def += s.def || 0; } }
  const inventory = (st.inv || []).map(x => { const i = x.lastIndexOf('*'); return { itemId: x.slice(0, i), quantity: +x.slice(i + 1) }; }).filter(x => x.quantity > 0);
  const S = story(n), flags = { 'intro.done': true, 'acts.geo2': true };
  if (n > 0) flags['elder.gaveMap'] = true;
  for (const b of S.bosses) flags[`boss.${b}.defeated`] = true;
  for (const t of S.towns) { flags['compass.visited.' + t] = true; if (ACT1_TOWNS[t]) flags['act1.townOpened.' + t] = true; }
  if (S.windCleared) flags['canyon.windCleared'] = true;
  for (const t of extra.towns || []) { flags['compass.visited.' + t] = true; if (ACT1_TOWNS[t]) flags['act1.townOpened.' + t] = true; }
  for (const b of extra.notBoss || []) delete flags[`boss.${b}.defeated`];
  const p = { name: NEWGAME.name, heroColor: NEWGAME.heroColor, level: st.level, exp: st.exp, expToNext: st.expToNext,
    hp: Math.min(st.hp, st.maxHp), maxHp: st.maxHp, atk: st.atk - g.atk, def: st.def - g.def, spd: st.spd,
    equipment: Object.fromEntries(GEAR.map(k => [k, (st.eq && st.eq[k]) || null])), inventory, gold: st.gold,
    storyFlags: flags, activeQuests: (st.active || []).slice(), completedQuests: (st.done || []).slice(), questProgress: {},
    timerEnabled: st.timer !== false, quizDifficulty: String(st.grade || NEWGAME.quizDifficulty), locale: 'en', soundEnabled: true, masterVolume: 0.7, kanjiMode: false };
  settleQuests(p, S);
  return p;
}
// Progress of every active quest as a player at this stop has it, then the acts runtime's catch-up rules run
// here (AUTO quests started / ended, boss credit) so that loading the record triggers none of them on screen.
function progress(p, S, id) {
  const q = T.quests[id], pr = p.questProgress[id] = p.questProgress[id] || {};
  const have = it => p.inventory.filter(x => x.itemId === it).reduce((a, x) => a + x.quantity, 0) + GEAR.filter(k => p.equipment[k] === it).length;
  for (const o of q.objectives) {
    const need = o.count || 1;
    if (o.type === 'talk') pr[o.targetId] = Math.max(pr[o.targetId] || 0, AUTO.includes(id) ? 0 : 1);          // the giver was spoken to; the report is still to come
    else if (o.type === 'defeat') pr[o.targetId] = need === 1 ? (p.storyFlags[`boss.${o.targetId}.defeated`] ? 1 : 0) : Math.min(need, pr[o.targetId] || 0);
    else if (o.type === 'collect') pr[o.targetId] = Math.min(need, have(o.targetId));
    else if (o.type === 'visit') pr[o.targetId] = (S.visited.has(o.targetId) || (VISIT_BOSS[o.targetId] && p.storyFlags[`boss.${VISIT_BOSS[o.targetId]}.defeated`])) ? need : 0;
  }
}
const ready = (p, id) => T.quests[id].objectives.every(o => (p.questProgress[id][o.targetId] || 0) >= (o.count || 1));
function wants(p, id) {
  const q = T.quests[id]; if (p.activeQuests.includes(id) || p.completedQuests.includes(id)) return false;
  const pre = (q.prerequisites || []).every(x => p.completedQuests.includes(x) || p.storyFlags[x]);
  return pre || q.objectives.some(o => o.type === 'defeat' && p.storyFlags[`boss.${o.targetId}.defeated`]);
}
function settleQuests(p, S) {
  for (const id of p.activeQuests) progress(p, S, id);
  for (let guard = 0; guard < 40; guard++) {
    let moved = false;
    for (const id of AUTO) {
      if (!T.quests[id]) continue;
      if (p.activeQuests.includes(id)) { progress(p, S, id); if (AUTO_END[id] && ready(p, id)) { finish(p, id); moved = true; } continue; }
      if (!wants(p, id)) continue;
      p.activeQuests.push(id); progress(p, S, id); moved = true;
      if (AUTO_END[id] && ready(p, id)) finish(p, id);
    }
    if (!moved) break;
  }
}
function finish(p, id) { p.activeQuests = p.activeQuests.filter(x => x !== id); if (!p.completedQuests.includes(id)) p.completedQuests.push(id); delete p.questProgress[id]; }

// ---------------------------------------------------------------- points
const records = [], recIx = new Map();
function rec(p) { const k = JSON.stringify(p); if (!recIx.has(k)) { recIx.set(k, records.length); records.push(p); } return recIx.get(k); }
const prevAfter = n => { for (let i = n - 1; i >= 0; i--) if (EV[i] && EV[i].after && !EV[i].restored) return EV[i].after; return null; };
const NG = { level: NEWGAME.level, exp: NEWGAME.exp, expToNext: NEWGAME.expToNext, hp: NEWGAME.hp, maxHp: NEWGAME.maxHp, atk: NEWGAME.atk, def: NEWGAME.def, spd: NEWGAME.spd, gold: NEWGAME.gold,
  eq: NEWGAME.equipment, inv: NEWGAME.inventory.map(i => i.itemId + '*' + i.quantity), active: [], done: [], grade: NEWGAME.quizDifficulty, timer: NEWGAME.timerEnabled };
const acts = {}, seen = new Set(), missing = [];
const place = (act, pl) => { (acts[act] = acts[act] || []).push(pl); return pl; };

function townPoint(s, map, hosted, viewId) {
  const key = 'town:' + (hosted || map); if (seen.has(key)) return; seen.add(key);
  const e = EV[s.n]; let st = s.n === 0 ? NG : prevAfter(s.n);
  if (!st) { missing.push(key); return; }
  const tw = e && (e.town || null);
  if (tw && s.t === 'town' && tw.level === st.level) st = { ...st, gold: tw.gold0, hp: tw.hp0 };     // what she carries through the gate (after the walk there)
  const p = fromStatus(st, s.n, { towns: [hosted || map] });
  const c = townCell(map, hosted);
  place(s.act, { id: hosted || map, kind: 'town', map, hosted: hosted || undefined, stop: s.n,
    points: [{ id: (hosted || map) + ':gate', kind: 'gate', r: rec(p), pos: { mapId: map, x: c[0], y: c[1], floor: 1 }, flags: hosted ? { ['acts.town.' + hosted]: true } : undefined }] });
}
function dungeonPoints(s, id, doorName) {
  if (seen.has('dungeon:' + id)) return; seen.add('dungeon:' + id);
  const e = EV[s.n], D = e && (e.dungeon || e.visit), wd = W.dungeons[id], fl = floorsOf(id);
  if (!fl.length) { missing.push('floors ' + id); return; }
  const boss = wd.bossId, arrive = (e && e.dungeon && e.dungeon.arrive) || prevAfter(s.n), atDoor = (e && e.dungeon && e.dungeon.boss && e.dungeon.boss.at) || arrive;
  if (!arrive) { missing.push('dungeon ' + id); return; }
  const rA = rec(fromStatus(arrive, s.n, { notBoss: [boss] })), rB = rec(fromStatus(atDoor, s.n, { notBoss: [boss] }));
  const pts = [], tower = !!TOWERS[id];
  const isle = ISLE_EXIT[id];
  pts.push({ id: id + ':entrance', kind: 'entrance', r: rA, pos: isle ? { mapId: isle, x: 25, y: 11, floor: 1 } : (() => { const x = doorExit(doorName); return { mapId: 'overworld', x: x[0], y: x[1], floor: 1 }; })() });
  const half = Math.ceil(fl.length / 2);
  for (const { n, f, engine } of fl) { const c = engine ? engine.land : landing(f); if (!c) { missing.push(`landing ${id} ${n}`); continue; }
    pts.push({ id: `${id}:f${n}`, kind: 'floor', floor: n, tower: tower || undefined, single: fl.length === 1 || undefined, r: n <= half ? rA : rB, pos: { mapId: id, x: c[0], y: c[1], floor: n } }); }
  const last = fl[fl.length - 1], bc = last.engine ? last.engine.boss : bossCell(last.f);
  if (bc) pts.push({ id: id + ':boss', kind: 'boss', r: rB, pos: { mapId: id, x: bc[0], y: bc[1], floor: last.n } }); else missing.push('boss cell ' + id);
  place(s.act, { id, kind: 'dungeon', map: id, stop: s.n, optional: s.optional ? true : undefined, points: pts });
}
for (const s of W.stops) {
  if (s.t === 'town') townPoint(s, s.id, s.hosted);
  else if (s.t === 'dungeon') dungeonPoints(s, s.id, s.door);
  else if (s.t === 'visit') dungeonPoints(s, s.id, s.door);
  else if (s.t === 'isle') { townPoint(s, s.village, null); dungeonPoints(s, s.dungeon, null); }
}
const out = { schema: 1, generated: new Date().toISOString(), note: 'TESTERS ONLY. Written by scripts/auto/jump/build.cjs; do not edit by hand.',
  source: { honestDir: HONEST, profile: PROFILE, run: RUN.d, runs: pool.map(r => r.d), rule: 'median finished run by final experience; towns: first arrival; dungeons: door record for the entrance and the first half of the floors, boss-door record for the rest' },
  acts: Object.keys(acts).sort().map(a => ({ act: +a, places: acts[a] })), records };
fs.writeFileSync(OUT, JSON.stringify(out));
const nPts = out.acts.reduce((a, x) => a + x.places.reduce((b, p) => b + p.points.length, 0), 0);
console.log(`wrote ${OUT}: ${nPts} points in ${out.acts.reduce((a, x) => a + x.places.length, 0)} places, ${records.length} records, ${fs.statSync(OUT).size} bytes; run ${RUN.d} (of ${pool.map(r => r.d).join(', ')})`);
if (missing.length) { console.log('MISSING', missing.join('; ')); process.exitCode = 1; }
