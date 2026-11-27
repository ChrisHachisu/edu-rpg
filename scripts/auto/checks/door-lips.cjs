'use strict';
// Doorway lips (day 3, track D, 2026-11-26). The painted post at a Demon Castle mirror doorway ends in a
// point that the collision mask draws up to ~20 px INTO the doorway's cells, so a hero hugging a wall of
// the hall stopped dead at the doorway, 20 px short of the room, with no slide and no message (1F first
// mirror room: soles y 1134..1138, stop at x 2236; the story robot "missed" it 5 of 5).
// Fix: public/acts-dungeons/modules/mirror-rooms.js free() opens those mask spots (only inside a doorway's
// own cells, only the first 28 px from the opening's edge, only where the mask is free again within 64 px on
// both sides of the row). localStorage 'qok-door-lips' = '0' restores the old behaviour.
// What this checks, on a save seeded on each of the nine floors (Continue):
//   * every doorway of every mirror room (plan rooms' doors entry/exit, 32 on nine floors): the soles are put
//     in the hall 70 px short of the doorway on the LOWEST and on the HIGHEST row of the opening where the hall
//     lane and the room lane are both clear (hugging either wall), the stick is held straight at the room, and
//     she must end up inside the room (exit doors are walked from outside in, so the room's swap never starts);
//   * the switch off ('qok-door-lips' = '0'): the 1F first doorway, hugging the lower wall, stops short (the old stop);
//   * negative: where a real wall stands beside a doorway (a row just outside the opening whose hall and room
//     lanes are clear but whose doorway column is wall) she still stops; a pit lip still lets her step off
//     and she falls (the pit rule is untouched).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5551/ node scripts/auto/checks/door-lips.cjs
// DOOR_LIPS_ONLY=<floor,floor> limits the floors (debug).
const fs = require('fs'), path = require('path');
const F = require('./field-lib.cjs');
const L = F.L;
const PLANS = path.join(F.ROOT, 'scripts/auto/feel/data/plans');
const PILOT = fs.readFileSync(path.join(F.ROOT, 'scripts/acts/probe/mech/_b-pilot.js'), 'utf8');
const plan = n => JSON.parse(fs.readFileSync(path.join(PLANS, `demonCastle-f${n}.json`), 'utf8'));
const ONLY = process.env.DOOR_LIPS_ONLY ? process.env.DOOR_LIPS_ONLY.split(',').map(Number) : null;
const ID = 'demonCastle', T = 48;

async function seed(page, n, off) {
  const fl = F.floorOf(ID, n), xy = F.midCell(fl, F.landing(fl));
  const s = L.save({ mapId: ID, floor: n, x: xy[0], y: xy[1], flags: { ...L.allFlags(), ...F.ALLB }, inventory: F.INV, completedQuests: F.QUESTS });
  s.player.name = 'Mika';
  await page.goto(F.URL_, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([s, off]) => { localStorage.clear(); localStorage.setItem('edu-rpg-save', JSON.stringify(s)); if (off) localStorage.setItem('qok-door-lips', '0'); }, [s, off]);
  await page.reload({ waitUntil: 'load' });
  await L.toTitle(page);
  await page.evaluate(() => { const t = window.__PHASER_GAME__.scene.getScene('TitleScene'); const i = t.menuItems.findIndex(m => m.getData && m.getData('action') === 'continue'); t.selectedIndex = i; t.confirmTitle(); });
  await page.waitForFunction(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return w && g.scene.isActive('WorldMapScene') && w.hero && w.mapData; }, { timeout: 90000 });
  await page.evaluate(() => { try { window.__GAME_STATE__.encounterManager.onStep = () => null; } catch (e) {} });
  await F.settle(page);
  const ready = await page.waitForFunction(() => { const d = window.__QOK_DNG2__, s = d && d.state && d.state(); const c = d && d.ctx && d.ctx(); return s && s.module && c && c.state && c.state.ok; }, { timeout: 60000, polling: 100 }).then(() => true).catch(() => false);
  await page.evaluate(PILOT);
  await F.dismiss(page);
  return { pos: await L.pos(page), ready };
}

// In the page: the doorway's rows (hug rows, wall rows) from the pure mask, and walks.
const LANES = ([d, T]) => {
  const c = window.__QOK_DNG2__.ctx(), free = (x, y) => c.maskFree(x, y);
  const dl = d.x * T, dr = dl + T, top = d.y0 * T, bot = (d.y1 + 1) * T;
  const hall = d.west ? [dl - 70, dl - 2] : [dr + 2, dr + 70], room = d.west ? [dr + 2, dr + T] : [dl - T, dl - 2];
  const lane = (y, s) => { for (let x = s[0]; x <= s[1]; x += 2) if (!free(x, y)) return false; return true; };
  const clear = y => lane(y, hall) && lane(y, room);
  let lo = null, hi = null, wall = [];
  for (let y = top; y < bot; y++) if (clear(y)) { if (hi === null) hi = y; lo = y; }
  // The real wall beside the doorway: a row just outside the opening whose hall lane is clear up to a FLAT face of wall (the face
  // stands at the same x, +-2, for 24 px of rows each side, so she cannot slide round it) inside the doorway's reach.
  const start = d.west ? dl - 70 : dr + 70, sgn = d.west ? 1 : -1, end = d.west ? d.rx0 : d.rx1;
  const face = y => { for (let x = start; d.west ? x < end : x > end; x += sgn) if (!free(x, y)) return x; return null; };
  const nearPit = y => { for (let cx = Math.floor(Math.min(start, end) / T) - 3; cx <= Math.floor(Math.max(start, end) / T) + 3; cx++) for (let cy = Math.floor(y / T) - 3; cy <= Math.floor(y / T) + 3; cy++) if (c.terrain(cx, cy) === '_') return true; return false; };
  const flat = y => { if (nearPit(y)) return false; const f0 = face(y); if (f0 === null || Math.abs(f0 - start) < 12) return false; for (let j = -24; j <= 24; j += 2) { const f = face(y + j); if (f === null || Math.abs(f - f0) > 2) return false; } return true; };
  for (let k = 8; k <= 60; k++) for (const y of [top - k, bot + k - 1]) if (flat(y)) wall.push(y);
  return { lo, hi, wall, start: d.west ? dl - 70 : dr + 70, goal: d.west ? d.rx0 + 1 : d.rx1 - 1, dir: d.west ? 1 : -1 };
};
const WALK = async ([y, x0, dir, goal]) => {
  const B = window.__B, c = B.ctx(), K = window.__QOK_D2KIT_B__, S = c.state;
  await B.dismiss(10);
  S.room = undefined; S.latch = null; S.placed = false; S.hold = 0;       // a fresh look at where she stands (as after Continue)
  K.placeSoles(c, x0, y); await B.wait(220);
  const a = B.here();
  await B.push(dir, 0, 4500, () => (dir > 0 ? B.here()[0] >= goal : B.here()[0] <= goal));
  const b = B.here(), ok = dir > 0 ? b[0] >= goal : b[0] <= goal;
  await B.wait(150); await B.dismiss(10);
  return { from: a.map(Math.round), to: b.map(Math.round), ok, room: S.room ? S.room.id : null };
};

(async () => {
  const { browser, page } = await L.launch({ dpr: 1 });
  let walked = 0, lipRows = 0, wallsDone = 0;
  try {
    for (let n = 1; n <= 9; n++) {
      if (ONLY && !ONLY.includes(n)) continue;
      const P = plan(n), doors = [];
      for (const r of P.mechanic.rooms) for (const nm of ['entry', 'exit']) {
        const cs = (r.doors || {})[nm]; if (!cs || !cs.length) continue;
        doors.push({ room: r.id, name: nm, x: cs[0][0], y0: Math.min(...cs.map(c => c[1])), y1: Math.max(...cs.map(c => c[1])), west: cs[0][0] < r.rect[0], rx0: r.rect[0] * T, rx1: (r.rect[2] + 1) * T });
      }
      const s = await seed(page, n, false);
      if (!F.ok(s.pos.map === ID && s.pos.floor === n && s.ready, `Demon Castle ${n}F reached, mirror module live`, `at ${s.pos.map} ${s.pos.floor}F`)) continue;
      let wallsHere = 0, warm = false;
      for (const d of doors) {
        const tag = `${n}F room ${P.mechanic.rooms.find(r => r.id === d.room).type}${d.room} ${d.name} doorway (cell x ${d.x}, rows ${d.y0}-${d.y1})`;
        const ln = await page.evaluate(LANES, [d, T]);
        if (ln.lo === null) { F.ok(false, `${tag}: a clear lane through the doorway exists`, 'no row of the opening has both lanes clear'); continue; }
        if (!warm) { warm = true; await page.evaluate(WALK, [ln.hi, ln.start, ln.dir, ln.goal]); }   // the very first walk after Continue is not a fair one: not counted
        for (const [side, y] of [['lower wall', ln.lo], ['upper wall', ln.hi]]) {
          if (side === 'upper wall' && ln.hi === ln.lo) continue;          // a one-row opening: the same walk
          const r = await page.evaluate(WALK, [y, ln.start, ln.dir, ln.goal]); walked++;
          F.ok(r.ok, `${tag}: hugging the ${side} (soles y ${y}) she walks through into the room`, `from x ${r.from[0]} to x ${r.to[0]} y ${r.to[1]} (room edge x ${ln.goal}${r.ok ? '' : ', stopped short'})`);
        }
        // a wall beside the doorway: the first such row (nearest the opening), at most two a floor
        if (ln.wall.length && wallsHere < 2) {
          wallsHere++; wallsDone++;
          const y = ln.wall[0], r = await page.evaluate(WALK, [y, ln.start, ln.dir, ln.goal]);
          F.ok(!r.ok, `${tag}: the real wall beside it (flat face, soles y ${y}, ${y < d.y0 * T ? 'above' : 'below'} the opening) still stops her`, `from x ${r.from[0]} to x ${r.to[0]} (doorway column ${d.x * T}..${(d.x + 1) * T})`);
        }
      }
      // pit lip: floors with pits. She walks straight at the nearest pit from the south and still falls (the pit rule is the module's own, untouched)
      if (P.rows.some(r => r.includes('_')) && n === 4) {
        const r = await page.evaluate(async () => {
          const B = window.__B, c = B.ctx(), S = c.state, K = window.__QOK_D2KIT_B__, T = 48; await B.dismiss(10);
          let pick = null;
          for (let y = 0; y < 200 && !pick; y++) for (let x = 0; x < 200 && !pick; x++) if ([-1, 0, 1].every(dx => c.terrain(x + dx, y) === '_' && [1, 2, 3].every(dy => c.terrain(x + dx, y + dy) === '.'))) pick = [x, y];
          if (!pick) return { ok: false, why: 'no pit with floor south of it' };
          S.room = undefined; S.latch = null; S.placed = false; S.hold = 0;
          K.placeSoles(c, (pick[0] + 0.5) * T, (pick[1] + 2.5) * T); await B.wait(250);
          const f0 = S.falls || 0, a = B.here();
          const edge = [(pick[0] + 0.5) * T, (pick[1] + 1) * T], lipFree = c.mod.free(c, edge[0], edge[1] + 2);
          await B.push(0, -1, 5000, () => (S.falls || 0) > f0);
          await B.waitFor(() => !S.fall, 4000); await B.wait(250); await B.dismiss(10);
          return { ok: (S.falls || 0) === f0 + 1, falls: (S.falls || 0) - f0, pit: pick, from: a.map(Math.round), to: B.here().map(Math.round), msg: !!c.scene.showingMessage, lipOpen: lipFree };
        });
        F.ok(r.ok, `4F: walking at a pit's lip still drops her into it (the pit rule as before)`, JSON.stringify(r));
      }
    }
    if (!ONLY || ONLY.includes(1)) {
      // the switch off: the 1F first doorway, lower wall, stops dead short of the room
      const s = await seed(page, 1, true);
      F.ok(s.pos.floor === 1 && s.ready, '1F reached with qok-door-lips=0', `at ${s.pos.map} ${s.pos.floor}F`);
      const P = plan(1), r0 = P.mechanic.rooms[0], cs = r0.doors.entry;
      const d = { room: r0.id, name: 'entry', x: cs[0][0], y0: cs[0][1], y1: cs[cs.length - 1][1], west: true, rx0: r0.rect[0] * T, rx1: (r0.rect[2] + 1) * T };
      const ln = await page.evaluate(LANES, [d, T]);
      // Steady frames for this walk (day 4, track S2), as scripts/auto/checks/snags.cjs seed() steps them: the game clock moves
      // 1/60 s per drawn frame. Collision is sampled once per substep, so on a loaded box, where the frame time jitters and her
      // step length with it, the mover's own slide steps past the post by luck or not (measured day 4: 2 of 3 walks passed on a
      // jittery clock, 9 of 9 stopped on a steady one, with or without the wall glide). The line is about the switch, not the box.
      const steady = await page.evaluate(() => { const g = window.__PHASER_GAME__, raf = g && g.loop && g.loop.raf;
        if (raf && raf.callback && !raf.__steady) { const cb = raf.callback; let t = performance.now(); raf.__steady = true; raf.callback = function () { t += 1000 / 60; return cb.call(this, t); }; }
        return !!(raf && raf.__steady); });
      await page.waitForTimeout(300);
      await page.evaluate(WALK, [ln.hi, ln.start, ln.dir, ln.goal]);
      const off = await page.evaluate(() => window.__QOK_DNG2__.ctx().state.lips);
      const bentOf = () => page.evaluate(() => { const sn = window.__QOK_SNAG__; return sn && sn.stats ? sn.stats.bent : 0; });   // the wall glide's bent frames (0 on a build without it)
      const bent0 = await bentOf(), r = await page.evaluate(WALK, [ln.lo, ln.start, ln.dir, ln.goal]), bent = (await bentOf()) - bent0;
      F.ok(off === false && steady && !r.ok && r.to[0] > d.x * T - 70 && r.to[0] < d.x * T + T && bent === 0, `1F first doorway, qok-door-lips=0: hugging the lower wall (soles y ${ln.lo}) she stops dead short of the room as before`, `module switch ${off}, from x ${r.from[0]} to x ${r.to[0]} (room from x ${ln.goal}), steady game clock ${steady}, the wall glide bent ${bent} frame(s) of the walk`);
    }
  } catch (e) { F.ok(false, 'door-lips check ran', String(e && e.stack || e).slice(0, 400)); }
  if (!ONLY) F.ok(wallsDone >= 2, 'a real wall beside a doorway was found and tested at least twice', `${wallsDone} wall walks`);
  F.info('walks', `${walked} hugging walks, ${wallsDone} wall walks`);
  await browser.close();
  F.done('door-lips');
})().catch(e => { console.error('CRASH', e); process.exit(1); });
