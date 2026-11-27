'use strict';
// Dungeon looks, day 4, worker FD2 (2026-11-27). THE LOOK CHANGED, THE RULES DID NOT: these lines read the
// objects the game drew (pixels only where only the picture can tell) and time the warnings on the modules' own clocks.
//   storm-terrace.js     Stormreach: the stone glows (soft picture, no squares), same warning time, bolts on the terrace, clear of the HUD
//   guard-lanterns.js    Demon Barracks: a soft pool over exactly the lit cells, a drawn lantern with a glow
//   mirror-rooms.js      Demon Castle: the swap badge sits with the controls, not over her head
//   push-ice.js          Frostfall: the plinth lies under her, only the boulder sorts in front
//   drifting-blocks.js   Void Rift: the open join is a soft light, not a hard bar
//   matching-portals.js  Twilight Sanctum: the pool of every portal turns
//   glyph-plates.js      Desert Tomb: the order is a carved slab over the stele; pressed plates sink; no plate marked as next
//   cracked-walls.js     Scorched Ruins: ash drifts out of the crack (a hint, not a marker)
//   sluice-wheels.js     Oasis Depths: a wheel in the dark is dark; state by the handle, wheel by its inlay shape
// Switch: localStorage qok-d4-looks=0 gives the old looks (FIELD_LS=qok-d4-looks=0 makes this check fail on a build that has them).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5572/ node scripts/auto/checks/dungeon-looks-fd2.cjs [group ...]
//   groups: storm guard mirror ice void portal glyph ash sluice   (default: all)
//   FD2_SHOTS=<dir>/ also saves the owner's pictures there (780 px wide JPEG), named <group>-<what>-<FD2_TAG>.jpg.
const fs = require('fs'), path = require('path');
const F = require('./field-lib.cjs');
const T = 48;
const want = process.argv.slice(2), on = g => !want.length || want.includes(g);
const fl = (id, n) => F.floorOf(id, n);
const sleep = (page, ms) => page.waitForTimeout(ms);
const SHOTS = process.env.FD2_SHOTS || '', TAG = process.env.FD2_TAG || 'after';
const st = expr => `(() => { const c = window.__QOK_DNG2__ && window.__QOK_DNG2__.ctx(); const S = c && c.state; return !!(${expr}); })()`;
const waitSt = (page, expr, ms = 30000) => page.waitForFunction(st(expr), null, { timeout: ms, polling: 30 }).then(() => true).catch(() => false);
async function seed(page, id, n, at, flags) { const p = await F.seedDungeon(page, id, n, at, flags ? { flags } : {}); await F.dismiss(page); return p; }
async function shot(page, name) {
  if (!SHOTS) return null;
  const png = path.join(F.OUT, `fd2-${name}.png`), jpg = path.join(SHOTS, `${name}-${TAG}.jpg`);
  await page.screenshot({ path: png });
  try { require('child_process').execFileSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");w,h=im.size;im=im.resize((780,round(h*780/w)),Image.LANCZOS) if w!=780 else im;im.save(sys.argv[2],quality=86)', png, jpg]); } catch (e) { F.info('shot failed', String(e).slice(0, 200)); }
  return jpg;
}
// a strip of frames side by side (each 390 px wide): one per condition (frozen there, see freeze) or, for a number, every `gap` ms
async function strip(page, name, conds, gap) {
  if (!SHOTS) return null;
  const files = [], n = Array.isArray(conds) ? conds.length : conds;
  for (let i = 0; i < n; i++) { const f = path.join(F.OUT, `fd2-${name}-${i}.png`);
    if (Array.isArray(conds)) { if (!(await freeze(page, conds[i]))) continue; await page.screenshot({ path: f }); await thaw(page); }
    else { await page.screenshot({ path: f }); if (i + 1 < n) await sleep(page, gap); }
    files.push(f); }
  const jpg = path.join(SHOTS, `${name}-strip${TAG === 'after' ? '' : '-' + TAG}.jpg`);
  try { require('child_process').execFileSync('python3', ['-c', 'import sys;from PIL import Image;fs=sys.argv[2:];ims=[Image.open(f).convert("RGB") for f in fs];w=390;ims=[i.resize((w,round(i.size[1]*w/i.size[0])),Image.LANCZOS) for i in ims];h=ims[0].size[1];o=Image.new("RGB",(w*len(ims)+6*(len(ims)-1),h),(255,255,255));[o.paste(im,(k*(w+6),0)) for k,im in enumerate(ims)];o.save(sys.argv[1],quality=86)', jpg, ...files]); } catch (e) { F.info('strip failed', String(e).slice(0, 200)); }
  return jpg;
}
// Freeze the mechanic at the first frame where `cond` (a function body over c, S, M) is true: from then on the module's
// tick gets dt = 0 (its clock, and everything it draws from it, stands still; the scene keeps rendering), so a screenshot
// on a loaded box shows that very moment. thaw() lets the clock run again. (Pausing the scene instead hides the HUD.)
async function freeze(page, cond, ms = 25000) {
  return page.evaluate(([cond, ms]) => new Promise(res => {
    const c = window.__QOK_DNG2__.ctx(), sc = c.scene, m = c.mod, f = new Function('c', 'S', 'M', cond); let done = false;
    if (!m.__fd2) { const orig = m.tick; m.tick = function (ctx, dt) { return orig.call(this, ctx, window.__fd2Freeze ? 0 : dt); }; m.__fd2 = orig; }
    window.__fd2Freeze = false;
    function step() { if (done) return; let ok = false; try { ok = f(c, c.state, c.state.M); } catch (e) {} if (ok) { done = true; window.__fd2Freeze = true; sc.events.off('postupdate', step); setTimeout(() => res(true), 120); } }
    sc.events.on('postupdate', step); setTimeout(() => { if (!done) { done = true; sc.events.off('postupdate', step); res(false); } }, ms);
  }), [cond, ms]);
}
const thaw = page => page.evaluate(() => { window.__fd2Freeze = false; });
// the texture's alpha at its border (max) and at given texture px
const texAlpha = (page, key, pts) => page.evaluate(([key, pts]) => {
  try { const sc = window.__QOK_DNG2__.ctx().scene, t = sc.textures.get(key).getSourceImage(), g = t.getContext('2d'), w = t.width, h = t.height, d = g.getImageData(0, 0, w, h).data; let border = 0;
    for (let i = 0; i < w; i++) border = Math.max(border, d[i * 4 + 3], d[((h - 1) * w + i) * 4 + 3]);
    for (let j = 0; j < h; j++) border = Math.max(border, d[(j * w) * 4 + 3], d[(j * w + w - 1) * 4 + 3]);
    return { w, h, border, at: (pts || []).map(p => d[(Math.min(h - 1, Math.max(0, Math.round(p[1]))) * w + Math.min(w - 1, Math.max(0, Math.round(p[0])))) * 4 + 3]) }; } catch (e) { return null; } }, [key, pts]);

// ---- Stormreach Spire (DC-02, DC-03) ---------------------------------------------------------------
async function storm(page) {
  const f = fl('stormreachSpire', 1);
  await seed(page, 'stormreachSpire', 1, [10, 9]);
  F.ok(await waitSt(page, 'S && S.ok && S.spr'), 'Stormreach 1F: the terrace module is running');
  const r = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, M = S.M, out = { look: S.spr.look || 1, glow: [], G: M.G, glowTicks: M.glow, strike: M.strike, ms: S.ms, kid: M.kid };
    for (let g = 0; g < M.G; g++) { const o = S.spr.glow[g]; out.glow.push({ type: o.type, key: o.texture ? o.texture.key : null, x: o.x, y: o.y, sx: o.scaleX, cmds: (o.commandBuffer || []).length }); }
    return out;
  });
  F.info('stormreach 1F', JSON.stringify(r));
  F.ok(r.glow.every(o => o.type === 'Image' && o.cmds === 0), 'Stormreach: the warning is not drawn as filled square cells (no rectangle layer)', r.glow.map(o => o.type + ':' + o.cmds).join(' '));
  // the soft picture: clear at its border; every cell of the group lit over its whole area, the joints between cells included
  const soft = [];
  for (let g = 0; g < r.G; g++) { const o = r.glow[g]; if (!o.key) { soft.push(null); continue; }
    const pts = f.mechanic.strikeGroups.flatMap((row, y) => [...row].map((ch, x) => ch === String(g) ? [x, y] : null).filter(Boolean))
      .flatMap(([x, y]) => [[x + 0.5, y + 0.5], [x + 0.08, y + 0.08], [x + 0.92, y + 0.92], [x + 1, y + 0.5], [x + 0.5, y + 1]].map(([u, v]) => [(u * T - o.x) / o.sx, (v * T - o.y) / o.sx]));
    soft.push(await texAlpha(page, o.key, pts)); }                         // texture px = (world px - its corner) / its scale
  const s0 = soft.filter(Boolean);
  F.ok(s0.length === r.G && s0.every(s => s.border <= 2), 'Stormreach: each group\'s glow is soft-edged (clear at its border, no square outline)', s0.map(s => s.border).join(' '));
  F.info('stormreach glow alpha inside the group cells (min, of 255)', s0.map(s => Math.min(...s.at)).join(' '));
  // timing and bolts over one full period, on the module's own clock
  const run = await page.evaluate(() => new Promise(res => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, M = S.M, sc = c.scene; const seen = {}; const bolts = []; let t0 = S.tick, lastT = S.tick, total = 0;
    const hud = () => { const out = []; const cv = sc.sys.game.canvas, cr = cv.getBoundingClientRect(), v = sc.cameras.main.worldView, k = v.width / cr.width;
      for (const sel of ['#dpad', '#fieldTabs > *', '#qok-field-hud > *', '#qok-quest-hud']) for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.width * r.height > cr.width * cr.height * 0.5) continue;
        out.push([v.x + (r.left - cr.left) * k, v.y + (r.top - cr.top) * k, v.x + (r.right - cr.left) * k, v.y + (r.bottom - cr.top) * k, sel]); }
      return out; };
    let lastStrikes = S.strikes || 0;
    function step() {
      const t = S.tick; total += ((t - lastT) % M.period + M.period) % M.period; lastT = t;
      for (let g = 0; g < M.G; g++) { const e = seen[g] || (seen[g] = { on: null, strike: null, frames: 0, shown: 0 });
        const a = S.spr.glow[g].alpha, sk = M.period, strikeNow = (((Math.floor(t) - g * M.gap) % sk) + sk) % sk < M.strike;
        if (e.strike === null) { if (!strikeNow && a > 0 && e.on === null && e.calm) e.on = t; if (!strikeNow && a === 0) { e.calm = true; e.on = null; }
          if (e.on !== null && !strikeNow) { e.frames++; if (a > 0) e.shown++; }
          if (strikeNow && e.on !== null) { e.strike = t; e.hit = Math.max(S.spr.hit[g].alpha, S.spr.glow[g].type === 'Image' ? S.spr.glow[g].alpha : 0); } } }
      if ((S.strikes || 0) !== lastStrikes) { lastStrikes = S.strikes; const v = sc.cameras.main.worldView;
        bolts.push({ list: (S.lastBolts || []).map(b => b.slice()), visible: S.spr.bolts.filter(b => b.visible).map(b => [b.x, b.y, b.displayHeight, b.displayWidth]), view: [v.x, v.y, v.right, v.bottom], hud: hud() }); }
      if (total > M.period * 1.3 + 1) fin(); }
    function fin() { sc.events.off('postupdate', step); res({ seen, bolts, glowTicks: M.glow, ms: S.ms, period: M.period }); }
    sc.events.on('postupdate', step); setTimeout(fin, 30000);
  }));
  F.info('stormreach one period', JSON.stringify({ seen: run.seen, glowTicks: run.glowTicks }));
  const gs = Object.values(run.seen).filter(e => e.strike !== null);
  const warn = gs.map(e => ((e.strike - e.on) % run.period + run.period) % run.period);
  F.ok(gs.length >= 3 && warn.every(w => Math.abs(w - run.glowTicks) <= 0.35), 'Stormreach: the warning lasts exactly the glow time before every strike (timing unchanged)', warn.map(w => (w * run.ms).toFixed(0) + ' ms').join(' ') + ` vs ${(run.glowTicks * run.ms).toFixed(0)} ms`);
  F.ok(gs.length >= 3 && gs.every(e => e.shown === e.frames && e.frames > 3), 'Stormreach: the glow is on in every frame of the warning', gs.map(e => `${e.shown}/${e.frames}`).join(' '));
  F.ok(gs.every(e => e.hit > 0.5), 'Stormreach: the strike itself lights the struck stones (a flash on the stones)', gs.map(e => e.hit.toFixed(2)).join(' '));
  // bolts: where each lands is a stone of the struck terrace, the bolt's whole height stands over terrace or floor, on screen, clear of every HUD box
  const terr = (x, y) => { const r = f.terrain[y]; return r ? r[x] : '#'; };
  let nb = 0, badCell = [], badHud = [], badView = [];
  for (const s of run.bolts) for (const b of s.list) { nb++;
    const [x, y, h] = b, cx = Math.floor(x / T), cy = Math.floor(y / T);
    if (terr(cx, cy) !== 'z') badCell.push([cx, cy, terr(cx, cy)]);
    for (let yy = y - h + 2; yy < y; yy += 8) { const ch = terr(cx, Math.floor(yy / T)); if (ch !== 'z' && ch !== '.') { badCell.push([cx, Math.floor(yy / T), ch, 'above']); break; } }
    if (x - 20 < s.view[0] || x + 20 > s.view[2] || y - h < s.view[1] || y > s.view[3]) badView.push([x, y, h]);
    for (const hb of s.hud) if (x + 20 > hb[0] && x - 20 < hb[2] && y > hb[1] && y - h < hb[3]) badHud.push([x, y, hb[4]]); }
  F.info('stormreach bolts', JSON.stringify(run.bolts.map(s => s.list)));
  F.ok(nb > 0 && run.bolts.every(s => s.list.length === s.visible.length), 'Stormreach: the bolts drawn are the bolts placed (their landing is known)', `${nb} bolts over ${run.bolts.length} strikes`);
  F.ok(nb > 0 && !badCell.length, 'Stormreach: every bolt lands on a stone of the terrace and stands over terrace stone, never over sky or wall', JSON.stringify(badCell.slice(0, 5)));
  F.ok(nb > 0 && !badView.length && !badHud.length, 'Stormreach: no bolt is drawn under the stick, the tabs or the HUD, nor cut by the screen edge', JSON.stringify({ hud: badHud.slice(0, 4), view: badView.slice(0, 4) }));
  // how visible is the warning? the mean colour change over group 0's cells on screen (inner 80 % of each), against the same
  // view when nothing on screen glows, at the start, a third and two thirds into the warning (frozen frames)
  const calmQ = 'const on = g => { const l = ((g * M.gap - S.tick) % M.period + M.period) % M.period, u = ((S.tick - g * M.gap) % M.period + M.period) % M.period; return l <= M.glow + 0.3 || u < M.strike + 0.3; }; return !on(0) && !on(2);';
  const cells0 = f.mechanic.strikeGroups.flatMap((row, y) => [...row].map((ch, x) => ch === '0' ? [x, y] : null).filter(Boolean));
  async function grabCells() { const cam = await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx().scene.cameras.main, v = c.worldView; return [v.x, v.y, v.width, v.height]; });
    const img = await F.grab(page), k = img.w / cam[2], out = [];
    for (const [x, y] of cells0) { const sx0 = (x * T - cam[0]) * k, sy0 = (y * T - cam[1]) * k, n = T * k; if (sx0 < 0 || sy0 < 0 || sx0 + n > img.w || sy0 + n > img.h * 0.62) continue;
      for (let yy = sy0 + n * 0.1; yy < sy0 + n * 0.9; yy += 3) for (let xx = sx0 + n * 0.1; xx < sx0 + n * 0.9; xx += 3) out.push(F.px(img, xx, yy)); }
    return out; }
  const vis = {};
  if (await freeze(page, calmQ)) { const base = await grabCells(); await thaw(page);
    for (const k of [0.95, 0.66, 0.33]) { if (!(await freeze(page, `const left = ((0 * M.gap - S.tick) % M.period + M.period) % M.period; return left > M.glow * ${k} - 0.35 && left < M.glow * ${k};`))) continue;
      const now = await grabCells(); await thaw(page); let d = 0; for (let i = 0; i < Math.min(base.length, now.length); i++) d += (Math.abs(now[i][0] - base[i][0]) + Math.abs(now[i][1] - base[i][1]) + Math.abs(now[i][2] - base[i][2])) / 3;
      vis[k] = base.length ? +(d / base.length).toFixed(1) : null; } }
  F.info('stormreach warning visibility: mean colour change on the warned cells at 95 %, 66 %, 33 % of the warning time left', JSON.stringify(vis));
  const OLD = { 0.95: 25.4, 0.66: 35.6, 0.33: 41.8 };                       // measured the same way on the old square cells (37de040, 2026-11-27)
  F.ok(Object.keys(OLD).every(k => vis[k] !== undefined && vis[k] !== null && vis[k] >= OLD[k] * 0.95), 'Stormreach: the warning is at least as visible as the old square cells at every stage', JSON.stringify({ now: vis, old: OLD }));
  // pictures: a late moment of a warning, and a strike
  if (SHOTS) {
    if (await freeze(page, 'const g = 0, left = ((g * M.gap - S.tick) % M.period + M.period) % M.period; return left > 0.6 && left < 1.4;')) { await shot(page, 'stormreach-warning'); await thaw(page); }
    if (await freeze(page, 'const g = 0, u = ((S.tick - g * M.gap) % M.period + M.period) % M.period; return u > 0.15 && u < 0.6;')) { await shot(page, 'stormreach-strike'); await thaw(page); }
    const L = k => `const g = 0, left = ((g * M.gap - S.tick) % M.period + M.period) % M.period; return left > M.glow * ${k} - 0.3 && left < M.glow * ${k};`;
    await strip(page, 'stormreach-warning', [L(0.98), L(0.62), L(0.3), 'const g = 0, u = ((S.tick - g * M.gap) % M.period + M.period) % M.period; return u > 0.1 && u < 0.7;']);
  }
}

// put her soles at world px (x, y): the hero sprite moves with its own foot offset
const place = (page, x, y) => page.evaluate(([x, y]) => { const c = window.__QOK_DNG2__.ctx(), sc = c.scene, h = c.hero(), dy = h.footY - h.y;
  sc.hero.x = x; sc.hero.y = y - dy; sc.heroTileX = Math.floor(x / 48); sc.heroTileY = Math.floor(y / 48); return true; }, [x, y]);

// ---- Demon Barracks (DC-04) ----------------------------------------------------------------------
async function guard(page) {
  const f = fl('demonBarracks', 5);
  await seed(page, 'demonBarracks', 5, F.landing(f));
  F.ok(await waitSt(page, 'S && S.ok && S.spr'), 'Demon Barracks 5F: the guard module is running');
  // stand two cells from where guard 0 stands at tick 0 of its beat (the pictures' moment). Being seen would start a
  // battle: the module's grace is held for this read (a test of the look only; the catch rule is the mech probe's).
  const spot = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, M = S.M, p = M.guards[0].seq[0]; S.grace = 1e12; let best = null;
    for (let y = p[1] - 4; y <= p[1] + 4; y++) for (let x = p[0] - 4; x <= p[0] + 4; x++) { if (c.terrain(x, y) !== '.') continue;
      const d = Math.max(Math.abs(x - p[0]), Math.abs(y - p[1])); if (d < 2) continue; const k = d * 10 + Math.abs(y - p[1]); if (!best || k < best[2]) best = [x, y, k]; }
    return best;
  });
  F.info('barracks spot', JSON.stringify(spot));
  if (spot) { await place(page, spot[0] * T + 24, spot[1] * T + 30); await sleep(page, 900); }
  const r = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, M = S.M, sc = c.scene, out = { light: S.spr.light ? (S.spr.light.commandBuffer || []).length : null, guards: [] };
    const a = ((Math.floor(S.tick) % M.period) + M.period) % M.period;
    for (const g of M.guards) { if (g.gone) continue; const e = S.spr.g[g.id]; if (!e) continue; const o = { id: g.id, lamp: e.lamp.texture.key, lampW: e.lamp.width, lampH: e.lamp.height, halo: e.halo ? +e.halo.alpha.toFixed(2) : null, pools: [] };
      const lit = c.mod.logic.litBy(c, M, g, S.tick), pos = g.seq[a];
      if (e.pool) { const im = e.pool[0], t = sc.textures.get(im.texture.key).getSourceImage(), cx = t.getContext('2d'), d = cx.getImageData(0, 0, t.width, t.height).data, k = im.scaleX;
        const at = (wx, wy) => { const u = Math.floor((wx - im.x) / k), v = Math.floor((wy - im.y) / k); return (u < 0 || v < 0 || u >= t.width || v >= t.height) ? 0 : d[(v * t.width + u) * 4 + 3]; };
        let border = 0; for (let i = 0; i < t.width; i++) border = Math.max(border, d[i * 4 + 3], d[((t.height - 1) * t.width + i) * 4 + 3], d[(i * t.width) * 4 + 3], d[(i * t.width + t.width - 1) * 4 + 3]);
        let litMin = 255, cornerMin = 255, darkMax = 0, nLit = 0, nDark = 0;
        for (let y = pos[1] - 9; y <= pos[1] + 9; y++) for (let x = pos[0] - 9; x <= pos[0] + 9; x++) { const key = x + ',' + y;
          if (lit[key]) { nLit++; litMin = Math.min(litMin, at((x + 0.5) * 48, (y + 0.5) * 48)); for (const [u, v] of [[0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]]) cornerMin = Math.min(cornerMin, at((x + u) * 48, (y + v) * 48)); }
          else { let near = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (lit[(x + dx) + ',' + (y + dy)]) near = true; if (!near) { nDark++; darkMax = Math.max(darkMax, at((x + 0.5) * 48, (y + 0.5) * 48)); } } }
        o.pools.push({ visible: im.visible, alpha: +im.alpha.toFixed(2), border, nLit, litMin, cornerMin, nDark, darkMax, blend: im.blendMode }); }
      out.guards.push(o); }
    return out;
  });
  F.info('barracks 5F guards', JSON.stringify(r));
  F.ok(r.light === null || r.light === 0, 'Barracks: the lantern light is not drawn as filled square cells', `${r.light} commands in the old cell layer`);
  const P = r.guards.map(g => g.pools[0]).filter(p => p && p.visible);             // a pool off screen is not drawn (nor redrawn) until it comes into view
  F.ok(P.length > 0 && P.every(p => p.border <= 2), 'Barracks: every guard\'s light is one soft pool, clear at its border (no grid lines, no square edge)', P.map(p => p.border).join(' '));
  F.ok(P.length > 0 && P.every(p => p.nLit > 0 && p.litMin >= 100 && p.cornerMin >= 70), 'Barracks: the pool covers every lit cell, into its corners, at the old cells\' strength (the cells that catch her are all inside the light)', P.map(p => `${p.nLit} cells, centres >= ${p.litMin}, corners >= ${p.cornerMin}`).join('; '));
  F.ok(P.length > 0 && P.every(p => p.darkMax <= 40), 'Barracks: a cell a full cell away from the lit ones stays dark (the pool does not spread the light)', P.map(p => p.darkMax).join(' '));
  F.ok(r.guards.length > 0 && r.guards.every(g => g.lamp === 'd2b_lantern2' && g.halo >= 0.5), 'Barracks: every guard carries a drawn lantern with a glow', r.guards.map(g => `${g.lamp} ${g.halo}`).join('; '));
  if (SHOTS && await freeze(page, 'return ((Math.floor(S.tick) % M.period) + M.period) % M.period === 0 && S.tick % 1 > 0.3;', 20000)) { await shot(page, 'barracks-light'); await thaw(page); }
  // DC-04's lone lit cells: from the census's own spot (the floor's middle), over one beat, which guard lights the cells on screen
  const mid = F.midCell(f, F.landing(f));
  await place(page, mid[0] * T + 24, mid[1] * T + 30); await sleep(page, 600);
  const lone = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, M = S.M, v = c.scene.cameras.main.worldView, out = { cellsOnScreen: 0, byGuardOffScreen: 0, ex: null };
    for (let t = 0; t < M.period; t++) for (const g of M.guards) { if (g.gone) continue; const p = g.seq[t], gx = (p[0] + 0.5) * 48, gy = (p[1] + 0.5) * 48, gOn = gx > v.x && gx < v.right && gy - 60 > v.y && gy < v.bottom;
      const lit = c.mod.logic.litBy(c, M, g, t); for (const k in lit) { const [x, y] = k.split(',').map(Number); if ((x + 1) * 48 <= v.x || x * 48 >= v.right || (y + 1) * 48 <= v.y || y * 48 >= v.bottom) continue;
        out.cellsOnScreen++; if (!gOn) { out.byGuardOffScreen++; if (!out.ex) out.ex = { tick: t, guard: g.id, guardCell: [p[0], p[1]], cell: [x, y], dist: Math.hypot(x - p[0], y - p[1]).toFixed(1) }; } } }
    return out;
  });
  F.info('barracks 5F, the census spot: lit cells on screen over one beat, and how many belong to a guard off screen (the far end of its cone)', JSON.stringify(lone));
}

// ---- Demon Castle mirror rooms (DC-05) -----------------------------------------------------------
async function mirror(page) {
  const f = fl('demonCastle', 1), R = f.mechanic.rooms[0], at = F.nearestWalk(f, (R.rect[0] + R.rect[2]) >> 1, (R.rect[1] + R.rect[3]) >> 1);
  await seed(page, 'demonCastle', 1, at);
  F.ok(await waitSt(page, 'S && S.spr && S.swap === true'), 'Demon Castle 1F: inside the mirror room her controls are swapped');
  await sleep(page, 700);
  const read = () => page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, b = S.spr.badge, ch = document.getElementById('d2mSwapChip'), dp = document.getElementById('dpad'), tk = document.getElementById('a1mInteract');
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
    return { swap: S.swap, badge: { visible: b.visible, alpha: +b.alpha.toFixed(2) }, chip: ch ? { rect: rect(ch), op: +getComputedStyle(ch).opacity, shown: ch.checkVisibility ? ch.checkVisibility() : true } : null, dpad: rect(dp), talk: tk && tk.classList.contains('a1m-show') ? rect(tk) : null };
  });
  const r = await read();
  F.info('demon castle 1F, in the mirror room', JSON.stringify(r));
  F.ok(!(r.badge.visible && r.badge.alpha > 0.05), 'Demon Castle: no swap badge floats over her head in the scene', JSON.stringify(r.badge));
  F.ok(r.chip && r.chip.op >= 0.9 && r.chip.shown, 'Demon Castle: the swap mark is shown with the controls while her controls are swapped', JSON.stringify(r.chip));
  const c = r.chip && r.chip.rect, d = r.dpad;
  F.ok(c && d && c[3] <= d[1] && c[3] >= d[1] - 60 && c[2] > d[0] && c[0] < d[2], 'Demon Castle: the swap mark sits just above the stick (where the Talk pill goes), not in the scene', JSON.stringify({ chip: c, dpad: d }));
  F.ok(!r.talk || !c || c[2] <= r.talk[0] || c[0] >= r.talk[2] || c[3] <= r.talk[1] || c[1] >= r.talk[3], 'Demon Castle: the swap mark never covers the Talk pill', JSON.stringify({ chip: c, talk: r.talk }));
  if (SHOTS) await shot(page, 'castle-mirror-swap');
  // out of the room: the mark fades away
  const out = F.nearestWalk(f, R.rect[0] - 4, (R.rect[1] + R.rect[3]) >> 1);
  if (out) { await place(page, out[0] * T + 24, out[1] * T + 30); await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(); c.state.latch = null; }); }
  await waitSt(page, 'S && S.swap === false', 8000); await sleep(page, 900);
  const r2 = await read();
  F.ok(r2.swap === false && (!r2.chip || r2.chip.op <= 0.05) && !(r2.badge.visible && r2.badge.alpha > 0.05), 'Demon Castle: outside the room the mark is gone', JSON.stringify(r2));
}

// ---- Frostfall Cavern push-ice (DC-10) -----------------------------------------------------------
async function ice(page) {
  const f = fl('frostfallCavern', 1), Rm = f.mechanic.rooms[0], b = Rm.blocks[0];
  const bx = (Rm.origin[0] + 2 * b[0]) * T, by = (Rm.origin[1] + 2 * b[1]) * T;   // the block's cell (96 px), top left
  await seed(page, 'frostfallCavern', 1, F.nearestWalk(f, Rm.origin[0] - 2, Rm.origin[1] + 2 * b[1] + 1) || F.landing(f));
  F.ok(await waitSt(page, 'S && S.spr && S.spr.blk'), 'Frostfall 1F: the push-ice module is running');
  await place(page, bx - 12, by + 52); await sleep(page, 700);
  const r = await page.evaluate(([bx, by]) => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, h = sc.hero, e = Object.values(S.spr.blk).find(o => o.visible && Math.abs(o.x - (bx + 48)) < 4);
    if (!e) return null;
    const hb = h.getBounds(), crop = e.isCropped && e._crop ? [e._crop.x, e._crop.y, e._crop.width, e._crop.height] : [0, 0, e.width, e.height];
    const x0 = e.x - e.displayWidth * e.originX + crop[0] * e.scaleX, y0 = e.y - e.displayHeight * e.originY + crop[1] * e.scaleY, x1 = x0 + crop[2] * e.scaleX, y1 = y0 + crop[3] * e.scaleY;
    // her body: the middle 60 % of her picture's width, from her head to her soles
    const bx0 = hb.x + hb.width * 0.2, bx1 = hb.right - hb.width * 0.2, ov = Math.max(0, Math.min(x1, bx1) - Math.max(x0, bx0)) * Math.max(0, Math.min(y1, hb.bottom) - Math.max(y0, hb.y));
    return { heroDepth: h.depth, blockDepth: e.depth, under: e.under ? { depth: e.under.depth, visible: e.under.visible, x: e.under.x, y: e.under.y } : null, front: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)],
      body: [Math.round(bx0), Math.round(hb.y), Math.round(bx1), Math.round(hb.bottom)], overlap: Math.round(ov), bodyArea: Math.round((bx1 - bx0) * hb.height) };
  }, [bx, by]);
  F.info('frostfall 1F, beside the block', JSON.stringify(r));
  F.ok(r && (r.blockDepth < r.heroDepth || r.overlap <= r.bodyArea * 0.04), 'Frostfall: standing left of the block, no part of her body is hidden by the block\'s floor plinth', r ? `${r.overlap} of ${r.bodyArea} px^2 of her body under a picture drawn in front of her` : 'no block');
  F.ok(r && (!r.under || (r.under.visible && r.under.depth < r.heroDepth && Math.abs(r.under.x - (bx + 48)) < 2)), 'Frostfall: the plinth (the whole block picture) still lies on the floor under her, at the block\'s place', r ? JSON.stringify(r.under) : '');
  if (SHOTS) await shot(page, 'frostfall-block');
}

// ---- Void Rift (DC-14) ---------------------------------------------------------------------------
async function voidr(page) {
  const f = fl('voidRift', 1), L0 = f.mechanic.gates[0].lanes[0];
  await seed(page, 'voidRift', 1, F.nearestWalk(f, L0.x - 3, L0.yCentre) || F.landing(f));
  F.ok(await waitSt(page, 'S && S.spr && S.gates && S.gates.some(G => G.joins && G.joins.length)', 30000), 'Void Rift 1F: a block docked (an open join)');
  await sleep(page, 200);
  const r = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, n = S.gates.reduce((a, G) => a + G.joins.length, 0), vis = S.spr.glow.filter(g => g.visible);
    return { joins: n, glows: vis.map(g => ({ type: g.type, key: g.texture ? g.texture.key : null, w: Math.round(g.displayWidth), h: Math.round(g.displayHeight), rot: +g.rotation.toFixed(2), a: +g.alpha.toFixed(2) })) };
  });
  F.info('void rift 1F', JSON.stringify(r));
  F.ok(r.glows.length === r.joins && r.joins > 0, 'Void Rift: one light per open join, exactly while it is open (rule unchanged)', `${r.glows.length} lights, ${r.joins} joins`);
  F.ok(r.glows.length > 0 && r.glows.every(g => g.type === 'Image' && g.key === 'd2b_joinglow'), 'Void Rift: the join is not drawn as a hard pale bar (a soft light picture instead)', r.glows.map(g => g.type + ':' + g.key).join(' '));
  const tx = await texAlpha(page, 'd2b_joinglow', [[16, 32]]);
  F.ok(tx && tx.border <= 16 && tx.at[0] >= 200, 'Void Rift: the join light fades out to both sides and both ends (no hard edge)', JSON.stringify(tx));
  if (SHOTS) {                                                               // the picture: beside the join, the moment it is open
    const e = await page.evaluate(() => { const S = window.__QOK_DNG2__.ctx().state; for (const G of S.gates) for (const j of G.joins) if (j.kind === 'ledgeL') return j.edge; for (const G of S.gates) if (G.joins.length) return G.joins[0].edge; return null; });
    if (e) { await place(page, e[0] - 40, (e[1] + e[3]) / 2 + 10); await sleep(page, 500); }
    if (await freeze(page, 'return S.gates.some(G => G.joins.some(j => j.kind === "ledgeL"));', 30000)) { await sleep(page, 300); await shot(page, 'voidrift-join'); await thaw(page); }
  }
}

// ---- Twilight Sanctum portals (DC-23) ------------------------------------------------------------
async function portal(page) {
  const f = fl('twilightDungeon', 1), p0 = f.mech.find(m => m.kind === 'portal');
  await seed(page, 'twilightDungeon', 1, F.nearestWalk(f, p0.x - 2, p0.y) || F.landing(f));
  F.ok(await waitSt(page, 'S && S.spr && S.spr.length'), 'Twilight 1F: the portal module is running');
  const read = () => page.evaluate(() => { const S = window.__QOK_DNG2__.ctx().state; return S.spr.map((e, i) => ({ i, rot: e.pool ? e.pool.rotation : null, a: e.pool ? +e.pool.alpha.toFixed(2) : null, vis: e.pool ? e.pool.visible : null })); });
  const a = await read(); await sleep(page, 1500); const b = await read();
  const turn = a.map((x, i) => x.rot === null ? null : Math.abs(((b[i].rot - x.rot) + Math.PI * 3) % (Math.PI * 2) - Math.PI));
  F.info('twilight 1F pools', JSON.stringify({ a, b }));
  F.ok(turn.length > 0 && turn.every(t => t !== null && t > 0.6), 'Twilight: the pool of every portal turns (over a third of a turn... at least 0.6 rad in 1.5 s)', turn.map(t => t === null ? 'none' : t.toFixed(2)).join(' '));
  if (SHOTS) await strip(page, 'twilight-portal', 4, 500);
  // standing on a pad that she arrived on (asleep), it still turns, slower
  await place(page, p0.x * T + 24, p0.y * T + 30); await sleep(page, 2500);
  const c = await read(); await sleep(page, 1500); const d = await read();
  const t2 = c.map((x, i) => x.rot === null ? null : Math.abs(((d[i].rot - x.rot) + Math.PI * 3) % (Math.PI * 2) - Math.PI));
  F.ok(t2.length > 0 && t2.every(t => t !== null && t > 0.3), 'Twilight: after a hop (a pad asleep under her) every pool still turns', t2.map(t => t === null ? 'none' : t.toFixed(2)).join(' '));
}

// ---- Desert Tomb glyph plates (DB-07, DB-06) -----------------------------------------------------
async function glyph(page) {
  for (const n of [1, 5]) {
    const f = fl('desertTomb', n), tb = f.mech.find(m => m.kind === 'tablet');
    await seed(page, 'desertTomb', n, F.nearestWalk(f, tb.x, tb.y + 2) || [tb.x, tb.y + 1]);
    F.ok(await waitSt(page, 'S && S.tablets && S.tablets.length'), `Desert Tomb ${n}F: the glyph module is running`);
    await place(page, tb.x * T + 24, (tb.y + 1) * T + 30); await sleep(page, 900);
    const r = await page.evaluate(([tx, ty]) => {
      const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, T0 = S.tablets.find(t => t.x === tx && t.y === ty), v = sc.cameras.main.worldView;
      const boxes = sc.children.list.filter(o => o.texture && /d2a_tabpanel/.test(o.texture.key) && o.visible && o.alpha > 0.05).length;
      const p = T0.panel[0], stele = S.sort.find(o => o.texture && /d2a_tablet/.test(o.texture.key) && Math.abs(o.x - (tx * 48 + 24)) < 2);
      return { boxes, panelKey: p.texture.key, alpha: +p.alpha.toFixed(2), px: p.x, py: p.y, pw: p.displayWidth, ph: p.displayHeight, items: T0.panel.length, stele: stele ? stele.texture.key : null, steleTop: stele ? stele.y - stele.displayHeight * stele.originY : null,
        view: [v.x, v.right], order: T0.V.R.order };
    }, [tb.x, tb.y]);
    F.info(`desert tomb ${n}F tablet`, JSON.stringify(r));
    const cx = tb.x * T + 24, clamped = r.px - r.pw / 2 <= r.view[0] + 8 || r.px + r.pw / 2 >= r.view[1] - 8;
    F.ok(r.boxes === 0 && /d2a_slab_/.test(r.panelKey) && r.items === 1, `Desert Tomb ${n}F: the order is not shown in a UI box (one carved slab instead)`, `${r.boxes} box(es), panel ${r.panelKey}`);
    F.ok(r.alpha >= 0.95 && (Math.abs(r.px - cx) <= 2 || clamped) && r.py + r.ph / 2 <= r.steleTop + 8 && r.py + r.ph / 2 >= r.steleTop - 40, `Desert Tomb ${n}F: the slab stands directly over the stele while she reads it`, `slab centre ${Math.round(r.px)},${Math.round(r.py)} h ${r.ph}, stele x ${cx} top ${r.steleTop}`);
    F.ok(r.stele === 'd2a_tablet2', `Desert Tomb ${n}F: the stele no longer carries glyphs of its own that contradict the order`, r.stele);
    if (SHOTS) await shot(page, `tomb-f${n}-tablet`);
  }
  // pressed plates: the first plate of the order lit (progress 1), she stands on another plate: both sink; every other plate looks the same
  const r = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, V = S.rooms[0]; V.n = 1; c.mod._paint ? c.mod._paint(c, V) : null;
    const keys = Object.keys(V.B.plates), lit = V.R.path[0].join(','), other = keys.find(k => k !== lit && V.R.path.findIndex(p => p.join(',') === k) !== 1) || keys.find(k => k !== lit);
    return { lit, other, p: V.B.plates[other] };
  });
  await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(); c.state.grace = 1e9; });           // standing on a wrong plate must not start the guardian here: this reads the look only
  await place(page, (r.p.x0 + r.p.x1) / 2, (r.p.y0 + r.p.y1) / 2); await sleep(page, 900);
  const q = await page.evaluate(([lit, other]) => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, V = S.rooms[0], out = {};
    for (const k in V.imgs) { const im = V.imgs[k], sk = V.sinks ? V.sinks[k] : null; out[k] = { tint: im.tintTopLeft, a: +im.alpha.toFixed(2), dy: Math.round(im.y - (V.B.plates[k].y0 + V.B.plates[k].y1) / 2), sink: sk ? +sk.alpha.toFixed(2) : null, glow: +V.glows[k].alpha.toFixed(2), scale: +im.scaleX.toFixed(2) }; }
    return { lit, other, plates: out };
  }, [r.lit, r.other]);
  F.info('desert tomb 5F plates (main room)', JSON.stringify(q));
  const P = q.plates, rest = Object.keys(P).filter(k => k !== q.lit && k !== q.other);
  F.ok(P[q.lit].sink >= 0.95 && P[q.lit].dy >= 2, 'Desert Tomb: a lit plate is drawn sunk (shadowed edge, glyph lower)', JSON.stringify(P[q.lit]));
  F.ok(P[q.other].sink >= 0.95, 'Desert Tomb: the plate under her soles is drawn pressed', JSON.stringify(P[q.other]));
  const same = rest.every(k => JSON.stringify(P[k]) === JSON.stringify(P[rest[0]]));
  F.ok(rest.length > 0 && same && P[rest[0]].sink === 0 && P[rest[0]].dy === 0, 'Desert Tomb: no unlit plate is marked (every one not lit and not under her looks the same: the next one is not shown)', JSON.stringify(rest.map(k => P[k])).slice(0, 300));
  if (SHOTS) await shot(page, 'tomb-plates');
}

// ---- Scorched Ruins draught (DB-15) --------------------------------------------------------------
async function ash(page) {
  const f = fl('scorchedRuins', 5), hint = f.mech.find(m => m.kind === 'hint' && m.type === 'draught in the ash'), sec = f.mechanic.secrets[hint.secret];
  await seed(page, 'scorchedRuins', 5, F.nearestWalk(f, hint.x + 2, hint.y) || F.landing(f));
  await place(page, (hint.x + 1) * T + 24, (hint.y + 2) * T + 30);           // a little below the crack's front: the crack at the screen's middle
  F.ok(await waitSt(page, 'S && S.hints && S.hints.length'), 'Scorched Ruins 5F: the crack module is running');
  const run = await page.evaluate(() => new Promise(res => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, h = S.hints.find(x => x.type === 'draught in the ash'); const t0 = performance.now(); let frames = 0, maxVis = 0, travel = 0, gusts = 0, lastN = 0;
    if (!h || !h.dr) return res({ none: true, objs: sc.children.list.filter(o => o.texture && o.texture.key === 'd2a_ashpuff').length });
    const D = h.dr;
    function step() { frames++; let n = 0; for (const m of D.motes) if (m.img.visible) { n++; travel = Math.max(travel, (m.img.x - D.fx) * D.ux + (m.img.y - D.fy) * D.uy); }
      if (n > lastN + 2) gusts++; lastN = n; maxVis = Math.max(maxVis, n);
      if (performance.now() - t0 > 5600) { sc.events.off('postupdate', step); res({ frames, maxVis, travel: Math.round(travel), gusts, depth: D.motes[0].img.depth, from: [D.fx, D.fy], dir: [+D.ux.toFixed(2), +D.uy.toFixed(2)] }); } }
    sc.events.on('postupdate', step);
  }));
  F.info('scorched ruins 5F draught', JSON.stringify(run));
  F.ok(!run.none && run.maxVis >= 4, 'Scorched Ruins: ash visibly drifts out of the crack (several motes at once)', `${run.maxVis || 0} motes at most`);
  F.ok(!run.none && run.travel >= 48 && run.travel <= 140, 'Scorched Ruins: the ash travels about a cell or two from the wall, then is gone (a hint, not a trail to follow)', `${run.travel || 0} px`);
  F.ok(!run.none && run.depth < 3, 'Scorched Ruins: the ash lies on the floor (under her, no glow, no marker)', `depth ${run.depth}`);
  const ph = (a, b) => `return S.t % 2600 > ${a} && S.t % 2600 < ${b};`;
  // how much a breath changes the picture: screen px (at this dpr) that differ by more than 30 between the quiet moment just
  // before a breath and the breath at its fullest, inside the 4 x 4 cells in front of the crack (the census measured 100 to
  // 500 px over 4 s on the old picture)
  async function region() { const cam = await page.evaluate(() => { const v = window.__QOK_DNG2__.ctx().scene.cameras.main.worldView; return [v.x, v.y, v.width]; });
    const img = await F.grab(page), k = img.w / cam[2], out = []; const x0 = (sec.front[0] - 0.5) * T, y0 = (sec.front[1] - 1.5) * T;
    for (let y = y0; y < y0 + 4 * T; y += 1 / k) for (let x = x0; x < x0 + 4 * T; x += 1 / k) { const sx = (x - cam[0]) * k, sy = (y - cam[1]) * k; if (sx >= 0 && sy >= 0 && sx < img.w && sy < img.h) out.push(F.px(img, sx, sy)); }
    return out; }
  let moved = null;
  if (await freeze(page, ph(2480, 2580))) { const a1 = await region(); await thaw(page);
    if (await freeze(page, ph(600, 700))) { const a2 = await region(); await thaw(page); moved = 0;
      for (let i = 0; i < Math.min(a1.length, a2.length); i++) if (Math.max(Math.abs(a1[i][0] - a2[i][0]), Math.abs(a1[i][1] - a2[i][1]), Math.abs(a1[i][2] - a2[i][2])) > 30) moved++; } }
  F.info('scorched ruins: screen px in front of the crack that a breath changes (quiet vs fullest)', String(moved));
  F.ok(moved !== null && moved >= 250, 'Scorched Ruins: a breath of the draught changes the picture several times more than the old breathing patch did (old: about 50 px)', `${moved} px`);
  if (SHOTS) await strip(page, 'scorched-draught', [ph(250, 330), ph(650, 730), ph(1100, 1180), ph(1600, 1680)]);
}

// ---- Oasis Depths sluice wheels (DB-09) ----------------------------------------------------------
async function sluice(page) {
  const f = fl('oasisDepths', 4);
  await seed(page, 'oasisDepths', 4, F.landing(f));
  F.ok(await waitSt(page, 'S && S.wheels && S.wheels.length'), 'Oasis Depths 4F: the sluice module is running');
  await sleep(page, 900);
  const r = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, h = sc.hero, z = sc.cameras.main.zoom || 1;
    return S.wheels.map(w => ({ id: w.id, key: w.img.texture.key, dist: Math.round(Math.hypot(w.img.x - h.x, w.img.y - h.y) * z), tint: w.img.tintTopLeft & 0xff, base: w.base.tintTopLeft & 0xff, rot: +w.img.rotation.toFixed(2) }));
  });
  F.info('oasis depths 4F wheels', JSON.stringify(r));
  const far = r.filter(w => w.dist > 330), near = r.filter(w => w.dist < 100);
  F.ok(far.length > 0 && far.every(w => w.tint <= 40 && w.base <= 40), 'Oasis Depths: a wheel far outside her light is as dark as the floor around it (not bright in the black)', JSON.stringify(far));
  if (SHOTS) await shot(page, 'oasis-entry');
  // beside a wheel: undimmed
  const w1 = f.mechanic.wheels[0], nb = F.nearestWalk(f, w1.at[0], w1.at[1] + 1) || [w1.at[0], w1.at[1] + 1];
  await place(page, nb[0] * T + 24, nb[1] * T + 30); await sleep(page, 800);
  const r2 = await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(), S = c.state, h = c.scene.hero, z = c.scene.cameras.main.zoom || 1;
    return S.wheels.map(w => ({ id: w.id, dist: Math.round(Math.hypot(w.img.x - h.x, w.img.y - h.y) * z), tint: w.img.tintTopLeft & 0xff })); });
  const near2 = r2.filter(w => w.dist < 110);
  F.ok(near2.length > 0 && near2.every(w => w.tint >= 250), 'Oasis Depths: a wheel in her light is undimmed', JSON.stringify(r2));
  F.ok(r.length > 0 && r.every(w => /d2c_wheel2_/.test(w.key)), 'Oasis Depths: each wheel shows its state by a handle on the marked spoke and names itself by an inlay shape, not by colour alone', r.map(w => w.key).join(' '));
  if (SHOTS) await shot(page, 'oasis-wheels');
  const shapes = await page.evaluate(() => { const sc = window.__QOK_DNG2__.ctx().scene, out = {};
    for (const id of [1, 2, 3]) { try { const t = sc.textures.get('d2c_wheel2_' + id).getSourceImage(), d = t.getContext('2d').getImageData(17, 17, 14, 14).data; let s = ''; for (let i = 0; i < d.length; i += 4) s += d[i] > 150 && d[i + 1] < 120 ? 1 : 0; out[id] = s; } catch (e) { out[id] = null; } }
    return out; });
  return shapes;
}

const GROUPS = [['storm', storm], ['guard', guard], ['mirror', mirror], ['ice', ice], ['void', voidr], ['portal', portal], ['glyph', glyph], ['ash', ash], ['sluice', sluice]];
(async () => {
  const { browser, page, errors } = await F.L.launch({ dpr: +(process.env.FIELD_DPR || 2) });
  for (const [name, fn] of GROUPS) {
    if (!on(name)) continue;
    const e0 = errors.length;
    try { await fn(page); } catch (e) { F.ok(false, `${name}: check ran`, String(e && e.stack || e).slice(0, 300)); }
    const mine = errors.slice(e0).filter(e => e.t === 'pageerror');
    F.ok(!mine.length, `${name}: no page error while it ran`, JSON.stringify(mine.slice(0, 3)).slice(0, 400));
  }
  await browser.close();
  F.done('dungeon-looks-fd2');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
