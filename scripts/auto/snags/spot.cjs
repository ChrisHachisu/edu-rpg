'use strict';
// The robot's logged stuck spots (day 3), tested in the browser: from the exact logged soles the stick is held in every
// heading (5 degree steps) for 0.6 s; a heading is DEAD when she has moved less than 2 px in all and the last 20 frames
// did not move, although the mover allows a spot 12 px ahead in that heading (so it is not simply a wall).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5560/ STEADY=1 node scripts/auto/snags/spot.cjs <out.json>   (STEADY=1: the game clock is stepped 1/60 s a frame)
const fs = require('fs');
const F = require('../checks/field-lib.cjs');
const SPOTS = [['demonCastle-f3', [3003.762441297102, 471.34078513513515]], ['demonCastle-f3', [3081, 466]], ['demonCastle-f6', [3627, 319]], ['sunkenTempleDungeon-f4', [1697.386455736691, 179.99871965726572]], ['demonCastle-f2', [1932, 945]]];
const out = process.argv[2];
(async () => {
  const { browser, page } = await F.L.launch({ dpr: 1 }); const res = []; let cur = null;
  try { for (const [key, at] of SPOTS) {
    if (cur !== key) { const id = key.replace(/-f\d+$/, ''), n = Number(key.match(/-f(\d+)$/)[1]), fl = F.floorOf(id, n), xy = F.midCell(fl, F.landing(fl)) || F.landing(fl);
      await F.seedDungeon(page, id, n, xy); await page.waitForTimeout(1500); await F.dismiss(page);
      await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(), m = c && c.mod; if (m) { if (m.__snag) m.__snag.tick = null; else m.tick = function () {}; } });
      if (process.env.STEADY) await page.evaluate(() => { const g = window.__PHASER_GAME__, raf = g.loop.raf; if (raf && raf.callback && !raf.__steady) { const cb = raf.callback; let t = performance.now(); raf.__steady = true; raf.callback = function () { t += 1000 / 60; return cb.call(this, t); }; } });
      await page.waitForTimeout(300); await F.dismiss(page); cur = key; }
    const rec = { key, at, heads: [] }; res.push(rec);
    for (let a = 0; a < 360; a += 5) {
      await F.dismiss(page);
      const r = await page.evaluate(async ([sx, sy, a, ms]) => {
        const D = window.__QOK_DNG2__, c = D.ctx(), w = c.scene, fd = D.footDy(), ux = Math.cos(a * Math.PI / 180), uy = Math.sin(a * Math.PI / 180);
        const raf = () => new Promise(r => requestAnimationFrame(r));
        window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; c.place(sx, sy - fd); await raf(); await raf();
        const p0 = [w.hero.x, w.hero.y + fd], t0 = performance.now(); let last = p0, still = 0, frames = 0, first = null, dmin = 1e9, dmax = 0;
        const ahead = [6, 12, 18].map(d => D.free(p0[0] + ux * d, p0[1] - fd + uy * d) ? 1 : 0);
        while (performance.now() - t0 < ms) { window.__DQ_STICK__ = { x: ux, y: uy, m: 1 }; await raf(); frames++; const p = [w.hero.x, w.hero.y + fd];
          const dl = w.game.loop.delta; if (dl < dmin) dmin = dl; if (dl > dmax) dmax = dl;
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.01) still++; else { still = 0; if (!first) first = frames; } last = p; if (w.showingMessage) break; }
        window.__DQ_STICK__ = { x: 0, y: 0, m: 0 };
        return { p0, end: last, moved: Math.hypot(last[0] - p0[0], last[1] - p0[1]), along: (last[0] - p0[0]) * ux + (last[1] - p0[1]) * uy, still, frames, ahead, msg: !!w.showingMessage, freeHere: D.free(p0[0], p0[1] - fd), dt: [Math.round(dmin * 100) / 100, Math.round(dmax * 100) / 100] };
      }, [at[0], at[1], a, 600]);
      rec.heads.push({ a, moved: Math.round(r.moved * 10) / 10, along: Math.round(r.along * 10) / 10, still: r.still, frames: r.frames, ahead: r.ahead.join(''), dt: r.dt, msg: r.msg, freeHere: r.freeHere, placed: r.p0 });
    }
    const dead = rec.heads.filter(h => h.moved < 2 && h.still >= 20), deadOpen = dead.filter(h => h.ahead[1] === '1');
    rec.dead = dead.map(h => h.a); rec.deadOpen = deadOpen.map(h => h.a);
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
    console.log(key, at.map(v => Math.round(v * 10) / 10).join(','), 'free here', rec.heads[0].freeHere, 'dead headings', rec.dead.join(' '), '| dead with 12 px ahead free', rec.deadOpen.join(' ') || 'none', '| msgs', rec.heads.filter(h => h.msg).length, '| frame dt', Math.min(...rec.heads.map(h => h.dt[0])), 'to', Math.max(...rec.heads.map(h => h.dt[1])), 'ms');
  } } catch (e) { console.log('CRASH', String(e && e.stack || e).slice(0, 500)); }
  await browser.close();
})();
