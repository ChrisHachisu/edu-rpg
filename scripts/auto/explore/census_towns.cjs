'use strict';
// Reachability census of every town (Act 1's three and the nine Acts 2-5 towns, incl. hosted
// Cinderwatch). Real entry: a save on the overworld at the door's exit cell, Continue, a real
// stick walk into the door; the hi-fi town frame opens. Then a flood (2 world px lattice,
// 8-neighbour, each step tested at its end and midpoint) over the town's OWN collision authority
// (__ACT1_TOWN__.isInsideWalkable: the polygons, static obstacles, NPC blockers that
// constrainWalkableMovement uses) from where she stands. Against that set, with town.html's own
// rules (nearestNpc band |dx|<=1.1 cell, dy -0.35..2.1 cells; nearest wins; NPC before service;
// services within 1.2 cells box; exit = crossing the mouth line within 2.4 cells):
//   every NPC has a talk band she can stand in where SHE is the nearest (band size reported);
//   shop counter / save point answer where no NPC band shadows them; the exit line is reachable;
//   NPC points and service cells: inside / outside the walkable set.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5500/ node scripts/auto/explore/census_towns.cjs [townId ...]
// Writes /home/user/work/explore/census-towns.jsonl + shots/census/town-<id>.jpg
const fs = require('fs'), path = require('path');
const X = require('./xlib.cjs'), L = X.L;
const acts = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const A1 = (() => { const src = fs.readFileSync(path.join(X.ROOT, 'public/act1-world-map.js'), 'utf8'), m = /var LANDMARKS = (\[.*?\]);/.exec(src);
  return JSON.parse(m[1]).map(l => ({ mapId: l.mapId, at: [l.at.x, l.at.y], exit: [l.exit.x, l.exit.y], tile: l.tile, act1: true })); })();
const DOORS = [...A1.filter(d => d.tile === 6), ...acts.landmarks.filter(d => d.tile === 6)];

const TFLOOD = async ({ step = 2 } = {}) => {
  const fr = document.querySelector('#act1-hifi-preserved-root iframe'), T = fr.contentWindow.__ACT1_TOWN__, town = T.town, C = town.worldPxPerCell;
  const ins = p => T.isInsideWalkable(p);
  const p0 = T.position(), WORLD = town.cells * C, GW = Math.ceil(WORLD / step) + 2;
  const ox = p0.x - Math.floor(p0.x / step) * step, oy = p0.y - Math.floor(p0.y / step) * step;
  const seen = new Uint8Array(GW * GW), q = new Int32Array(GW * GW); let qh = 0, qt = 0;
  const g0 = Math.floor(p0.y / step) * GW + Math.floor(p0.x / step); const startIn = ins(p0);
  if (startIn) { seen[g0] = 1; q[qt++] = g0; }
  const pts = [];
  while (qh < qt) { const c = q[qh++], gx = c % GW, gy = (c / GW) | 0, x = gx * step + ox, y = gy * step + oy; pts.push([x, y]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GW) continue; const n = ny * GW + nx; if (seen[n]) continue;
      const X1 = nx * step + ox, Y1 = ny * step + oy; if (ins({ x: X1, y: Y1 }) && ins({ x: (x + X1) / 2, y: (y + Y1) / 2 })) { seen[n] = 1; q[qt++] = n; } } }
  const npcs = T.npcs.map(n => ({ id: n.id, name: n.name || n.nameKey, x: n.point.x, y: n.point.y }));
  const nearestAt = (x, y) => { let best = null; for (const n of npcs) { const dx = x - n.x, dy = y - n.y; if (Math.abs(dx) > C * 1.1 || dy < -C * 0.35 || dy > C * 2.1) continue; const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { n, d }; } return best && best.n.id; };
  const band = {}, bandBox = {}; for (const n of npcs) { band[n.id] = 0; bandBox[n.id] = null; }
  const svc = [['shop', town.shopCounter], ['save', town.savePoint]].filter(s => Array.isArray(s[1]));
  const svcHit = {}, svcShadow = {}; for (const [k] of svc) { svcHit[k] = 0; svcShadow[k] = 0; }
  const exitCell = (town.exit && town.exit.cell) || town.startCell, axis = (town.exit && town.exit.axis) || (exitCell[1] < town.cells / 2 ? 'north' : 'south'), sign = axis === 'north' ? -1 : 1;
  let exitPts = 0, minOut = 1e9;
  for (const [x, y] of pts) {
    const id = nearestAt(x, y); if (id) { band[id]++; const b = bandBox[id] || (bandBox[id] = [x, y, x, y]); b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
    for (const [k, cell] of svc) { const dx = x / C - cell[0], dy = y / C - cell[1]; if (Math.abs(dx) <= 1.2 && Math.abs(dy) <= 1.2) { if (id) svcShadow[k]++; else svcHit[k]++; } }
    const out = (y / C - exitCell[1]) * sign, lat = Math.abs(x / C - exitCell[0]); if (lat < 2.4) { minOut = Math.min(minOut, -out); if (out >= 0) exitPts++; }
  }
  const inside = (x, y) => ins({ x, y });
  return { id: town.id, C, cells: town.cells, start: [p0.x / C, p0.y / C], startIn, nodes: pts.length, step,
    npcs: npcs.map(n => ({ ...n, cell: [+(n.x / C).toFixed(2), +(n.y / C).toFixed(2)], band: band[n.id], bandPx: band[n.id] * step * step,
      box: bandBox[n.id] && bandBox[n.id].map(v => +(v / C).toFixed(2)) })),
    services: svc.map(([k, cell]) => ({ kind: k, cell, hit: svcHit[k], shadowedByNpc: svcShadow[k], cellInside: inside((cell[0] + 0.5) * C, (cell[1] + 0.5) * C) })),
    exit: { cell: exitCell, axis, reachablePts: exitPts, gapCells: exitPts ? 0 : +minOut.toFixed(2) },
    shopId: town.shopId || null };
};

(async () => {
  const only = process.argv.slice(2);
  const S = await X.launchX(), page = S.page;
  for (const d of DOORS) {
    const id = d.virtual || d.mapId; if (only.length && !only.includes(id)) continue;
    const row = { town: id, door: d.at, exit: d.exit };
    try {
      S.errors.length = 0;
      await X.boot(page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags() }));
      const walk = await L.walkCells(page, [d.at], { maxMs: 25000 }); row.walk = walk.why;
      await page.waitForFunction(() => { const fr = document.querySelector('#act1-hifi-preserved-root iframe'); return !!(fr && fr.contentWindow && fr.contentWindow.__ACT1_TOWN__); }, { timeout: 30000 });
      await page.waitForTimeout(3000);
      const r = await page.evaluate(TFLOOD, { step: 2 });
      Object.assign(row, r);
      row.problems = [];
      for (const n of r.npcs) { if (!n.band) row.problems.push(`npc ${n.id} at ${n.cell}: no reachable talk spot`); else if (n.bandPx < 40) row.problems.push(`npc ${n.id} at ${n.cell}: talk band only ${n.bandPx} px^2 (${n.band} points)`); }
      for (const s of r.services) if (!s.hit) row.problems.push(`${s.kind} at ${s.cell}: no reachable spot that answers (shadowed by an NPC band at ${s.shadowedByNpc} points)`);
      if (!r.exit.reachablePts) row.problems.push(`exit line not reachable (gap ${r.exit.gapCells} cells)`);
      if (!r.startIn) row.problems.push('spawn point outside walkable');
      row.errors = S.errors.slice(0, 6);
      row.shot = path.basename(await X.jpeg(page, path.join(X.OUTX, 'shots/census'), 'town-' + id));
      console.log(id, 'nodes', r.nodes, 'npcs', r.npcs.length, 'problems', JSON.stringify(row.problems));
    } catch (e) { row.error = String(e && e.stack || e).slice(0, 400); console.log(id, 'ERROR', row.error); }
    X.append('census-towns.jsonl', row);
  }
  await S.browser.close();
})();
