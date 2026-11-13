'use strict';
// A real walk in every act, the Act 1 / Act 2 seam and the Act 3 / Act 4 overlap, with frame time
// and texture memory per leg, and an Act 1 leg measured the same way for comparison.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> node scripts/acts/probe/walk.cjs [legId ...]
// Routes are planned in the page on the index's `reach` raster (cells whose standing point the
// world gate calls free) and followed with the analog stick, so a leg that arrives was walked.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const LEGS = [
  { id: 'act2', from: 'Ironkeep', to: 'Iron Mine' },
  { id: 'act2-north', from: 'Ravenhollow', to: 'Shadow Cave' },
  { id: 'act3', from: 'Oasis Haven', to: 'Oasis Depths' },
  { id: 'act3-4-overlap', from: "Ember's Rest", to: 'Magma Tunnels' },
  { id: 'act4-north', from: 'Ember Mines', to: 'Cinderwatch' },
  { id: 'act5', from: 'Last Bastion', to: 'Volcanic Forge (Act 5 side)' },
  { id: 'seam-1-2', from: 'Crystal Cave (Act 2 side)', toward: 'west' },
];
const MAX_CELLS = 70;
const metricsStart = page => page.evaluate(() => { const P = window.__PERF = { dts: [], on: true }; let prev = performance.now();
  (function loop() { if (!P.on) return; const now = performance.now(); P.dts.push(now - prev); prev = now; requestAnimationFrame(loop); })(); });
const metricsStop = page => page.evaluate(() => { const P = window.__PERF; P.on = false; const d = P.dts.slice(5).sort((a, b) => a - b);
  const g = window.__PHASER_GAME__, list = g.textures.list; let n = 0, bytes = 0;
  for (const k in list) { const t = list[k]; if (!t || !t.source) continue; for (const s of t.source) { if (s && s.width > 4) { n++; bytes += s.width * s.height * 4; } } }
  return { frames: d.length, meanMs: d.length ? +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1) : null, p95Ms: d.length ? +d[Math.floor(d.length * 0.95)].toFixed(1) : null,
    textures: n, textureMB: +(bytes / 1048576).toFixed(1), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null }; });
(async () => {
  const only = process.argv.slice(2);
  const { browser, page, errors } = await L.launch();
  const rows = [];
  await L.bootSave(page, L.save({ x: 80, y: 262, flags: L.allFlags() }));
  const doors = await page.evaluate(() => window.__QOK_MULTIACT__.index().landmarks);
  const D = n => doors.find(d => d.name === n);
  for (const leg of LEGS) {
    if (only.length && !only.includes(leg.id)) continue;
    const a = D(leg.from), b = leg.to ? D(leg.to) : null;
    const row = { leg: leg.id, from: leg.from, to: leg.to || leg.toward };
    if (!a || (leg.to && !b)) { row.error = 'door not in index'; rows.push(row); console.log(JSON.stringify(row)); continue; }
    try {
      await L.bootSave(page, L.save({ x: a.exit[0], y: a.exit[1], flags: L.allFlags() }));
      // plan on the reach raster: to the other door's exit, or (seam) to the reachable cell furthest west
      const plan = await page.evaluate(({ s, t, toward }) => { const R = window.__QOK_MULTIACT__.reach, W = 320, H = 400, prev = new Int32Array(W * H).fill(-2), q = [s[1] * W + s[0]]; prev[q[0]] = -1; let h = 0, goal = -1, best = q[0];
        while (h < q.length) { const c = q[h++], x = c % W, y = (c / W) | 0; if (t && x === t[0] && y === t[1]) { goal = c; break; }
          if (toward === 'west' && h < 4000 && x < best % W) best = c;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const n = ny * W + nx; if (prev[n] !== -2 || !R(nx, ny)) continue; prev[n] = c; q.push(n); } }
        if (goal < 0 && toward) goal = best;
        if (goal < 0) return null; const cells = []; for (let c = goal; c !== -1; c = prev[c]) cells.unshift([c % W, (c / W) | 0]); return cells; }, { s: a.exit, t: b && b.exit, toward: leg.toward });
      if (!plan) { row.error = 'no route on the reach raster'; rows.push(row); console.log(JSON.stringify(row)); continue; }
      const cells = plan.slice(0, MAX_CELLS + 1); row.planned = plan.length - 1; row.walkCells = cells.length - 1; row.end = cells[cells.length - 1];
      row.shotStart = path.basename(await L.shot(page, 'walk-' + leg.id + '-start'));
      await metricsStart(page);
      const half = Math.floor(cells.length / 2);
      const r1 = await L.walkCells(page, cells.slice(1, half + 1), { tol: 0.45, maxMs: 60000 });
      row.shotMid = path.basename(await L.shot(page, 'walk-' + leg.id + '-mid'));
      const r2 = r1.ok && r1.why === 'arrived' ? await L.walkCells(page, cells.slice(half + 1), { tol: 0.45, maxMs: 60000 }) : r1;
      row.perf = await metricsStop(page);
      const p = await L.pos(page), m = await L.multi(page);
      row.result = r2.why; row.at = [p.x, p.y]; row.moved = +(r1.moved + (r2 === r1 ? 0 : r2.moved)).toFixed(1);
      row.arrived = r2.ok && r2.why === 'arrived' && Math.abs(p.x - row.end[0]) <= 1 && Math.abs(p.y - row.end[1]) <= 1;
      row.status = m && { resident: m.resident.length, act1: m.act1, objects: m.objects, relocated: m.stats.relocated, blockedSteps: m.stats.blockedSteps || 0, loadErrors: m.stats.loadErrors };
      row.plateDrift = await page.evaluate(() => { const d = window.__QOK_MULTIACT__.plateDrift(); return d && d.cells; });
      row.withinCap = !!m && m.resident.length + (m.act1 || 0) <= 12;
      await page.waitForTimeout(800);
      row.shotEnd = path.basename(await L.shot(page, 'walk-' + leg.id + '-end'));
    } catch (e) { row.error = String(e).slice(0, 300); }
    row.pass = !!(row.arrived && row.withinCap && row.plateDrift === 0);
    rows.push(row); console.log(JSON.stringify(row));
  }
  if (!only.length || only.includes('act1')) {
    // Act 1 reference leg: a timed stick plan around Greenhollow, measured the same way.
    const row = { leg: 'act1', from: 'Greenhollow', to: 'timed stick plan' };
    try {
      await L.bootSave(page, L.save({ x: 69, y: 258, flags: L.allFlags() }));
      await metricsStart(page);
      for (const [x, y, ms] of [[1, 0, 3000], [0, 1, 3000], [0.707, 0.707, 3000], [-1, 0, 3000], [0, -1, 3000]]) await L.stick(page, x, y, ms);
      row.perf = await metricsStop(page);
      const m = await L.multi(page); row.status = m && { resident: m.resident.length, act1: m.act1, objects: m.objects };
      row.shotEnd = path.basename(await L.shot(page, 'walk-act1-end')); row.pass = true;
    } catch (e) { row.error = String(e).slice(0, 300); }
    rows.push(row); console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(L.OUT, 'walk.json'), JSON.stringify({ rows, errors: errors.slice(0, 20) }, null, 1));
  console.log('WALK', rows.filter(r => r.pass).length + '/' + rows.length, 'errors', errors.length, JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
