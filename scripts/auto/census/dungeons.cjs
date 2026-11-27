'use strict';
// Census: every dungeon floor. For each dungeon id given (default: all):
//   * floor 1 by the real entry path: a save seeded on the overworld exit cell of its mouth, Continue,
//     a real walk into the mouth (the overworld view at the mouth is captured first);
//     portal-isle dungeons: a save on the isle next to the mouth, walk in the same way;
//   * floors 2..n: a save seeded at that floor's own landing cell (where the stairs put her), Continue;
//   * every floor: one mid-floor view (a save on the walkable cell nearest the floor's middle);
//   * the boss floor: a save three cells below the boss with that boss not yet defeated.
//   node scripts/auto/census/dungeons.cjs [dungeonId ...]
const fs = require('fs'), path = require('path');
const C = require('./clib.cjs');
const { L } = C;
const A1F = JSON.parse(fs.readFileSync(path.join(C.ROOT, 'public/act1-dungeon-floors.json'), 'utf8')).floors;
const A1IDS = ['sunkenCellar', 'whisperingWoodsCave', 'coastalReef', 'mistyGrotto', 'crystalCave'];
const ISLE = { frostfallCavern: 'frostfallPeaks', stormreachSpire: 'stormreachIsles', sunkenTempleDungeon: 'sunkenTempleIsle', twilightDungeon: 'twilightRealm' };
const BUNDLE_BOSSES = ['ashenGuardian', 'banditLord', 'celestialGuardian', 'coralTitan', 'crystalHydra', 'dragon', 'flameTitan', 'frostMonarch', 'giantCrab', 'giantToad', 'iceWyrm',
  'lavaWyrm', 'magmaBeetleKing', 'mosswarden', 'nullDevourer', 'oreColossus', 'phantomStag', 'sandGolem', 'sandSerpentQueen', 'serpent', 'stormHarpy', 'stormSentinel', 'swordWraith', 'warGeneralMalachar', 'demonKing'];
const ALLB = Object.fromEntries(BUNDLE_BOSSES.map(b => [`boss.${b}.defeated`, true]));
const INV = [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 }];
const QUESTS = ['owlsLesson', 'drakeCargo', 'lunasMap', 'ancientRelic', 'flameCloak', 'lunasProphecy'];

function floorsOf(id) {
  if (A1IDS.includes(id)) return Object.keys(A1F).filter(k => A1F[k].dungeonId === id).sort((a, b) => A1F[a].floor - A1F[b].floor).map(k => ({ key: k, n: A1F[k].floor, f: A1F[k], act1: true }));
  const d = C.dman.dungeons[id]; return d.authoredFloors.map(n => ({ key: `${id}-f${n}`, n, f: C.dman.floors[`${id}-f${n}`], act1: false }));
}
const walk = (f, x, y) => { const r = f.rows[y]; return !!r && x >= 0 && x < r.length && r[x] === '.'; };
function nearestWalk(f, x, y, avoid = []) {
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const a = x + dx, b = y + dy;
    if (walk(f, a, b) && walk(f, a + 1, b) && walk(f, a - 1, b) && walk(f, a, b + 1) && walk(f, a, b - 1) && !avoid.some(([p, q]) => Math.hypot(p - a, q - b) < 2)) return [a, b];
  }
  return null;
}
function landing(fl) {
  const f = fl.f;
  if (f.land) { const l = f.land.fromPrev || f.land.mouth; if (l) return [l.x, l.y]; }
  const up = (f.assets || []).find(a => a.kind === 'stairsUp') || (f.assets || []).find(a => a.kind === 'mouth');
  if (!up) return null;
  // two cells off the stairs (one cell away can still trip the stair trigger and send her back up)
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (walk(f, up.x + dx, up.y + dy) && walk(f, up.x + 2 * dx, up.y + 2 * dy)) return [up.x + 2 * dx, up.y + 2 * dy];
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1]]) if (walk(f, up.x + dx, up.y + dy)) return [up.x + dx, up.y + dy];
  return nearestWalk(f, up.x, up.y + 1);
}
function midCell(f, from) {
  let sx = 0, sy = 0, n = 0; f.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '.') { sx += x; sy += y; n++; } });
  if (!n) return null; const cx = Math.round(sx / n), cy = Math.round(sy / n);
  let c = nearestWalk(f, cx, cy);
  if (c && from && Math.hypot(c[0] - from[0], c[1] - from[1]) < 8) { const ox = cx + (cx - from[0] >= 0 ? 6 : -6); c = nearestWalk(f, ox, cy) || c; }
  return c;
}
async function settle(page, ms = 25000) {
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); if (!w || !g.scene.isActive('WorldMapScene')) return false;
    if (w.__a1dEntryWaiting) return false; const d = window.__QOK_DNG2__; if (d && w.currentMapId && d.state && d.state().loaded && d.state().merged) { const s = d.state(); return s.art === 'ready' && s.mask === 'ready'; } return true; }, { timeout: ms }).catch(() => {});
  await page.waitForTimeout(1800);
}
async function seed(page, id, floor, xy, extraFlags = {}, dropBoss = null) {
  const flags = { ...L.allFlags(), ...ALLB, ...extraFlags }; if (dropBoss) delete flags[`boss.${dropBoss}.defeated`];
  await C.boot(page, { mapId: id, floor, x: xy[0], y: xy[1], flags, all: false, inventory: INV, completedQuests: QUESTS,
    mutate: dropBoss === '*' ? s => { s.player.storyFlags = { 'intro.done': true, 'acts.geo2': true }; } : null }, { ready: false, settle: 1200 });
  await settle(page);
  return L.pos(page);
}
(async () => {
  const want = process.argv.slice(2);
  const ids = want.length ? want : A1IDS.concat(Object.keys(C.dman.dungeons));
  const { browser, page, errors } = await C.open();
  const report = [];
  for (const id of ids) {
    const fls = floorsOf(id), act1 = A1IDS.includes(id);
    const lm = C.LANDMARKS.find(l => l.mapId === id && !l.toFloor && !l.virtual);
    const actN = act1 ? 1 : (C.dman.dungeons[id] || {}).act;
    for (const fl of fls) {
      const tag = `dungeon-${id}-f${fl.n}`; const row = { id, floor: fl.n };
      try {
        if (fl.n === 1 && lm) {
          await C.boot(page, { mapId: 'overworld', x: lm.exit[0], y: lm.exit[1], flags: ALLB, inventory: INV, completedQuests: QUESTS });
          await C.snap(page, `ow-mouth-${id}`, { area: 'overworld', act: actN, shows: `overworld at the mouth of ${id}, hero on its exit cell`, how: `save seeded on exit cell ${lm.exit}` });
          const r = await L.walkCells(page, [lm.at], { maxMs: 25000 });
          await page.waitForTimeout(1500); await settle(page);
          const p = await L.pos(page); row.walk = r.why; row.entered = p.map === id;
          await C.snap(page, `${tag}-entry`, { area: 'dungeon', act: actN, dungeon: id, floor: 1, shows: `${id} floor 1 arrival`, how: `real walk into the overworld mouth at ${lm.at}` });
          if (p.map !== id) { row.note = 'walk-in failed, seeding at landing'; }
          else { row.ok = true; }
        }
        if (fl.n !== 1 || !lm || !row.ok) {
          const land = landing(fl); if (!land) { row.err = 'no landing'; report.push(row); continue; }
          if (fl.n === 1 && ISLE[id]) {
            // portal-isle dungeon: the isle view first
            await C.boot(page, { mapId: ISLE[id], x: 25, y: 10, flags: ALLB, inventory: INV, completedQuests: QUESTS }); await settle(page);
            await C.snap(page, `ow-isle-${ISLE[id]}`, { area: 'overworld', act: 5, shows: `portal isle ${ISLE[id]} where ${id} lets her out`, how: 'save seeded on the isle at (25,10)' });
          }
          const p = await seed(page, id, fl.n, land);
          row.entered = p.map === id && p.floor === fl.n; row.land = land;
          await C.snap(page, `${tag}-entry`, { area: 'dungeon', act: actN, dungeon: id, floor: fl.n, shows: `${id} floor ${fl.n} arrival (landing cell ${land})`, how: `save seeded at the floor's landing cell, Continue` });
        }
        const land = landing(fl) || [0, 0];
        const mid = midCell(fl.f, land);
        if (mid) { await seed(page, id, fl.n, mid);
          await C.snap(page, `${tag}-mid`, { area: 'dungeon', act: actN, dungeon: id, floor: fl.n, shows: `${id} floor ${fl.n} mid-floor view at ${mid}`, how: 'save seeded on the walkable cell nearest the floor middle' }); }
        const boss = (fl.f.assets || []).find(a => a.kind === 'boss');
        if (boss) { const bc = nearestWalk(fl.f, boss.x, boss.y + 3) || nearestWalk(fl.f, boss.x, boss.y + 2);
          if (bc) { await seed(page, id, fl.n, bc, {}, act1 ? '*' : (boss.id || C.dman.dungeons[id].bossId));
            await C.snap(page, `${tag}-boss-room`, { area: 'dungeon', act: actN, dungeon: id, floor: fl.n, shows: `${id} boss room, boss ${boss.id || '(act 1)'} not yet defeated`, how: `save seeded at ${bc} below the boss` }); } }
      } catch (e) { row.err = String(e).slice(0, 300); C.log('ERR', id, fl.n, row.err); }
      report.push(row); C.log(JSON.stringify(row));
    }
  }
  fs.appendFileSync(path.join(C.OUT, 'dungeons-report.jsonl'), report.map(r => JSON.stringify(r)).join('\n') + '\n');
  C.log('errors', JSON.stringify(errors.filter(e => !/favicon|audio|mp3|ogg/.test(e.m)).slice(0, 8)));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
