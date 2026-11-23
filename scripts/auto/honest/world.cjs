'use strict';
// Honest player, part 1: the world model, read from the shipped artefacts (never from src/).
//   * tables: sliced out of the compiled bundle as literals (zones, monsters, items, shops, quests, maps)
//   * dungeon floors: act1-dungeon-floors.json + acts-dungeons/manifest.json (the authored floors the
//     game really loads), routes by BFS over their own walk grids
//   * overworld legs: BFS over the Act 1 walk bake (act1-overworld-walk.bin) and the Acts 2-5 `reach`
//     raster of acts-hifi/manifest.json, between the doors' own exit cells
//   * the story itinerary (the compass chain + the quests a compass-following child picks up)
// Output: world.json (written next to the run logs). Nothing here touches the game.
const fs = require('fs'), path = require('path');
const DIST = process.env.HONEST_DIST || '/home/user/work/dist';
const BUNDLE = path.join(DIST, 'assets/index-BhoGQRaA.js');
const WANDER = +(process.env.HONEST_WANDER || 1.3);      // route steps x this = steps a child really walks
const CHEST_DETOUR = +(process.env.HONEST_CHEST_DETOUR || 20); // a chest is "on the route" if it costs <= this many extra steps

// ---------------------------------------------------------------- bundle literals
function literalAfter(src, marker) {
  const at = src.indexOf(marker); if (at < 0) throw new Error('marker not found: ' + marker);
  let i = at + marker.length; while (src[i] !== '{' && src[i] !== '[') i++;
  const open = src[i], close = open === '{' ? '}' : ']'; let depth = 0, j = i, str = null;
  for (; j < src.length; j++) { const c = src[j];
    if (str) { if (c === '\\') j++; else if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { depth--; if (depth === 0) break; } }
  return (new Function('return (' + src.slice(i, j + 1) + ')'))();
}
function tables() {
  const src = fs.readFileSync(BUNDLE, 'utf8');
  if (src.length < 4.5e6 || src.length > 5.5e6) throw new Error('bundle size looks wrong: ' + src.length);
  const t = {
    zones: literalAfter(src, '\nconst On = '), monsters: literalAfter(src, '\n    Ni = '), items: literalAfter(src, '\nconst ye = '),
    shops: literalAfter(src, '\nconst Fn = '), quests: literalAfter(src, '\nconst wi = '), maps: literalAfter(src, '\nconst Xt = '),
    compass: literalAfter(src, '\n    hs = '), healer: literalAfter(src, 'Te.HEALER_PRICES = '),
    xpTable: literalAfter(src, '\n    Wr = '), levelGains: literalAfter(src, '\n    al = '),
  };
  if (Object.keys(t.monsters).length !== 75) throw new Error('expected 75 monsters, got ' + Object.keys(t.monsters).length);
  return t;
}

// ---------------------------------------------------------------- floors
function loadFloors() {
  const a1 = JSON.parse(fs.readFileSync(path.join(DIST, 'act1-dungeon-floors.json'), 'utf8'));
  const a2 = JSON.parse(fs.readFileSync(path.join(DIST, 'acts-dungeons/manifest.json'), 'utf8'));
  return { floors: { ...a1.floors, ...a2.floors }, dungeons: a2.dungeons };
}
function gridBfs(rows, from, extraOpen) {       // distances from one cell over the non-# cells (assets' own cells count as open)
  const H = rows.length, W = rows[0].length, d = new Int32Array(W * H).fill(-1), open = (x, y) => rows[y][x] !== '#' || extraOpen.has(x + ',' + y);
  const q = [from[1] * W + from[0]]; d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) { const c = q[h], x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (d[n] >= 0 || !open(nx, ny)) continue; d[n] = d[c] + 1; q.push(n); } }
  return (p) => d[p[1] * W + p[0]];
}
// One floor's route as a list of legs: [{ steps, then }] with then = chest | crystal | stairs | boss.
// `heals`: the crystal restores HP here (floors > 1 only: dq-tiles.js a1mCrystalShow gives the floor-1 crystal the warp alone).
function floorRoute(key, f, floorNo, totalFloors) {
  const A = f.assets || [], one = k => A.find(a => a.kind === k);
  const start = (f.land && (floorNo === 1 ? f.land.mouth : f.land.fromPrev)) || (floorNo === 1 ? one('mouth') : one('stairsUp'));
  const boss = one('boss'), down = one('stairsDown'), goal = boss || down, crystal = one('save');
  if (!start || !goal) return { key, error: 'no start/goal', legs: [] };
  const chests = A.filter(a => a.kind === 'chest' && !a.hidden);
  const open = new Set(A.map(a => a.x + ',' + a.y)); open.add(start.x + ',' + start.y);
  const P = a => [a.x, a.y], manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const dStart = gridBfs(f.rows, P(start), open), dGoal = gridBfs(f.rows, P(goal), open);
  let approx = false, base = dStart(P(goal));
  if (base < 0) { approx = true; base = Math.round(manh(start, goal) * 1.5); }      // the walk grid alone does not connect them (a mechanic bridges it)
  const dist = (dfn, a, b) => { const v = dfn(P(b)); return v >= 0 ? v : Math.round(manh(a, b) * 1.5); };
  // way points: chests whose detour is small, in the order she meets them; a healing crystal always (it is the rest stop)
  const stops = [];
  for (const c of chests) { const det = dist(dStart, start, c) + dist(dGoal, goal, c) - base; if (det <= CHEST_DETOUR) stops.push({ kind: 'chest', at: c, along: dist(dStart, start, c), id: `${c.x},${c.y}`, loot: c.loot || null, golden: !!c.golden }); }
  // the Holy Amulet chest is story-critical (Sword Wraith reflects 90% without it): she is told to find it
  for (const c of chests) if (c.golden && !stops.some(s => s.at === c)) stops.push({ kind: 'chest', at: c, along: dist(dStart, start, c), id: `${c.x},${c.y}`, loot: c.loot || null, golden: true });
  const heals = !!crystal && floorNo > 1;
  if (heals) stops.push({ kind: 'crystal', at: crystal, along: boss ? 1e9 : dist(dStart, start, crystal) });   // on the boss floor: last thing before the boss
  stops.sort((a, b) => a.along - b.along);
  const legs = []; let cur = start, total = 0;
  for (const s of stops) { const dfn = gridBfs(f.rows, P(cur), open), d = dist(dfn, cur, s.at); legs.push({ steps: Math.ceil(d * WANDER), raw: d, then: s.kind, id: s.id, loot: s.loot, golden: s.golden }); total += d; cur = s.at; }
  { const dfn = gridBfs(f.rows, P(cur), open), d = dist(dfn, cur, goal); legs.push({ steps: Math.ceil(d * WANDER), raw: d, then: boss ? 'boss' : 'stairs' }); total += d; }
  return { key, floor: floorNo, totalFloors, size: [f.width, f.height], mechanic: (f.mechanic && f.mechanic.id) || null, approx, direct: base, routeRaw: total, routeSteps: legs.reduce((a, l) => a + l.steps, 0),
    chestsAll: chests.length, chestsHidden: A.filter(a => a.kind === 'chest' && a.hidden).length, chestsOnRoute: stops.filter(s => s.kind === 'chest').length, crystal: !!crystal, heals, boss: !!boss, legs };
}

// ---------------------------------------------------------------- overworld
function loadOverworld() {
  const man = JSON.parse(fs.readFileSync(path.join(DIST, 'acts-hifi/manifest.json'), 'utf8'));
  const W = man.reach.width, H = man.reach.height, R = new Uint8Array(W * H);
  man.reach.rows.forEach((row, y) => { let x = 0; for (const seg of row.split(',')) { const [v, n] = seg.split(':').map(Number); for (let i = 0; i < n; i++) R[y * W + x++] = v; } });
  // Act 1: the baked walk field; a cell is open unless it is wholly blocked (mixed cells count when part of them is clear)
  const buf = fs.readFileSync(path.join(DIST, 'act1-overworld-walk.bin')), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const N = dv.getUint16(6, true), mw = dv.getUint16(8, true), blkOff = 96 + mw * dv.getUint16(10, true) * 2;
  const idx = (x, y) => dv.getUint16(96 + (y * mw + x) * 2, true);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (R[y * W + x]) continue; const v = idx(x, y);
    if (v === 0xFFFF) R[y * W + x] = 1; else if (v < 0xFFFD) { let ok = 0; const o = blkOff + v * N * N; for (let i = 0; i < N * N; i++) if (buf[o + i] >= 48) ok++; if (ok >= N * N * 0.15) R[y * W + x] = 1; } }
  const a1src = fs.readFileSync(path.join(DIST, 'act1-world-map.js'), 'utf8'), m = /var LANDMARKS = (\[.*?\]);/.exec(a1src);
  const doors = {};
  for (const l of JSON.parse(m[1])) doors[l.mapId] = { name: l.mapId, mapId: l.mapId, at: [l.at.x, l.at.y], exit: [l.exit.x, l.exit.y], act: 1 };
  for (const l of man.landmarks) doors[l.name] = { name: l.name, mapId: l.virtual || l.mapId, engineMap: l.mapId, at: l.at, exit: l.exit, act: l.act, toFloor: l.toFloor || null };
  function pathCells(a, b) {
    const prev = new Int32Array(W * H).fill(-2), q = [a[1] * W + a[0]]; prev[q[0]] = -1; const goal = b[1] * W + b[0];
    for (let h = 0; h < q.length; h++) { const c = q[h]; if (c === goal) { const out = []; let k = c; while (k !== -1) { out.push([k % W, (k / W) | 0]); k = prev[k]; } return out.reverse(); }
      const x = c % W, y = (c / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (prev[n] !== -2 || (!R[n] && n !== goal)) continue; prev[n] = c; q.push(n); } }
    return null;
  }
  return { doors, pathCells, gates: man.gates };
}

// ---------------------------------------------------------------- story itinerary
// Town stops name the engine map (shop stock + healer price are the engine map's). `door` = the manifest door.
// A dungeon runs every authored floor and its boss; `exit` = the door she comes out of after the boss.
// quest: { start: id } when a person on the direct route hands it out, { turnIn: id } when she is back with it done.
const STORY = [
  { act: 1, t: 'town', id: 'greenhollow', door: 'greenhollow', start: true },
  { act: 1, t: 'town', id: 'millbrook', door: 'millbrook', quest: { start: 'owlsLesson' } },
  { act: 1, t: 'dungeon', id: 'whisperingWoodsCave', door: 'whisperingWoodsCave', side: 'quest owlsLesson (the Sage hands it out on the direct route; the compass follows an active quest)' },
  { act: 1, t: 'town', id: 'millbrook', door: 'millbrook', quest: { turnIn: 'owlsLesson' } },
  { act: 1, t: 'town', id: 'portSapphire', door: 'portSapphire', quest: { start: 'drakeCargo' } },
  { act: 1, t: 'visit', id: 'coastalReef', door: 'coastalReef', steps: 30, side: 'quest drakeCargo needs a visit only: about 15 cells in and back out' },
  { act: 1, t: 'town', id: 'portSapphire', door: 'portSapphire', quest: { turnIn: 'drakeCargo' } },
  { act: 1, t: 'dungeon', id: 'mistyGrotto', door: 'mistyGrotto' },
  { act: 1, t: 'town', id: 'portSapphire', door: 'portSapphire' },
  { act: 1, t: 'dungeon', id: 'crystalCave', door: 'crystalCave', exit: 'Crystal Cave (Act 2 side)' },
  { act: 2, t: 'town', id: 'ironkeep', door: 'Ironkeep', quest: { start: 'gordosOre' } },
  { act: 2, t: 'dungeon', id: 'ironMine', door: 'Iron Mine' },
  { act: 2, t: 'town', id: 'ironkeep', door: 'Ironkeep', quest: { turnIn: 'gordosOre' } },
  { act: 2, t: 'dungeon', id: 'stormNest', door: 'Storm Nest' },
  { act: 2, t: 'town', id: 'ironkeep', door: 'Ironkeep', quest: { turnIn: 'gordosOre' } },
  { act: 2, t: 'town', id: 'frostwatch', door: 'Frostwatch', gate: 'wind-canyon' },
  { act: 2, t: 'dungeon', id: 'frozenLake', door: 'Frozen Lake' },
  { act: 2, t: 'town', id: 'frostwatch', door: 'Frostwatch' },
  { act: 2, t: 'dungeon', id: 'hauntedForest', door: 'Haunted Forest', exit: 'Haunted Forest (second entrance)' },
  { act: 2, t: 'town', id: 'hauntedVillage', door: 'Ravenhollow' },
  { act: 2, t: 'dungeon', id: 'shadowCave', door: 'Shadow Cave', exit: 'Shadow Cave (Act 3 side)' },
  { act: 3, t: 'town', id: 'ruinsCamp', door: 'Ruins Camp' },
  { act: 3, t: 'town', id: 'oasisHaven', door: 'Oasis Haven', quest: { start: 'lunasMap' } },
  { act: 3, t: 'dungeon', id: 'oasisDepths', door: 'Oasis Depths' },
  { act: 3, t: 'town', id: 'oasisHaven', door: 'Oasis Haven', quest: { turnIn: 'lunasMap' } },
  { act: 3, t: 'dungeon', id: 'desertTomb', door: 'Desert Tomb' },
  { act: 3, t: 'town', id: 'oasisHaven', door: 'Oasis Haven', quest: { start: 'ancientRelic' } },
  { act: 3, t: 'dungeon', id: 'banditHideout', door: 'Bandit Hideout', optional: 'drakesCargo2 has no giver in build 98, so nothing sends her here; measured from a copy of her record, which is then put back' },
  { act: 3, t: 'dungeon', id: 'scorchedRuins', door: 'Scorched Ruins' },
  { act: 3, t: 'town', id: 'ruinsCamp', door: 'Ruins Camp', quest: { turnIn: 'ancientRelic' } },
  { act: 4, t: 'town', id: 'embersRest', door: "Ember's Rest", quest: { start: 'flameCloak' } },
  { act: 4, t: 'dungeon', id: 'magmaTunnels', door: 'Magma Tunnels', exit: 'Magma Tunnels (Act 4 side)' },
  { act: 4, t: 'town', id: 'embersRest', door: 'Cinderwatch', hosted: 'cinderwatch' },
  { act: 4, t: 'dungeon', id: 'emberMines', door: 'Ember Mines' },
  { act: 4, t: 'town', id: 'embersRest', door: 'Cinderwatch', hosted: 'cinderwatch' },
  { act: 4, t: 'dungeon', id: 'obsidianCavern', door: 'Obsidian Cavern', optional: 'its door is back on the Act 3 side and its quest (lunasProphecy) is Luna\'s, in Oasis Haven; the compass skips it unless she walks back; measured from a copy of her record, which is then put back' },
  { act: 4, t: 'dungeon', id: 'volcanicForge', door: 'Volcanic Forge', exit: 'Volcanic Forge (Act 5 side)' },
  { act: 5, t: 'town', id: 'lastBastion', door: 'Last Bastion' },
  { act: 5, t: 'dungeon', id: 'demonBarracks', door: 'Demon Barracks' },
  { act: 5, t: 'town', id: 'havensEdge', door: "Haven's Edge" },
  { act: 5, t: 'dungeon', id: 'voidRift', door: 'Void Rift' },
  { act: 5, t: 'town', id: 'havensEdge', door: "Haven's Edge" },
  { act: 5, t: 'isle', id: 'stormreachIsles', door: 'Portal - Stormreach Isles', village: 'stormreachVillage', dungeon: 'stormreachSpire' },
  { act: 5, t: 'isle', id: 'frostfallPeaks', door: 'Portal - Frostfall Peaks', village: 'frostfallVillage', dungeon: 'frostfallCavern' },
  { act: 5, t: 'isle', id: 'sunkenTempleIsle', door: 'Portal - Sunken Temple', village: 'sunkenTempleVillage', dungeon: 'sunkenTempleDungeon' },
  { act: 5, t: 'isle', id: 'twilightRealm', door: 'Portal - Twilight Realm', village: 'twilightVillage', dungeon: 'twilightDungeon' },
  { act: 5, t: 'town', id: 'lastBastion', door: 'Last Bastion' },
  { act: 5, t: 'dungeon', id: 'demonCastle', door: 'Demon Castle', final: true },
];
// What the bundle's WorldMapScene hands over when a boss falls (its wake handler: `o === "giantToad" && tt.player.addItem("toadShield", 1)` ...).
// Legendary pieces are equipped by the bundle itself; the rest only lands in the bag.
const BOSS_REWARD = {
  giantToad: ['toadShield'], giantCrab: ['coralBlade'], serpent: ['crystalPendant', 'shadowCrystal'], stormHarpy: ['shadowCrystal', 'windbreakerStone'],
  iceWyrm: ['frostbrand'], dragon: ['dragonheartAmulet', 'shadowCrystal'], sandGolem: ['sandstormCloak', 'flameCloak', 'shadowCrystal'], banditLord: ['banditDagger'],
  lavaWyrm: ['magmaBlade'], flameTitan: ['moltenGreaves', 'shadowCrystal'], swordWraith: ['excalibur'], celestialGuardian: ['aegisOfDawn'], stormSentinel: ['galeShield'], frostMonarch: ['crownOfWisdom'],
};
const BOSS_AUTOEQUIP = ['excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom'];

function build() {
  const T = tables(), F = loadFloors(), OW = loadOverworld();
  const dungeons = {};
  for (const [id, m] of Object.entries(T.maps)) { if (m.type !== 'dungeon') continue;
    const keys = Object.keys(F.floors).filter(k => k.startsWith(id + '-f')).sort((a, b) => +a.split('-f')[1] - +b.split('-f')[1]);
    if (!keys.length) continue;
    const floors = keys.map((k, i) => floorRoute(k, F.floors[k], i + 1, keys.length));
    const tier = ['sunkenCellar', 'whisperingWoodsCave', 'coastalReef', 'mistyGrotto'].includes(id) ? 1 : ['ironMine', 'stormNest', 'hauntedForest', 'frozenLake', 'crystalCave', 'shadowCave'].includes(id) ? 2 : ['oasisDepths', 'desertTomb', 'banditHideout', 'scorchedRuins'].includes(id) ? 3 : ['emberMines', 'magmaTunnels', 'obsidianCavern', 'volcanicForge'].includes(id) ? 4 : 5;
    dungeons[id] = { id, zone: m.encounterZone, bossId: m.bossId, bundleFloors: m.floors, floors, chestTier: tier, reward: BOSS_REWARD[m.bossId] || [] };
  }
  // itinerary with overworld legs between consecutive stops
  const stops = []; let at = null, lastTown = null;
  const leg = (from, to, why) => { const cells = OW.pathCells(from, to); return cells ? { cells, raw: cells.length - 1, steps: Math.ceil((cells.length - 1) * WANDER) } : { cells: null, raw: Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]), steps: Math.ceil((Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1])) * WANDER * 1.2), noPath: why, from, to }; };
  STORY.forEach((s, i) => {
    const d = OW.doors[s.door]; if (!d) throw new Error('no door ' + s.door);
    const st = { ...s, n: i, doorAt: d.at, doorExit: d.exit };
    if (!s.start) st.leg = leg(at, d.exit, `${i} ${s.id}`);
    if (s.t === 'town') { st.shop = T.shops[s.id] ? T.shops[s.id].items : []; st.healer = T.healer[s.id]; lastTown = { id: s.id, door: s.door, exit: d.exit }; at = d.exit; }
    else if (s.t === 'visit') { st.zone = T.maps[s.id].encounterZone; st.lastTown = lastTown; at = d.exit; }
    else if (s.t === 'dungeon') { st.lastTown = lastTown; st.backLeg = leg(lastTown.exit, d.exit, 'back to ' + s.id); if (!s.optional) at = OW.doors[s.exit || s.door].exit; }
    else if (s.t === 'isle') {   // portal isle: the bundle's own small map (arrive 20,39; village 10,20; dungeon 25,10), zone by map id
      st.lastTown = lastTown; st.isleZone = { stormreachIsles: 'stormreach-isles', frostfallPeaks: 'frostfall-peaks', sunkenTempleIsle: 'sunken-temple', twilightRealm: 'twilight-realm' }[s.id];
      st.legToVillage = Math.ceil(29 * WANDER); st.legToDungeon = Math.ceil(25 * WANDER); st.legBack = Math.ceil(44 * WANDER);
      st.shop = T.shops[s.village].items; st.healer = T.healer[s.village]; at = d.exit; }
    stops.push(st);
  });
  return { built: new Date().toISOString(), wander: WANDER, chestDetour: CHEST_DETOUR, tables: T, dungeons, stops, bossAutoEquip: BOSS_AUTOEQUIP, gates: OW.gates };
}
module.exports = { build, tables, STORY, BOSS_REWARD };
if (require.main === module) {
  const out = process.argv[2] || '/home/user/work/honest/world.json';
  const w = build(); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(w));
  for (const s of w.stops) { const d = s.t === 'dungeon' ? w.dungeons[s.id] : s.t === 'isle' ? w.dungeons[s.dungeon] : null;
    console.log(String(s.n).padStart(2), 'A' + s.act, s.t.padEnd(7), s.id.padEnd(20), s.leg ? `leg ${s.leg.raw}${s.leg.noPath ? ' NOPATH' : ''}` : '', d ? `zone ${d.zone} boss ${d.bossId} floors ${d.floors.length} route ${d.floors.map(f => f.routeSteps + (f.approx ? '~' : '')).join('/')} chests ${d.floors.map(f => f.chestsOnRoute + ':' + f.chestsAll).join(' ')} heal ${d.floors.map(f => f.heals ? 'H' : '-').join('')}` : '', s.quest ? JSON.stringify(s.quest) : ''); }
  console.log('wrote', out, fs.statSync(out).size);
}
