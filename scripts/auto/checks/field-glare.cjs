'use strict';
// M10 (census 2026-11-23): an Acts 2-5 floor-1 arrival showed the way out as a flat white glare
// block ending in a hard straight edge with black beyond (the floor picture paints the daylight
// right up to the map's edge; past it the camera shows nothing). Fix: public/dq-tiles.js
// a2dGlareSetup (an amber wash on the glare, the paint fading into the dark along that edge, and
// warm daylight spilling past the edge, feathered).
// Each listed floor 1: a save seeded at the floor's mouth landing (where walking in puts her),
// Continue, then the screen is read at the mouth:
//   * just past the edge, in the middle of the mouth, it is lit (warm daylight), not black;
//   * the light fades with distance: 2.5 cells out it is dimmer than at 0.4 cells;
//   * inside the mouth, almost nothing is pure white (all channels >= 248).
// FIELD_OUT/glare-<id>-<port>.png are the frames.
//   node scripts/auto/checks/field-glare.cjs [dungeonId ...]   (default ironMine stormNest frostfallCavern)
const path = require('path');
const F = require('./field-lib.cjs');
(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : ['ironMine', 'stormNest', 'frostfallCavern'];
  const { browser, page } = await F.L.launch({ dpr: +(process.env.FIELD_DPR || 1) });
  for (const id of want) {
    const fl = F.floorOf(id, 1), m = fl.land && fl.land.mouth, mouth = (fl.assets || []).filter(a => a.kind === 'mouth');
    if (!m || !mouth.length) { F.ok(false, `${id}: floor 1 has a mouth`); continue; }
    try {
      const p = await F.seedDungeon(page, id, 1, [m.x, m.y]);
      await F.dismiss(page);
      const side = mouth[0].side || 'down', xs = mouth.map(a => a.x), ys = mouth.map(a => a.y), TL = 48;
      const out = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[side];
      // the mouth's centre ON the map edge, in world px
      const ex = side === 'left' ? 0 : side === 'right' ? fl.width * TL : (Math.min(...xs) + Math.max(...xs) + 1) / 2 * TL;
      const ey = side === 'up' ? 0 : side === 'down' ? fl.height * TL : (Math.min(...ys) + Math.max(...ys) + 1) / 2 * TL;
      const cam = await page.evaluate(() => { const c = window.__PHASER_GAME__.scene.getScene('WorldMapScene').cameras.main; return { x: c.scrollX, y: c.scrollY, z: c.zoom, w: c.width, h: c.height }; });
      const file = path.join(F.OUT, `glare-${id}-${new URL(F.URL_).port}.png`);
      const img = await F.grab(page, file), k = img.w / 390;
      const scr = (wx, wy) => [((wx - cam.x) * cam.z) * k * (390 / cam.w) * (cam.w / 390), ((wy - cam.y) * cam.z) * k];
      const avg = (wx, wy, r = 6) => { const [sx, sy] = scr(wx, wy); let s = [0, 0, 0], n = 0;
        for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { const X = sx + dx * k, Y = sy + dy * k; if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) continue; const q = F.px(img, X, Y); s[0] += q[0]; s[1] += q[1]; s[2] += q[2]; n++; }
        return n ? s.map(v => Math.round(v / n)) : null; };
      const near = avg(ex + out[0] * 0.4 * TL, ey + out[1] * 0.4 * TL), far = avg(ex + out[0] * 2.5 * TL, ey + out[1] * 2.5 * TL);
      // pure white inside the mouth: the strip 0..2 cells in from the edge, across the mouth
      const across = [Math.abs(out[1]), Math.abs(out[0])], span = (side === 'down' || side === 'up') ? (Math.max(...xs) - Math.min(...xs) + 1) * TL : (Math.max(...ys) - Math.min(...ys) + 1) * TL;
      let white = 0, tot = 0;
      for (let a = -span / 2; a <= span / 2; a += 3) for (let b = 2; b <= 2 * TL; b += 3) {
        const [sx, sy] = scr(ex + across[0] * a - out[0] * b, ey + across[1] * a - out[1] * b); if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
        const q = F.px(img, sx, sy); tot++; if (q[0] >= 248 && q[1] >= 248 && q[2] >= 248) white++; }
      const lum = c => c ? (c[0] + c[1] + c[2]) / 3 : 0;
      F.info(`${id} mouth`, JSON.stringify({ at: [p.map, p.floor], side, near, far, whitePct: tot ? +(100 * white / tot).toFixed(1) : null }));
      if (!near) F.info(`${id}: the map's edge at the mouth is off screen here (the camera stops at it)`, 'only the glare inside is judged');
      else {
        // 28 Nov (integration): day 4's d4-looks.js replaced the engine's broad glare wash with one soft warm glow on the mouth (reviewed,
        // pictures in autoloop/day4/fixes/dungeons/ironmine-mouth-*.jpg). Just past the edge it now reads lum 67 (rgb 80,65,48) against 8
        // a cell further on: warm daylight, not black, but under the old 70 that was set on the old wash (199,175,133). The rule keeps its
        // meaning (warm, far brighter than the dark beyond) at 55.
        F.ok(lum(near) >= 55 && near[0] >= near[2], `${id}: past the mouth's edge it is daylight, not black`, `rgb ${near} just outside`);
        F.ok(far && lum(far) < lum(near) - 20, `${id}: the daylight fades out beyond the edge (no hard line)`, `rgb ${near} at 0.4 cell -> ${far} at 2.5 cells`);
      }
      F.ok(tot > 0 && white / tot <= 0.01, `${id}: no pure-white glare in the mouth`, `${white}/${tot} sampled pixels pure white`);
    } catch (e) { F.ok(false, `${id}: glare check ran`, String(e).slice(0, 200)); }
  }
  await browser.close();
  F.done('field-glare');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
