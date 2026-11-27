'use strict';
// Day 4 census, group 4 (dungeons), mechanics in action. For each dungeon the floors' own mechanic data
// (acts-dungeons/manifest.json: mech[], zones[], mechanic.secrets / rocks) gives the places where a mechanic acts
// (tripwire, spike patch, guard, gust window, strike group (lit warning), mirror frame, crack, crust bridge, ...).
// A save is seeded beside one element of each kind (first floor that has it, plus one on another floor), Continue,
// and the moving scene is photographed three times over about 4 seconds (t1 ~0.7 s, t2 ~2.1 s, t3 ~4 s after the floor settles).
//   node scripts/auto/census/dungeons_mech.cjs [dungeonId ...]
const fs = require('fs'), path = require('path');
const C = require('./clib.cjs');
const { L } = C;
const BUNDLE_BOSSES = ['ashenGuardian', 'banditLord', 'celestialGuardian', 'coralTitan', 'crystalHydra', 'dragon', 'flameTitan', 'frostMonarch', 'giantCrab', 'giantToad', 'iceWyrm',
  'lavaWyrm', 'magmaBeetleKing', 'mosswarden', 'nullDevourer', 'oreColossus', 'phantomStag', 'sandGolem', 'sandSerpentQueen', 'serpent', 'stormHarpy', 'stormSentinel', 'swordWraith', 'warGeneralMalachar', 'demonKing'];
const ALLB = Object.fromEntries(BUNDLE_BOSSES.map(b => [`boss.${b}.defeated`, true]));
const INV = [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 }];
const QUESTS = ['owlsLesson', 'drakeCargo', 'lunasMap', 'ancientRelic', 'flameCloak', 'lunasProphecy'];
const MAXPER = +(process.env.MECH_MAX || 6);
const walk = (f, x, y) => { const r = f.rows[y]; return !!r && x >= 0 && x < r.length && r[x] === '.'; };
function nearestWalk(f, x, y) {
  for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const a = x + dx, b = y + dy;
    if (walk(f, a, b) && walk(f, a + 1, b) && walk(f, a - 1, b) && walk(f, a, b + 1) && walk(f, a, b - 1)) return [a, b];
  }
  return null;
}
const mid = cells => cells[Math.floor(cells.length / 2)];
function pois(f) {
  const out = [];
  for (const m of f.mech || []) if (m.x !== undefined) out.push({ kind: m.kind + (m.kind === 'hint' ? '' : ''), at: [m.x, m.y], note: m.type || m.mode || '' });
  for (const z of f.zones || []) { if (z.kind === 'room') continue; const c = z.cells && z.cells.length ? mid(z.cells) : z.rect ? [(z.rect[0] + z.rect[2]) >> 1, (z.rect[1] + z.rect[3]) >> 1] : null; if (c) out.push({ kind: z.kind, at: c, note: z.group !== undefined ? 'group ' + z.group : '' }); }
  const mc = f.mechanic || {};
  for (const s of mc.secrets || []) if (s.front) out.push({ kind: 'crack', at: s.front, note: s.hint || '' });
  for (const r of mc.rocks || []) if (Array.isArray(r)) out.push({ kind: 'rock', at: r, note: '' });
  return out;
}
async function settle(page, ms = 25000) {
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); if (!w || !g.scene.isActive('WorldMapScene')) return false;
    if (w.__a1dEntryWaiting) return false; const d = window.__QOK_DNG2__; if (d && w.currentMapId && d.state && d.state().loaded && d.state().merged) { const s = d.state(); return s.art === 'ready' && s.mask === 'ready'; } return true; }, { timeout: ms }).catch(() => {});
  await page.waitForTimeout(1200);
}
(async () => {
  const want = process.argv.slice(2), ids = want.length ? want : Object.keys(C.dman.dungeons);
  const { browser, page } = await C.open(); const rep = [];
  for (const id of ids) {
    const d = C.dman.dungeons[id]; if (!d) continue;
    const byKind = {};
    for (const n of d.authoredFloors) { const f = C.dman.floors[`${id}-f${n}`]; for (const p of pois(f)) (byKind[p.kind] = byKind[p.kind] || []).push({ ...p, floor: n }); }
    const picks = [];
    for (const [k, list] of Object.entries(byKind)) {
      const floors = [...new Set(list.map(p => p.floor))];
      const a = list.find(p => p.floor === floors[0]); picks.push(a);
      if (floors.length > 1) { const lastF = floors[floors.length - 1], b = list.find(p => p.floor === lastF && p !== a); if (b) picks.push(b); }
    }
    picks.sort((a, b) => a.floor - b.floor);
    const chosen = picks.slice(0, MAXPER);
    C.log(id, d.mechanic, 'kinds', Object.keys(byKind).join(','), 'chosen', chosen.length);
    let i = 0;
    for (const p of chosen) {
      i++; const f = C.dman.floors[`${id}-f${p.floor}`], row = { id, floor: p.floor, kind: p.kind, at: p.at };
      try {
        const st = nearestWalk(f, p.at[0], p.at[1]); if (!st) { row.err = 'no walkable cell'; rep.push(row); continue; }
        // stand two cells off the element when the cell itself is the element
        const flags = { ...L.allFlags(), ...ALLB };
        await C.boot(page, { mapId: id, floor: p.floor, x: st[0], y: st[1], flags, all: false, inventory: INV, completedQuests: QUESTS }, { ready: false, settle: 1200 });
        await settle(page);
        const pos = await L.pos(page); row.pos = [pos.x, pos.y]; row.map = pos.map;
        for (const [k, w] of [[1, 700], [2, 1400], [3, 1900]]) {
          await page.waitForTimeout(w);
          const bat = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')).catch(() => false);
          await C.snap(page, `mech-${id}-f${p.floor}-${p.kind}-${i}-t${k}`, { area: 'dungeon', act: d.act, dungeon: id, floor: p.floor, mechanic: d.mechanic, element: p.kind,
            shows: `${id} floor ${p.floor}: mechanic "${d.mechanic}", element ${p.kind}${p.note ? ' (' + p.note + ')' : ''} at ${p.at}, hero at ${pos.x},${pos.y}; frame ${k}/3 of a burst${bat ? ' (a battle started: guard or monster contact)' : ''}`,
            how: 'save seeded beside the element, Continue, three frames over 4 s' });
          if (bat) break;
        }
        row.ok = true;
      } catch (e) { row.err = String(e).slice(0, 200); C.log('ERR', id, p.floor, p.kind, row.err); }
      rep.push(row);
    }
  }
  fs.appendFileSync(path.join(C.OUT, 'mech-report.jsonl'), rep.map(r => JSON.stringify(r)).join('\n') + '\n');
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
