'use strict';
// Browser confirmation of the static snag census (day 4, track S): real walks with frame-by-frame position samples.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5560/ node scripts/auto/snags/confirm.cjs <out.json> <floorKey> [floorKey ...]
//   (after masks.py and census.cjs)
// For each floor: a save seeded on the floor (Continue), then walks taken from census/<key>.json:
//   lips of three sizes (sure dead stops in the model), closing walls, and a control walk beside each lip (shifted clear of it).
// CONFIRM_LS=key=value sets a localStorage switch with the save. CONFIRM_N = lips per size class (default 2).
const fs = require('fs'), path = require('path');
const F = require('../checks/field-lib.cjs');
const S = require('./snaglib.cjs');
const L = F.L;
const out = process.argv[2], keys = process.argv.slice(3);
const CEN = process.env.CONFIRM_CENSUS || path.join(require('os').tmpdir(), 'qok-snag-census');
const N = Number(process.env.CONFIRM_N || 2);
const DV = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
if (process.env.CONFIRM_LS) process.env.FIELD_LS = process.env.CONFIRM_LS;

const WALK = async ([sx, sy, ux, uy, ms]) => {
  const D = window.__QOK_DNG2__, c = D.ctx(), w = c.scene, fd = D.footDy(), g = window.__PHASER_GAME__;
  const raf = () => new Promise(r => requestAnimationFrame(r));
  window.__DQ_STICK__ = { x: 0, y: 0, m: 0 };
  c.place(sx, sy - fd); try { w.updateCamera(); } catch (e) {}
  await raf(); await raf(); await raf();
  const a = [w.hero.x, w.hero.y + fd], sam = [], t0 = performance.now();
  let why = 'time';
  while (performance.now() - t0 < ms) {
    window.__DQ_STICK__ = { x: ux, y: uy, m: 1 }; await raf();
    sam.push([Math.round(performance.now() - t0), Math.round(w.hero.x * 100) / 100, Math.round((w.hero.y + fd) * 100) / 100]);
    if (w.showingMessage) { why = 'message'; break; }
    if (!g.scene.isActive('WorldMapScene') || g.scene.isActive('BattleScene')) { why = 'scene'; break; }
  }
  window.__DQ_STICK__ = { x: 0, y: 0, m: 0 };
  return { a, sam, why, map: w.currentMapId, floor: w.currentFloor || 1, free: D.free(w.hero.x, w.hero.y) };
};
function verdict(r, ux, uy, goalAlong) {
  const s = r.sam; if (!s.length) return { kind: 'none' };
  const last = s[s.length - 1], along = (last[1] - r.a[0]) * ux + (last[2] - r.a[1]) * uy;
  // dead: the last 20 frames did not move at all
  let still = 0; for (let i = s.length - 1; i > 0; i--) { if (Math.abs(s[i][1] - s[i - 1][1]) + Math.abs(s[i][2] - s[i - 1][2]) < 0.01) still++; else break; }
  // longest run of dead frames anywhere (a stumble she got out of)
  let run = 0, worst = 0, firstMove = -1; for (let i = 1; i < s.length; i++) { const mv = Math.abs(s[i][1] - s[i - 1][1]) + Math.abs(s[i][2] - s[i - 1][2]); if (mv >= 0.01 && firstMove < 0) firstMove = i; if (firstMove >= 0) { if (mv < 0.01) { run++; if (run > worst) worst = run; } else run = 0; } }
  return { kind: along >= goalAlong ? 'pass' : (still >= 20 ? 'dead' : 'short'), along: Math.round(along * 10) / 10, end: [last[1], last[2]], still, worstDeadRun: worst, frames: s.length };
}

(async () => {
  const { browser, page } = await L.launch({ dpr: 1 });
  const res = [];
  const flush = () => fs.writeFileSync(out, JSON.stringify(res, null, 1));
  try {
    for (const key of keys) {
      const id = key.replace(/-f\d+$/, ''), n = Number(key.match(/-f(\d+)$/)[1]);
      const cen = JSON.parse(fs.readFileSync(path.join(CEN, key + '.json'), 'utf8')), m = S.build(key);
      const fl = F.floorOf(id, n), xy = F.midCell(fl, F.landing(fl)) || F.landing(fl);
      const pos = await F.seedDungeon(page, id, n, xy);
      const st = await page.evaluate(() => { const d = window.__QOK_DNG2__; return d && d.state ? d.state() : null; });
      await page.waitForTimeout(1500); await F.dismiss(page);
      // the mechanic's hazards (shadows, guards, gusts, knights) are stood still: collision (free/input hooks) is untouched
      // (not the ice floors: the ice module's tick is what carries her across the ice, and it has no hazards)
      const quiet = await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(); if (c && c.mechanic && c.mechanic.id === 'slide-ice') return false; if (c && c.mod && c.mod.tick && !c.mod.__quiet) { c.mod.__quiet = c.mod.tick; c.mod.tick = function () {}; return true; } return !!(c && c.mod && c.mod.__quiet); });
      // CONFIRM_STEADY=1: the game clock advances 1/60 s per drawn frame (a device holding 60 fps), whatever the load on the box
      const steady = !!process.env.CONFIRM_STEADY && await page.evaluate(() => { const g = window.__PHASER_GAME__, raf = g.loop.raf; if (raf && raf.callback && !raf.__steady) { const cb = raf.callback; let t = performance.now(); raf.__steady = true; raf.callback = function () { t += 1000 / 60; return cb.call(this, t); }; } return !!(raf && raf.__steady); });
      await page.waitForTimeout(300); await F.dismiss(page);
      const rec = { key, pos, state: st, quiet, steady, walks: [] }; res.push(rec);
      if (!(pos.map === id && pos.floor === n)) { rec.error = 'not on the floor'; flush(); continue; }
      // pick: sure events of each size class, not at a prop, far from each other
      const picks = [], far = e => picks.every(p => Math.hypot(p.e.stop[0] - e.stop[0], p.e.stop[1] - e.stop[1]) > 60);
      // ice cells ('~', Frozen Lake) are the ice module's, not the mover's: only walks that stay on snow, 40 px around
      const rows = fl.terrain || fl.rows || [], cellAt = (x, y) => { const r = rows[Math.floor(y / 48)]; return r ? r.charAt(Math.floor(x / 48)) : '#'; };
      const snowOnly = e => { const [ux, uy] = DV[e.d], cx = ux ? e.at : e.line, cy = ux ? e.line : e.at;
        for (let i = -40; i <= 40; i += 8) for (let k = -40; k <= 40; k += 8) if (cellAt(cx + i * ux - k * uy, cy + i * uy + k * ux) === '~') return false; return true; };
      const ev = cen.eventList.filter(e => e.nDead === e.tried && !e.prop && snowOnly(e));
      const cls = [['lip 1-3', e => e.k48 !== null && e.k48 <= 3], ['lip 4-10', e => e.k48 !== null && e.k48 >= 4 && e.k48 <= 10], ['lip 11-24', e => e.k48 !== null && e.k48 >= 11 && e.k48 <= 24], ['closing', e => e.k48 === null || e.k48 > 24]];
      for (const [name, fn] of cls) { let c = 0; const pool = ev.filter(fn);
        for (let i = 0; i < pool.length && c < N; i++) { const e = pool[Math.floor((i * 7919 + 13) % pool.length)]; if (far(e)) { picks.push({ name, e }); c++; } } }
      for (const { name, e } of picks) {
        const [ux, uy] = DV[e.d], lx = -uy, ly = ux, cx = ux ? e.at : e.line, cy = ux ? e.line : e.at;   // contact pixel (last free)
        let back = 0; while (back < 20 && S.free(m, cx - (back + 1) * ux + 0.5, cy - (back + 1) * uy + 0.5)) back++;
        const p0 = [cx - back * ux + 0.5, cy - back * uy + 0.5];
        const sim = S.walk(m, { x: p0[0], y: p0[1] }, ux, uy, 90, { until: p => (p.x - cx) * ux + (p.y - cy) * uy > 14 });
        const r = await page.evaluate(WALK, [p0[0], p0[1], ux, uy, 1300]);
        const v = verdict(r, ux, uy, back + 14);
        const w = { cls: name, d: e.d, start: p0, contact: [cx, cy], k48: e.k48, k8: e.k8, hug: e.hug, sim: { dead: sim.dead, end: [Math.round(sim.x * 10) / 10, Math.round(sim.y * 10) / 10] }, placed: r.a, why: r.why, ...v, sam: r.sam.filter((_, i) => i % 3 === 0 || i >= r.sam.length - 3).slice(0, 40) };
        rec.walks.push(w);
        // control: the same walk shifted to the open side by k48+6 (or 30 for a closing wall): she must pass
        if (name !== 'closing') { const sh = e.k48 + 6; let c0 = null;
          for (const s of [1, -1]) { const q = [p0[0] + s * sh * lx, p0[1] + s * sh * ly]; let okk = true; for (let i = 0; i <= back + 16; i += 2) if (!S.free(m, q[0] + i * ux, q[1] + i * uy)) { okk = false; break; } if (okk) { c0 = q; break; } }
          if (c0) { const rc = await page.evaluate(WALK, [c0[0], c0[1], ux, uy, 700]); const vc = verdict(rc, ux, uy, back + 14);
            rec.walks.push({ cls: 'control for ' + name, d: e.d, start: c0, placed: rc.a, why: rc.why, ...vc }); } }
        if (r.why !== 'time') { await F.dismiss(page); }
      }
      flush();
      const lips = rec.walks.filter(w => !w.cls.startsWith('control')), ctl = rec.walks.filter(w => w.cls.startsWith('control'));
      console.log(key, 'lips dead in browser', lips.filter(w => w.kind === 'dead').length + '/' + lips.length, 'controls pass', ctl.filter(w => w.kind === 'pass').length + '/' + ctl.length);
    }
  } catch (e) { console.log('CRASH', String(e && e.stack || e).slice(0, 600)); res.push({ crash: String(e) }); flush(); }
  await browser.close();
  flush();
})();
