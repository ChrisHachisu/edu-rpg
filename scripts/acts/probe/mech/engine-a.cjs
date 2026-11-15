'use strict';
// E2 engine fixes, checked in the game on Obsidian Cavern (real art, no mechanic of its own):
//  1. a pillar no longer hides her: standing right behind it the pillar's over-sprite thins to
//     45 % and comes back when she steps aside or in front;
//  2. a module's `bump` is told when she pushes against a PAINTED wall (the mover glides there
//     and never "stops"), with info.wall = true and her soles; a listener is put on the floor's
//     ctx for the test only.
// (The sealed second mouth is checked on Shadow Cave by shadow-freeze.cjs.)
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/engine-a.cjs
const { Run, manifest } = require('./_a-lib.cjs');
const ID = 'obsidianCavern';
(async () => {
  const M = manifest(), F1 = M.floors[`${ID}-f1`], R = new Run(ID, { bossId: M.dungeons[ID].bossId, name: 'engine-a', needModule: false });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page, ov = (F1.over || [])[0];
    const sprite = () => R.ev(([k, x, y]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), o = w.children.list.find(o => o.texture && o.texture.key === 'a2dover_' + k && Math.round(o.x) === x && Math.round(o.y) === y); return o ? { depth: o.depth, alpha: +o.alpha.toFixed(2), hero: w.hero.depth } : null; }, [`${ID}-f1`, ov.x, ov.y]);
    if (R.rec('f1 has a pillar in its over atlas', !!ov, ov)) {
      const bx = ov.x + ov.w / 2;
      let g = await R.go({ soles: [bx, ov.by - 40], r: 16 }); await page.waitForTimeout(900); let d = await sprite(); await R.shot('pillar-right-behind');
      R.rec('right behind the pillar it is drawn over her but thinned to 45 %, so she shows through', g.ok && d && d.depth > d.hero && d.alpha >= 0.4 && d.alpha <= 0.5, { g: g.why, d });
      g = await R.go({ soles: [bx, ov.by + 44], r: 16 }); await page.waitForTimeout(900); d = await sprite(); await R.shot('pillar-in-front');
      R.rec('in front of the pillar she is drawn over it and it is whole again', g.ok && d && d.depth < d.hero && d.alpha === 1, { g: g.why, d });
      const far = await R.go({ soles: [bx + 150, ov.by - 30], r: 14 }).then(async g2 => g2.ok ? g2 : R.go({ soles: [bx - 150, ov.by - 30], r: 14 })); await page.waitForTimeout(900); d = await sprite();
      R.rec('behind its line but clear of it the pillar is whole', far.ok && d && d.alpha === 1, { far: far.why, d });
    }
    // bump against a painted wall
    await R.ev(() => { const c = window.__QOK_DNG2__.ctx(); window.__bumps = []; c.mod = { bump: (ctx, tx, ty, ux, uy, t, info) => { window.__bumps.push([tx, ty, +ux.toFixed(2), +uy.toFixed(2), t, info && info.wall, info && Math.round(info.px), info && Math.round(info.py)]); } }; });
    const s0 = await R.st();
    // the nearest painted wall straight up from where she stands: lean on it
    await R.ev(() => window.__A.push(0, -1, 2500)); await page.waitForTimeout(200); const s1 = await R.st(), bumps = await R.ev(() => window.__bumps.slice(0, 400));
    const wall = bumps.filter(b => b[5] === true), cell = wall.length ? wall[wall.length - 1] : null, rows = F1.rows;
    R.rec('leaning on a painted wall tells the module: bump(cell, direction, {wall:true, soles}) on a cell the mask closes', wall.length > 3 && cell && rows[cell[1]][cell[0]] === '#' && cell[3] === -1 && Math.abs(cell[7] - s1.sy) < 6, { from: [s0.sx, s0.sy], to: [s1.sx, s1.sy], n: wall.length, last: cell });
    await R.ev(() => { window.__bumps = []; }); await R.ev(() => window.__A.push(0, 1, 250)); await page.waitForTimeout(100);
    R.rec('walking away over open ground tells it nothing', (await R.ev(() => window.__bumps.length)) === 0);
    await R.ev(() => { window.__QOK_DNG2__.ctx().mod = null; });
    await R.shot('leaning-on-painted-wall');
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
