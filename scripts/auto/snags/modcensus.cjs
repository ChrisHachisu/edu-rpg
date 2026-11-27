'use strict';
// Census of the MECHANICS' own solid things (free() === false on painted floor: ice blocks, bells, glyph doors, tablets,
// crystals, wheels, levers, carts, buffer stops, flooded channels, void lanes...): where a hero walking straight would
// clip one within 24 px of its corner although a sideways shift of that much would take her past, and what a real walk
// does there. The fix leaves these alone on purpose (they are puzzle pieces, not rock).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5560/ STEADY=1 node scripts/auto/snags/modcensus.cjs <out.json> <floorKey> ...
const fs = require('fs');
const F = require('../checks/field-lib.cjs');
const L = F.L, out = process.argv[2], keys = process.argv.slice(3);
const SCAN = () => {
  const D = window.__QOK_DNG2__, c = D.ctx(), T = 48, fd = D.footDy(), m = c.mod, W = c.plan.width * T, H = c.plan.height * T;
  if (!m || !m.free) return { comps: [], note: 'no free hook' };
  const veto = (x, y) => { try { return m.free(c, x, y, (x / T) | 0, (y / T) | 0) === false; } catch (e) { return false; } };
  const fr = (x, y) => D.free(x, y - fd) && c.maskFree(x, y);
  const G = 4, gw = Math.ceil(W / G), gh = Math.ceil(H / G), v = new Uint8Array(gw * gh), lab = new Int32Array(gw * gh); let n = 0;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (c.maskFree(gx * G + 2, gy * G + 2) && veto(gx * G + 2, gy * G + 2)) { v[gy * gw + gx] = 1; n++; }
  const comps = [];
  for (let i = 0; i < v.length; i++) { if (!v[i] || lab[i]) continue; const id = comps.length + 1, st = [i]; lab[i] = id; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cnt = 0;
    while (st.length) { const j = st.pop(), gx = j % gw, gy = (j / gw) | 0; cnt++; if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy;
      for (const k of [j - 1, j + 1, j - gw, j + gw]) if (k >= 0 && k < v.length && v[k] && !lab[k] && Math.abs((k % gw) - gx) <= 1) { lab[k] = id; st.push(k); } }
    comps.push({ bbox: [x0 * G, y0 * G, (x1 + 1) * G, (y1 + 1) * G], px: cnt * G * G }); }
  const objs = (c.plan.mech || []).concat((c.plan.assets || []));
  for (const q of comps) { const cx = (q.bbox[0] + q.bbox[2]) / 2, cy = (q.bbox[1] + q.bbox[3]) / 2; let best = null, bd = 1e9;
    for (const o of objs) { const cells = o.cells && o.cells.length && typeof o.cells[0][0] === 'number' ? o.cells : [[o.x, o.y]]; for (const cell of cells) { const d = Math.hypot(cell[0] * T + 24 - cx, cell[1] * T + 24 - cy); if (d < bd) { bd = d; best = o.kind; } } }
    q.kind = bd < 80 ? best : 'zone'; q.w = q.bbox[2] - q.bbox[0]; q.h = q.bbox[3] - q.bbox[1];
    // clip lanes: per approach direction, the lines that meet the thing after a 30 px free run-up and pass it with a shift of k <= 24
    q.clips = {}; q.sample = null;
    for (const [d, ux, uy] of [['E', 1, 0], ['W', -1, 0], ['S', 0, 1], ['N', 0, -1]]) { const lx = -uy, ly = ux; let lanes = 0, maxK = 0;
      const a0 = ux ? q.bbox[1] : q.bbox[0], a1 = ux ? q.bbox[3] : q.bbox[2];
      for (let a = a0 + 1; a < a1; a += 2) {
        // the face on this line
        let f = null; const b0 = ux > 0 ? q.bbox[0] - 2 : ux < 0 ? q.bbox[2] + 2 : uy > 0 ? q.bbox[1] - 2 : q.bbox[3] + 2;
        for (let i = 0; i <= 12; i++) { const x = ux ? b0 + ux * i : a, y = ux ? a : b0 + uy * i; if (veto(x, y)) { f = [x - ux, y - uy]; break; } if (!fr(x, y)) break; }
        if (!f) continue; let run = true; for (let i = 0; i <= 30 && run; i += 2) if (!fr(f[0] - ux * i, f[1] - uy * i)) run = false; if (!run) continue;
        let kk = 0; for (const s of [1, -1]) { for (let k = 1; k <= 24; k++) { const px = f[0] + s * k * lx, py = f[1] + s * k * ly; if (!fr(px, py)) break; if (fr(px + ux * 6, py + uy * 6) && fr(px + ux * 12, py + uy * 12)) { if (!kk || k < kk) kk = k; break; } } }
        if (!kk) continue; lanes++; if (kk > maxK) maxK = kk; if (!q.sample || kk < q.sample.k) q.sample = { d, start: [f[0] - ux * 30, f[1] - uy * 30], face: f, k: kk }; }
      if (lanes) q.clips[d] = { lanes: lanes * 2, maxK }; } }
  return { comps, vetoPx: n * G * G };
};
const WALK = async ([sx, sy, ux, uy, ms]) => { const D = window.__QOK_DNG2__, c = D.ctx(), w = c.scene, fd = D.footDy(); const raf = () => new Promise(r => requestAnimationFrame(r));
  c.place(sx, sy - fd); await raf(); await raf(); const a = [w.hero.x, w.hero.y + fd], t0 = performance.now(), sn = window.__QOK_SNAG__, b0 = sn ? sn.stats.bent : 0, f0 = w.game.loop.frame; let still = 0, last = a;
  while (w.game.loop.frame - f0 < ms * 60 / 1000 && performance.now() - t0 < ms * 6) { window.__DQ_STICK__ = { x: ux, y: uy, m: 1 }; await raf(); const p = [w.hero.x, w.hero.y + fd]; still = Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.01 ? still + 1 : 0; last = p; if (w.showingMessage) break; }
  window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; const b = [w.hero.x, w.hero.y + fd];
  return { a, b, along: (b[0] - a[0]) * ux + (b[1] - a[1]) * uy, side: Math.abs((b[0] - a[0]) * -uy + (b[1] - a[1]) * ux), still, msg: !!w.showingMessage, bent: (sn ? sn.stats.bent : 0) - b0 }; };
(async () => {
  const { browser, page } = await L.launch({ dpr: 1 }); const res = []; const flush = () => fs.writeFileSync(out, JSON.stringify(res, null, 1));
  try { for (const key of keys) { const id = key.replace(/-f\d+$/, ''), n = Number(key.match(/-f(\d+)$/)[1]), fl = F.floorOf(id, n), xy = F.midCell(fl, F.landing(fl)) || F.landing(fl);
    const pos = await F.seedDungeon(page, id, n, xy); await page.waitForTimeout(1500); await F.dismiss(page);
    await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(), m = c && c.mod; if (m) { if (m.__snag) m.__snag.tick = null; else m.tick = function () {}; } });
    if (process.env.STEADY) await page.evaluate(() => { const g = window.__PHASER_GAME__, raf = g.loop.raf; if (raf && raf.callback && !raf.__steady) { const cb = raf.callback; let t = performance.now(); raf.__steady = true; raf.callback = function () { t += 1000 / 60; return cb.call(this, t); }; } });
    await page.waitForTimeout(300); await F.dismiss(page);
    const sc = await page.evaluate(SCAN); const rec = { key, ok: pos.map === id && pos.floor === n, vetoPx: sc.vetoPx, note: sc.note, comps: sc.comps }; res.push(rec);
    const DV = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }, seen = {};
    for (const q of sc.comps) { if (!q.sample || (seen[q.kind] || 0) >= 2) continue; seen[q.kind] = (seen[q.kind] || 0) + 1; const [ux, uy] = DV[q.sample.d];
      const r = await page.evaluate(WALK, [q.sample.start[0], q.sample.start[1], ux, uy, 1000]); q.walk = { along: Math.round(r.along * 10) / 10, side: Math.round(r.side * 10) / 10, still: r.still, msg: r.msg, bent: r.bent, verdict: r.msg ? 'message' : (r.along > 44 ? 'passed' : (r.still >= 20 ? 'dead stop' : 'slow')) };
      if (r.msg) { await F.dismiss(page); await page.waitForTimeout(200); } }
    flush();
    const byKind = {}; for (const q of sc.comps) { const k = q.kind; byKind[k] = byKind[k] || { n: 0, withClip: 0, walks: [] }; byKind[k].n++; if (q.sample) byKind[k].withClip++; if (q.walk) byKind[k].walks.push(q.walk.verdict + ' (clip ' + q.sample.k + ' px, ' + q.walk.along + ' along, ' + q.walk.side + ' side, bent ' + q.walk.bent + ')'); }
    console.log(key, JSON.stringify(byKind)); } }
  catch (e) { console.log('CRASH', String(e && e.stack || e).slice(0, 500)); }
  await browser.close(); flush();
})();
