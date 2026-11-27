'use strict';
// Day 4 census: what the game has versus what the index holds. Prints a JSON report to stdout.
//   node scripts/auto/census/coverage.cjs [index.json=/home/user/work/d4/c/stage/index.json]
process.env.HONEST_DIST = process.env.HONEST_DIST || '/home/user/work/h3/dist';
const fs = require('fs'), path = require('path');
const C = require('./clib.cjs');
const T = require('../honest/world.cjs').tables();
const idx = JSON.parse(fs.readFileSync(process.argv[2] || '/home/user/work/d4/c/stage/index.json', 'utf8'));
const have = new Set(idx.images.map(i => i.id));
const A1 = JSON.parse(fs.readFileSync(path.join(C.ROOT, 'public/act1-dungeon-floors.json'), 'utf8')).floors;
const A1IDS = ['sunkenCellar', 'whisperingWoodsCave', 'coastalReef', 'mistyGrotto', 'crystalCave'];
const rep = { counts: idx.counts, total: idx.count, flatFrames: idx.flatFrames, groups: {} };
// towns
const HI = ['greenhollow', 'millbrook', 'portSapphire', 'ironkeep', 'frostwatch', 'hauntedVillage', 'ruinsCamp', 'oasisHaven', 'embersRest', 'cinderwatch', 'lastBastion', 'havensEdge'];
const PORTAL = ['stormreachVillage', 'frostfallVillage', 'sunkenTempleVillage', 'twilightVillage'];
const tm = [], tex = { towns: HI.length + PORTAL.length, services: {}, missing: [] };
for (const id of HI) {
  const tj = JSON.parse(fs.readFileSync(path.join(C.ROOT, 'public/act1-hifi/town', id + '-town.json'), 'utf8'));
  for (const k of ['ow-gate-' + id, `town-${id}-entry`, `town-${id}-centre`, `town-${id}-save-point`, `town-${id}-shop`]) if (!have.has(k)) tex.missing.push(k);
  for (const n of tj.npcs) if (!have.has(`town-${id}-npc-${n.id}`)) tex.missing.push(`town-${id}-npc-${n.id}`);
  tex.services[id] = tj.npcs.map(n => n.id);
}
for (const id of PORTAL) for (const k of [`town-${id}-entry`, `town-${id}-centre`]) if (!have.has(k)) tex.missing.push(k);
rep.groups.towns = tex;
// dungeons
const dex = { dungeons: 0, floors: 0, entryMissing: [], midMissing: [], bossMissing: [], mechDungeons: [], mechMissing: [] };
const lists = {}; for (const id of A1IDS) lists[id] = Object.values(A1).filter(f => f.dungeonId === id).map(f => f.floor).sort((a, b) => a - b);
for (const [id, d] of Object.entries(C.dman.dungeons)) lists[id] = d.authoredFloors;
for (const [id, fl] of Object.entries(lists)) {
  dex.dungeons++;
  for (const n of fl) { dex.floors++;
    if (!have.has(`dungeon-${id}-f${n}-entry`)) dex.entryMissing.push(`${id}-f${n}`);
    if (!have.has(`dungeon-${id}-f${n}-mid`)) dex.midMissing.push(`${id}-f${n}`); }
  const last = fl[fl.length - 1]; if (!have.has(`dungeon-${id}-f${last}-boss-room`)) dex.bossMissing.push(`${id}-f${last}`);
}
const mech = idx.images.filter(i => i.group === 'dungeons' && /^mech-/.test(i.id)); const md = {};
for (const m of mech) { md[m.place] = md[m.place] || new Set(); md[m.place].add(m.element); }
for (const [id, d] of Object.entries(C.dman.dungeons)) { if (!md[id]) dex.mechMissing.push(`${id} (${d.mechanic})`); else dex.mechDungeons.push(`${id}: ${[...md[id]].join(',')}`); }
rep.groups.dungeons = dex;
// battles
const bat = { monsters: Object.keys(T.monsters).length, captured: 0, missing: [] };
for (const id of Object.keys(T.monsters)) { if (have.has('battle-' + id)) bat.captured++; else bat.missing.push(id); }
rep.groups.battles = bat;
// overworld
const ow = idx.images.filter(i => i.group === 'overworld'); const by = {}; for (const i of ow) { const k = i.id.startsWith('ow-atlas') ? 'atlas-a' + i.act : i.id.split('-').slice(0, 2).join('-'); by[k] = (by[k] || 0) + 1; }
rep.groups.overworld = { total: ow.length, by };
// ui
const ui = idx.images.filter(i => i.group === 'ui'); const lang = {}; for (const i of ui) lang[i.lang] = (lang[i.lang] || 0) + 1;
const stems = {}; for (const i of ui) { const s = i.id.replace(/-(en|ja-kana|ja-kanji)$/, ''); (stems[s] = stems[s] || new Set()).add(i.lang); }
rep.groups.ui = { total: ui.length, byLang: lang, screens: Object.keys(stems).length, notInAllThreeLangs: Object.entries(stems).filter(([, v]) => v.size < 3).map(([k, v]) => `${k} [${[...v].join(',')}]`) };
console.log(JSON.stringify(rep, null, 1));
