'use strict';
// M14 (census 2026-11-23): Storm Nest's gust streaks must read as wind inside the play field, not as
// white bars over the whole screen. The unfixed module drew pure-white (0xffffff) 2-3 px lines at
// depth 10.8 -- above the fog (8) -- along the whole lane as far as the camera saw, so they ran
// behind the HUD and the joystick. Fix: public/acts-dungeons/modules/gust-walkways.js (wisps under
// the fog, fading out with distance from her, pale blue, tapered, translucent).
// A save seeded at Storm Nest 2F's mid cell (the census's view), Continue, wait for a gust, then
// read what the module's streak layer drew that frame (Phaser's command buffer):
//   * the streak layer sits under the fog;
//   * no stroke is pure white or more than half opaque;
//   * every stroke lies within 0.55 of the shorter screen side of her (the play field around her).
// FIELD_OUT/gust-<port>.png is the frame.
//   node scripts/auto/checks/field-gust.cjs [floor]
const path = require('path');
const F = require('./field-lib.cjs');
(async () => {
  const n = +(process.argv[2] || 2), fl = F.floorOf('stormNest', n), mid = F.midCell(fl, F.landing(fl));
  const { browser, page } = await F.L.launch({ dpr: +(process.env.FIELD_DPR || 1) });
  try {
    const p = await F.seedDungeon(page, 'stormNest', n, mid);
    F.ok(p.map === 'stormNest' && p.floor === n, `Storm Nest ${n}F reached`, `at ${p.map} ${p.floor}F cell ${p.x},${p.y}`);
    await F.dismiss(page);
    // wait for a lane near her to blow (the clock only runs while no message is up)
    const got = await page.waitForFunction(() => { const c = window.__QOK_DNG2__ && window.__QOK_DNG2__.ctx(); const st = c && c.state;
      if (!st || !st.lanes || !st.fx) return false; return st.lanes.some(L => L.state === 'gust'); }, { timeout: 15000, polling: 50 }).then(() => true).catch(() => false);
    F.ok(got, 'a gust blew while she stood on the floor');
    await page.waitForTimeout(350);
    const shot = path.join(F.OUT, `gust-${new URL(F.URL_).port}.png`);
    await page.screenshot({ path: shot });
    const r = await page.evaluate(() => {
      const c = window.__QOK_DNG2__.ctx(), st = c.state, sc = c.scene, g = st.fx, cb = g.commandBuffer || [], v = sc.cameras.main.worldView;
      const hx = sc.hero.x, hy = sc.hero.y, lim = Math.min(v.width, v.height) * 0.55;
      let i = 0, strokes = 0, white = 0, opaque = 0, far = 0, maxA = 0, maxD = 0, col = 0, a = 0, bad = null;
      while (i < cb.length) { const k = cb[i++];
        if (k === 6) { i++; col = cb[i++]; a = cb[i++]; }                           // LINE_STYLE width color alpha
        else if (k === 5 || k === 4) { const x = cb[i++], y = cb[i++]; const d = Math.hypot(x - hx, y - hy); if (d > maxD) maxD = d; if (d > lim) far++;
          if (k === 4) { strokes++; if (col === 0xffffff) white++; if (a > 0.5) opaque++; if (a > maxA) maxA = a; } }
        else if (k === 1 || k === 9 || k === 2) {}                                   // BEGIN_PATH, STROKE_PATH, CLOSE_PATH
        else { bad = k; break; } }
      return { depth: g.depth, fogDepth: 8, strokes, white, opaque, far, maxA: +maxA.toFixed(2), maxD: Math.round(maxD), lim: Math.round(lim), bad, lanes: st.lanes.map(L => L.state) };
    });
    F.info('streak layer', JSON.stringify(r));
    F.ok(r.bad === null, 'streak commands parsed', r.bad === null ? '' : 'unknown command ' + r.bad);
    F.ok(r.strokes > 0, 'the gust draws streaks', `${r.strokes} strokes, lanes ${r.lanes.join(',')}`);
    F.ok(r.depth < r.fogDepth, 'streaks sit under the fog (the dark beyond the walkway hides them)', `depth ${r.depth}`);
    F.ok(r.white === 0 && r.opaque === 0, 'no stroke is pure white or more than half opaque', `${r.white} white, ${r.opaque} over 0.5 alpha (max ${r.maxA})`);
    F.ok(r.far === 0, 'every stroke stays in the play field around her', `${r.far} points beyond ${r.lim} px (furthest ${r.maxD} px)`);
  } catch (e) { F.ok(false, 'gust check ran', String(e).slice(0, 200)); }
  await browser.close();
  F.done('field-gust');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
