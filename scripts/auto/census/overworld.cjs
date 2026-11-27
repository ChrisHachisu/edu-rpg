'use strict';
// Census: overworld views beyond the gates/mouths (those come from towns.cjs / dungeons.cjs).
//   * per act: the reachable cell furthest toward each of 8 compass directions inside the act's
//     bounds (these land on coasts, mountain bases and map edges);
//   * the act borders: a reachable cell on each seam between acts;
//   * the wind gate (closed: walking into it; cleared).
// Cells come from the manifest's `reach` grid (cells a player can stand on).
//   node scripts/auto/census/overworld.cjs [act ...|gate|borders]
const fs = require('fs'), path = require('path');
const C = require('./clib.cjs');
const { L } = C;
const R = C.acts.reach; const W = R.width, H = R.height;
const grid = R.rows.map(r => { const a = []; for (const p of r.split(',')) { const [v, n] = p.split(':'); for (let i = 0; i < +n; i++) a.push(+v); } return a; });
const ok = (x, y) => grid[y] && grid[y][x] === 1 && grid[y][x - 1] === 1 && grid[y][x + 1] === 1 && grid[y - 1] && grid[y - 1][x] === 1 && grid[y + 1] && grid[y + 1][x] === 1;
const BOUNDS = { 1: [0, 218, 160, 399] }; for (const a of C.acts.acts) BOUNDS[a.act] = a.bounds;
const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
function extremes(act) {
  const [x0, y0, x1, y1] = BOUNDS[act]; const out = [];
  for (const [k, [dx, dy]] of Object.entries(DIRS)) {
    let best = null, bv = -1e9;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (ok(x, y)) { const v = dx * x + dy * y; if (v > bv) { bv = v; best = [x, y]; } }
    if (best && !out.some(o => Math.hypot(o.c[0] - best[0], o.c[1] - best[1]) < 10)) out.push({ k, c: best });
  }
  return out;
}
function borders() {
  const pick = (cells, tag) => { if (!cells.length) return null; return { k: tag, c: cells[Math.floor(cells.length / 2)] }; };
  const res = [];
  const row = (y, xa, xb) => { const c = []; for (let x = xa; x <= xb; x++) if (ok(x, y)) c.push([x, y]); return c; };
  const col = (x, ya, yb) => { const c = []; for (let y = ya; y <= yb; y++) if (ok(x, y)) c.push([x, y]); return c; };
  res.push(pick(row(222, 161, 312), 'border-act2-act3'));
  res.push(pick(row(88, 163, 314), 'border-act3-act4'));
  res.push(pick(col(162, 7, 217), 'border-act5-east'));
  res.push(pick(col(160, 222, 399), 'border-act1-act2'));
  res.push(pick(row(218, 9, 160), 'border-act1-act5'));
  return res.filter(Boolean);
}
async function view(name, x, y, meta, extra = {}) {
  await C.boot(page, { mapId: 'overworld', x, y, ...extra });
  await page.waitForTimeout(800);
  await C.snap(page, name, { area: 'overworld', ...meta, how: `save seeded on overworld cell (${x},${y})` + (meta.how ? '; ' + meta.how : '') });
}
let page;
(async () => {
  const args = process.argv.slice(2); const want = args.length ? args : ['1', '2', '3', '4', '5', 'borders', 'gate'];
  const o = await C.open(); page = o.page;
  for (const w of want) {
    try {
      if (/^\d$/.test(w)) for (const e of extremes(+w)) await view(`ow-act${w}-${e.k}`, e.c[0], e.c[1], { act: +w, shows: `act ${w}: the reachable cell furthest ${e.k.toUpperCase()} (${e.c}) - edge of the land: coast / mountain / map edge` });
      else if (w === 'act1') {
        // Act 1 walks on its own grid (act1-overworld-walk.bin): start at a door's exit cell and walk a few seconds outward
        const trips = [['portSapphire', 1, 0, 'coast east of Port Sapphire'], ['portSapphire', -1, 0, 'coast west of Port Sapphire'], ['coastalReef', 0, -1, 'north of the Coastal Reef mouth'],
          ['millbrook', 0, 1, 'south of Millbrook'], ['greenhollow', -1, 0, 'west of Greenhollow'], ['mistyGrotto', 1, 0, 'east of Misty Grotto'], ['crystalCave', 1, 0, 'toward the Act 1/2 border east of Crystal Cave']];
        for (const [id, dx, dy, what] of trips) { const l = C.LANDMARKS.find(q => q.mapId === id); await C.boot(page, { mapId: 'overworld', x: l.exit[0], y: l.exit[1] });
          await L.stick(page, dx, dy, 3500); await page.waitForTimeout(700); const p = await L.pos(page);
          await C.snap(page, `ow-act1-${id}-${dx > 0 ? 'e' : dx < 0 ? 'w' : dy < 0 ? 'n' : 's'}`, { area: 'overworld', act: 1, shows: `act 1 overworld: ${what} (cell ${p.x},${p.y})`, how: `save on ${id}'s exit cell, stick ${dx},${dy} for 3.5 s` }); }
      }
      else if (w === 'borders') for (const b of borders()) await view(`ow-${b.k}`, b.c[0], b.c[1], { shows: `overworld on the ${b.k.replace('border-', '')} seam at (${b.c})` });
      else if (w === 'gate') {
        await C.boot(page, { mapId: 'overworld', x: 221, y: 331, all: false, flags: L.allFlags() });
        await C.snap(page, 'ow-windgate-approach', { area: 'overworld', act: 2, shows: 'wind canyon gate seen from the west, not yet cleared', how: 'save at (221,331)' });
        await L.walkCells(page, [[228, 331]], { maxMs: 6000 }); await L.stick(page, 1, 0, 1200); await page.waitForTimeout(400);
        await C.snap(page, 'ow-windgate-blocked', { area: 'overworld', act: 2, shows: 'walking into the wind gate without the stone (refusal)', how: 'walk east into the gate' });
        await C.dismiss(page);
        await C.boot(page, { mapId: 'overworld', x: 221, y: 331, all: false, flags: { ...L.allFlags(), 'canyon.windCleared': true }, inventory: [{ itemId: 'windbreakerStone', quantity: 1 }] });
        await L.walkCells(page, [[226, 331]], { maxMs: 8000 }); await page.waitForTimeout(400);
        await C.snap(page, 'ow-windgate-cleared', { area: 'overworld', act: 2, shows: 'inside the cleared wind canyon', how: 'cleared flag, walked east' });
      }
    } catch (e) { C.log('ERR', w, String(e).slice(0, 200)); }
  }
  await o.browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
