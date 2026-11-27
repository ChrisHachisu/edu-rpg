'use strict';
// Dungeon looks, day 4, worker FD1 (2026-11-27). The LOOK changed, the rules did not: these lines
// read the objects the game drew (and a few screen pixels where only the picture can tell).
//   public/acts-dungeons/modules/d4-looks.js      mouth glow, map-edge fade, rim light, boss art (switch)
//   public/acts-dungeons/modules/mine-carts.js    no arrow badge; bolder point blades; levers take the lamp's falloff
//   public/acts-dungeons/modules/shadow-freeze.js the shadow's reach is a soft breathing pool, not a square; crystal rim
//   public/acts-dungeons/modules/gust-walkways.js no chevrons; travelling air in warn and gust; nothing in a lull
// Switches: localStorage qok-d4-looks=0 (old looks), qok-boss-field=art (boss painting on the field, off by default).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5571/ node scripts/auto/checks/dungeon-looks-fd1.cjs [group ...]
//   groups: mine shadow gust mouth edge rim boss   (default: all)
// It FAILS on a build without the fixes (and with FIELD_LS=qok-d4-looks=0 on a build that has them).
const F = require('./field-lib.cjs');
const T = 48;
const want = process.argv.slice(2), on = g => !want.length || want.includes(g);
const fl = (id, n) => F.floorOf(id, n);
const sleep = (page, ms) => page.waitForTimeout(ms);
const d4 = page => page.evaluate(() => (window.__QOK_D4LOOKS__ ? window.__QOK_D4LOOKS__.state() : null));
const st = expr => `(() => { const c = window.__QOK_DNG2__ && window.__QOK_DNG2__.ctx(); const S = c && c.state; return !!(${expr}); })()`;
const waitSt = (page, expr, ms = 30000) => page.waitForFunction(st(expr), null, { timeout: ms, polling: 30 }).then(() => true).catch(() => false);
async function seed(page, id, n, at, flags) { const p = await F.seedDungeon(page, id, n, at, flags ? { flags } : {}); await F.dismiss(page); return p; }
// world point -> screenshot pixel
async function camOf(page) { return page.evaluate(() => { const c = window.__PHASER_GAME__.scene.getScene('WorldMapScene').cameras.main; return { x: c.worldView.x, y: c.worldView.y, w: c.worldView.width, h: c.worldView.height }; }); }
const lum = c => (c[0] + c[1] + c[2]) / 3;

async function mine(page) {
  // Iron Mine B3F has two levers; seeded where the census stood, one of them is far outside her light.
  const f = fl('ironMine', 3), at = F.midCell(f, F.landing(f));
  await seed(page, 'ironMine', 3, at);
  const r = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, l = sc.children.list, out = { looks: S.looks, arrows: 0, arrowImgs: Object.keys(S.arrowImg || {}).length, blades: [], levers: [] };
    for (const o of l) if (o.texture && o.texture.key === 'd2a_arrow') out.arrows++;
    for (const jn in S.blades) { const cb = S.blades[jn].commandBuffer || []; let i = 0, maxBright = 0, n = 0;
      while (i < cb.length) { const k = cb[i++]; if (k === 6) { const w = cb[i++], col = cb[i++]; i++; if (col === 0xffe9a8 || col === 0xfffbe6) maxBright = Math.max(maxBright, w); } else if (k === 4 || k === 5) { i += 2; n++; } }
      out.blades.push({ jn, points: n, brightWidth: maxBright, depth: S.blades[jn].depth }); }
    const z = sc.cameras.main.zoom || 1;
    for (const jn in S.leverImg) { const o = S.leverImg[jn]; out.levers.push({ jn, dist: Math.round(Math.hypot(o.x - sc.hero.x, o.y - sc.hero.y) * z), tint: o.tintTopLeft, depth: o.depth }); }
    return out;
  });
  F.info('iron mine B3F', JSON.stringify(r));
  F.ok(r.arrows === 0 && r.arrowImgs === 0, 'Iron Mine: no arrow badge object on any junction or lever', `${r.arrows} arrow sprites in the scene`);
  F.ok(r.blades.length > 0 && r.blades.every(b => b.points >= 4 && b.brightWidth >= 3), 'Iron Mine: every junction shows its set lane with point blades (bright line 3 px or more)', JSON.stringify(r.blades));
  const far = r.levers.filter(l => l.dist > 330), near = r.levers.filter(l => l.dist < 100);
  F.ok(far.length > 0 && far.every(l => (l.tint & 0xff) <= 24), 'Iron Mine: a lever outside her light is as dark as the floor around it (not drawn bright in the black)', JSON.stringify(far));
  F.ok(r.levers.every(l => l.dist > 100 || (l.tint & 0xff) >= 250), 'Iron Mine: a lever in her light is undimmed', JSON.stringify(near));
  // pull a lever: the blades turn (rule unchanged) and no arrow appears
  const f4 = fl('ironMine', 4), lv = f4.mech.find(m => m.kind === 'lever');
  await seed(page, 'ironMine', 4, F.nearestWalk(f4, lv.x, lv.y));
  const pulled = await page.evaluate((jn) => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, J = S.N.junc[jn], D = c.mod._debug;
    const b0 = D.branchOf(c, S.N, J); const h = c.hero(); const p = c.mod.interact(c, J.lever.x * 48 + 24, J.lever.y * 48 + 48 + 6, null);
    if (!p || !p.act) return { why: 'no prompt beside the lever' };
    p.act(); const b1 = D.branchOf(c, S.N, J);
    let arrows = 0; for (const o of c.scene.children.list) if (o.texture && o.texture.key === 'd2a_arrow') arrows++;
    return { verb: p.verb, b0, b1, arrows, glint: S.glint ? S.glint[jn] : null };
  }, lv.junction);
  F.ok(pulled.b0 && pulled.b1 && pulled.b0 !== pulled.b1 && pulled.arrows === 0, 'Iron Mine: pulling the lever still switches the branch, with no arrow', JSON.stringify(pulled));
}

async function shadow(page) {
  const f = fl('shadowCave', 5), cr = f.mech.filter(m => m.kind === 'crystalLight')[0];
  await seed(page, 'shadowCave', 5, F.nearestWalk(f, cr.x, cr.y));
  F.ok(await waitSt(page, 'S && S.dim === true && S.shadows && S.shadows.length'), 'Shadow Cave B5F: a dim phase with shadows prowling was reached');
  await page.evaluate(() => { const S = window.__QOK_DNG2__.ctx().state; S.grace = 1e9; });   // not caught while the looks are read (catching is the probe's business)
  // she arrives late in a dim phase: read the looks early in the NEXT dim phase (a slow box would otherwise miss it)
  await waitSt(page, 'S && S.dim === false', 20000); await waitSt(page, 'S && S.dim === true', 20000);
  await sleep(page, 250);
  const r = await page.evaluate(() => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, cb = S.ring.commandBuffer || [];
    const out = { looks: S.looks, dim: S.dim, ringCmds: cb.length, shadows: [], crystals: [], darkDepth: S.dark.depth };
    for (const s of S.shadows) { const p = s.pool, o = { id: s.id, cell: [s.cx, s.cy], pool: !!p };
      if (p) { const zx = s.cx * 48 + 24, zy = s.cy * 48 + 24, R0 = 0.84;
        o.alpha = +p.alpha.toFixed(2); o.rimAlpha = +s.arim.alpha.toFixed(2); o.visible = p.visible && s.arim.visible; o.depth = p.depth; o.tex = p.texture.key;
        // the pool's rim (a 4th-power round square at R0 of its half size): does it reach the four corners of the 3x3?
        const hw = p.displayWidth / 2 * R0, hh = p.displayHeight / 2 * R0; let worst = 0;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const u = (zx + sx * 72 - p.x) / hw, v = (zy + sy * 72 - p.y) / hh; worst = Math.max(worst, Math.pow(u * u * u * u + v * v * v * v, 0.25)); }
        o.cornerAtRim = +worst.toFixed(3); o.size = [Math.round(p.displayWidth), Math.round(p.displayHeight)]; }
      out.shadows.push(o); }
    for (const k of S.crystals) out.crystals.push(k.rim ? { a: +k.rim.alpha.toFixed(2), depth: k.rim.depth, lit: k.img.texture.key } : null);
    // the pool texture: soft all the way round (its border is clear, its middle is not)
    try { const t = sc.textures.get('d2a_shadow_pool').getSourceImage(), g = t.getContext('2d'), w = t.width, d = g.getImageData(0, 0, w, w).data; let border = 0; for (let i = 0; i < w; i++) border = Math.max(border, d[i * 4 + 3], d[((w - 1) * w + i) * 4 + 3], d[(i * w) * 4 + 3], d[(i * w + w - 1) * 4 + 3]);
      out.poolTex = { border, centre: d[((w >> 1) * w + (w >> 1)) * 4 + 3] }; } catch (e) { out.poolTex = null; }
    return out;
  });
  F.info('shadow cave B5F (dim)', JSON.stringify(r));
  F.ok(r.ringCmds === 0, 'Shadow Cave: no square is drawn round a prowling shadow', `${r.ringCmds} commands in the old square layer`);
  F.ok(r.shadows.length > 0 && r.shadows.every(s => s.pool && s.visible && s.alpha >= 0.99 && s.rimAlpha >= 0.5), 'Shadow Cave: every prowling shadow shows its reach as a pool with a rim (fully on while it prowls)', JSON.stringify(r.shadows.map(s => [s.alpha, s.rimAlpha])));
  F.ok(r.shadows.length > 0 && r.shadows.every(s => s.pool && s.cornerAtRim <= 1.0), 'Shadow Cave: the pool covers the whole 3x3 catch area, corners included', JSON.stringify(r.shadows.map(s => [s.cornerAtRim, s.size])));
  F.ok(r.poolTex && r.poolTex.border <= 2 && r.poolTex.centre >= 100, 'Shadow Cave: the pool is soft-edged (clear at its border, dark at its middle)', JSON.stringify(r.poolTex));
  F.ok(r.crystals.length > 0 && r.crystals.every(k => k && k.a >= 0.3 && k.depth > r.darkDepth), 'Shadow Cave: each unlit crystal carries a rim drawn over the dim', JSON.stringify(r.crystals));
  // the reach is shown for exactly the dim phase: sample every frame over one full cycle on the module's clock
  const cyc = await page.evaluate(() => new Promise(res => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene; let dimFrames = 0, dimShown = 0, shineFrames = 0, shineLate = 0, t0 = S.t, lastDim = S.dim, shineStart = null;
    S.grace = 1e9;   // standing still, she would be caught and the cave clock would stop for the battle: the sample needs a full cycle

    function step() { if (!S.shadows.length) return fin(); const s = S.shadows[0], a = s.pool ? s.pool.alpha : -1;
      if (S.dim) { dimFrames++; if (a >= 0.99) dimShown++; } else { if (lastDim) shineStart = S.t; shineFrames++; if (shineStart !== null && S.t - shineStart > 260 && a > 0.01) shineLate++; }
      lastDim = S.dim; if (S.t - t0 > (S.P.dimTicks + S.P.shineTicks) * 185 + 300) fin(); }
    function fin() { sc.events.off('postupdate', step); S.grace = 0; res({ dimFrames, dimShown, shineFrames, shineLate, dimMs: S.P.dimTicks * 185, clockMs: Math.round(S.t - t0), pending: !!S.pending }); }
    sc.events.on('postupdate', step); setTimeout(fin, 25000);
  }));
  F.ok(cyc.dimFrames > 10 && cyc.dimShown === cyc.dimFrames, 'Shadow Cave: the reach is shown on every frame of the dim phase (as long as the square was)', JSON.stringify(cyc));
  F.ok(cyc.shineFrames > 10 && cyc.shineLate === 0, 'Shadow Cave: the reach is gone while the crystals shine (frozen shadows catch only by touch)', `${cyc.shineLate} frames with a pool later than 0.26 s into the shine`);
}

async function gust(page) {
  const f = fl('stormNest', 2);
  await seed(page, 'stormNest', 2, F.landing(f));
  const snap = () => page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene; let chev = 0; for (const o of sc.children.list) if (o.texture && o.texture.key === 'd2a_gust_chev') chev++;
    return { looks: S.looks, t: S.t, chev, tint: (S.tint.commandBuffer || []).length, fx: (S.fx.commandBuffer || []).length, dust: S.dust ? (S.dust.commandBuffer || []).length : -1,
      lanes: S.lanes.map(L => ({ id: L.id, state: L.state, band: L.band ? { v: L.band.visible, a: +L.band.alpha.toFixed(2), tp: L.band.tilePositionX, depth: L.band.depth, rot: +L.band.rotation.toFixed(2) } : null, dir: L.dir, chev: L.chev.length })) }; });
  F.ok(await waitSt(page, 'S && S.lanes && S.lanes.length && S.lanes.every(L => L.state === "lull")'), 'Storm Nest 2F: a lull on every lane was reached');
  const lull = await snap();
  F.info('storm nest lull', JSON.stringify(lull));
  F.ok(lull.chev === 0 && lull.lanes.every(L => L.chev === 0), 'Storm Nest: no chevron object on any lane cell', `${lull.chev} chevron sprites in the scene`);
  F.ok(lull.lanes.every(L => L.band && !L.band.v) && lull.tint === 0 && lull.fx === 0, 'Storm Nest: in a lull nothing is drawn on the lane (no band, no tint, no streak)', `tint ${lull.tint} cmds, streak ${lull.fx} cmds`);
  // the warning: timed on the module clock from the first warn frame to the first gust frame, with the band checked on every frame
  const run = await page.evaluate(() => new Promise(res => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene; const seen = {}; let done = null;
    function step() { for (const L of S.lanes) { const e = seen[L.id] || (seen[L.id] = { calm: false });
        if (L.state === 'lull') { e.calm = true; if (e.t1 !== undefined && e.gustEnd === undefined && e.gust0 !== undefined) { e.gustEnd = S.t; done = L.id; } }
        if (L.state === 'warn' && e.calm && e.t0 === undefined) { e.t0 = S.t; e.frames = 0; e.shown = 0; e.tp0 = L.band ? L.band.tilePositionX : null; e.warn = L.warn * 185; e.dirOk = true; e.last = e.tp0; e.tintRect = 0; }
        if (L.state === 'warn' && e.t0 !== undefined && e.t1 === undefined) { e.frames++; if (L.band && L.band.visible && L.band.alpha >= 0.15) e.shown++; if (L.band) { if (L.band.tilePositionX > e.last) e.dirOk = false; e.last = L.band.tilePositionX; } }
        if (L.state === 'gust' && e.t0 !== undefined && e.t1 === undefined) { e.t1 = S.t; e.tp1 = L.band ? L.band.tilePositionX : null; e.gust0 = S.t; e.gframes = 0; e.gshown = 0; }
        if (L.state === 'gust' && e.gust0 !== undefined && e.gustEnd === undefined) { e.gframes++; if (L.band && L.band.visible && L.band.alpha >= 0.8) e.gshown++; e.tp2 = L.band ? L.band.tilePositionX : null; e.t2 = S.t; } }
      if (done !== null) fin(); }
    function fin() { sc.events.off('postupdate', step); const e = seen[done] || {}; res({ lane: done, ...e, tintCmds: (S.tint.commandBuffer || []).length }); }
    sc.events.on('postupdate', step); setTimeout(fin, 40000);
  }));
  F.info('storm nest one warning and gust', JSON.stringify(run));
  const drawn = run.t1 - run.t0;
  F.ok(run.t1 !== undefined && Math.abs(drawn - run.warn) <= 120, 'Storm Nest: the warning lasts exactly the lane\'s warn time (timing unchanged)', `${Math.round(drawn)} ms on the module clock vs ${run.warn} ms`);
  F.ok(run.frames > 5 && run.shown === run.frames, 'Storm Nest: the air band is shown on every frame of the warning', `${run.shown}/${run.frames} frames`);
  F.ok(run.tp0 !== null && run.tp1 < run.tp0 - 40 && run.dirOk, 'Storm Nest: during the warning the streaks travel down-wind (they move, and only one way)', `band offset ${Math.round(run.tp0)} -> ${Math.round(run.tp1)} px`);
  F.ok(run.gframes > 3 && run.gshown === run.gframes && run.tp2 < run.tp1 - 0.4 * (run.t2 - run.t1), 'Storm Nest: during the gust the band is full and the streaks travel fast (over 0.4 px a ms)', `${run.gshown}/${run.gframes} frames, ${Math.round(run.tp1 - run.tp2)} px in ${Math.round(run.t2 - run.t1)} ms`);
  F.ok(run.tintCmds === 0, 'Storm Nest: no cell is filled as a tinted rectangle', `${run.tintCmds} commands in the tint layer`);
  const tex = await page.evaluate(() => { try { const sc = window.__QOK_DNG2__.ctx().scene, t = sc.textures.get('d2a_gust_wind').getSourceImage(), g = t.getContext('2d'), d = g.getImageData(0, 0, t.width, t.height).data;
    let top = 0, bot = 0, mid = 0; for (let x = 0; x < t.width; x++) { top = Math.max(top, d[x * 4 + 3]); bot = Math.max(bot, d[((t.height - 1) * t.width + x) * 4 + 3]); mid = Math.max(mid, d[((t.height >> 1) * t.width + x) * 4 + 3]); }
    let white = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 250) { n++; if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) white++; }
    return { top, bot, mid, opaqueWhite: white }; } catch (e) { return null; } });
  F.ok(tex && tex.top <= 2 && tex.bot <= 2 && tex.mid >= 60, 'Storm Nest: the band is feathered at both sides (no ruled lane edge)', JSON.stringify(tex));
}

async function mouth(page) {
  for (const id of ['ironMine', 'voidRift']) {
    const f = fl(id, 1), m = f.land.mouth, ms = f.assets.filter(a => a.kind === 'mouth'), side = ms[0].side || 'down';
    await seed(page, id, 1, [m.x, m.y]);
    await sleep(page, 400);
    const s = await d4(page);
    F.info(`${id} mouth`, JSON.stringify(s && { mouths: s.mouths, engineGlare: s.engineGlare, edges: s.edges, err: s.err }));
    F.ok(s && s.mouths.length === 1 && s.mouths[0].w > 0, `${id}: the mouth has one glow`, s ? `${s.mouths.length} glow(s)` : 'no d4-looks');
    F.ok(s && s.engineGlare.length >= 2 && s.engineGlare.every(g => !g.visible), `${id}: the old glare images (wash, edge band, spill over the void) are not drawn`, s ? JSON.stringify(s.engineGlare) : '');
    // the screen: step across the map's edge in the mouth. Inside and outside must be the same light (no ruled line).
    const xs = ms.map(a => a.x), ys = ms.map(a => a.y), out = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[side];
    const ex = side === 'left' ? 0 : side === 'right' ? f.width * T : (Math.min(...xs) + Math.max(...xs) + 1) / 2 * T;
    const ey = side === 'up' ? 0 : side === 'down' ? f.height * T : (Math.min(...ys) + Math.max(...ys) + 1) / 2 * T;
    const cam = await camOf(page), img = await F.grab(page), k = img.w / cam.w;
    const span = (side === 'down' || side === 'up' ? Math.max(...xs) - Math.min(...xs) + 1 : Math.max(...ys) - Math.min(...ys) + 1) * T, ac = [Math.abs(out[1]), Math.abs(out[0])];
    const at = (a, b) => { const X = (ex + ac[0] * a + out[0] * b - cam.x) * k, Y = (ey + ac[1] * a + out[1] * b - cam.y) * k; if (X < 2 || Y < 2 || X >= img.w - 2 || Y >= img.h - 2) return null;
      let s2 = 0; for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) s2 += lum(F.px(img, X + dx, Y + dy)); return s2 / 5; };
    let worst = 0, n = 0, centreOut = null;
    // a ruled line is a step across the edge far bigger than the light's own slope just inside it (same 10 px stride)
    for (let a = -span / 2 + 6; a <= span / 2 - 6; a += 6) { const i = at(a, -5), o = at(a, 5), i2 = at(a, -15); if (i === null || o === null || i2 === null) continue; n++;
      worst = Math.max(worst, Math.abs(i - o) - Math.max(0, 1.5 * Math.abs(i2 - i))); }
    centreOut = at(0, 4); const farOut = at(0, 1.6 * T), sideOut = at(span / 2 + 1.2 * T, 0.6 * T);
    if (!n) F.info(`${id}: the mouth's edge is off screen`, 'pixel lines skipped');
    else {
      F.ok(worst <= 20, `${id}: across the mouth the light carries over the map's edge (no ruled line: no step bigger than the glow's own slope)`, `largest brightness step across the edge beyond the glow's own slope ${worst.toFixed(0)} of 255 over ${n} points`);
      F.ok(centreOut !== null && centreOut >= 90 && farOut !== null && farOut <= 24, `${id}: the glow is brightest at the mouth and gone 1.6 cells out (it fades into the dark)`, `${centreOut && centreOut.toFixed(0)} at the edge, ${farOut && farOut.toFixed(0)} at 1.6 cells`);
      F.ok(sideOut === null || sideOut <= 30, `${id}: beside the mouth the void stays dark (no block of light over it)`, `${sideOut && sideOut.toFixed(0)}`);
    }
  }
  const tex = await page.evaluate(() => { try { const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); const keys = sc.textures.getTextureKeys().filter(k => k.indexOf('d4mouth_') === 0); if (!keys.length) return null;
    const t = sc.textures.get(keys[0]).getSourceImage(), g = t.getContext('2d'), w = t.width, h = t.height, d = g.getImageData(0, 0, w, h).data; let border = 0, peak = 0, white = 0;
    for (let x = 0; x < w; x++) border = Math.max(border, d[x * 4 + 3], d[((h - 1) * w + x) * 4 + 3]); for (let y = 0; y < h; y++) border = Math.max(border, d[(y * w) * 4 + 3], d[(y * w + w - 1) * 4 + 3]);
    for (let i = 0; i < d.length; i += 4) { peak = Math.max(peak, d[i + 3]); if (d[i] >= 250 && d[i + 1] >= 250 && d[i + 2] >= 250 && d[i + 3] > 0) white++; }
    return { key: keys[0], border, peak, white }; } catch (e) { return null; } });
  F.ok(tex && tex.border === 0 && tex.peak >= 200 && tex.white === 0, 'mouth glow: soft on every side (clear at its border), and never pure white', JSON.stringify(tex));
}

async function edge(page) {
  for (const [id, n] of [['sunkenTempleDungeon', 3], ['demonCastle', 3]]) {
    const f = fl(id, n), at = F.landing(f);
    await seed(page, id, n, at);
    await sleep(page, 300);
    const s = await d4(page);
    F.ok(s && s.edges === 4, `${id} ${n}F: all four map edges have a fade`, s ? `${s.edges} edge fades` : 'no d4-looks');
    // no fade over a walkable cell: read the fade's own alpha at the centre (and the edge-side rim) of every open cell near the edge
    const r = await page.evaluate(([key, rows, W, H]) => { try {
      const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), S4 = 4, MAXD = 1.6 * 48, out = { cells: 0, worst: 0, rockMax: 0 };
      for (const side of ['down', 'up', 'left', 'right']) { let t = sc.textures.get('d4edge_' + key + '_' + side); if (!t || t.key === '__MISSING') t = sc.textures.get('d4edge_' + key + 'b_' + side);   // 'b': built with the floor's boss down
        if (!t || t.key === '__MISSING') return { missing: side };
        const c = t.getSourceImage(), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
        const alpha = (wx, wy) => { let dist, along; if (side === 'down') { dist = H * 48 - wy; along = wx; } else if (side === 'up') { dist = wy; along = wx; } else if (side === 'left') { dist = wx; along = wy; } else { dist = W * 48 - wx; along = wy; }
          if (dist >= MAXD || dist < 0) return 0; const q = Math.floor(dist / S4), a = Math.floor(along / S4); let x, y; const ld = Math.ceil(MAXD / S4);
          if (side === 'down') { x = a; y = ld - 1 - q; } else if (side === 'up') { x = a; y = q; } else if (side === 'left') { x = q; y = a; } else { x = ld - 1 - q; y = a; }
          return d[(y * c.width + x) * 4 + 3] / 255; };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dd = side === 'down' ? H - 1 - y : side === 'up' ? y : side === 'left' ? x : W - 1 - x; if (dd > 2) continue;
          if (rows[y][x] === '.') { out.cells++; for (const [fx, fy] of [[0.5, 0.5], [0.15, 0.5], [0.85, 0.5], [0.5, 0.15], [0.5, 0.85]]) out.worst = Math.max(out.worst, alpha((x + fx) * 48, (y + fy) * 48)); }
          else if (dd === 0) out.rockMax = Math.max(out.rockMax, alpha((x + 0.5) * 48 + (side === 'left' ? -22 : side === 'right' ? 22 : 0), (y + 0.5) * 48 + (side === 'up' ? -22 : side === 'down' ? 22 : 0))); } }
      return out; } catch (e) { return { err: String(e) }; } }, [`${id}-f${n}`, f.rows, f.width, f.height]);
    F.info(`${id} ${n}F edge fade`, JSON.stringify(r));
    F.ok(r && r.cells > 0 && r.worst <= 0.06, `${id} ${n}F: the fade never darkens a walkable cell`, r ? `${r.cells} walkable cells within 2 of an edge, darkest ${(r.worst * 100).toFixed(1)}%` : '');
    F.ok(r && r.rockMax >= 0.9, `${id} ${n}F: at the map's edge the rock is fully faded (the picture does not end in a line)`, r ? `fade at the edge ${(r.rockMax * 100).toFixed(0)}%` : '');
  }
}

async function rim(page) {
  let f = fl('demonCastle', 8), g = f.mech.find(m => m.kind === 'guard');
  await seed(page, 'demonCastle', 8, F.nearestWalk(f, g.waypoints[0][0] + 3, g.waypoints[0][1] + 2));
  await page.waitForFunction(st('S && S.spr && S.spr.knights && Object.keys(S.spr.knights).length'), null, { timeout: 20000 }).catch(() => {});
  await sleep(page, 500);
  let s = await d4(page), body = await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(), k = c.state.spr && c.state.spr.knights; const o = k && k[Object.keys(k)[0]]; return o ? { depth: o.body.depth, n: Object.keys(k).length } : null; });
  let rk = s ? s.rims.filter(r => r.kind === 'knight') : [];
  F.info('castle 8F rims', JSON.stringify({ rims: s && s.rims, body }));
  F.ok(body && rk.length === body.n && rk.every(r => r.visible && r.alpha >= 0.3), 'Demon Castle: every knight carries a light rim', `${rk.length} rim(s), alpha ${rk.map(r => r.alpha)}`);
  f = fl('sunkenTempleDungeon', 1);
  await seed(page, 'sunkenTempleDungeon', 1, [5, 4]);
  await page.waitForFunction(st('S && S.spr && S.spr.body'), null, { timeout: 20000 }).catch(() => {});
  await sleep(page, 500);
  s = await d4(page); rk = s ? s.rims.filter(r => r.kind === 'hunter') : [];
  F.info('temple B1F rims', JSON.stringify(s && s.rims));
  F.ok(rk.length === 1 && rk[0].visible && rk[0].alpha >= 0.3, 'Sunken Temple: the hunter carries a light rim', JSON.stringify(rk));
  await seed(page, 'sunkenCellar', 1, [20, 25]);
  await sleep(page, 900);
  s = await d4(page);
  const pl = s ? s.rims.find(r => r.kind === 'plaque') : null, cr = s ? s.rims.find(r => r.kind === 'crystal') : null;
  F.info('cellar B1F rims', JSON.stringify(s && s.rims));
  F.ok(pl && pl.visible && pl.alpha >= 0.2 && pl.depth > 8, 'Sunken Cellar B1F: on arrival the plaque shows a faint rim above the dark', JSON.stringify(pl));
  F.ok(cr && cr.visible && cr.alpha >= 0.2 && cr.depth > 8, 'Sunken Cellar B1F: on arrival the dormant crystal shows a faint rim above the dark', JSON.stringify(cr));
}

async function boss(page) {
  const f = fl('demonCastle', 9), b = f.assets.find(a => a.kind === 'boss'), at = F.nearestWalk(f, b.x, b.y + 3) || F.nearestWalk(f, b.x, b.y + 2);
  const read = () => page.evaluate(() => { const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); let balls = [], art = 0, sh = 0;
    for (const o of sc.children.list) { if (o.texture && o.texture.key === 'a1dasset_boss') balls.push({ v: o.visible, depth: o.depth, a: o.alpha }); if (o.__d4 === 'boss:art') art++; if (o.__d4 === 'boss:shadow') sh++; }
    const d = window.__QOK_D4LOOKS__; return { balls, art, sh, hero: [sc.hero.x, sc.hero.y, sc.hero.displayHeight, sc.hero.depth], st: d ? d.state().boss : null, bossArt: d ? d.bossArt : null }; });
  // default: the ball, no painting
  process.env.FIELD_LS = [process.env.FIELD_LS_BASE || '', ''].filter(Boolean).join(',');
  await seed(page, 'demonCastle', 9, at, { 'boss.demonKing.defeated': false });
  await page.waitForFunction(() => { const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return sc.children.list.some(o => o.texture && o.texture.key === 'a1dasset_boss'); }, null, { timeout: 20000 }).catch(() => {});
  await sleep(page, 600);
  let r = await read();
  F.info('demon castle 9F, default', JSON.stringify(r));
  F.ok(r.bossArt === false && r.art === 0 && r.balls.length === 1 && r.balls[0].v, 'boss, default: the smoke ball stands on the field and no painting is drawn (the alternative is OFF unless asked for)', `${r.balls.length} ball(s), ${r.art} painting(s), switch ${r.bossArt}`);
  // qok-boss-field=art
  process.env.FIELD_LS = [process.env.FIELD_LS_BASE || '', 'qok-boss-field=art'].filter(Boolean).join(',');
  await seed(page, 'demonCastle', 9, at, { 'boss.demonKing.defeated': false });
  await page.waitForFunction(() => { const d = window.__QOK_D4LOOKS__; return d && d.state().boss.length > 0; }, null, { timeout: 30000 }).catch(() => {});
  await sleep(page, 500);
  r = await read(); const a = r.st && r.st[0];
  F.info('demon castle 9F, qok-boss-field=art', JSON.stringify(r));
  F.ok(a && r.art === 1 && r.balls.length === 1 && !r.balls[0].v, 'boss art: the Demon King\'s own painting stands in for the ball (ball hidden, one painting)', a ? `${a.bossId} ${a.artW}x${a.artH} px` : 'no painting');
  F.ok(a && Math.abs(a.artH / r.hero[2] - 1.6) <= 0.12, 'boss art: about 1.6 times the hero\'s height', a ? `${a.artH} px vs hero ${Math.round(r.hero[2])} px = ${(a.artH / r.hero[2]).toFixed(2)}x` : '');
  F.ok(a && r.sh === 1 && a.shadowAlpha >= 0.5 && a.shadowW > 30, 'boss art: a soft contact shadow lies under it', a ? `shadow ${a.shadowW} px wide, alpha ${a.shadowAlpha.toFixed(2)}` : '');
  F.ok(a && a.artDepth === a.ballDepth && a.artDepth < r.hero[3], 'boss art: she stands south of it, so she is drawn in front (it sorts as the ball does)', a ? `painting depth ${a.artDepth}, hero ${r.hero[3]}` : '');
  // idle bob: the painting's y moves a little while the ball's anchor does not
  const ys = []; for (let i = 0; i < 6; i++) { const q = await d4(page); if (q && q.boss[0]) ys.push(q.boss[0].y); await sleep(page, 220); }
  F.ok(ys.length > 3 && Math.max(...ys) - Math.min(...ys) >= 0.8 && Math.max(...ys) - Math.min(...ys) <= 5, 'boss art: it bobs gently while it waits', `y over 1.3 s: ${ys.map(v => v.toFixed(1)).join(' ')}`);
  // north of its foot line she is behind it
  const north = await page.evaluate(([bx, by]) => { const c = window.__QOK_DNG2__.ctx(), sc = c.scene; sc.hero.x = (bx - 1) * 48 + 24; sc.hero.y = by * 48 - 30; sc.heroTileX = bx - 1; sc.heroTileY = by - 1; return true; }, [b.x, b.y]);
  await sleep(page, 400);
  r = await read(); const a2 = r.st && r.st[0];
  F.ok(a2 && a2.artDepth > r.hero[3], 'boss art: with her soles north of its feet the painting is drawn in front of her (never the hero on top of the boss)', a2 ? `painting depth ${a2.artDepth}, hero ${r.hero[3]}` : '');
  // defeat: it goes exactly as the ball goes (the engine's own shrink-and-fade), shadow and all
  await page.evaluate(() => { window.__GAME_STATE__.player.state.storyFlags['boss.demonKing.defeated'] = true; });
  const seen = []; for (let i = 0; i < 14; i++) { const q = await read(); const s0 = q.st && q.st[0]; seen.push({ art: q.art, sh: q.sh, a: s0 ? +s0.artAlpha.toFixed(2) : null, ball: q.balls.length }); if (!q.art && !q.balls.length) break; await sleep(page, 150); }
  const last = seen[seen.length - 1], faded = seen.some(x => x.a !== null && x.a < 0.95 && x.a > 0);
  F.info('defeat', JSON.stringify(seen));
  F.ok(last.art === 0 && last.sh === 0 && last.ball === 0, 'boss art: on defeat the painting and its shadow are gone when the ball\'s vanish ends (nothing is left behind)', `after ${seen.length} samples: ${JSON.stringify(last)}`);
  F.ok(faded || seen.length <= 3, 'boss art: it fades with the ball\'s own vanish tween', seen.map(x => x.a).join(' '));
  process.env.FIELD_LS = process.env.FIELD_LS_BASE || '';
}

(async () => {
  process.env.FIELD_LS_BASE = process.env.FIELD_LS || '';
  const { browser, page } = await F.L.launch({ dpr: +(process.env.FIELD_DPR || 1) });
  for (const [name, fn] of [['mine', mine], ['shadow', shadow], ['gust', gust], ['mouth', mouth], ['edge', edge], ['rim', rim], ['boss', boss]]) {
    if (!on(name)) continue;
    try { await fn(page); } catch (e) { F.ok(false, `${name}: check ran`, String(e && e.stack || e).slice(0, 300)); }
  }
  await browser.close();
  F.done('dungeon-looks-fd1');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
