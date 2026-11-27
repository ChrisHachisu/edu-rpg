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
// SNAGS_ONLY=<floorKey,floorKey> limits the floors (debug). The check FAILS on a build without the module.
const fs = require('fs'), path = require('path');
const F = require('./field-lib.cjs');
const L = F.L;
const SITES = JSON.parse(fs.readFileSync(path.join(F.ROOT, 'scripts/auto/snags/sites.json'), 'utf8'));
const ONLY = process.env.SNAGS_ONLY ? process.env.SNAGS_ONLY.split(',') : null;
const ACT1 = (SITES.act1 && SITES.act1.floors) || {};
const DV = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] }, FACE = { E: 2, W: 1, S: 0, N: 3 };

async function seed(page, key, ls) {
  const id = key.replace(/-f\d+$/, ''), n = Number(key.match(/-f(\d+)$/)[1]);
  let xy; if (ACT1[key]) xy = ACT1[key].seed; else { const fl = F.floorOf(id, n); xy = F.midCell(fl, F.landing(fl)) || F.landing(fl); }
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
      if (A1) F.ok(s.live.api && s.live.on && s.live.a1 && s.live.a1live, `${key}: the wall glide is live in the mover (Act 1)`, JSON.stringify(s.live));
      else F.ok(s.live.api && s.live.on && s.live.wrapped, `${key}: the wall glide is live on this floor's mechanic (${s.live.mech})`, JSON.stringify(s.live));
      let refused = 0, turned = 0, frames = 0;
      for (const p of S.lips || []) {
        const [ux, uy] = DV[p.d], r = await walk(page, [p.start[0], p.start[1], ux, uy, 1300, FACE[p.d], p.need]); lipWalks++;
        refused += r.refused; turned += r.turned; frames += r.frames;
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
    }
    // the switch off: the first floor's lips stop her again
    const keys25 = keys.filter(k => !ACT1[k]), keysA1 = keys.filter(k => ACT1[k]);
    if (keys25.length) {
      const key = keys25.includes('shadowCave-f3') ? 'shadowCave-f3' : keys25[0], S = SITES.floors[key], s = await seed(page, key, 'qok-snag-slide=0');
      F.ok(s.ok && s.live.api && !s.live.on && !s.live.wrapped, `${key} with qok-snag-slide=0: reached, the glide is off`, JSON.stringify(s.live));
      let dead = 0;
      for (const p of S.lips || []) { const [ux, uy] = DV[p.d], r = await walk(page, [p.start[0], p.start[1], ux, uy, 1300, null, p.need]); if (r.passMs === null && r.endDead >= 10) dead++; }
      F.ok(dead >= Math.ceil((S.lips || []).length / 2), `${key} with qok-snag-slide=0: the lips stop her dead as before`, `${dead} of ${(S.lips || []).length} lips`);
    }
    if (keysA1.length) {                                                       // the same switch turns the Act 1 glide off
      const key = keysA1[0], S = ACT1[key], s = await seed(page, key, 'qok-snag-slide=0');
      F.ok(s.ok && s.live.a1 && !s.live.a1live && !s.live.on, `${key} (Act 1) with qok-snag-slide=0: reached, the glide is off`, JSON.stringify(s.live));
      let dead = 0;
      for (const p of S.lips || []) { const [ux, uy] = DV[p.d], r = await walk(page, [p.start[0], p.start[1], ux, uy, 1300, null, p.need]); if (r.passMs === null && r.endDead >= 10) dead++; }
      F.ok(dead >= Math.ceil((S.lips || []).length / 2), `${key} (Act 1) with qok-snag-slide=0: the lips stop her dead as before`, `${dead} of ${(S.lips || []).length} lips`);
    }
  } catch (e) { F.ok(false, 'snags check ran', String(e && e.stack || e).slice(0, 400)); }
  if (!ONLY) { F.ok(lipWalks >= 60 && a1Lips >= 16, 'lips were walked in every dungeon', `${lipWalks} lip walks on ${keys.length} floors, ${a1Lips} of them on the Act 1 floors`); F.ok(wallWalks >= 20 && blockers >= 3, 'walls and blockers were tested', `${wallWalks} wall walks, ${blockers} blockers, ${chests} chests`); }
  F.info('walks', `${lipPass}/${lipWalks} lips passed (Act 1: ${a1Pass}/${a1Lips}), ${robots} robot spots, ${wallWalks} walls, ${blockers} blockers, ${chests} chests`);
  await browser.close();
  F.done('snags');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
