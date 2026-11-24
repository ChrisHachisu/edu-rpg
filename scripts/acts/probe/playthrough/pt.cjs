'use strict';
// E3 story playthrough, one segment per process (a segment = one browser), chained by the game's own
// save (see ptlib.cjs for what is and is not a real input).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5400/ \
//     node scripts/acts/probe/playthrough/pt.cjs <segment> <in.json|new> <out-name>
// Records go to $PT_DIR/rows.jsonl (default /home/user/work/e3/pt), screenshots to $PT_SHOTS.
const fs = require('fs'), path = require('path');
const { Session, door, OUTD, L } = require('./ptlib.cjs');
const [SEG, IN, OUT] = process.argv.slice(2);
const S = new Session(SEG);
const has = (s, q) => s.done.includes(q);
const SEGS = {};

// ---------------------------------------------------------------- shared steps
async function dungeonGenerated(id, doorName, { want } = {}) {
  await S.travel(doorName); await S.shot(`${id}-mouth`);
  const r = await S.walkInto(doorName); await S.page.waitForTimeout(2500); await S.inject(); await L.noEncounters(S.page);
  let s = await S.st(); const lines = await S.dismissAll();
  if (!S.rec(`walks into the ${id} mouth: floor 1`, s.map === id, { walk: r.why, map: s.map, floor: s.floor, lines })) return false;
  const res = await S.solveDungeon(id);
  s = await S.st(); await S.shot(`${id}-out`);
  S.rec(`${id}: floors solved, boss fought, back outside`, s.map !== id && (!want || want(s)), { end: res.end, boss: res.boss, log: res.log.slice(-12) });
  return s.map !== id;
}
function mechProbe(script, args = [], { name = script } = {}) {     // a mechanic probe run on the playthrough's own record
  const { spawnSync } = require('child_process');
  const inF = path.join(OUTD, '_mech-in.json'), outF = path.join(OUTD, `_mech-out-${name}.json`);
  return { inF, outF, run: () => spawnSync('node', [path.join(__dirname, '..', script), ...args], { env: { ...process.env, PT_SAVE: inF, PT_SAVE_OUT: outF, PROBE_OUT: path.join(OUTD, 'mech-' + name), PROBE_SHOTS: path.join(OUTD, 'mech-shots') }, encoding: 'utf8', timeout: 2400000, maxBuffer: 64 << 20 }) };
}
// Run a dungeon's own end-to-end probe from the playthrough's record (she stands at the mouth's exit)
// and continue from the record it leaves.
async function dungeonAuthored(id, doorName, script, args = []) {
  await S.travel(doorName); await S.shot(`${id}-mouth`);
  const m = mechProbe(script, args, { name: id });
  fs.writeFileSync(m.inF, JSON.stringify(await S.capture()));
  await S.close();
  const t0 = Date.now(); const r = m.run(); const out = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(path.join(OUTD, `mech-${id}.log`), out);
  const fails = out.split('\n').filter(l => l.startsWith('[FAIL]')); const last = out.trim().split('\n').slice(-1)[0];
  const sv = fs.existsSync(m.outF) ? JSON.parse(fs.readFileSync(m.outF, 'utf8')) : null;
  S.rec(`${id}: the dungeon played end to end on the story record (${script})`, r.status === 0 && fails.length === 0 && !!sv, { secs: Math.round((Date.now() - t0) / 1000), last, fails: fails.slice(0, 6).map(l => l.slice(0, 220)) });
  if (!sv) throw new Error('no record back from ' + script);
  await S.open(sv); await S.inject(); await L.noEncounters(S.page);
  return sv;
}
async function town(doorName, fn) { await S.travel(doorName); if (!(await S.enterTown(doorName))) return false; await S.shot(`${door(doorName).virtual || door(doorName).mapId}-in`); await fn(); await S.leaveTown(); return true; }
async function compassIs(what, mapIdOrDoor) {
  const s = await S.st(); const d = door(mapIdOrDoor);
  S.rec(`compass points at ${what}`, !!s.compass && s.compass.ox === d.at[0] && s.compass.oy === d.at[1], { compass: s.compass, door: d.at });
}
// The compass with one optional quest set aside (the bundle points at an active quest's target first).
async function compassIsWithout(q, what, mapIdOrDoor) {
  const d = door(mapIdOrDoor);
  const c = await S.ev(q => { const s = window.__GAME_STATE__.player.state, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), a = s.activeQuests.slice();
    s.activeQuests = a.filter(x => x !== q); try { const t = w.getCompassTarget(); return t ? { ox: t.ox, oy: t.oy } : null; } finally { s.activeQuests = a; } }, q);
  S.rec(`compass points at ${what} (optional ${q} set aside)`, !!c && c.ox === d.at[0] && c.oy === d.at[1], { compass: c, door: d.at });
}
async function questLog(what, re) { const q = await S.questLog(); S.rec(`quest log: ${what}`, re ? q.entries.some(e => re.test(e)) : true, q); return q; }
async function continueHere(what) {                                   // the real title path: reload, Start -> slot -> newest record
  const page = S.page; const before = await S.st();
  await page.evaluate(() => { const gs = window.__GAME_STATE__; try { gs.saveGame(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-act="titleSlots"]', { state: 'visible', timeout: 120000 }).catch(() => {});
  await page.waitForFunction(() => { const k = window.__QOK_COVER__; return !k || k.phase() === 'waiting'; }, { timeout: 30000 }).catch(() => {});
  await page.click('[data-act="titleSlots"]'); await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.__QOK_SAVES__.activeSlot());
  await page.click(`[data-act="slotPick"][data-i="${n}"]`); await page.waitForTimeout(400);
  const pick = await page.evaluate(n => { const i = window.__QOK_SAVES__.slotInfo(n); return i.auto && (!i.save || i.auto.timestamp >= i.save.timestamp) ? 0 : 1; }, n);
  await page.click(`[data-act="slotLoad"][data-i="${pick}"]`);
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 120000 });
  await page.waitForTimeout(4000); await S.inject(); await L.noEncounters(page);
  const after = await S.st();
  S.rec(`Save -> Continue (${what}): same place, same story`, after.map === before.map && Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1 && JSON.stringify(after.done) === JSON.stringify(before.done) && JSON.stringify(after.bosses.sort()) === JSON.stringify(before.bosses.sort()),
    { before: [before.map, before.x, before.y], after: [after.map, after.x, after.y], town: after.town && after.town.id });
  await S.shot('continued-' + what.replace(/\W+/g, '-'));
}

// ---------------------------------------------------------------- Act 1 (the shipped Act 1, unchanged)
SEGS.a1 = async () => {
  await S.open(null, { newGame: true }); await S.shot('newgame-greenhollow');
  S.rec('New Game opens in Greenhollow', (await S.st()).map === 'greenhollow');
  await S.dismissAll(); await S.talk('elder'); await S.buff();
  await S.leaveTown(); await compassIs('Millbrook first', 'millbrook');
  await town('millbrook', async () => { await S.talk('sage', { want: s => s.active.includes('owlsLesson') }); await questLog('Owl\'s lesson listed', /./); });
  await dungeonGenerated('whisperingWoodsCave', 'whisperingWoodsCave', { want: s => s.bosses.includes('mosswarden') });
  await town('millbrook', async () => { await S.talk('sage', { want: s => has(s, 'owlsLesson') }); });
  await town('portSapphire', async () => { await S.talk('drake', { want: s => s.active.includes('drakeCargo') }); await S.townSave(); });
  await continueHere('Act 1 town save point');
  await dungeonGenerated('coastalReef', 'coastalReef');
  await town('portSapphire', async () => { await S.talk('drake', { want: s => has(s, 'drakeCargo') }); });
  await dungeonGenerated('mistyGrotto', 'mistyGrotto', { want: s => s.bosses.includes('giantToad') });
  await town('millbrook', async () => { await S.talk('sage'); });
  await compassIs('the Crystal Cave', 'crystalCave');
  await S.shot('act1-before-crystal-cave');
};
SEGS.a1b = async () => {                       // Crystal Cave: the way from Act 1 into Act 2
  await S.open(JSON.parse(fs.readFileSync(IN, 'utf8'))); await S.buff();
  const ok = await dungeonGenerated('crystalCave', 'crystalCave', { want: s => s.bosses.includes('serpent') });
  const s = await S.st(); await S.shot('act2-arrival');
  S.rec('Crystal Cave lets her out on the Act 2 side', s.map === 'overworld' && s.x === door('Crystal Cave (Act 2 side)').exit[0] && s.y === door('Crystal Cave (Act 2 side)').exit[1], [s.map, s.x, s.y]);
  await compassIs('Millbrook (the Sage is waiting for the Crystal Cave report; Ironkeep comes after it, see a2)', 'millbrook');
};

// ---------------------------------------------------------------- helpers for the later acts
const load = () => JSON.parse(fs.readFileSync(IN, 'utf8'));
async function travelCell(x, y, what) { const sv = await S.capture(); sv.player.position = { mapId: 'overworld', x, y, floor: 1 }; await S.boot(sv); await L.noEncounters(S.page);
  const p = await L.pos(S.page); S.rec(`fast travel to ${what}`, p.map === 'overworld' && p.x === x && p.y === y, [p.map, p.x, p.y]); }
// Real random encounters on the floor she stands on: pace back and forth until `n` battles are won (or time runs out).
async function encounters(n, { maxMs = 240000, until = null, sideways = false } = {}) {   // sideways: pace left-right (a door above or below her)
  const page = S.page, t0 = Date.now(); let won = 0, met = []; await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
  let dir = 1;
  while (won < n && Date.now() - t0 < maxMs && !(until && await until())) {
    if (sideways) await L.stick(page, dir, 0, 700); else await L.stick(page, 0, dir, 700); dir = -dir;
    if (await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene'))) { const fr = await S.fight(); met.push(fr.monster); if (fr.won) won++; await page.waitForTimeout(1500); await S.dismissAll(); await S.inject(); }
    else { const m = await S.ev(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').showingMessage); if (m) await S.dismissAll(); }
    const s = await S.st(); if (s.map === 'overworld' && n && !met.length && Date.now() - t0 > maxMs / 2) break;
  }
  await L.noEncounters(page); return { won, met };
}
async function walkGate() {                       // the Act 2 wind canyon, for real, with the stone she won
  await travelCell(221, 331, 'the west side of the wind canyon');
  let r = await L.walkCells(S.page, [[228, 331]], { maxMs: 20000 }); await S.page.waitForTimeout(1500); await S.dismissAll();
  // The clearing plays as she steps in (message + wind fade); she then walks on, as a player would.
  for (let k = 0; k < 2; k++) { if ((await L.pos(S.page)).x >= 227) break; await S.page.waitForTimeout(1500); r = await L.walkCells(S.page, [[228, 331]], { maxMs: 20000 }); await S.dismissAll(); }
  const p = await L.pos(S.page); const fl = await S.ev(() => ({ ...window.__GAME_STATE__.player.state.storyFlags }));
  await S.shot('wind-canyon-crossed');
  S.rec('carrying the Windbreaker Stone she walks through the wind canyon (story gate opens, clearing plays)', r.ok && p.x >= 227 && !!fl['canyon.windCleared'], { r: r.why, at: [p.x, p.y], cleared: !!fl['canyon.windCleared'] });
}
async function defeat(townName) {                // lose a battle on purpose: the game sends her to the last town with half her gold
  const page = S.page; const s0 = await S.st(); const gold0 = s0.gold;
  await S.ev(() => { const s = window.__GAME_STATE__.player.state; s.__keep = { atk: s.atk, def: s.def, hp: s.hp, maxHp: s.maxHp }; s.atk = 1; s.def = 0; s.hp = 1; });
  await page.evaluate(() => { try { delete window.__GAME_STATE__.encounterManager.onStep; } catch (e) {} });
  let fr = null; const t0 = Date.now(); let dir = 1;
  while (!fr && Date.now() - t0 < 180000) { await L.stick(page, dir, 0, 700); dir = -dir; if (await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene'))) fr = await S.fight(120000, { lose: true }); }
  await page.waitForTimeout(2000);
  for (let i = 0; i < 20; i++) { const sc = await page.evaluate(() => window.__PHASER_GAME__.scene.getScenes(true).map(s => s.scene.key)); if (sc.includes('WorldMapScene') && !sc.includes('GameOverScene') && !sc.includes('BattleScene')) break;
    if (i === 0) await S.shot('defeat-screen').catch(() => {}); const b = page.locator('[data-act="defeatTown"]'); if (await b.count()) await b.first().click().catch(() => {}); await page.waitForTimeout(1500); }
  await page.waitForTimeout(3000); await S.inject(); await S.dismissAll(); await L.noEncounters(page);
  const s = await S.st(); await S.shot('after-defeat');
  await S.ev(() => { const s = window.__GAME_STATE__.player.state; if (s.__keep) { Object.assign(s, s.__keep); s.hp = s.maxHp; delete s.__keep; } });
  S.rec(`a lost battle sends her to the last town (${townName}) with half her gold`, !!fr && fr.lost && s.map === door(townName).mapId && Math.abs(s.gold - Math.floor(gold0 / 2)) <= 1, { fight: fr, gold: [gold0, s.gold], at: [s.map, s.x, s.y], town: s.town && s.town.id });
  return s;
}

// ---------------------------------------------------------------- Act 2
SEGS.a2 = async () => {
  await S.open(load()); await S.buff();
  await compassIs('Millbrook (the Sage is waiting for the Crystal Cave report)', 'millbrook');
  await town('millbrook', async () => { await S.talk('sage', { want: s => has(s, 'crystalCaveGate') }); });
  await compassIs('Ironkeep (first Act 2 stop)', 'Ironkeep');
  await town('Ironkeep', async () => { const bs = await S.talk('blacksmith');
    S.rec('Ironkeep blacksmith gives directions that fit the new map (Iron Mine west, Storm Nest south)', bs.lines.some(t => /Iron Mine is west of town/.test(t) && /Storm Nest to the south/.test(t)), bs.lines);
    await S.talk('gordo', { want: s => s.active.includes('gordosOre') }); await questLog('Gordo\'s ore listed', /Gordo|Ore/i); await S.heal(); await S.townSave(); });
  await continueHere('Ironkeep save point');
  await compassIs('the Iron Mine', 'Iron Mine');
  await dungeonAuthored('ironMine', 'Iron Mine', 'mech/mine-carts.cjs');
  // three Iron Ore for Gordo: real Iron Mine battles; any shortfall after them is credited the way a drop is (no grinding)
  await S.travel('Iron Mine'); await S.walkInto('Iron Mine'); await S.page.waitForTimeout(3000); await S.inject();
  const ore = () => S.ev(() => (window.__GAME_STATE__.player.state.inventory.find(i => i.itemId === 'ironOre') || { quantity: 0 }).quantity);
  const e = await encounters(6, { until: async () => (await ore()) >= 3 });
  const got = await ore();
  if (got < 3) await S.ev(n => { const gs = window.__GAME_STATE__; gs.player.addItem('ironOre', n); try { gs.questManager.updateProgress(gs.player.state, 'collect', 'ironOre', n); } catch (e) {} }, 3 - got);
  S.rec('Iron Mine random encounters are fought and won (Iron Mine zone)', e.won > 0, { ...e, oreFromBattles: got });
  await town('Ironkeep', async () => { await S.talk('gordo', { want: s => has(s, 'gordosOre') }); await S.talk('soldier', { want: s => s.active.includes('frozenSupplies') }); });
  await dungeonAuthored('stormNest', 'Storm Nest', 'mech/gust-walkways.cjs');
  S.rec('the Storm Harpy left the Windbreaker Stone', (await S.st()).inv.includes('windbreakerStone'), (await S.st()).inv);
  await walkGate();
  await town('Frostwatch', async () => { await S.talk('frostElder'); await S.heal(); });
  await compassIs('the Frozen Lake', 'Frozen Lake');
  await dungeonAuthored('frozenLake', 'Frozen Lake', 'mech/slide-ice.cjs');
  await town('Ironkeep', async () => { await S.talk('soldier', { want: s => has(s, 'frozenSupplies') || s.active.includes('frozenSupplies') }); });
  await S.shot('act2-mid');
};
SEGS.a2s = async () => {                        // back to the Storm Nest (its first try was lost to a probe walker snag)
  await S.open(load()); await S.buff();
  await dungeonAuthored('stormNest', 'Storm Nest', 'mech/gust-walkways.cjs');
  S.rec('the Storm Harpy left the Windbreaker Stone', (await S.st()).inv.includes('windbreakerStone'), (await S.st()).inv);
  await walkGate();
};
SEGS.a2b = async () => {
  await S.open(load()); await S.buff();
  await compassIs('the Haunted Forest', 'Haunted Forest');
  await dungeonAuthored('hauntedForest', 'Haunted Forest', 'mech/forest-rooms.cjs');
  await town('Ravenhollow', async () => { const he = await S.talk('hauntedElder');
    S.rec('Ravenhollow elder points west to the Shadow Cave', he.lines.some(t => /Shadow Cave lies to the west/.test(t)), he.lines); await S.townSave(); });
  await continueHere('Ravenhollow save point');
  await defeat('Ravenhollow');
  await dungeonAuthored('shadowCave', 'Shadow Cave', 'mech/shadow-freeze.cjs');
  const s = await S.st(); await S.shot('act2-done');
  S.rec('Act 2 done: the Dragon is down; Shadow Cave lets her out toward Act 3', s.bosses.includes('dragon') && s.map === 'overworld', [s.map, s.x, s.y]);
};

// ---------------------------------------------------------------- Act 3
SEGS.a3 = async () => {
  await S.open(load()); await S.buff();
  await town('Ruins Camp', async () => { await S.talk('explorer'); await S.heal(); await S.townSave(); });
  await continueHere('Ruins Camp save point');
  await town('Oasis Haven', async () => { await S.talk('luna', { want: s => s.active.includes('lunasMap') }); await questLog("Luna's star map listed", /./); });
  await compassIs('Oasis Depths', 'Oasis Depths');
  await dungeonAuthored('oasisDepths', 'Oasis Depths', 'mech/sluice-wheels.cjs');
  await town('Oasis Haven', async () => { await S.talk('luna', { want: s => has(s, 'lunasMap') }); });
  await compassIs('the Desert Tomb', 'Desert Tomb');
  await dungeonAuthored('desertTomb', 'Desert Tomb', 'mech/glyph-plates.cjs');
  S.rec('the Sand Golem left the Flame Cloak', (await S.st()).inv.includes('flameCloak'), (await S.st()).inv);
  await town('Oasis Haven', async () => { await S.talk('archaeologist', { want: s => s.active.includes('ancientRelic') }); });
  await dungeonAuthored('banditHideout', 'Bandit Hideout', 'mech/tripwires-and-spikes.cjs');
  await dungeonAuthored('scorchedRuins', 'Scorched Ruins', 'mech/cracked-walls.cjs');
  await town('Oasis Haven', async () => { await S.talk('archaeologist', { want: s => has(s, 'ancientRelic') }); await S.townSave(); });
  await defeat('Oasis Haven');
  await S.shot('act3-done');
};
// ---------------------------------------------------------------- Act 4
SEGS.a4 = async () => {
  await S.open(load()); await S.buff();
  await town("Ember's Rest", async () => { await S.talk('forgemaster', { want: s => s.active.includes('flameCloak') }); await S.heal(); await S.townSave(); });
  await continueHere("Ember's Rest save point");
  await dungeonAuthored('magmaTunnels', 'Magma Tunnels', 'mech/crust-bridges.cjs');
  await compassIs('the Ember Mines', 'Ember Mines');
  await dungeonAuthored('emberMines', 'Ember Mines', 'dungeon_authored.cjs', ['emberMines']);
  await town('Cinderwatch', async () => { await S.talk('watchCaptain'); await S.heal(); });
  await town("Ember's Rest", async () => { await S.talk('forgemaster', { want: s => has(s, 'flameCloak') }); });
  await town('Oasis Haven', async () => { await S.talk('luna', { want: s => s.active.includes('lunasProphecy') }); });
  await dungeonAuthored('obsidianCavern', 'Obsidian Cavern', 'dungeon_authored.cjs', ['obsidianCavern']);
  await town('Oasis Haven', async () => { await S.talk('luna', { want: s => has(s, 'lunasProphecy') }); });
  await compassIs('the Volcanic Forge', 'Volcanic Forge');
  await dungeonAuthored('volcanicForge', 'Volcanic Forge', 'mech/lava-channels.cjs');
  const s = await S.st(); await S.shot('act5-arrival');
  S.rec('Act 4 done: the Flame Titan is down; the forge lets her out in Act 5', s.bosses.includes('flameTitan') && s.map === 'overworld' && s.x === door('Volcanic Forge (Act 5 side)').exit[0], [s.map, s.x, s.y]);
};
// ---------------------------------------------------------------- Act 5
async function isle(id, portal, script) {          // a portal on the overworld, the bundle's isle, then the isle's dungeon
  await S.travel(portal); const r = await S.walkInto(portal); await S.page.waitForTimeout(3000); await S.inject(); await S.dismissAll();
  const s = await S.st(); await S.shot(`${id}-isle`);
  if (!S.rec(`walks into ${portal}: the isle opens`, s.map === door(portal).mapId, { walk: r.why, at: [s.map, s.x, s.y] })) return false;
  const m = mechProbe(script, [], { name: id }); fs.writeFileSync(m.inF, JSON.stringify(await S.capture())); await S.close();
  const t0 = Date.now(); const rr = m.run(); const out = (rr.stdout || '') + (rr.stderr || ''); fs.writeFileSync(path.join(OUTD, `mech-${id}.log`), out);
  const fails = out.split('\n').filter(l => l.startsWith('[FAIL]')); const sv = fs.existsSync(m.outF) ? JSON.parse(fs.readFileSync(m.outF, 'utf8')) : null;
  S.rec(`${id}: the dungeon played end to end on the story record (${script})`, rr.status === 0 && !fails.length && !!sv, { secs: Math.round((Date.now() - t0) / 1000), last: out.trim().split('\n').slice(-1)[0], fails: fails.slice(0, 6).map(l => l.slice(0, 220)) });
  if (!sv) throw new Error('no record back from ' + script);
  await S.open(sv); await S.inject(); await L.noEncounters(S.page); return true;
}
// A quest step with a person: talk (twice if the first line was another one), and check the quest moved.
async function questTalk(npc, kind, q, label) {
  let r = await S.talk(npc, { label: `${label} (${kind} ${q})` });
  if (!r[kind].includes(q)) { const r2 = await S.talk(npc, { label: `${label} again (${kind} ${q})` }); r2.lines = r.lines.concat(r2.lines); r2.started = r.started.concat(r2.started); r2.finished = r.finished.concat(r2.finished); r = r2; }
  S.rec(`${label}: ${q} ${kind}`, r[kind].includes(q), { started: r.started, finished: r.finished, shown: r.lines.map(t => t.slice(0, 160)) });
  return r;
}
const qprog = (q, k) => S.ev(([q, k]) => ((window.__GAME_STATE__.player.state.questProgress || {})[q] || {})[k] || 0, [q, k]);
SEGS.a5 = async () => {
  await S.open(load()); await S.buff();
  await town('Last Bastion', async () => { await questTalk('veteran', 'started', 'demonBarracksQuest', 'the Last Bastion veteran gives Thin the Ranks'); await S.talk('priestess'); await S.heal(); await S.townSave(); });
  await continueHere('Last Bastion save point');
  await town("Haven's Edge", async () => { await S.talk('kiki'); await S.talk('prophetess'); await S.heal(); });
  // The game's own Act 5 chain (quests AUDIT rows 18, 19, G12): Thin the Ranks -> Kiki's Resolve -> the four portals.
  await compassIsWithout('kikisChallenge', 'the Demon Barracks (Thin the Ranks active)', 'Demon Barracks');
  await dungeonAuthored('demonBarracks', 'Demon Barracks', 'mech/guard-lanterns.cjs');
  // Ten demons: real random encounters on the Demon's Threshold fields at the barracks door (the zone rolls `demon` 4 in 10).
  const d0 = await qprog('demonBarracksQuest', 'demon'); const t0 = Date.now();
  const e = await encounters(40, { maxMs: 600000, sideways: true, until: async () => (await qprog('demonBarracksQuest', 'demon')) >= 10 });
  const d1 = await qprog('demonBarracksQuest', 'demon'); await S.shot('ten-demons');
  S.rec('Thin the Ranks: 10 demons beaten in real random encounters (not simulated)', d1 >= 10, { before: d0, after: d1, won: e.won, met: e.met, secs: Math.round((Date.now() - t0) / 1000) });
  await compassIsWithout('kikisChallenge', 'Last Bastion (10 demons beaten: report to the veteran)', 'Last Bastion');
  await town('Last Bastion', async () => { await questTalk('veteran', 'finished', 'demonBarracksQuest', 'the veteran takes the report'); await S.dismissAll(); });
  const hb = await S.st(); S.rec('the veteran\'s reward, the Holy Blade, is in her bag', hb.inv.some(i => /^holyBlade/.test(i)), { inv: hb.inv });
  await town("Haven's Edge", async () => { await questTalk('kiki', 'started', 'kikisResolve', 'Haven\'s Edge Kiki gives Kiki\'s Resolve'); });
  await compassIsWithout('kikisChallenge', 'the Void Rift (Kiki\'s Resolve active)', 'Void Rift');
  await dungeonAuthored('voidRift', 'Void Rift', 'mech/drifting-blocks.cjs');
  S.rec('Kiki\'s Resolve: the Void Rift visit counted by the game on the real walk in', (await qprog('kikisResolve', 'voidRift')) >= 1, await S.ev(() => window.__GAME_STATE__.player.state.questProgress.kikisResolve));
  await compassIsWithout('kikisChallenge', 'Haven\'s Edge (Void Rift visited: report to Kiki)', "Haven's Edge");
  await town("Haven's Edge", async () => { await questTalk('kiki', 'finished', 'kikisResolve', 'Kiki takes the report'); await S.dismissAll(); });
  const q = await S.st(); S.rec('The Four Relics starts after Kiki\'s Resolve', q.active.includes('portalRelics') || q.done.includes('portalRelics'), { active: q.active });
  await compassIsWithout('kikisChallenge', 'the first portal (Stormreach Isles) while the Demon Castle is sealed', 'Portal - Stormreach Isles');
  await S.shot('act5-mid');
};
SEGS.a5k = async () => {                        // re-check of a5's two misses on its own record: Last Bastion healer, portal compass
  await S.open(load()); await S.buff();
  await town('Last Bastion', async () => { await S.heal(); });
  await compassIsWithout('kikisChallenge', 'the first portal (Stormreach Isles) while the Demon Castle is sealed', 'Portal - Stormreach Isles');
  S.rec('(info) with kikisChallenge active the compass shows its target', true, { compass: (await S.st()).compass });
  // frame time, standing and walking, on the Act 5 overworld and in a hi-fi town (headless, software GL: an upper bound)
  const fsStand = await S.frameStats(4000);
  const walkP = L.stick(S.page, 1, 0, 4000).catch(() => {}); const fsWalk = await S.frameStats(3500); await walkP;
  let fsTown = null; await town('Last Bastion', async () => { fsTown = await S.frameStats(4000); });
  S.rec('frame time is sane (mean under 50 ms, p95 under 100 ms; headless software rendering)', [fsStand, fsWalk, fsTown].every(f => f && f.mean < 50 && f.p95 < 100), { overworldStanding: fsStand, overworldWalking: fsWalk, town: fsTown });
};
SEGS.a5b = async () => {
  await S.open(load()); await S.buff();
  await compassIsWithout('kikisChallenge', 'the first portal (Stormreach Isles), after Continue', 'Portal - Stormreach Isles');
  await isle('stormreachSpire', 'Portal - Stormreach Isles', 'mech/storm-terrace.cjs');
  await compassIsWithout('kikisChallenge', 'the next portal (Frostfall Peaks)', 'Portal - Frostfall Peaks');
  await isle('frostfallCavern', 'Portal - Frostfall Peaks', 'mech/push-ice.cjs');
  await compassIsWithout('kikisChallenge', 'the next portal (Sunken Temple)', 'Portal - Sunken Temple');
  await isle('sunkenTempleDungeon', 'Portal - Sunken Temple', 'mech/maze-hunter.cjs');
  await compassIsWithout('kikisChallenge', 'the next portal (Twilight Realm)', 'Portal - Twilight Realm');
  await isle('twilightDungeon', 'Portal - Twilight Realm', 'mech/matching-portals.cjs');
  const s = await S.st(); const need = ['excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom'];
  const eq = await S.ev(() => ({ ...window.__GAME_STATE__.player.state.equipment }));
  S.rec('the four portal guardians left the four relics the Demon Castle asks for', need.every(n => s.inv.includes(n) || Object.values(eq).includes(n)), { inv: s.inv, eq });
};
SEGS.a5s = async () => {                        // the Sunken Temple again (its first run was lost to a probe walker snag), then the relics
  await S.open(load()); await S.buff();
  await compassIsWithout('kikisChallenge', 'the Sunken Temple portal (its guardian still stands)', 'Portal - Sunken Temple');
  await isle('sunkenTempleDungeon', 'Portal - Sunken Temple', 'mech/maze-hunter.cjs');
  const s = await S.st(); const need = ['excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom'];
  const eq = await S.ev(() => ({ ...window.__GAME_STATE__.player.state.equipment }));
  S.rec('the four portal guardians left the four relics the Demon Castle asks for', need.every(n => s.inv.includes(n) || Object.values(eq).includes(n)), { inv: s.inv, eq });
};
SEGS.a5c = async () => {                         // the Demon Castle (authored mirror rooms since build 98) and the Demon King
  await S.open(load()); await S.buff();
  await town('Last Bastion', async () => { await S.heal(); });
  await compassIsWithout('kikisChallenge', 'the Demon Castle (all four relics in hand)', 'Demon Castle');
  // The castle is an authored dungeon now: its own end-to-end probe plays it on the story record, fights the
  // Demon King and checks that the ending (VictoryScene) starts. The generated-floor solver loops on its stairs.
  let sv = null; try { sv = await dungeonAuthored('demonCastle', 'Demon Castle', 'mech/mirror-rooms.cjs'); } catch (e) { S.rec('demonCastle: a record comes back from the castle', false, String(e).slice(0, 300)); }
  const f = sv ? sv.player.storyFlags : {};
  S.rec('the Demon King is defeated (boss.demonKing.defeated) on the story record', !!f['boss.demonKing.defeated'], { flag: !!f['boss.demonKing.defeated'] });
};

(async () => {
  let code = 0;
  try { if (!SEGS[SEG]) throw new Error('no segment ' + SEG); await SEGS[SEG](); }
  catch (e) { S.rec('segment crashed', false, String(e && e.stack || e).slice(0, 700)); code = 1; await S.shot('crash').catch(() => {}); }
  try { if (S.page && OUT) { const f = await S.saveFile(OUT); console.log('saved', f, JSON.stringify((await S.st()))); } } catch (e) { console.log('save fail', e.message); }
  try { await S.noErrors(); } catch (e) {}
  await S.close();
  const fail = S.rows.filter(r => r.status === 'FAIL').length; console.log(`pt ${SEG}: ${S.rows.length} checks, ${fail} FAIL`); process.exit(code || (fail ? 1 : 0));
})();
