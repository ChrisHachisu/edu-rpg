'use strict';
// Dungeon looks, day 4, worker FD1 (2026-11-27). The LOOK changed, the rules did not: these lines
// read the objects the game drew (and a few screen pixels where only the picture can tell).
//   public/acts-dungeons/modules/d4-looks.js      mouth glow, map-edge fade, rim light, boss art (switch)
//   public/acts-dungeons/modules/mine-carts.js    no arrow badge; bolder point blades; levers take the lamp's falloff
//   public/acts-dungeons/modules/shadow-freeze.js the shadow's reach is a soft breathing pool, not a square; crystal rim
//   public/acts-dungeons/modules/gust-walkways.js no chevrons; travelling air in warn and gust; nothing in a lull
// Switches: localStorage qok-d4-looks=0 (old looks), qok-boss-field=art (boss painting on the field, off by default).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5571/ node scripts/auto/checks/dungeon-looks-fd1.cjs [group ...]
//   groups: mine shadow crystal gust gustcost mouth far edge rim retry boss tex   (default: all)
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
    // (a crystal she stands in front of, her picture over its, has its rim sorted under her instead: group "crystal")
    const hb = sc.hero.getBounds(), hf = c.hero().footY;
    for (const k of S.crystals) out.crystals.push(k.rim ? { a: +k.rim.alpha.toFixed(2), depth: k.rim.depth, lit: k.img.texture.key,
      behindHer: hf >= k.img.__by && hb.x < k.rim.x + 26 && hb.right > k.rim.x - 26 && hb.y < k.rim.y + 32 && hb.bottom > k.rim.y - 32 } : null);
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
  F.ok(r.crystals.length > 0 && r.crystals.every(k => k && k.a >= 0.3 && (k.depth > r.darkDepth || k.behindHer)), 'Shadow Cave: each unlit crystal carries a rim drawn over the dim (or under her, where she stands in front of it)', JSON.stringify(r.crystals));
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

// A ruled line across the mouth is a step in brightness AT the map's edge that the light's own slope does not explain:
// the change across the edge (5 px inside to 5 px outside) less the mean of the changes over the 10 px before and the
// 10 px after it. A smooth light gives about 0 however steep it is; a ruled step of s levels on top of it gives s.
// (The first version took 1.5 x the slope just inside off the step, so a steep light hid a ruled step.)
const STEP_MAX = 12;
function edgeStep(at, span) { let worst = 0, n = 0; const all = [];
  for (let a = -span / 2 + 6; a <= span / 2 - 6; a += 6) { const i2 = at(a, -15), i = at(a, -5), o = at(a, 5), o2 = at(a, 15); if (i2 === null || i === null || o === null || o2 === null) continue; n++;
    const r = Math.abs((o - i) - ((i - i2) + (o2 - o)) / 2); all.push(Math.round(r)); if (r > worst) worst = r; }
  return { worst: Math.round(worst * 10) / 10, n, all }; }
async function mouth(page) {
  { // the test itself, on synthetic rows: a smooth light of 2.4 levels a px (steeper than the glow), without and with a ruled step at the edge
    const light = b => 140 - 2.4 * b - 0.012 * b * b, row = step => edgeStep((a, b) => light(b) - (b >= 0 ? step : 0), 144).worst;
    const firstVersion = step => Math.abs(light(-5) - (light(5) - step)) - 1.5 * Math.abs(light(-15) - light(-5));   // what dungeon-looks-fd1 measured before
    F.ok(row(0) < 1 && row(11) < STEP_MAX && row(12) >= STEP_MAX && row(30) >= STEP_MAX, `mouth test, synthetic rows: a smooth slope passes, the same slope with a ruled step of ${STEP_MAX} levels or more at the edge fails`,
      `step measured: none ${row(0).toFixed(1)}, 11 -> ${row(11).toFixed(1)}, 12 -> ${row(12).toFixed(1)}, 30 -> ${row(30).toFixed(1)} (the first version of this test gave ${firstVersion(12).toFixed(1)} for the 12-level step and let 20 pass)`);
  }
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
    let centreOut = null;
    const es = edgeStep(at, span), worst = es.worst, n = es.n;
    F.info(`${id}: step at the map's edge at each point across the mouth (levels of 255)`, es.all.join(' '));
    centreOut = at(0, 4); const farOut = at(0, 1.6 * T), sideOut = at(span / 2 + 1.2 * T, 0.6 * T);
    if (!n) F.info(`${id}: the mouth's edge is off screen`, 'pixel lines skipped');
    else {
      F.ok(worst < STEP_MAX, `${id}: across the mouth the light carries over the map's edge (no ruled line: no step of ${STEP_MAX} levels or more beyond the light's own slope)`, `largest brightness step at the edge ${worst.toFixed(1)} of 255 over ${n} points`);
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

// ---- DL2 (2026-11-27, follow-up to two code reviews) -------------------------------------------------
// put her soles at world px (x, y): the hero sprite moves with its own foot offset
const place = (page, x, y) => page.evaluate(([x, y]) => { const c = window.__QOK_DNG2__.ctx(), sc = c ? c.scene : window.__PHASER_GAME__.scene.getScene('WorldMapScene'), dy = c ? c.hero().footY - c.hero().y : 31;
  sc.hero.x = x; sc.hero.y = y - dy; sc.heroTileX = Math.floor(x / 48); sc.heroTileY = Math.floor(y / 48); try { sc.updateCamera(); } catch (e) {} return true; }, [x, y]);
// Freeze the mechanic at the first frame where `cond` (a function body over c, S, M) holds: from then on its tick gets
// dt = 0 (its clock stands still, the scene keeps rendering). thaw() lets it run again. (As in dungeon-looks-fd2.cjs.)
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
const shotIf = async (page, name) => { if (process.env.DL2_SHOTS) await page.screenshot({ path: require('path').join(process.env.DL2_SHOTS, name + '.png') }).catch(() => {}); };   // DL2_SHOTS=<dir>: pictures of the moments measured
// In-page helpers: the game canvas alone (the renderer's own snapshot: no stick, tabs or HUD over it), kept in the page
// under a name, and the mean brightness of a world rectangle in it.
const lib = page => page.evaluate(() => { if (window.__dl2) return; const g = window.__PHASER_GAME__, W = () => g.scene.getScene('WorldMapScene');
  window.__dl2 = { shots: {},
    snap: name => new Promise(res => g.renderer.snapshot(img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const im = x.getImageData(0, 0, c.width, c.height), v = W().cameras.main.worldView; im.view = { x: v.x, y: v.y, k: c.width / v.width }; window.__dl2.shots[name] = im; res({ w: c.width, h: c.height, k: im.view.k }); })),
    lum(name, x0, y0, x1, y1) { const im = window.__dl2.shots[name], v = im.view; let s = 0, n = 0, tot = 0, max = 0;
      for (let y = Math.round((y0 - v.y) * v.k); y < (y1 - v.y) * v.k; y += 2) for (let x = Math.round((x0 - v.x) * v.k); x < (x1 - v.x) * v.k; x += 2) { tot++; if (x < 0 || y < 0 || x >= im.width || y >= im.height) continue; const o = (y * im.width + x) * 4, l = (im.data[o] + im.data[o + 1] + im.data[o + 2]) / 3; s += l; if (l > max) max = l; n++; }
      return tot && n >= tot * 0.25 ? { mean: +(s / n).toFixed(1), max: Math.round(max), part: +(n / tot).toFixed(2) } : null; } }; });

// Item 9: the way out must show in the dark. Six cells from the mouth of a dark floor the mouth lies outside her lamp
// (the darkness is drawn at depth 8, the floor glow under it). The exit region (the mouth's width, one cell either
// side of the map's edge) against the dark beside it (the same band, two to three and a half cells to each side).
const FAR_OLD = { ironMine: 63.4, shadowCave: 56.0 };       // the margin of the tree before day 4 (37de040, the engine's spill over the dark), measured by this same function on :5570
async function far(page) {
  for (const id of ['ironMine', 'shadowCave']) {
    const f = fl(id, 1), ms = f.assets.filter(a => a.kind === 'mouth'), xs = ms.map(a => a.x), x0 = Math.min(...xs) * T, x1 = (Math.max(...xs) + 1) * T, ey = f.height * T, xm = (x0 + x1) / 2;
    await seed(page, id, 1, [f.land.mouth.x, f.land.mouth.y]); await lib(page);
    await place(page, xm, ey - 2.3 * T); await sleep(page, 500);                 // at the mouth (the last floor cell before its own cells, which are the way out): the glow's heart is in her light
    const nearS = await d4(page);
    await shotIf(page, `far-${id}-in-the-mouth`);
    await place(page, xm, ey - 6 * T); await sleep(page, 700);
    const s = await d4(page); await shotIf(page, `far-${id}-six-cells`);
    const r = await page.evaluate(async ([x0, x1, ey, T]) => { await window.__dl2.snap('far'); const L = window.__dl2.lum;
      const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), h = sc.hero, z = sc.cameras.main.zoom;
      return { exit: L('far', x0, ey - T, x1, ey + T), left: L('far', x0 - 3.5 * T, ey - T, x0 - 2 * T, ey + T), right: L('far', x1 + 2 * T, ey - T, x1 + 3.5 * T, ey + T), zoom: z, heroToEdge: Math.round(ey - h.y) }; }, [x0, x1, ey, T]);
    const sides = [r.left, r.right].filter(Boolean), dark = sides.length ? sides.reduce((a, b) => a + b.mean, 0) / sides.length : null, margin = r.exit && dark !== null ? +(r.exit.mean - dark).toFixed(1) : null;
    F.info(`${id} B1F, six cells from the mouth`, JSON.stringify({ ...r, dark, margin, far: s && s.mouths[0] && s.mouths[0].far, nearFar: nearS && nearS.mouths[0] && nearS.mouths[0].far }));
    F.ok(margin !== null && margin >= FAR_OLD[id] * 0.95, `${id}: six cells from the mouth, in the dark, the way out is brighter than the dark beside it by at least the old build's margin`, `exit ${r.exit && r.exit.mean} against ${dark === null ? 'nothing' : dark.toFixed(1)}: margin ${margin} (old build ${FAR_OLD[id]})`);
    const fm = s && s.mouths[0] && s.mouths[0].far, nm = nearS && nearS.mouths[0] && nearS.mouths[0].far;
    F.ok(fm && fm.visible && fm.depth > 8 && fm.alpha >= 0.6 && nm && nm.alpha <= 0.05, `${id}: the glow over the dark is on only while the mouth is outside her light (off when she stands in the mouth: no second glare on top of the floor glow)`, JSON.stringify({ far: fm, atTheMouth: nm }));
    F.ok(r.exit && r.exit.max <= 249, `${id}: the far glow is never pure white`, `brightest point ${r.exit && r.exit.max}`);
  }
}

// Item 10: the unlit crystal's rim (drawn over the dim, depth 45) must not cross her head when she stands just south of it.
async function crystal(page) {
  const f = fl('shadowCave', 5), cr = f.mech.filter(m => m.kind === 'crystalLight').find(c => F.walk(f, c.x, c.y + 1));
  await seed(page, 'shadowCave', 5, F.landing(f)); await lib(page);              // arrive where the stairs put her (no shadow reaches it), then go to the crystal with the catch held off
  F.ok(await waitSt(page, 'S && S.crystals && S.crystals.length && S.dim !== undefined && !S.pending'), 'Shadow Cave B5F: the module is running (crystal rim check)');
  await page.evaluate(() => { const S = window.__QOK_DNG2__.ctx().state; S.grace = 1e9; });
  await place(page, cr.x * T + 24, (cr.y + 1) * T + 8); await sleep(page, 400);   // her soles just south of the crystal's base line: she is in front of it
  const ok = await freeze(page, 'const P = S.P, per = P.dimTicks + P.shineTicks, pos = (S.t / 185) % per; return S.dim && pos > 2 && (P.dimTicks - pos) * 185 > 1600;', 30000);
  const r = await page.evaluate(async ([cx, cy]) => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, h = sc.hero, D = window.__dl2, k0 = S.crystals.find(k => Math.abs(k.img.x - (cx * 48 + 24)) < 2 && Math.abs(k.img.__by - (cy * 48 + 42)) < 2);
    const wait = () => new Promise(r => setTimeout(r, 90));
    try { if (h.anims && h.anims.isPlaying) h.anims.pause(); } catch (e) {}
    await wait(); await D.snap('A');                                                    // as drawn
    for (const k of S.crystals) if (k.rim) k.rim.setVisible(false);
    await wait(); const m = await D.snap('B');                                          // without the rims
    h.setVisible(false); await wait(); await D.snap('C');                               // without her
    h.setVisible(true); for (const k of S.crystals) if (k.rim) k.rim.setVisible(true);
    const A = D.shots.A, B = D.shots.B, C = D.shots.C, v = A.view, hb = h.getBounds(), dif = (P, Q, o) => Math.max(Math.abs(P.data[o] - Q.data[o]), Math.abs(P.data[o + 1] - Q.data[o + 1]), Math.abs(P.data[o + 2] - Q.data[o + 2]));
    let body = 0, over = 0, beside = 0;
    for (let y = Math.max(0, Math.round((hb.y - v.y) * v.k)); y < Math.min(A.height, (hb.bottom - v.y) * v.k); y++) for (let x = Math.max(0, Math.round((hb.x - v.x) * v.k)); x < Math.min(A.width, (hb.right - v.x) * v.k); x++) { const o = (y * A.width + x) * 4;
      const she = dif(B, C, o) > 16, rim = dif(A, B, o) > 16; if (she) { body++; if (rim) over++; } else if (rim) beside++; }
    return { field: window.__PHASER_GAME__.scene.isActive('WorldMapScene'), dim: S.dim, found: !!k0, rim: k0 && k0.rim ? { depth: k0.rim.depth, alpha: +k0.rim.alpha.toFixed(2) } : null, crystalDepth: k0 ? k0.img.depth : null, heroDepth: h.depth, darkDepth: S.dark.depth, darkAlpha: +S.dark.alpha.toFixed(2),
      box: [Math.round(hb.x), Math.round(hb.y), Math.round(hb.right), Math.round(hb.bottom)], crystalBox: k0 ? [k0.img.x - 24, k0.img.y - 30, k0.img.x + 24, k0.img.y + 30] : null, body, over, beside,
      others: S.crystals.filter(k => k !== k0 && k.rim).map(k => k.rim.depth) };
  }, [cr.x, cr.y]);
  await shotIf(page, 'crystal-rim-south-of-it'); await thaw(page);
  F.info('shadow cave B5F, her soles just south of a crystal, dim phase (frozen)', JSON.stringify({ frozen: ok, ...r }));
  F.ok(ok && r.field && r.found && r.body > 300 && r.over * 100 <= r.body, 'Shadow Cave: standing just south of an unlit crystal, no rim line is drawn over her (under 1% of her sprite changes when the rims are hidden: the soft edge of her outline only)', `${r.over} of ${r.body} px of her sprite carry the rim (her box ${JSON.stringify(r.box)}, the crystal's ${JSON.stringify(r.crystalBox)})`);
  F.ok(r.rim && r.rim.alpha >= 0.3 && r.beside > 0, 'Shadow Cave: that crystal still shows its rim beside her (it is sorted under her, not switched off)', `rim alpha ${r.rim && r.rim.alpha}, ${r.beside} rim px inside her box but not on her`);
  F.ok(r.others.length > 0 && r.others.every(d => d > r.darkDepth), 'Shadow Cave: every other unlit crystal keeps its rim over the dim', JSON.stringify(r.others));
}

// Item 12: (a) after a scene rebuild on the same Act 1 painted floor (a Retry) the Sunken Cellar plaque rim comes back;
// (b) when the boss painting cannot be cropped the picture is not requested again on every frame.
async function retry(page) {
  await seed(page, 'sunkenCellar', 1, [20, 25]);
  await sleep(page, 900);
  const a = await d4(page), pa = a ? a.rims.find(r => r.kind === 'plaque') : null;
  // the scene's own objects die (as on its shutdown) while the scene object, the floor and the map stay the same
  const how = await page.evaluate(() => { const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); let n = 0; for (const o of sc.children.list.slice()) if (o.__d4 === 'rim:plaque') { o.destroy(); n++; } return n; });
  await sleep(page, 900);
  const b = await d4(page), pb = b ? b.rims.find(r => r.kind === 'plaque') : null;
  const live = await page.evaluate(() => { const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return sc.children.list.filter(o => o.__d4 === 'rim:plaque' && o.active).length; });
  F.info('cellar B1F plaque rim, before and after its picture died with the scene', JSON.stringify({ before: pa, destroyed: how, after: pb, live, err: b && b.err }));
  F.ok(pa && how === 1 && pb && live === 1 && pb.visible && pb.alpha >= 0.2, 'Sunken Cellar B1F: when the scene is rebuilt on the same floor (a Retry) the plaque rim is drawn again', `before ${JSON.stringify(pa)}, after ${JSON.stringify(pb)}, ${live} live picture(s)`);
  // (b) the crop is made to throw (the texture manager refuses the painting's canvas): one try, then a pause, not a try a frame
  const f = fl('demonCastle', 9), bs = f.assets.find(x => x.kind === 'boss'), at = F.nearestWalk(f, bs.x, bs.y + 3) || F.nearestWalk(f, bs.x, bs.y + 2);
  process.env.FIELD_LS = [process.env.FIELD_LS_BASE || '', 'qok-boss-field=art', 'dl2-boss-throw=1'].filter(Boolean).join(',');
  await seed(page, 'demonCastle', 9, at, { 'boss.demonKing.defeated': false });
  process.env.FIELD_LS = process.env.FIELD_LS_BASE || '';
  await page.waitForFunction(() => window.__dl2Boss && window.__dl2Boss.tries >= 1, null, { timeout: 25000 }).catch(() => {});
  const t0 = await page.evaluate(() => (window.__dl2Boss ? window.__dl2Boss.tries : -1)); await sleep(page, 3000);
  const t1 = await page.evaluate(() => { const sc = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), d = window.__QOK_D4LOOKS__; return { tries: window.__dl2Boss ? window.__dl2Boss.tries : -1, hooked: !!(window.__dl2Boss && window.__dl2Boss.hooked), ball: sc.children.list.filter(o => o.texture && o.texture.key === 'a1dasset_boss' && o.visible).length, art: sc.children.list.filter(o => o.__d4 === 'boss:art').length, err: d ? d.state().err : null, bossArt: d ? d.bossArt : null }; });
  F.info('demon castle 9F, qok-boss-field=art, the crop forced to throw', JSON.stringify({ triesAtStart: t0, after3s: t1 }));
  F.ok(t1.hooked && t0 >= 1 && t1.tries - t0 <= 1, 'boss art: when cropping the painting throws, it is asked for again after a pause, not on every frame', `${t0} tr${t0 === 1 ? 'y' : 'ies'} when first seen, ${t1.tries - t0} more in the next 3 s`);
  F.ok(t1.ball === 1 && t1.art === 0, 'boss art: while the painting cannot be made the smoke ball stays on the field', `${t1.ball} ball(s) shown, ${t1.art} painting(s)`);
}

// Item 6: the floor's own textures leave with the floor. A real floor change (the engine's own, through the module
// context's toFloor) 1 -> 2 -> 3 -> 2 -> 1, then the texture manager is read.
const OWN = /^(d4edge_|d4plaque_|d2b_pool_|d2s_stone_)/;
async function tex(page) {
  for (const id of ['demonBarracks', 'stormreachSpire']) {
    await seed(page, id, 1, F.landing(fl(id, 1)));
    const hold = () => page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(); if (c && c.state) c.state.grace = 1e12; });   // not caught, not struck: this reads textures only
    const hop = async (n, from) => { const f = fl(id, n), sp = from < n ? f.land.fromPrev : f.land.fromNext;
      await F.dismiss(page); await hold();
      const went = await page.evaluate(([n, sp]) => window.__QOK_DNG2__.ctx().toFloor(n, { x: sp.x, y: sp.y, dir: sp.dir || 0 }), [n, sp]);
      const there = await page.waitForFunction(k => { const c = window.__QOK_DNG2__.ctx(); return !!(c && c.key === k && c.state && c.state.ok); }, `${id}-f${n}`, { timeout: 40000, polling: 50 }).then(() => true).catch(() => false);
      await hold(); await F.settle(page); await F.dismiss(page); await hold();
      await page.waitForFunction(() => { const c = window.__QOK_DNG2__.ctx(); return !!(c && c.state && c.state.spr); }, null, { timeout: 20000 }).catch(() => {});
      await sleep(page, 500); return went && there; };
    await page.waitForFunction(() => { const c = window.__QOK_DNG2__.ctx(); return !!(c && c.state && c.state.spr); }, null, { timeout: 20000 }).catch(() => {});
    await hold(); await sleep(page, 500);
    const keys = () => page.evaluate(() => window.__PHASER_GAME__.textures.getTextureKeys().filter(k => /^(d4edge_|d4plaque_|d2b_pool_|d2s_stone_)/.test(k)));
    const k1 = await keys(); let walked = true; const seen = [];
    for (const [n, from] of [[2, 1], [3, 2], [2, 3], [1, 2]]) { walked = (await hop(n, from)) && walked; seen.push((await keys()).length); }
    const k2 = await keys(), here = `${id}-f1`, stale = k2.filter(k => k.indexOf(here + '_') < 0 && k.indexOf(here + 'b_') < 0);
    const st2 = await page.evaluate(() => { const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, d = window.__QOK_D4LOOKS__ ? window.__QOK_D4LOOKS__.state() : { edges: 0, err: null };   // (a tree before day 4 has no such module: the line below then fails, it does not throw)
      const pics = sc.children.list.filter(o => o.texture && /^(d4edge_|d2b_pool_|d2s_stone_)/.test(o.texture.key)); return { key: c.key, edges: d.edges, err: d.err, pics: pics.length, dead: pics.filter(o => !o.texture.source || !o.texture.source[0] || !o.frame || !o.frame.source).length, spr: !!S.spr, look: S.spr && S.spr.look }; });
    F.info(`${id}: textures named for a floor`, JSON.stringify({ onArrival: k1.length, afterEachHop: seen, atTheEnd: k2.length, stale: stale.slice(0, 6), state: st2 }));
    F.ok(walked && st2.key === here, `${id}: walked floors 1, 2, 3 and back to 1 by the engine's own floor change`, JSON.stringify({ walked, key: st2.key }));
    F.ok(walked && stale.length === 0, `${id}: back on floor 1 after three floors, the texture manager holds no edge, pool or stone-glow texture of a floor she is not on`, `${stale.length} stale of ${k2.length}: ${stale.slice(0, 4).join(' ')}`);
    F.ok(walked && k2.length === k1.length && k2.every(k => k1.includes(k)) && st2.edges === 4 && st2.spr && st2.dead === 0 && !st2.err, `${id}: the return to floor 1 drew its own textures again (the same set as on arrival, every picture alive)`, `${k1.length} on arrival, ${k2.length} now, ${st2.pics} pictures, ${st2.dead} dead`);
  }
}

// Item 3: Storm Nest's air costs half the strokes, and a lane's band no longer keeps a lane-length x 256 canvas.
const GUST_OLD_CMDS = 3708;                                     // Graphics command numbers in the busiest frame of one gust, her soles on the same lane cell, on the build before (measured by this function)
async function gustcost(page) {
  const f = fl('stormNest', 5), z = f.zones.filter(q => q.kind === 'gustLane')[0], cell = z.cells[Math.floor(z.cells.length / 2)];
  await seed(page, 'stormNest', 5, F.landing(f));
  F.ok(await waitSt(page, 'S && S.lanes && S.lanes.length'), 'Storm Nest 5F: the gust module is running');
  await page.evaluate(() => { window.__QOK_DNG2__.ctx().state.grace = 1e12; });            // she is not blown off while the drawing is counted
  await place(page, cell[0] * T + 24, cell[1] * T + 24); await sleep(page, 500);
  await page.waitForFunction(id => { const S = window.__QOK_DNG2__.ctx().state, L = S.lanes.find(l => l.id === id); return L && L.state === 'lull'; }, z.id, { timeout: 30000, polling: 30 }).catch(() => {});   // start in her lane's lull: then one whole warning and gust
  const bands = await page.evaluate(() => { const S = window.__QOK_DNG2__.ctx().state; return S.lanes.map(L => L.band ? { id: L.id, canvas: L.band.canvas ? [L.band.canvas.width, L.band.canvas.height] : null, bytes: L.band.canvas ? L.band.canvas.width * L.band.canvas.height * 4 : null,
    shown: [Math.round(L.band.displayWidth), Math.round(L.band.displayHeight)], want: [(L.dir[0] !== 0 ? L.rect[2] - L.rect[0] + 1 : L.rect[3] - L.rect[1] + 1) * 48, ((L.dir[0] !== 0 ? L.rect[3] - L.rect[1] + 1 : L.rect[2] - L.rect[0] + 1) + 1) * 48],
    tile: [L.band.tileScaleX * L.band.scaleX, +(L.band.tileScaleY * L.band.scaleY).toFixed(4)], frame: [L.band.displayFrame.width, L.band.displayFrame.height] } : null); });
  F.info('storm nest 5F lane bands', JSON.stringify(bands));
  const tot = bands.reduce((a, b) => a + (b && b.bytes || 0), 0);
  F.ok(bands.length > 0 && bands.every(b => b && b.bytes !== null && b.bytes < 600000), 'Storm Nest 5F: no lane band keeps a canvas over 0.6 MB', bands.map(b => b && (b.bytes / 1e6).toFixed(2)).join(' ') + ` MB, ${(tot / 1e6).toFixed(1)} MB on the floor`);
  F.ok(bands.length > 0 && bands.every(b => b && b.shown[0] === b.want[0] && b.shown[1] === b.want[1] && b.frame[1] === 256 && Math.abs(b.tile[1] - b.want[1] / 256) < 0.002 && b.tile[0] === 1), 'Storm Nest 5F: each band still covers its lane plus half a cell each side, with the same 256 px tile at the same scale on screen', JSON.stringify(bands.map(b => b && [b.shown, b.want, b.tile])));
  // one full cycle of her lane: Graphics command numbers per frame in the streak layer, and the frame times
  const run = await page.evaluate(id => new Promise(res => {
    const c = window.__QOK_DNG2__.ctx(), S = c.state, sc = c.scene, L = S.lanes.find(l => l.id === id); let seenGust = false, done = false, last = performance.now();
    const o = { warn: [], gust: [], lull: 0, dtGust: [], dtWarn: [], dtLull: [], drawn: [] };
    function step() { const now = performance.now(), dt = now - last; last = now; const n = (S.fx.commandBuffer || []).length;
      if (L.state === 'gust') { seenGust = true; o.gust.push(n); o.dtGust.push(dt); o.drawn.push(S.drawn || 0); } else if (L.state === 'warn') { if (!seenGust) { o.warn.push(n); o.dtWarn.push(dt); } } else { o.lull = Math.max(o.lull, n); o.dtLull.push(dt); if (seenGust) fin(); } }
    function med(a) { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return +b[b.length >> 1].toFixed(1); }
    function fin() { if (done) return; done = true; sc.events.off('postupdate', step); res({ gustFrames: o.gust.length, gustMax: Math.max(0, ...o.gust), gustMed: med(o.gust), warnMax: Math.max(0, ...o.warn), warnMed: med(o.warn), lull: o.lull, piecesMax: Math.max(0, ...o.drawn),
      frameMs: { gust: med(o.dtGust), warn: med(o.dtWarn), lull: med(o.dtLull) }, state: L.state, blown: !!S.blown }); }
    sc.events.on('postupdate', step); setTimeout(fin, 45000);
  }), z.id);
  F.info('storm nest 5F, her soles on a lane cell, one warning and gust', JSON.stringify(run));
  F.ok(run.gustFrames > 3 && run.gustMax > 0 && run.gustMax <= GUST_OLD_CMDS * 0.6, 'Storm Nest 5F: the streaks near her take at most 0.6 of the Graphics commands they took before (busiest gust frame)', `${run.gustMax} command numbers against ${GUST_OLD_CMDS} before`);
  F.ok(run.piecesMax >= 20, 'Storm Nest 5F: the streaks near her are still drawn in the gust (tapered pieces on screen)', `${run.piecesMax} pieces in the busiest frame`);
}

(async () => {
  process.env.FIELD_LS_BASE = process.env.FIELD_LS || '';
  const { browser, page } = await F.L.launch({ dpr: +(process.env.FIELD_DPR || 1) });
  // (retry) the boss painting's crop can be made to throw: with localStorage dl2-boss-throw=1 the texture manager refuses its canvas
  await page.addInitScript(() => { window.__dl2Boss = { tries: 0, hooked: false }; const iv = setInterval(() => { const g = window.__PHASER_GAME__; if (!g || !g.textures) return; clearInterval(iv);
    let on = false; try { on = localStorage.getItem('dl2-boss-throw') === '1'; } catch (e) {} if (!on) return;
    const tm = g.textures, orig = tm.createCanvas; window.__dl2Boss.hooked = true;
    tm.createCanvas = function (key) { if (/^d4boss_/.test(key) && key !== 'd4boss_shadow') { window.__dl2Boss.tries++; throw new Error('dl2: crop forced to fail'); } return orig.apply(this, arguments); }; }, 5); });
  for (const [name, fn] of [['mine', mine], ['shadow', shadow], ['crystal', crystal], ['gust', gust], ['gustcost', gustcost], ['mouth', mouth], ['far', far], ['edge', edge], ['rim', rim], ['retry', retry], ['boss', boss], ['tex', tex]]) {
    if (!on(name)) continue;
    try { await fn(page); } catch (e) { F.ok(false, `${name}: check ran`, String(e && e.stack || e).slice(0, 300)); }
  }
  await browser.close();
  F.done('dungeon-looks-fd1');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
