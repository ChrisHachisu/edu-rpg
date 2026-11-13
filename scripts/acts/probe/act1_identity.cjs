'use strict';
// Act 1 must not change: the same screens and the same movement on the unmodified build and on
// this one, with the Acts 2-5 runtime ON.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> BASE_URL=http://127.0.0.1:5181/ PROBE_URL=http://127.0.0.1:5182/ \
//     node scripts/acts/probe/act1_identity.cjs
// SCREENS  Four spots whose whole view is inside Act 1's rectangle, eight shots each on base, base
//          again and new. Water and glints animate, so a pixel counts only where it holds still
//          through all eight shots of BOTH builds compared; there it must be the same colour.
//          The base/base count of the same measure is printed beside it (the noise floor).
// FIELD    dq-tiles' own spawn check (`__DQ_TILES__.checkOverworldSpawn`, in both builds) asked on
//          a 6 px grid, 10 cells each way from the spot: free / blocked must agree at every point.
//          This is the exact claim: the hero is stopped by the same pixels.
// PUSHES   From each spot the stick is held in eight directions. Where she ends depends a little
//          on frame timing (base against base is printed), so this only has to agree on the map
//          she ends in and to within the larger of 0.5 cell and twice the base/base spread.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5181/';
const SPOTS = [['greenhollow', 69, 257], ['portSapphire', 133, 347], ['millbrook', 39, 346], ['mid', 100, 300]];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
async function run(url, tag, { move }) {
  const { browser, page, errors } = await L.launch();
  const out = { shots: {}, field: {}, rest: {}, errors: 0, multi: null };
  for (const [name, x, y] of SPOTS) {
    await L.bootSave(page, L.save({ x, y, flags: L.allFlags() }), { url, settle: 4000 });
    out.multi = await L.multi(page);
    out.shots[name] = [];
    for (let k = 0; k < 8; k++) { out.shots[name].push(await page.screenshot({ clip: { x: 0, y: 300, width: 390, height: 280 } })); await page.waitForTimeout(330); }   // the field, clear of HUD and stick
    out.field[name] = await page.evaluate(async ([x, y]) => {
      const dq = window.__DQ_TILES__, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), sp = dq.overworldSpace;
      const cx = (x + 0.5) * 48, cy = (y + 0.5) * 48, at = (px, py) => dq.checkOverworldSpawn(w, sp.toPhysical(px), sp.toPhysical(py));
      for (let i = 0; i < 100 && at(cx, cy).status === 'pending'; i++) await new Promise(r => setTimeout(r, 100));
      let bits = '';
      for (let dy = -480; dy <= 480; dy += 6) for (let dx = -480; dx <= 480; dx += 6) { const r = at(cx + dx, cy + dy); bits += r.status === 'ready' ? (r.free ? '1' : '0') : r.status.charAt(0); }
      return bits; }, [x, y]);
    if (move) {
      const rest = [];
      for (const [dx, dy] of DIRS) {
        await L.bootSave(page, L.save({ x, y, flags: L.allFlags() }), { url, settle: 1500 });
        await L.stick(page, dx, dy, 4500); await page.waitForTimeout(400);
        const p = await L.pos(page); rest.push(p.cx === null ? [p.x, p.y, p.map] : [+p.cx.toFixed(2), +p.cy.toFixed(2), p.map]);   // (a door she was pushed into: the map and cell she entered on)
      }
      out.rest[name] = rest;
    }
  }
  out.errors = errors.length;
  await browser.close();
  return out;
}
// pixels that hold still through every shot of both sets and differ between the sets
function stillDiff(A, B) {
  const a = A.map(L.decodePng), b = B.map(L.decodePng), bpp = a[0].bpp, n = a[0].data.length; let still = 0, differ = 0;
  for (let i = 0; i < n; i += bpp) {
    let ok = true;
    for (const set of [a, b]) for (let k = 1; k < set.length && ok; k++) { const d = set[k].data, e = set[0].data; if (d[i] !== e[i] || d[i + 1] !== e[i + 1] || d[i + 2] !== e[i + 2]) ok = false; }
    if (!ok) continue;
    still++;
    const d = a[0].data, e = b[0].data; if (d[i] !== e[i] || d[i + 1] !== e[i + 1] || d[i + 2] !== e[i + 2]) differ++;
  }
  return { still, differ, total: n / bpp };
}
const spread = (P, Q) => Math.max(...P.map((p, i) => Math.max(Math.abs(p[0] - Q[i][0]), Math.abs(p[1] - Q[i][1]))));
(async () => {
  const move = process.env.MOVE !== '0';
  const b1 = await run(BASE, 'base1', { move });
  const b2 = await run(BASE, 'base2', { move });
  const nw = await run(L.URL_, 'new', { move });
  const rows = [];
  for (const [name] of SPOTS) {
    fs.writeFileSync(path.join(L.OUT, `act1-${name}-base.png`), b1.shots[name][0]); fs.writeFileSync(path.join(L.OUT, `act1-${name}-new.png`), nw.shots[name][0]);
    const noise = stillDiff(b1.shots[name], b2.shots[name]), d = stillDiff(b1.shots[name], nw.shots[name]);
    const r = { spot: name, stillPx: d.still, totalPx: d.total, noiseFloorPx: noise.differ, newVsBasePx: d.differ, screenPass: d.still > d.total * 0.2 && d.differ <= noise.differ };
    const fb = b1.field[name], fn = nw.field[name]; let fd = 0; for (let i = 0; i < fb.length; i++) if (fb[i] !== fn[i]) fd++;
    r.fieldSamples = fb.length; r.fieldAnswered = fb.replace(/[^01]/g, '').length; r.fieldFree = fb.replace(/[^1]/g, '').length; r.fieldDiffer = fd + Math.abs(fb.length - fn.length);
    r.fieldBaseVsBase = [...fb].filter((c, i) => c !== b2.field[name][i]).length;
    r.fieldPass = r.fieldAnswered > 1000 && r.fieldDiffer === 0;
    if (move) { r.restBase = b1.rest[name]; r.restNew = nw.rest[name];
      r.restSpreadBase = +spread(b1.rest[name], b2.rest[name]).toFixed(2); r.maxRestDelta = +spread(b1.rest[name], nw.rest[name]).toFixed(2);
      r.movePass = r.maxRestDelta <= Math.max(0.5, 2 * r.restSpreadBase) && b1.rest[name].every((p, i) => p[2] === nw.rest[name][i][2]); }
    r.pass = r.screenPass && r.fieldPass && (!move || r.movePass); rows.push(r); console.log(JSON.stringify(r));
  }
  const res = { rows, newRuntimeOn: !!nw.multi, baseRuntime: !!b1.multi, act1ObjectsFromActs: nw.multi && nw.multi.objects, errors: { base: b1.errors, new: nw.errors } };
  fs.writeFileSync(path.join(L.OUT, 'act1_identity.json'), JSON.stringify(res, null, 1));
  console.log('ACT1', rows.filter(r => r.pass).length + '/' + rows.length, JSON.stringify({ on: res.newRuntimeOn, objs: res.act1ObjectsFromActs, errors: res.errors }));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
