'use strict';
// Act 1 must not change: the same screens and the same movement on the unmodified build and on
// this one, with the Acts 2-5 runtime ON.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> BASE_URL=http://127.0.0.1:5181/ PROBE_URL=http://127.0.0.1:5182/ \
//     node scripts/acts/probe/act1_identity.cjs
// SCREENS  Four spots whose whole view is inside Act 1's rectangle, shot on base, base again and
//          new. Animated layers (water, glints) move between any two shots, so the base/base
//          difference is the noise floor and the new build must not exceed it.
// MOVEMENT From each spot the stick is pushed in eight directions for long enough to come to rest
//          against whatever blocks that way; where she comes to rest does not depend on frame
//          timing, so the resting points must match to a hundredth of a cell.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5181/';
const SPOTS = [['greenhollow', 69, 257], ['portSapphire', 133, 347], ['millbrook', 39, 346], ['mid', 100, 300]];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
async function run(url, tag, { move }) {
  const { browser, page, errors } = await L.launch();
  const out = { shots: {}, rest: {}, errors: 0, multi: null };
  for (const [name, x, y] of SPOTS) {
    await L.bootSave(page, L.save({ x, y, flags: L.allFlags() }), { url, settle: 4000 });
    out.multi = await L.multi(page);
    out.shots[name] = await page.screenshot({ clip: { x: 0, y: 300, width: 390, height: 280 } });   // the field, clear of HUD and stick
    if (move) {
      const rest = [];
      for (const [dx, dy] of DIRS) {
        await L.bootSave(page, L.save({ x, y, flags: L.allFlags() }), { url, settle: 1500 });
        await L.stick(page, dx, dy, 6000); await page.waitForTimeout(400);
        const p = await L.pos(page); rest.push([+p.cx.toFixed(2), +p.cy.toFixed(2), p.map]);
      }
      out.rest[name] = rest;
    }
  }
  out.errors = errors.length;
  await browser.close();
  return out;
}
const diff = L.pngDiff;
(async () => {
  const move = process.env.MOVE !== '0';
  const b1 = await run(BASE, 'base1', { move });
  const b2 = await run(BASE, 'base2', { move: false });
  const nw = await run(L.URL_, 'new', { move });
  const rows = [];
  for (const [name] of SPOTS) {
    fs.writeFileSync(path.join(L.OUT, `act1-${name}-base.png`), b1.shots[name]); fs.writeFileSync(path.join(L.OUT, `act1-${name}-new.png`), nw.shots[name]);
    const noise = diff(b1.shots[name], b2.shots[name]), d = diff(b1.shots[name], nw.shots[name]);
    const r = { spot: name, noiseFloorPx: noise, newVsBasePx: d, screenPass: d <= noise };
    if (move) { r.restBase = b1.rest[name]; r.restNew = nw.rest[name];
      r.maxRestDelta = Math.max(...b1.rest[name].map((p, i) => Math.max(Math.abs(p[0] - nw.rest[name][i][0]), Math.abs(p[1] - nw.rest[name][i][1]))));
      r.movePass = r.maxRestDelta <= 0.011 && b1.rest[name].every((p, i) => p[2] === nw.rest[name][i][2]); }
    r.pass = r.screenPass && (!move || r.movePass); rows.push(r); console.log(JSON.stringify(r));
  }
  const res = { rows, newRuntimeOn: !!nw.multi, baseRuntime: !!b1.multi, act1ObjectsFromActs: nw.multi && nw.multi.objects, errors: { base: b1.errors, new: nw.errors } };
  fs.writeFileSync(path.join(L.OUT, 'act1_identity.json'), JSON.stringify(res, null, 1));
  console.log('ACT1', rows.filter(r => r.pass).length + '/' + rows.length, JSON.stringify({ on: res.newRuntimeOn, objs: res.act1ObjectsFromActs, errors: res.errors }));
})().catch(e => { console.error('CRASH', e); process.exit(1); });
