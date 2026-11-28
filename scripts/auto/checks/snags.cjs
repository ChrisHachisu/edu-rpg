'use strict';
// Wall snags in the Acts 2-5 dungeons (day 4, track S, 2026-11-27).
// Before the fix a hero who walked straight along a dungeon wall stopped dead at any unevenness of that wall, a 1 px
// step of the painted walk mask being enough: the mover's slide (dq-tiles.js a1mSlide) reads the wall's direction from
// the mask at the pixel she stands on, a wall exactly beside her gives it nothing to slide along, and the refused step
// is never retried sideways. The static census (scripts/auto/snags/census.cjs) found 43,062 such places of 24 px or
// less on the 107 floors; the story robot's "stuck" spots in Demon Castle 3F/6F and Sunken Temple 4F are four of them.
// Fix: public/acts-dungeons/modules/snag-slide.js bends the stick around a lip (the mover still accepts or refuses every
// position). localStorage 'qok-snag-slide' = '0' restores the old behaviour.
// What this checks, on a save seeded on one floor of each of the 20 dungeons (Continue), with the floor's hazards stood
// still (the mechanic's tick; its collision and stick hooks stay live):
//   * lips (scripts/auto/snags/sites.json: places that stopped her dead in the browser on the build before, three
//     sizes 1-3, 4-10 and 11-24 px): the stick is held straight along the wall and she must walk on past the lip, facing
//     the way she pushes, never standing on a spot the mover refuses;
//   * the story robot's logged stuck spots of day 3 (dead stops for a push east on the build before, with steady frames):
//     the same push from the logged soles walks on;
//   * walls: a push square into a flat face with no opening within 30 px still stops her where the face stands;
//   * blockers: a push at the corner of a mechanic's solid object (ice block, glyph door, lever, wheel...) neither passes
//     it nor slides round it; walking into a chest at its corner still opens it;
//   * a pit: hugging the lip of a Demon Castle pit sideways does not drop her into it;
//   * the switch off: the lips of one floor stop her again.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5561/ node scripts/auto/checks/snags.cjs
// ACT 1 (Whispering Woods Cave, Sunken Cellar, Misty Grotto, Coastal Reef: the same mover, no mechanic): the glide is
// asked by the mover itself there (dq-tiles.js a1mSnagBend). One floor of each (sites.json `act1`): lips of the three
// sizes from the model's census, flat walls, a chest at its corner, and the switch off.
// The game clock is stepped 1/60 s per drawn frame (steady frames, as on the device): see seed().
// SAFETY (track S2, the same day; scripts/auto/snags/sites-s2.json, built by mksites2.cjs from the static model). A code
// review found that the first glide could (1) walk her along a flat wall for as long as the stick was held and (2) carry
// her onto trigger cells she had not walked onto. Three kinds of line, all walked with the game stepped frame by frame:
//   (a) 40 pushes square into a flat face, 8 per act (the review's two places among them), held 3 s: no bent frame, she
//       stands still from her first stop, and ends no further sideways than the mover alone takes her on the way in;
//   (b) the Demon Barracks 1F pillar and 30 more places beside a trigger zone (guard light, shadow reach, storm cells,
//       glyph plates, ice, a trip wire, exits): the walk with the glide reaches no zone that the same walk with the glide
//       taken out does not reach (an exit counts when the mover asks for the floor change; the change itself is held back);
//   (c) 200 near-wall pushes per act: her sideways travel on bent frames never passes the glide's allowance, 28 px against
//       one obstacle (level = max(0, level - 0.5 x her own un-bent advance along the push), plus each bent frame's travel
//       across the push). Twelve or more of each act's 200 are the widest carries the first glide made in the model.
// All three FAIL on the build with the first glide and pass on a build without any glide (nothing is bent there).
// SNAGS_ONLY=<floorKey,floorKey> limits the floors (debug). The check FAILS on a build without the module.
const fs = require('fs'), path = require('path');
const F = require('./field-lib.cjs');
const L = F.L;
const SITES = JSON.parse(fs.readFileSync(path.join(F.ROOT, 'scripts/auto/snags/sites.json'), 'utf8'));
const ONLY = process.env.SNAGS_ONLY ? process.env.SNAGS_ONLY.split(',') : null;
const SAFETY = process.env.SNAGS_SAFETY === '1';   // SNAGS_SAFETY=1 (debug): only the safety lines of track S2, on every floor they need; the other lines are not run
const S2 = JSON.parse(fs.readFileSync(path.join(F.ROOT, 'scripts/auto/snags/sites-s2.json'), 'utf8'));
const S2_TRACE = process.env.SNAGS_TRACE || null;                              // a folder: every safety walk's positions are written there (evidence)
const ACT1 = (SITES.act1 && SITES.act1.floors) || {};
const DV = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }, FACE = { E: 2, W: 1, S: 0, N: 3 };

async function seed(page, key, ls) {
  const id = key.replace(/-f\d+$/, ''), n = Number(key.match(/-f(\d+)$/)[1]);
  let xy; if (ACT1[key]) xy = ACT1[key].seed; else if (S2.seeds && S2.seeds[key]) xy = S2.seeds[key]; else { const fl = F.floorOf(id, n); xy = F.midCell(fl, F.landing(fl)) || F.landing(fl); }
  const old = process.env.FIELD_LS; if (ls) process.env.FIELD_LS = [old, ls].filter(Boolean).join(',');
  let pos; try { pos = await F.seedDungeon(page, id, n, xy); } finally { if (ls) { if (old === undefined) delete process.env.FIELD_LS; else process.env.FIELD_LS = old; } }
  await page.waitForTimeout(1500); await F.dismiss(page);
  // the floor's hazards stand still: the mechanic's own tick is taken out (shadows, guards, gusts, knights, bolts);
  // free(), input() and the glide stay as they are. The ice floors keep their tick: it is what carries her over the ice.
  const live = await page.evaluate(() => { const d = window.__QOK_DNG2__, c = d && d.ctx && d.ctx(), m = c && c.mod, sn = window.__QOK_SNAG__, a1 = window.__QOK_SNAG_A1__;
    if (m && c.mechanic.id !== 'slide-ice') { if (m.__snag) m.__snag.tick = null; else if (!m.__quiet) { m.__quiet = true; m.tick = function () {}; } }
    try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {}
    // steady frames, as on a device that holds 60 fps: the game clock advances 1/60 s per drawn frame. On a loaded test box
    // the frame time jitters, her step length with it, and a lip that stops her for good at a steady 4.33 px a frame is
    // sometimes stepped over by luck (day 4: 7 of 113 lips on the build before the fix).
    const g = window.__PHASER_GAME__, raf = g && g.loop && g.loop.raf;
    if (raf && raf.callback && !raf.__steady) { const cb = raf.callback; let t = performance.now(); raf.__steady = true; raf.callback = function () { t += 1000 / 60; return cb.call(this, t); }; }
    return { steady: !!(raf && raf.__steady), api: !!sn, on: !!(sn && sn.on), wrapped: !!(m && m.__snag), mech: c ? c.mechanic.id : null,
      a1: !!a1, a1live: !!(a1 && a1.live()), authored: !!c }; });
  await page.waitForTimeout(300); await F.dismiss(page);
  return { ok: pos.map === id && pos.floor === n && live.steady, pos, live };
}
// Hold the stick (ux,uy) from soles (sx,sy) for ms of GAME time (ms / 16.67 game frames, whatever the box's frame rate);
// every frame is sampled.
const WALK = async ([sx, sy, ux, uy, ms, wantDir, need]) => {
  // an authored Acts 2-5 floor has the dungeon hook's ctx; an Act 1 floor has the mover's probe (or, on a build before it, nothing)
  const D = window.__QOK_DNG2__, c = D && D.ctx && D.ctx(), g = window.__PHASER_GAME__, w = c ? c.scene : g.scene.getScene('WorldMapScene'), A1 = window.__QOK_SNAG_A1__;
  const fd = c ? D.footDy() : (A1 ? A1.footDy(w) : 30.88125);                  // the hero sprite's sole offset (the same sprite everywhere)
  const freeAt = c ? ((x, y) => D.free(x, y)) : (A1 ? ((x, y) => A1.free(w, x, y)) : null);
  const raf = () => new Promise(r => requestAnimationFrame(r));
  window.__DQ_STICK__ = { x: 0, y: 0, m: 0 };
  if (c) c.place(sx, sy - fd); else { const h = w.hero; h.x = sx; h.y = sy - fd; w.heroTileX = Math.floor(sx / 48); w.heroTileY = Math.floor((sy - fd) / 48); try { w.updatePosition(); } catch (e) {} }
  try { w.updateCamera(); } catch (e) {}
  await raf(); await raf(); await raf();
  const a = [w.hero.x, w.hero.y + fd], t0 = performance.now(), sn = window.__QOK_SNAG__, bent0 = sn && sn.stats ? sn.stats.bent : 0;
  const N = Math.round(ms * 60 / 1000), f0 = g.loop.frame, gf = () => g.loop.frame - f0;
  let why = w.showingMessage ? 'message before the walk' : 'time', frames = 0, refused = 0, turned = 0, run = 0, run0 = 0, worst = 0, moved = false, last = a.slice(), path = 0;
  let passMs = null, stallBefore = 0;                                          // when she was past the lip (game time); the longest stall before that, from the first frame
  while (why === 'time' && gf() < N && performance.now() - t0 < ms * 6) {
    window.__DQ_STICK__ = { x: ux, y: uy, m: 1 }; await raf(); frames++;
    const p = [w.hero.x, w.hero.y + fd], mv = Math.hypot(p[0] - last[0], p[1] - last[1]); path += mv; last = p;
    if (freeAt && !freeAt(w.hero.x, w.hero.y)) refused++;
    if (mv >= 0.01) { moved = true; run = 0; run0 = 0; if (wantDir !== null && w.heroDir !== wantDir) turned++; } else { run0++; if (passMs === null && run0 > stallBefore) stallBefore = run0; if (moved) { run++; if (run > worst) worst = run; } }
    if (passMs === null && typeof need === 'number' && (p[0] - a[0]) * ux + (p[1] - a[1]) * uy >= need) passMs = gf() * 1000 / 60;
    if (w.showingMessage) { why = 'message'; break; }
    if (!g.scene.isActive('WorldMapScene') || g.scene.isActive('BattleScene')) { why = 'scene'; break; }
  }
  window.__DQ_STICK__ = { x: 0, y: 0, m: 0 };
  const b = [w.hero.x, w.hero.y + fd];
  return { a, b, why, frames, refused, turned, fd, probe: !!freeAt, deadRun: worst, endDead: run0, stillMs: run0 * 1000 / 60, passMs, stallBefore, bent: (sn && sn.stats ? sn.stats.bent : 0) - bent0, path, ms: gf() * 1000 / 60,
    along: (b[0] - a[0]) * ux + (b[1] - a[1]) * uy, side: Math.abs((b[0] - a[0]) * -uy + (b[1] - a[1]) * ux), msg: !!w.showingMessage };
};
// A solid object of the mechanic (free() === false on painted floor): a lane that meets it 5 px inside one of its corners.
const BLOCKER = () => {
  const D = window.__QOK_DNG2__, c = D.ctx(); if (!c) return null; const T = 48, fd = D.footDy(), m = c.mod; if (!m || !m.free) return null;
  const veto = (x, y) => { try { return m.free(c, x, y, Math.floor(x / T), Math.floor(y / T)) === false; } catch (e) { return false; } };
  const fr = (x, y) => D.free(x, y - fd) && c.maskFree(x, y);
  for (const o of (c.plan.mech || [])) {
    const cells = o.cells && o.cells.length ? o.cells : [[o.x, o.y]];
    for (const cell of cells) { if (typeof cell[0] !== 'number') continue;
      const mx = cell[0] * T + 24, my = cell[1] * T + 24; if (!veto(mx, my)) continue;
      let x0 = mx, x1 = mx, y0 = my, y1 = my;
      while (x0 > mx - 60 && veto(x0 - 1, my)) x0--; while (x1 < mx + 60 && veto(x1 + 1, my)) x1++;
      while (y0 > my - 60 && veto(mx, y0 - 1)) y0--; while (y1 < my + 60 && veto(mx, y1 + 1)) y1++;
      const tries = [['E', x0 - 1, y0 + 5], ['E', x0 - 1, y1 - 5], ['W', x1 + 1, y0 + 5], ['W', x1 + 1, y1 - 5], ['S', x0 + 5, y0 - 1], ['S', x1 - 5, y0 - 1], ['N', x0 + 5, y1 + 1], ['N', x1 - 5, y1 + 1]];
      for (const [d, fx, fy] of tries) { const u = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }[d]; let ok = true;
        for (let i = 0; i <= 34 && ok; i += 2) if (!fr(fx - u[0] * i, fy - u[1] * i)) ok = false;
        // the corner she could slip round: floor beside the object on the near side of the clip
        if (ok) return { kind: o.kind, cell, d, start: [fx - u[0] * 30, fy - u[1] * 30], rect: [x0, y0, x1, y1] }; } } }
  return null;
};
const CHEST = (cells) => {                                                 // cells: the chest cells of an Act 1 floor (no ctx there)
  const D = window.__QOK_DNG2__, c = D && D.ctx && D.ctx(), T = 48, A1 = window.__QOK_SNAG_A1__, w = c ? c.scene : window.__PHASER_GAME__.scene.getScene('WorldMapScene');
  if (!c && !A1) return { noProbe: true };
  const fd = c ? D.footDy() : A1.footDy(w), fr = c ? ((x, y) => D.free(x, y - fd)) : ((x, y) => A1.free(w, x, y - fd));
  const tileAt = (x, y) => c ? c.tile(x, y) : (w.mapData[y] ? w.mapData[y][x] : undefined);
  const list = c ? (c.plan.assets || []) : (cells || []).map(q => ({ kind: 'chest', x: q[0], y: q[1] }));
  for (const a of list) { if (a.kind !== 'chest' || tileAt(a.x, a.y) !== 4) continue;
    const x0 = a.x * T, y0 = a.y * T, x1 = x0 + T - 1, y1 = y0 + T - 1;
    const tries = [['E', x0 - 1, y0 + 8], ['E', x0 - 1, y1 - 8], ['W', x1 + 1, y0 + 8], ['W', x1 + 1, y1 - 8], ['N', x0 + 8, y1 + 1], ['N', x1 - 8, y1 + 1]];
    for (const [d, fx, fy] of tries) { const u = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }[d]; let ok = true;
      for (let i = 0; i <= 34 && ok; i += 2) if (!fr(fx - u[0] * i, fy - u[1] * i)) ok = false;
      if (ok) return { cell: [a.x, a.y], d, start: [fx - u[0] * 30, fy - u[1] * 30] }; } }
  return null;
};
// Demon Castle: a pit three cells wide with floor south of it; the last row of painted floor below its lip.
const PIT = () => {
  const D = window.__QOK_DNG2__, c = D.ctx(), T = 48; let pick = null;
  for (let y = 0; y < 200 && !pick; y++) for (let x = 0; x < 200 && !pick; x++) if ([-1, 0, 1].every(dx => c.terrain(x + dx, y) === '_' && [1, 2, 3].every(dy => c.terrain(x + dx, y + dy) === '.'))) pick = [x, y];
  if (!pick) return null;
  const cx = (pick[0] + 0.5) * T; let yr = (pick[1] + 3) * T;
  while (yr > pick[1] * T && c.maskFree(cx, yr - 1) && c.maskFree(cx - 40, yr - 1) && c.maskFree(cx + 40, yr - 1)) yr--;
  return { pit: pick, start: [cx, yr], falls: c.state.falls || 0 };
};
const FALLS = () => { const c = window.__QOK_DNG2__.ctx(); return c && c.state ? (c.state.falls || 0) : 0; };

// ---- safety walks (track S2) ----------------------------------------------------------------------------------------
// One walk with the game stepped by hand, one 1/60 s frame per call (seed()'s steady clock), so a walk costs no waiting:
// soles (sx,sy), stick (ux,uy) at magnitude mag for `frames` frames. glide false: the same walk with the glide taken out
// (the mechanic's own input hook put back for the walk; the Act 1 mover's switch off). A floor change the mover asks for
// is noted and held back, so she stays on the floor. Every frame: [sole x, sole y, 1 if the glide bent this frame].
const WALK2 = ([sx, sy, ux, uy, mag, frames, glide]) => {
  const D = window.__QOK_DNG2__, c = D && D.ctx && D.ctx(), g = window.__PHASER_GAME__, w = c ? c.scene : g.scene.getScene('WorldMapScene'), A1 = window.__QOK_SNAG_A1__, sn = window.__QOK_SNAG__;
  const fd = c ? D.footDy() : (A1 ? A1.footDy(w) : 30.88125), raf = g.loop.raf;
  if (!raf || !raf.__steady) return { why: 'no steady clock', tr: [], a: [sx, sy], fd };
  const m = c && c.mod, wrapped = !!(m && m.__snag), wi = wrapped ? m.input : null, on = sn ? sn.on : null, pt = w.performTransition; let asked = 0;
  if (!glide) { if (wrapped) m.input = m.__snag.input; if (sn) sn.on = false; }
  w.performTransition = function () { asked++; };
  const step = () => raf.callback(performance.now());
  try {
    window.__DQ_STICK__ = { x: 0, y: 0, m: 0 };
    if (c) c.place(sx, sy - fd); else { const h = w.hero; h.x = sx; h.y = sy - fd; w.heroTileX = Math.floor(sx / 48); w.heroTileY = Math.floor((sy - fd) / 48); try { w.updatePosition(); } catch (e) {} }
    try { w.updateCamera(); } catch (e) {}
    step(); step();
    const a = [w.hero.x, w.hero.y + fd], tr = []; let b0 = sn && sn.stats ? sn.stats.bent : 0, why = w.showingMessage ? 'message before the walk' : 'time', way = -1;
    for (let i = 0; i < frames && why === 'time'; i++) { window.__DQ_STICK__ = { x: ux, y: uy, m: mag }; step();
      const nb = sn && sn.stats ? sn.stats.bent : 0; tr.push([w.hero.x, w.hero.y + fd, nb > b0 ? 1 : 0]); b0 = nb;
      if (asked && way < 0) way = i;
      if (w.showingMessage) why = 'message'; else if (!g.scene.isActive('WorldMapScene') || g.scene.isActive('BattleScene')) why = 'scene'; }
    window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; step();
    return { a, tr, why, fd, way, api: !!sn };
  } finally { w.performTransition = pt; if (!glide) { if (wrapped) m.input = wi; if (sn) sn.on = on; } }
};
async function walk2(page, args, tag) {
  await F.dismiss(page);
  let r = await page.evaluate(WALK2, args);
  if (r.why === 'message before the walk') { await F.dismiss(page); r = await page.evaluate(WALK2, args); }
  if (r.why === 'message') await F.dismiss(page);
  if (S2_TRACE && tag) { try { fs.mkdirSync(S2_TRACE, { recursive: true }); fs.appendFileSync(path.join(S2_TRACE, 'walks.jsonl'), JSON.stringify({ tag, url: process.env.PROBE_URL, args, why: r.why, way: r.way, a: r.a, tr: r.tr.map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100, q[2]]) }) + '\n'); } catch (e) {} }
  return r;
}
// the glide's allowance over one press (snag-slide.js BOUND / REFILL), from the frames of a walk
function s2Level(r, ux, uy) { let lv = 0, top = 0, prev = r.a, bent = 0; for (const q of r.tr) { const dx = q[0] - prev[0], dy = q[1] - prev[1], adv = dx * ux + dy * uy, lat = -dx * uy + dy * ux; prev = q; if (q[2]) { bent++; lv += Math.abs(lat); if (lv > top) top = lv; } else if (adv > 0) lv = Math.max(0, lv - S2.refill * adv); } return { top, bent }; }
function s2In(shape, q, fd) { const x = q[0], y = shape.centre ? q[1] - fd : q[1];
  if (shape.cells) { const cx = Math.floor(x / 48), cy = Math.floor(y / 48); return shape.cells.some(c => c[0] === cx && c[1] === cy); }
  if (shape.rect) return x >= shape.rect[0] && x < shape.rect[2] && y >= shape.rect[1] && y < shape.rect[3];
  if (shape.disc) return Math.hypot(x - shape.disc[0], y - shape.disc[1]) <= shape.disc[2];
  return false; }
const s2 = { flat: [], haz: [], push: {}, floors: new Set() };
const s2Keys = () => { const k = new Set(); for (const e of S2.flat) k.add(e.key); for (const e of S2.hazard) k.add(e.key); for (const a in S2.pushes) for (const e of S2.pushes[a]) k.add(e.key); return [...k].sort(); };
async function s2Floor(page, key) {
  if (s2.floors.has(key)) return; s2.floors.add(key);
  for (const e of S2.flat.filter(q => q.key === key)) { const [ux, uy] = DV[e.d], r = await walk2(page, [e.start[0], e.start[1], ux, uy, e.m, 180, true], 'flat ' + key);
    let stop = -1, after = 0, prev = r.a; r.tr.forEach((q, i) => { const mv = Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; if (stop < 0 && mv < 0.01) stop = i; else if (stop >= 0) after = Math.max(after, Math.hypot(q[0] - r.tr[stop][0], q[1] - r.tr[stop][1])); });
    const end = r.tr.length ? r.tr[r.tr.length - 1] : r.a, side = Math.abs((end[0] - r.a[0]) * -uy + (end[1] - r.a[1]) * ux), bent = r.tr.filter(q => q[2]).length;
    s2.flat.push({ e, ok: r.why === 'time' && r.tr.length === 180 && bent === 0 && stop >= 0 && after < 0.01 && side <= e.side + 1.5, bent, side, after, stop, why: r.why }); }
  for (const e of S2.hazard.filter(q => q.key === key)) { const a = e.deg * Math.PI / 180, args = [e.start[0], e.start[1], Math.cos(a), Math.sin(a), 1, e.frames];
    const u = await walk2(page, args.concat([false]), 'hazard, glide out ' + key), g = await walk2(page, args.concat([true]), 'hazard ' + key);
    const hit = r => { const i = r.tr.findIndex(q => s2In(e.shape, q, r.fd)); return e.shape.centre && r.way >= 0 ? (i < 0 ? r.way : Math.min(i, r.way)) : i; };
    const gi = hit(g), ui = hit(u); s2.haz.push({ e, ok: !(gi >= 0 && ui < 0), gi, ui, bent: g.tr.filter(q => q[2]).length, gEnd: g.tr.length ? g.tr[g.tr.length - 1] : g.a, uEnd: u.tr.length ? u.tr[u.tr.length - 1] : u.a, why: g.why + '/' + u.why }); }
  for (const act in S2.pushes) for (const e of S2.pushes[act].filter(q => q.key === key)) { const a = e.deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), r = await walk2(page, [e.start[0], e.start[1], ux, uy, 1, 45, true], 'push ' + key);
    const L = s2Level(r, ux, uy); (s2.push[act] = s2.push[act] || []).push({ e, top: L.top, bent: L.bent, ok: L.top <= S2.bound + 0.01, frames: r.tr.length, why: r.why }); }
}

// One walk: no message box is open when it starts; what a walk that ended on a message said is kept.
async function walk(page, args) {
  await F.dismiss(page);
  const n0 = (await F.messages(page)).length; let r = await page.evaluate(WALK, args);
  if (r.why === 'message before the walk') { await F.dismiss(page); r = await page.evaluate(WALK, args); }   // a line said on arrival at the spot
  if (r.why !== 'time') { r.said = (await F.messages(page)).slice(n0).map(m => m.t.replace(/\s+/g, ' ').slice(0, 60)); await F.dismiss(page); }
  return r;
}
const STALL = 6;   // frames she may stand at a lip before the glide carries her on (it arms one frame after a dead frame)

(async () => {
  const { browser, page } = await L.launch({ dpr: 1 });
  let lipWalks = 0, lipPass = 0, wallWalks = 0, blockers = 0, chests = 0, robots = 0;
  const keys = Object.keys(SITES.floors).sort().concat(Object.keys(ACT1).sort()).filter(k => !ONLY || ONLY.includes(k));
  let a1Lips = 0, a1Pass = 0;
  try {
    for (const key of keys) {
      const A1 = !!ACT1[key], S = A1 ? ACT1[key] : SITES.floors[key], s = await seed(page, key);
      if (!F.ok(s.ok && (A1 ? !s.live.authored : s.live.authored), `${key}: reached (Continue on the floor)`, `at ${s.pos.map} ${s.pos.floor}F${A1 ? ' (Act 1: the mover alone, no mechanic)' : ''}`)) continue;
      if (SAFETY) { await s2Floor(page, key); continue; }
      if (A1) F.ok(s.live.api && s.live.on && s.live.a1 && s.live.a1live, `${key}: the wall glide is live in the mover (Act 1)`, JSON.stringify(s.live));
      else F.ok(s.live.api && s.live.on && s.live.wrapped, `${key}: the wall glide is live on this floor's mechanic (${s.live.mech})`, JSON.stringify(s.live));
      let refused = 0, turned = 0, frames = 0;
      for (const p of S.lips || []) {
        const [ux, uy] = DV[p.d], r = await walk(page, [p.start[0], p.start[1], ux, uy, 1300, FACE[p.d], p.need]); lipWalks++;
        refused += r.refused; turned += r.turned; frames += r.frames;
        if (typeof p.stop === 'string') {   // a wanted stop (28 Nov, REVIEW-S2; Act 1 lips carry a numeric "stop" point, not this): the glide must leave her exactly where the mover alone stops, in her own cell
          const end = r.b || r.a, off = Math.hypot(end[0] - p.deadAt[0], end[1] - p.deadAt[1]);
          // 4 px: the model's mover and the browser's differ by up to 2.9 px at these corners (integration run 28 Nov); what matters is 0 bent frames and not past
          F.ok(r.passMs === null && (r.bent || 0) === 0 && off <= 4 && r.why === 'time', `${key}: lip ${p.cls} px (push ${p.d} from soles ${p.start.map(Math.round)}): she stops where the mover alone stops, no bent frame`,
            `${r.bent || 0} bent frame(s), ends ${end.map(v => v.toFixed(1))}, the mover alone ${p.deadAt.map(v => v.toFixed(1))} (${off.toFixed(1)} px apart${r.passMs !== null ? ', she got past' : ''}); ${p.stop}`);
          continue;
        }
        const ok = r.passMs !== null && r.stallBefore <= STALL && r.why === 'time'; if (ok) lipPass++; if (A1) { a1Lips++; if (ok) a1Pass++; }
        F.ok(ok, `${key}: lip ${p.cls} px (push ${p.d} along the wall from soles ${p.start.map(Math.round)}): she walks on past it`,
          r.passMs !== null ? `past it (${p.need} px along) after ${(r.passMs / 1000).toFixed(2)} s, longest stall on the way ${r.stallBefore} frame(s); ${r.along.toFixed(1)} px along in ${(r.ms / 1000).toFixed(1)} s`
            : `${r.along.toFixed(1)} px along in ${(r.ms / 1000).toFixed(1)} s (past the lip is ${p.need}), ended on ${r.endDead} dead frames at ${r.b.map(v => v.toFixed(1))}${r.why !== 'time' ? ' (' + r.why + ': ' + (r.said || []).join(' | ') + ')' : ''}`);
      }
      for (const p of (SITES.robot || []).filter(q => q.key === key)) {
        const [ux, uy] = DV[p.d], need = p.need || 20, r = await walk(page, [p.at[0], p.at[1], ux, uy, 900, FACE[p.d], need]); robots++;
        refused += r.refused; frames += r.frames;
        F.ok(r.passMs !== null && r.stallBefore <= STALL && Math.hypot(r.a[0] - p.at[0], r.a[1] - p.at[1]) < 1.5, `${key}: the robot's stuck spot (soles ${p.at.map(v => v.toFixed(1))}, push ${p.d}): she walks on`,
          `placed at ${r.a.map(v => v.toFixed(1))}, ${r.along.toFixed(1)} px along, ${r.passMs !== null ? need + ' px after ' + (r.passMs / 1000).toFixed(2) + ' s, longest stall on the way ' + r.stallBefore + ' frame(s)' : 'ended on ' + r.endDead + ' dead frames'}${r.why !== 'time' ? ' (' + r.why + ')' : ''}`);
      }
      for (const p of S.walls || []) {
        const [ux, uy] = DV[p.d], r = await walk(page, [p.start[0], p.start[1], ux, uy, 1100, FACE[p.d]]); wallWalks++;
        refused += r.refused; frames += r.frames;
        F.ok(r.why === 'time' && r.along <= 34 && r.along >= 18 && r.side <= 8 && r.bent === 0, `${key}: a flat wall (push ${p.d} square into the face at ${p.face}): she stops at it, the glide does not bend her push`, `${r.along.toFixed(1)} px along after ${(r.ms / 1000).toFixed(1)} s of pushing (the face is 30 px ahead), ${r.side.toFixed(1)} px sideways, ${r.bent} bent frame(s), still for the last ${(r.stillMs / 1000).toFixed(2)} s${r.why !== 'time' ? ' (' + r.why + ')' : ''}`);
      }
      const B = await page.evaluate(BLOCKER);
      if (B) { const [ux, uy] = DV[B.d], r = await walk(page, [B.start[0], B.start[1], ux, uy, 1000, null]); blockers++;
        refused += r.refused; frames += r.frames;
        F.ok(r.why !== 'message before the walk' && r.along >= 20 && r.along <= (r.why === 'message' ? 54 : 31.5) && r.side <= 2.5 && r.bent === 0, `${key}: the mechanic's solid ${B.kind} at cell ${B.cell} (push ${B.d} at its corner, 5 px in): she neither passes it nor slides round it (or it answers her bump), the glide does not bend her push`, `${r.along.toFixed(1)} px along (its face is 30 px ahead), ${r.side.toFixed(1)} px sideways, ${r.bent} bent frame(s)${r.why !== 'time' ? ', ' + r.why + (r.said ? ' "' + r.said.join(' | ') + '"' : '') : ''}`); }
      if (S.chest || (S.chests && S.chests.length)) { const C = await page.evaluate(CHEST, S.chests || null);
        if (C && C.noProbe) F.ok(false, `${key}: walking into a chest at its corner still opens it`, 'not run: this build has no Act 1 probe (window.__QOK_SNAG_A1__)');
        else if (C) { const [ux, uy] = DV[C.d], r = await walk(page, [C.start[0], C.start[1], ux, uy, 1500, null]); chests++;
          const t = await page.evaluate(([x, y]) => { const c = window.__QOK_DNG2__.ctx(), w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return c ? c.tile(x, y) : w.mapData[y][x]; }, C.cell);
          F.ok(r.why === 'message' && r.along >= 20 && r.along <= 34 && r.side <= 3, `${key}: walking into the chest at cell ${C.cell} at its corner (push ${C.d}, 8 px in) still opens it`, `${r.why}${r.said ? ' "' + r.said.join(' | ') + '"' : ''}, tile ${t}, ${r.along.toFixed(1)} px along (its face is 30 px ahead), ${r.side.toFixed(1)} px sideways`);
          await page.waitForTimeout(300); await F.dismiss(page); }
        else F.info(`${key}: chest`, 'no closed chest with a free lane to its corner on this floor'); }
      if (S.pit) { const P = await page.evaluate(PIT);
        if (F.ok(!!P, `${key}: a pit with floor south of it was found`, JSON.stringify(P))) {
          for (const d of ['E', 'W']) { const [ux, uy] = DV[d], r = await walk(page, [P.start[0], P.start[1], ux, uy, 500, FACE[d]]); refused += r.refused; frames += r.frames; }
          await page.waitForTimeout(700); const f1 = await page.evaluate(FALLS);
          F.ok(f1 === P.falls, `${key}: hugging the lip of the pit at cell ${P.pit} sideways (soles y ${P.start[1]}, east then west) does not drop her in`, `falls ${P.falls} -> ${f1}`);
          await F.dismiss(page); } }
      if (A1 && !s.live.a1) F.ok(false, `${key}: she never stood on a spot the mover refuses`, 'not run: this build has no Act 1 probe (window.__QOK_SNAG_A1__)');
      else F.ok(refused === 0, `${key}: she never stood on a spot the mover refuses`, `${refused} of ${frames} frames`);
      F.ok(turned === 0, `${key}: she kept facing the way she pushed on every moving frame of the lip walks`, `${turned} frame(s) turned`);
      await s2Floor(page, key);                                                // the safety walks of this floor (reported below, after every floor)
    }
    // ---- safety (track S2): the floors only the safety walks need, then the three kinds of line ----
    for (const key of s2Keys().filter(k => !s2.floors.has(k) && (!ONLY || ONLY.includes(k)))) {
      const s = await seed(page, key);
      if (!F.ok(s.ok, `${key}: reached (Continue on the floor) for the safety walks`, `at ${s.pos.map} ${s.pos.floor}F`)) continue;
      await s2Floor(page, key);
    }
    {
      const fb = s2.flat.filter(q => !q.ok), fmt = q => `${q.e.key} ${q.e.d} from ${q.e.start.map(Math.round)}${q.e.kind !== 'plain' ? ' (' + q.e.kind + ')' : ''}: ${q.bent} bent frame(s), ${q.side.toFixed(1)} px sideways, ${q.after.toFixed(1)} px after her first stop${q.why !== 'time' ? ', ' + q.why : ''}`;
      F.ok(fb.length === 0 && (ONLY || s2.flat.length >= 40), `safety (a): a push square into a flat wall, held 3 s, never moves her sideways (${s2.flat.length} places on all five acts, the review's two among them)`,
        fb.length ? `${fb.length} of ${s2.flat.length} moved: ` + fb.slice(0, 6).map(fmt).join(' | ') : `${s2.flat.length} places: 0 bent frames, 0.0 px after the first stop everywhere; widest sideways on the way in ${Math.max(0, ...s2.flat.map(q => q.side)).toFixed(1)} px (the mover's own)`);
      const named = s2.flat.filter(q => q.e.kind === 'named'); for (const q of named) F.info(`safety (a), the review's place ${q.e.key}`, fmt(q));
      const hb = s2.haz.filter(q => !q.ok), kinds = {}; for (const q of s2.haz) kinds[q.e.kind] = (kinds[q.e.kind] || 0) + 1;
      const hf = q => `${q.e.key} ${q.e.zone} (soles ${q.e.start.map(Math.round)}, push ${q.e.deg} deg): ${q.gi >= 0 ? 'in the zone at frame ' + q.gi : 'never in the zone'} with the glide (${q.bent} bent), ${q.ui >= 0 ? 'in it at frame ' + q.ui : 'never in it'} with the glide out; ends ${q.gEnd.map(v => v.toFixed(1))} against ${q.uEnd.map(v => v.toFixed(1))}`;
      const pil = s2.haz.find(q => q.e.pillar);
      if (pil || !ONLY) F.ok(!!pil && pil.ok, 'safety (b), the Demon Barracks 1F pillar (north into its south face, near its east end): the glide does not slide her into the lit column', pil ? hf(pil) : 'not walked');
      F.ok(hb.length === 0 && (ONLY || s2.haz.length >= 31), `safety (b): beside a trigger zone the walk with the glide reaches no zone the walk without it does not (${s2.haz.length} places: ${Object.keys(kinds).map(k => kinds[k] + ' ' + k).join(', ')})`,
        hb.length ? `${hb.length} of ${s2.haz.length} reached one: ` + hb.slice(0, 5).map(hf).join(' | ') : `${s2.haz.length} places, none reached`);
      for (const act of Object.keys(S2.pushes).sort()) { const l = s2.push[act] || [], bad = l.filter(q => !q.ok), worst = l.reduce((a, q) => q.top > a.top ? q : a, { top: 0 });
        if (!l.length && ONLY) continue;
        F.ok(bad.length === 0 && (ONLY || l.length === 200), `safety (c), Act ${act}: ${l.length} near-wall pushes, her sideways travel on bent frames never passes the allowance of ${S2.bound} px`,
          bad.length ? `${bad.length} of ${l.length} passed it: ` + bad.sort((a, b) => b.top - a.top).slice(0, 5).map(q => `${q.e.key} soles ${q.e.start.map(Math.round)} push ${q.e.deg} deg: ${q.top.toFixed(1)} px (${q.bent} bent frames)`).join(' | ') : `widest ${worst.top.toFixed(2)} px${worst.e ? ' (' + worst.e.key + ', soles ' + worst.e.start.map(Math.round) + ', push ' + worst.e.deg + ' deg)' : ''}; ${l.filter(q => q.bent).length} of the walks were bent at all, ${l.reduce((a, q) => a + q.bent, 0)} bent frames`); }
    }
    // the switch off: the first floor's lips stop her again
    const keys25 = keys.filter(k => !ACT1[k]), keysA1 = keys.filter(k => ACT1[k]);
    if (!SAFETY && keys25.length) {
      const key = keys25.includes('shadowCave-f3') ? 'shadowCave-f3' : keys25[0], S = SITES.floors[key], s = await seed(page, key, 'qok-snag-slide=0');
      F.ok(s.ok && s.live.api && !s.live.on && !s.live.wrapped, `${key} with qok-snag-slide=0: reached, the glide is off`, JSON.stringify(s.live));
      let dead = 0;
      for (const p of S.lips || []) { const [ux, uy] = DV[p.d], r = await walk(page, [p.start[0], p.start[1], ux, uy, 1300, null, p.need]); if (r.passMs === null && r.endDead >= 10) dead++; }
      F.ok(dead >= Math.ceil((S.lips || []).length / 2), `${key} with qok-snag-slide=0: the lips stop her dead as before`, `${dead} of ${(S.lips || []).length} lips`);
    }
    if (!SAFETY && keysA1.length) {                                                       // the same switch turns the Act 1 glide off
      const key = keysA1[0], S = ACT1[key], s = await seed(page, key, 'qok-snag-slide=0');
      F.ok(s.ok && s.live.a1 && !s.live.a1live && !s.live.on, `${key} (Act 1) with qok-snag-slide=0: reached, the glide is off`, JSON.stringify(s.live));
      let dead = 0;
      for (const p of S.lips || []) { const [ux, uy] = DV[p.d], r = await walk(page, [p.start[0], p.start[1], ux, uy, 1300, null, p.need]); if (r.passMs === null && r.endDead >= 10) dead++; }
      F.ok(dead >= Math.ceil((S.lips || []).length / 2), `${key} (Act 1) with qok-snag-slide=0: the lips stop her dead as before`, `${dead} of ${(S.lips || []).length} lips`);
    }
  } catch (e) { F.ok(false, 'snags check ran', String(e && e.stack || e).slice(0, 400)); }
  if (!ONLY && !SAFETY) { F.ok(lipWalks >= 60 && a1Lips >= 16, 'lips were walked in every dungeon', `${lipWalks} lip walks on ${keys.length} floors, ${a1Lips} of them on the Act 1 floors`); F.ok(wallWalks >= 20 && blockers >= 3, 'walls and blockers were tested', `${wallWalks} wall walks, ${blockers} blockers, ${chests} chests`); }
  F.info('walks', `${lipPass}/${lipWalks} lips passed (Act 1: ${a1Pass}/${a1Lips}), ${robots} robot spots, ${wallWalks} walls, ${blockers} blockers, ${chests} chests`);
  await browser.close();
  F.done('snags');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
