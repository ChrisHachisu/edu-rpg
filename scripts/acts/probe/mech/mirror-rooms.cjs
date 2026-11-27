'use strict';
// Demon Castle, mirror rooms, played like a player: in by the overworld mouth with the four relics
// the castle's seal asks for; all nine floors by the stairs; the Demon King on his throne; the
// ending. On the way: the rule itself (inside a mirror room a push to the right walks her left, up
// and down are untouched, and she is carried through the doorway she was walking through), a
// chest inside a mirror room, a fall into a pit (back in the doorway she came in by, no HP lost),
// Save -> Continue in the middle of a mirror room (still mirrored, and a fall after it still goes
// to the doorway she had entered by), a castle knight (touch: a Dark Knight battle; then it is
// half a loop away) and a guarded hall crossed untouched.
// Her thumb: the probe plans in map directions and, exactly as a player who knows the rule does,
// pushes the other way while her controls are swapped (window.__BM.comp; off for the rule checks).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5500/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/mirror-rooms.cjs
const { Run, plan, CELL } = require('./_b-lib.cjs');
const ID = 'demonCastle', BOSS = 'demonKing', FLOORS = 9;
const RELICS = ['excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom'];

const EXTRA = `(() => { if (window.__BM) return; const B = window.__B, D = window.__QOK_DNG2__, T = 48;
  // the planner never walks a pit's lip (the module opens it: that is how she falls) nor a hall the probe has closed
  const free0 = D.free;
  D.free = (x, y) => { if (!free0(x, y)) return false; const c = D.ctx(); if (!c) return true; const sy = y + B.fdy();
    if (c.mechanic.id === 'mirror-rooms' && !c.maskFree(x, sy)) return false;
    const a = window.__BM.avoid; if (a) for (const r of a) if (x >= r[0] * T && x < (r[2] + 1) * T && sy >= r[1] * T && sy < (r[3] + 1) * T) return false;
    return true; };
  let raw = window.__DQ_STICK__ || { x: 0, y: 0, m: 0 };
  Object.defineProperty(window, '__DQ_STICK__', { configurable: true, set(v) { raw = v; },
    get() { const S = B.mstate(); return (window.__BM.comp && S && S.swap && raw) ? { x: -raw.x, y: raw.y, m: raw.m } : raw; } });
  const ms = () => { const S = B.mstate() || {}; return { room: S.room ? S.room.id : null, type: S.room ? S.room.type : null, swap: !!S.swap, latch: !!S.latch,
    door: S.door ? S.door.room.id + ':' + S.door.name : null, spot: S.door ? S.door.spot : null, falls: S.falls || 0, battles: S.battles || 0, falling: !!S.fall, busy: !!S.busy, tick: S.tick,
    legacy: !!B.ctx().scene.mirrorActive, sprites: S.spr ? { frames: S.spr.frames.length, knights: Object.keys(S.spr.knights).length, badge: S.spr.badge.alpha } : null }; };
  const knightCell = (k, t) => { const n = k.ring.length; return k.ring[((Math.floor((t + k.off) / k.tpt) % n) + n) % n]; };
  const env = (goals, blind) => { const c = B.ctx(), S = c.state, f = B.fdy(), g = new Set(goals.map(x => x.join(',')));
    return { period: S.M.period, tick: () => c.state.tick, walk: (x, y) => D.free(x * T + 24, y * T + 24 - f), goal: (x, y) => g.has(x + ',' + y),
      safe: (x, y, t) => blind || S.M.knights.every(k => [t - 1, t, t + 1].every(u => { const q = knightCell(k, u); return Math.abs(q[0] - x) + Math.abs(q[1] - y) > 1; })) }; };
  window.__BM = { comp: true, avoid: null, ms, env,
    // an uncompensated push: what the stick alone does to her
    rawPush: async (vx, vy, ms_) => { const a = B.here(); window.__BM.comp = false; try { await B.push(vx, vy, ms_); } finally { window.__BM.comp = true; } const b = B.here(); return { dx: b[0] - a[0], dy: b[1] - a[1] }; },
    // walk off the nearest edge: the first pit cell straight ahead in any of the four directions, no wall in between
    intoPit: async () => { const c = B.ctx(), s = B.state(), f0 = ms().falls; let best = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 6; k++) { const ch = c.terrain(s.cx + dx * k, s.cy + dy * k);
        if (ch === '_') { if (!best || k < best.k) best = { dx, dy, k }; break; } if (ch !== '.') break; }
      if (!best) return { ok: false, why: 'no pit in reach', at: [s.cx, s.cy] };
      const from = B.here(); await B.push(best.dx, best.dy, 5000, () => ms().falls > f0);
      await B.waitFor(() => !ms().falling, 4000); await B.wait(250);
      return { ok: ms().falls === f0 + 1, dir: [best.dx, best.dy], from, to: B.here(), falls: ms().falls }; },
    sneak: (goals, opts) => B.timedGo(env(goals, false), opts || {}),
    meet: async () => { const c = B.ctx(), S = c.state, k = S.M.knights[0]; if (!k) return { ok: false, why: 'no knight' };   // stand in its way and let it come
      const q = knightCell(k, S.tick + 14), r = await B.timedGo(env([q], true), { until: () => !!B.mstate().busy || B.state().battle, maxMs: 40000 });
      const ok = await B.waitFor(() => !!B.mstate().busy || B.state().battle, 30000); return { ok, r, cell: q }; },
    knightFar: () => { const c = B.ctx(), S = c.state, k = S.M.knights[0], s = B.state(), q = knightCell(k, S.tick); return Math.abs(q[0] - s.cx) + Math.abs(q[1] - s.cy); },
    msgHas: re => B.msgs().some(m => new RegExp(re, 'i').test(m)) };
})()`;

const mid = d => [d[0][0], d[Math.floor(d.length / 2)][1]];                  // a doorway's middle cell
(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'mirror-rooms', extra: EXTRA, inventory: RELICS });
  const ms = () => R.ev(() => window.__BM.ms());
  const avoidE = rooms => R.ev(a => { window.__BM.avoid = a; }, rooms.filter(r => r.type === 'E').map(r => r.rect));
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    await R.dismiss(); await page.waitForTimeout(300);
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f), rooms = P.mechanic.rooms, frames = P.assets.filter(a => a.kind === 'mirrorFrame'); let s = await R.st(), m = await ms();
      if (!R.rec(`f${f}: on the authored floor "${P.title}" with the mirror-rooms module; the bundle's own both-axes mirror is off`,
        s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'mirror-rooms' && s.d2.module && !m.legacy && !m.swap, { s: [s.w, s.h, s.d2], m })) break;
      await page.waitForTimeout(500); m = await ms();
      R.rec(`f${f}: a mirror frame stands at each of the ${frames.length} doorways` + (P.assets.some(a => a.kind === 'guard') ? ', and the castle knight walks its loop' : ''),
        !!m.sprites && m.sprites.frames === frames.length && m.sprites.knights === P.assets.filter(a => a.kind === 'guard').length, m.sprites);
      await R.shot(`f${f}-arrive`);
      await avoidE(rooms);
      const hp0 = s.hp;

      if (f === 1) {                                                           // the rule, in the open hall beside the gate
        const A = rooms[0], d = A.doors.entry, dc = mid(d), inX = A.rect[0] + 2;
        // She comes at the doorway along its upper cell. Along the lower wall (soles at y 1134) the base of the mirror frame's post
        // sticks 6 px out of the wall line at x 2212-2248 and stops her dead 20 px short of the room, with no slide: that was the
        // "robot miss" of 2026-11-24 and 2026-11-26 (about two runs in five). It is a game finding (PACKET-QUEUE R1), not this check's subject.
        await R.go({ cell: [dc[0] - 2, d[0][1]] }); await R.shot('f1-mirror-frame'); await R.ev(() => window.__B.clearMsgs());
        const a = await R.ev(() => window.__BM.rawPush(1, 0, 1700)); await page.waitForTimeout(200);
        let st = await ms(); s = await R.st();
        const said = await R.ev(() => window.__BM.msgHas('left and right are swapped'));
        R.rec('f1: walking right through the frame carries her on into the room (she is not thrown back); the rule is told once; the door she came by is kept in the story flags',
          a.dx > 60 && s.cx >= A.rect[0] && st.room === A.id && said && (await R.ev(() => window.__B.d2flags()))[`d2.${ID}.f1.door`] === `${A.id}:entry`, { a, st, said });
        await R.dismiss(); await page.waitForTimeout(250);
        await R.go({ cell: [inX + 2, dc[1]] });
        const r1 = await R.ev(() => window.__BM.rawPush(1, 0, 600)), r2 = await R.ev(() => window.__BM.rawPush(-1, 0, 600)), r3 = await R.ev(() => window.__BM.rawPush(0, -1, 500)), r4 = await R.ev(() => window.__BM.rawPush(0, 1, 500));
        st = await ms(); await R.shot('f1-mirrored');
        R.rec('f1: inside, a push right walks her LEFT and a push left walks her RIGHT; up is up and down is down (left-right only); the badge is over her head',
          r1.dx < -40 && r2.dx > 40 && r3.dy < -30 && Math.abs(r3.dx) < 6 && r4.dy > 30 && Math.abs(r4.dx) < 6 && st.swap && st.sprites.badge > 0.8, { r1, r2, r3, r4, st });
        const ch = P.assets.find(c => c.kind === 'chest' && c.mirrorRoom === A.id), v = await R.use(ch.x, ch.y, null), fl = await R.ev(() => window.__B.flags()); await R.dismiss(); await R.shot('f1-chest');
        R.rec('f1: the chest inside the mirror room opens by the prompt pill', !!v && !!fl[`chest.${ID}.f1.${ch.x}.${ch.y}`], { v });
        await R.go({ cell: [inX, dc[1]] });
        const o = await R.ev(() => window.__BM.rawPush(1, 0, 1900)); await page.waitForTimeout(200); st = await ms();   // mirrored: a push right walks her out to the left, and on through the doorway
        const o2 = await R.ev(() => window.__BM.rawPush(1, 0, 500)); const st2 = await ms();
        R.rec('f1: walking out, she is carried on through the frame; outside, the next push is her own again and the door flag is cleared',
          o.dx < -60 && st.room === null && o2.dx > 30 && !st2.swap && !(await R.ev(() => window.__B.d2flags()))[`d2.${ID}.f1.door`], { o, st, o2, st2 });
      }

      if (f === 3) {                                                           // Save -> Continue in the middle of the first mirror room on the way
        const B_ = rooms.find(r => r.role === 'required'), cell = [B_.rect[0] + 4, B_.rect[1] + 6];
        const g = await R.go({ cell }); const before = await ms(); s = await R.st(); await R.shot('f3-before-save');
        const rc = await R.saveContinue(); await page.waitForTimeout(400);
        const a = await R.st(); await R.ev(() => window.__BM.rawPush(0, -1, 90)); const st = await ms();
        const r1 = await R.ev(() => window.__BM.rawPush(1, 0, 600)); await R.shot('f3-resumed');
        R.rec('f3: Save -> Continue in the middle of a mirror room: same floor and cell, still mirrored (a push right walks her left), the door she came by is restored from the save',
          g.ok && rc.ok && a.floor === 3 && Math.abs(a.cx - s.cx) <= 1 && Math.abs(a.cy - s.cy) <= 1 && st.room === B_.id && st.swap && st.door === before.door && rc.saved.d2[`d2.${ID}.f3.door`] === before.door && r1.dx < -40,
          { g, before, st, r1, saved: rc.saved.d2, at: [a.cx, a.cy], was: [s.cx, s.cy] });
        await avoidE(rooms);
      }

      if (f === 4 || f === 5) {                                                // pits: the optional bridge on 4, the bridge on the way on 5
        const C = rooms.find(r => r.type === 'C'), dc = mid(C.doors.entry), on = [C.rect[0] + 3, dc[1]];
        const g = await R.go({ cell: on }); let st = await ms();
        if (f === 5) {                                                         // the save carries the doorway: a fall after Continue still goes back to it
          const rc = await R.saveContinue(); await page.waitForTimeout(400); await R.ev(() => window.__BM.rawPush(0, -1, 120)); const st1 = await ms();
          R.rec('f5: Save -> Continue on the pit bridge keeps the doorway she came in by', rc.ok && st1.room === C.id && st1.door === st.door && st1.swap, { st, st1, saved: rc.saved.d2 });
          await avoidE(rooms); st = st1;
        }
        await R.ev(() => window.__B.clearMsgs()); await R.shot(`f${f}-on-the-bridge`);
        const fallP = R.ev(() => window.__BM.intoPit());
        const fr = await R.watch(fallP, [{ tag: `f${f}-falling`, when: () => window.__BM.ms().falling }]);
        await page.waitForTimeout(500); const said = await R.ev(() => window.__BM.msgHas('pit')); await R.shot(`f${f}-back-at-the-frame`); await R.dismiss();
        s = await R.st(); const st2 = await ms();
        R.rec(`f${f}: stepping into a pit puts her back in the doorway she came in by (${st.door}), with no HP lost` + (f === 4 ? '; the rule is told the first time' : ''),
          g.ok && fr.ok && Math.hypot(s.sx - st.spot[0], s.sy - st.spot[1]) < 14 && s.hp === hp0 && s.field && (f !== 4 || said), { fr, at: [s.sx, s.sy], spot: st.spot, hp: [hp0, s.hp], said, st2 });
        if (f === 4) {                                                         // over the bridge to the rare weapon
          const ch = P.assets.find(c => c.kind === 'chest' && c.mirrorRoom === C.id), v = await R.use(ch.x, ch.y, null), fl = await R.ev(() => window.__B.flags()); await R.dismiss();
          st = await ms(); await R.shot('f4-bridge-chest');
          R.rec('f4: the pit bridge is crossed with swapped controls to its chest, without a fall', !!v && !!fl[`chest.${ID}.f4.${ch.x}.${ch.y}`] && st.falls === 1, { v, falls: st.falls });
        } else {                                                               // across, out by the far door, back in by it, and a fall there
          const xc = mid(C.doors.exit), out = [xc[0] + (xc[0] > C.rect[2] ? 1 : -1), xc[1]];
          const g1 = await R.go({ cell: out }); const g2 = await R.go({ cell: [xc[0] + (xc[0] > C.rect[2] ? -3 : 3), xc[1]] }); st = await ms();
          const fr2 = await R.ev(() => window.__BM.intoPit()); await page.waitForTimeout(400); await R.dismiss(); s = await R.st();
          R.rec('f5: come in by the far door instead, a fall puts her back in THAT doorway', g1.ok && g2.ok && st.door === `${C.id}:exit` && fr2.ok && Math.hypot(s.sx - st.spot[0], s.sy - st.spot[1]) < 14 && s.hp === hp0,
            { st, fr2, at: [s.sx, s.sy] });
        }
      }

      if (f === 7) {                                                           // the knight in the optional guarded hall
        const E = rooms.find(r => r.type === 'E'), dc = mid(E.doors.entry);
        await R.go({ cell: [dc[0] - 1, dc[1]] }); await R.ev(() => { window.__BM.avoid = null; window.__B.clearMsgs(); });
        const mt = R.ev(() => window.__BM.meet());
        const r = await R.watch(mt, [{ tag: 'f7-the-knight', when: () => window.__BM.ms().room !== null && window.__BM.knightFar() <= 3 }]);
        const said = await R.ev(() => window.__BM.msgHas('knight'));
        const fr = await R.fight(); await page.waitForTimeout(1600); await R.pilot(); await R.dismiss(); await page.waitForTimeout(300);
        s = await R.st(); const st = await ms(), far = await R.ev(() => window.__BM.knightFar());
        R.rec('f7: touching the castle knight starts a Dark Knight battle; afterwards she stands where she was and the knight is half a loop away',
          r.ok && said && fr.entered && fr.won && /darkKnight/.test(String(fr.monster)) && st.battles === 1 && s.field && st.room === E.id && far >= 8, { r, said, fr, st, far });
        await R.shot('f7-after-the-knight');
        const ch = P.assets.find(c => c.kind === 'chest' && c.mirrorRoom === E.id);
        const gs = await R.ev(c => window.__BM.sneak([[c[0], c[1] + 1], [c[0] - 1, c[1]], [c[0] + 1, c[1]], [c[0], c[1] - 1]]), [ch.x, ch.y]);
        await R.ev(([cx, cy]) => window.__B.lean(cx, cy, 700), [ch.x, ch.y]); const v = await R.tapPrompt(); await R.dismiss(); const fl = await R.ev(() => window.__B.flags());
        const gb = await R.ev(g => window.__BM.sneak(g), E.doors.entry.map(c => [c[0] - 1, c[1]])); const st3 = await ms();
        R.rec('f7: the guarded hall\'s chest is taken and the hall left again without a second battle', gs.ok && !!v && !!fl[`chest.${ID}.f7.${ch.x}.${ch.y}`] && gb.ok && st3.battles === 1 && st3.room === null, { gs, v, gb, st3 });
        await avoidE(rooms);
      }

      if (f === 8) {                                                           // two mirror rooms in a row; the second has a knight
        const E = rooms.find(r => r.type === 'E'), dc = mid(E.doors.entry), b0 = (await ms()).battles;
        const g = await R.go({ cell: [dc[0] - 1, dc[1]] }); await R.shot('f8-after-the-zigzag'); await R.ev(() => { window.__BM.avoid = null; });
        const run = R.ev(g => window.__BM.sneak(g), E.doors.exit.map(c => [c[0] + 1, c[1]]));
        const gs = await R.watch(run, [{ tag: 'f8-past-the-knight', when: () => window.__BM.ms().room !== null && window.__BM.knightFar() <= 4 }]);
        const st = await ms(); s = await R.st();
        R.rec('f8: the zigzag bridge, then the guarded hall crossed with swapped controls without touching the knight (no battle, no fall)', g.ok && gs.ok && gs.why === 'arrived' && st.battles === b0 && st.falls === 0 && s.field, { g, gs, st });
        await avoidE(rooms);
      }

      if (f < FLOORS) {
        const nx = P.assets.find(a => a.kind === 'stairsNext');
        const g = await R.go({ cell: await R.ev(r => window.__B.standCell(r), P.route) }); const st = await ms(); s = await R.st();
        const need = rooms.filter(r => r.role === 'required').map(r => r.type).join('+') || 'none';
        if (!R.rec(`f${f}: the way to the stairs is walked` + (need !== 'none' ? ` through the mirror room on the way (${need}) with swapped controls` : ' (no mirror room on the way)') + `, HP untouched`,
          g.ok && s.hp === hp0 && s.field, { g, falls: st.falls, hp: [hp0, s.hp] })) break;
        await R.shot(`f${f}-through`);
        if (!(await R.stairs(nx, f + 1))) break;
      } else {                                                                 // the throne
        const b = P.assets.find(a => a.kind === 'boss');
        await R.go({ beside: [b.x, b.y], reach: 110 }); await page.waitForTimeout(400); await R.shot('f9-throne-room');
        const st = await ms(); const r1 = await R.ev(() => window.__BM.rawPush(1, 0, 400));
        R.rec('f9: in the throne room her controls are her own (the fight is the bundle\'s, with normal controls)', !st.swap && st.room === null && r1.dx > 30 && !st.legacy, { st, r1 });
        let started = false;
        for (let k = 0; k < 4 && !started; k++) {
          await R.go({ beside: [b.x, b.y], reach: 14 });
          await R.ev(([cx, cy]) => window.__B.lean(cx, cy, 900), [b.x, b.y]); await page.waitForTimeout(200);
          if (k === 0) await R.shot('f9-demon-king');
          if (await R.ev(() => window.__B.prompt())) await R.tapPrompt();
          for (let j = 0; j < 16 && !started; j++) { await R.ev(() => window.__B.tapKey('z')); await page.waitForTimeout(300); started = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')); } }
        const lines = await R.ev(() => window.__B.msgs().slice(-6));
        if (started) { await page.waitForTimeout(1500); await R.shot('f9-the-fight'); }
        const fr = started ? await R.fight(240000) : { entered: false };
        await page.waitForTimeout(3000);
        const end = await page.evaluate(() => { const g = window.__PHASER_GAME__, st = window.__GAME_STATE__.player.state;
          return { scenes: g.scene.getScenes(true).map(x => x.scene.key), flag: !!st.storyFlags['boss.demonKing.defeated'], encountered: !!st.storyFlags['boss.demonKing.encountered'],
            crystal: (st.inventory || []).filter(i => i.itemId === 'crystalOfKnowledge' || i.itemId === 'shadowCrystal').map(i => i.itemId + '*' + i.quantity) }; });
        await R.shot('f9-ending');
        R.rec('f9: walking into the Demon King on his throne starts the bundle\'s own boss talk and the Demon King fight (demonKing)', fr.entered && /demonKing/.test(String(fr.monster)), { fr, lines });
        R.rec('f9: the fight is won, boss.demonKing.defeated is set and the ending (VictoryScene) starts, as on the generated castle', !!fr.won && end.flag && end.scenes.includes('VictoryScene'), end);
      }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
