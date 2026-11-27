'use strict';
// m9 (census 2026-11-23): the dungeon light (the dark around her lit circle) was drawn in coarse
// visible steps. It is a 1/6-resolution canvas (dq-tiles.js ensureDng, 'dqdngfog') scaled up 6x and
// sampled NEAREST, so its smooth radial falloff showed as 6-px blocks. Fix: sample it LINEAR.
// A save seeded at Storm Nest 3F's landing (the census's view), Continue; then
//   * the fog texture samples LINEAR (Phaser FilterMode 0), and
//   * along the row through her, the fog's own alpha changes in small steps: the largest jump
//     between neighbouring screen pixels in the falloff band is under 1/3 of the unfixed 6-px step.
//   node scripts/auto/checks/field-fog.cjs
const path = require('path');
const F = require('./field-lib.cjs');
(async () => {
  const { browser, page } = await F.L.launch({ dpr: 1 });
  try {
    const fl = F.floorOf('stormNest', 3), land = F.landing(fl);
    const p = await F.seedDungeon(page, 'stormNest', 3, land);
    F.ok(p.map === 'stormNest' && p.floor === 3, 'Storm Nest 3F reached', `at ${p.map} ${p.floor}F`);
    await page.screenshot({ path: path.join(F.OUT, `fog-${new URL(F.URL_).port}.png`) });
    const r = await page.evaluate(() => {
      const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), t = sc.textures.get('dqdngfog'), src = t && t.source && t.source[0];
      let img = null; sc.children.list.forEach(o => { if (o.texture && o.texture.key === 'dqdngfog') img = o; });
      if (!src || !img) return { none: true };
      // the fog's alpha as the screen shows it: sample the 1/6 canvas the way the GPU does
      const cv = src.image, ctx = cv.getContext('2d'), d = ctx.getImageData(0, 0, cv.width, cv.height).data, S = img.scaleX;
      const cam = sc.cameras.main, hy = (sc.hero.y - cam.scrollY) * cam.zoom, fy = hy / S, lin = src.scaleMode === 0;
      const A = (fx, fy) => { const x = Math.max(0, Math.min(cv.width - 1, fx)), y = Math.max(0, Math.min(cv.height - 1, fy)); return d[(y * cv.width + x) * 4 + 3]; };
      const at = sx => { const u = sx / S - (lin ? 0.5 : 0), v = fy - (lin ? 0.5 : 0);
        if (!lin) return A(Math.floor(u), Math.floor(v));
        const x0 = Math.floor(u), y0 = Math.floor(v), ax = u - x0, ay = v - y0;
        return (A(x0, y0) * (1 - ax) + A(x0 + 1, y0) * ax) * (1 - ay) + (A(x0, y0 + 1) * (1 - ax) + A(x0 + 1, y0 + 1) * ax) * ay; };
      let maxJump = 0, prev = at(0);
      for (let sx = 1; sx < cam.width; sx++) { const a = at(sx); if (Math.abs(a - prev) > maxJump) maxJump = Math.abs(a - prev); prev = a; }
      // what the GPU actually samples (the renderer re-applies the game's pixel-art filter on each upload)
      let gpu = null; try { const gl = sc.renderer.gl, tx = src.glTexture && (src.glTexture.webGLTexture || src.glTexture);
        gl.bindTexture(gl.TEXTURE_2D, tx); gpu = gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER) === gl.LINEAR ? 'LINEAR' : 'NEAREST'; gl.bindTexture(gl.TEXTURE_2D, null); } catch (e) { gpu = 'error ' + e; }
      return { scaleMode: src.scaleMode, gpu, scale: S, maxJump: Math.round(maxJump) };
    });
    F.info('fog', JSON.stringify(r));
    F.ok(!r.none && r.scaleMode === 0 && r.gpu === 'LINEAR', 'the fog texture samples LINEAR (smooth), not NEAREST, on the GPU', `scaleMode ${r.scaleMode}, GPU mag filter ${r.gpu}`);
    F.ok(!r.none && r.maxJump <= 5, 'the fog falloff has no visible steps along the row through her', `largest jump between neighbouring screen pixels: ${r.maxJump}/255 alpha`);
  } catch (e) { F.ok(false, 'fog check ran', String(e).slice(0, 200)); }
  await browser.close();
  F.done('field-fog');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
