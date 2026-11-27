'use strict';
// Day 4 census, group 5: every monster and boss of the bundle (75) once on its battle background.
// A seeded save puts the hero on a map where the monster belongs (its zone's dungeon, or an overworld spot of
// its zone, which decides the biome backdrop); the battle is launched the way the bundle's startBattle does
// (WorldMapScene.scene.launch('BattleScene', { monster, zone })) and photographed at the command menu.
//   node scripts/auto/census/battles.cjs [monsterId ...]    (default: all 75; BATTLE_REBOOT=1 boots a save per monster)
const fs = require('fs'), path = require('path');
process.env.HONEST_DIST = process.env.HONEST_DIST || '/home/user/work/h3/dist';
const C = require('./clib.cjs');
const { L } = C;
const T = require('../honest/world.cjs').tables();
const JP = JSON.parse(fs.readFileSync(path.join(C.ROOT, 'public/acts-hifi/jump-points.json'), 'utf8'));
const floor1 = {}; for (const a of JP.acts) for (const p of a.places) for (const q of p.points) if (q.kind === 'floor' && q.floor === 1) floor1[p.map] = q.pos;
floor1.sunkenCellar = floor1.sunkenCellar || { mapId: 'sunkenCellar', x: 19, y: 17, floor: 1 };   // not in jump-points.json; the seed ui.cjs uses for its chest shot
// zone -> where to stand (map id, or an overworld cell that falls in the zone; the backdrop follows the latitude band)
const OW = { 'greenhollow-plains': [39, 345], 'whispering-woods': [100, 290], 'crystal-coast': [133, 348], 'iron-mountains': [209, 300], 'scorched-wastes': [220, 190], 'demons-threshold': [85, 60] };
const MAP = { 'misty-grotto': 'mistyGrotto', 'sunken-cellar': 'sunkenCellar', 'crystal-cave': 'crystalCave', 'coral-tunnels': 'coastalReef', 'shadow-cave': 'shadowCave', 'storm-nest': 'stormNest',
  'frozen-lake': 'frozenLake', 'frostpeak-cavern': 'frostfallCavern', 'desert-tomb': 'desertTomb', 'bandit-hideout': 'banditHideout', 'magma-tunnels': 'magmaTunnels', 'sunken-ruins': 'sunkenTempleDungeon',
  'volcanic-forge': 'volcanicForge', 'demon-castle': 'demonCastle', 'whispering-woods-cave': 'whisperingWoodsCave', 'coastal-reef': 'coastalReef', 'iron-mine': 'ironMine', 'haunted-forest': 'hauntedForest',
  'oasis-depths': 'oasisDepths', 'scorched-ruins': 'scorchedRuins', 'ember-mines': 'emberMines', 'obsidian-cavern': 'obsidianCavern', 'demon-barracks': 'demonBarracks', 'void-rift': 'voidRift',
  'stormreach-isles': 'stormreachSpire', 'frostfall-peaks': 'frostfallCavern', 'sunken-temple': 'sunkenTempleDungeon', 'twilight-realm': 'twilightDungeon' };
// bosses and the two non-zone monsters: where they stand in the game (dungeon boss rooms) or the closest theme
const dman = C.dman;
const BOSSMAP = {}; for (const [id, d] of Object.entries(dman.dungeons)) BOSSMAP[d.bossId] = id;
Object.assign(BOSSMAP, { giantToad: 'whisperingWoodsCave', giantCrab: 'coastalReef', serpent: 'crystalCave', kraken: 'coastalReef', coralTitan: 'sunkenCellar', mosswarden: 'whisperingWoodsCave', lich: 'demonCastle', mimic: 'sunkenCellar', shadowWisp: 'shadowCave' });
const NOTE = { kraken: 'no boss room of its own found; shown on the Coastal Reef backdrop', coralTitan: 'no boss room found; Sunken Cellar backdrop', mosswarden: 'no boss room found; Whispering Woods Cave backdrop', lich: 'no boss room found; Demon Castle backdrop', mimic: 'not in any zone table; Sunken Cellar backdrop', shadowWisp: 'not in any zone table; Shadow Cave backdrop', mosswarden2: '' };

function placeFor(id) {
  const zones = Object.entries(T.zones).filter(([, v]) => v.monsters.some(m => m.monsterId === id)).map(([z]) => z);
  for (const z of zones) { if (OW[z]) return { zone: z, mapId: 'overworld', x: OW[z][0], y: OW[z][1], floor: 1, why: `zone ${z}: overworld cell ${OW[z]}` }; if (MAP[z] && floor1[MAP[z]]) { const p = floor1[MAP[z]]; return { zone: z, mapId: MAP[z], x: p.x, y: p.y, floor: 1, why: `zone ${z}: ${MAP[z]} floor 1` }; } }
  const m = BOSSMAP[id]; if (m && floor1[m]) { const p = floor1[m]; return { zone: (T.maps[m] && T.maps[m].encounterZone) || 'greenhollow-plains', mapId: m, x: p.x, y: p.y, floor: 1, why: `${m} floor 1 (${NOTE[id] || 'its own dungeon'})` }; }
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const want = process.argv.slice(2), ids = want.length ? want : Object.keys(T.monsters);
  const items = ids.map(id => ({ id, p: placeFor(id) })), missing = items.filter(i => !i.p).map(i => i.id);
  if (missing.length) C.log('NO PLACE', missing.join(','));
  const groups = {}; for (const i of items.filter(i => i.p)) (groups[`${i.p.mapId}@${i.p.x},${i.p.y}`] = groups[`${i.p.mapId}@${i.p.x},${i.p.y}`] || []).push(i);
  const { browser, page, errors } = await C.open(); const rep = [];
  for (const [key, list] of Object.entries(groups)) {
    const p0 = list[0].p;
    const boot = async () => { await C.boot(page, { mapId: p0.mapId, floor: p0.floor, x: p0.x, y: p0.y, all: true, mutate: s => { s.player.hp = 9999; } }, { ready: false, settle: 1500 }); await page.waitForTimeout(1500); };
    try { await boot(); } catch (e) { C.log('boot fail', key, String(e).slice(0, 120)); for (const i of list) rep.push({ id: i.id, err: 'boot ' + String(e).slice(0, 80) }); continue; }
    for (const [n, it] of list.entries()) {
      const row = { id: it.id, place: it.p.why, zone: it.p.zone };
      try {
        if (n > 0 && process.env.BATTLE_REBOOT) await boot();
        const mon = T.monsters[it.id];
        const ok = await page.evaluate(async ({ id, zone }) => {
          const g = window.__PHASER_GAME__, wm = g.scene.getScene('WorldMapScene'), em = window.__GAME_STATE__.encounterManager, w = console.warn; console.warn = () => {};
          let m; try { m = em.rollEncounter({ monsters: [{ monsterId: id, weight: 1 }] }); } finally { console.warn = w; }
          if (!m) return 'no monster';
          wm.currentEncounterZone = zone; wm.scene.launch('BattleScene', { monster: m, zone }); wm.scene.pause();
          return 'launched';
        }, { id: it.id, zone: it.p.zone });
        row.launch = ok;
        // advance the intro boxes until the command menu is up
        let ph = null; const t0 = Date.now();
        while (Date.now() - t0 < 25000) {
          ph = await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return { on: window.__PHASER_GAME__.scene.isActive('BattleScene'), phase: b && b.phase, mon: b && b.monster && b.monster.id }; });
          if (ph.on && ph.phase === 'playerMenu') break;
          if (ph.on && ph.phase === 'message') { await page.evaluate(() => { const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); if (b._messageCallback) b.advanceMessage(); }); }
          await sleep(350);
        }
        row.phase = ph && ph.phase; row.mon = ph && ph.mon;
        await sleep(900);
        const bg = await page.evaluate(() => { const r = document.getElementById('qok-ui'); const m = r && /bg-([a-z_]+)\.webp/.exec(r.style.backgroundImage || ''); return m ? m[1] : null; });
        row.bg = bg;
        await C.snap(page, `battle-${it.id}`, { area: 'battle', act: (T.maps[it.p.mapId] || {}).act, place: it.p.mapId, shows: `${it.id} (${mon.aiPattern === 'boss' ? 'boss' : 'monster'}) at the command menu on the ${bg} backdrop; ${it.p.why}`, how: 'seeded save on the place, BattleScene launched as startBattle does' });
        // leave the battle
        await page.evaluate(() => { const g = window.__PHASER_GAME__; g.scene.stop('BattleScene'); g.scene.resume('WorldMapScene'); });
        await sleep(600);
      } catch (e) { row.err = String(e).slice(0, 200); C.log('ERR', it.id, row.err); try { await boot(); } catch (e2) {} }
      rep.push(row); C.log(JSON.stringify(row));
    }
  }
  fs.appendFileSync(path.join(C.OUT, 'battles-report.jsonl'), rep.map(r => JSON.stringify(r)).join('\n') + '\n');
  if (missing.length) fs.appendFileSync(path.join(C.OUT, 'battles-report.jsonl'), JSON.stringify({ noPlace: missing }) + '\n');
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
