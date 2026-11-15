'use strict';
// Frostfall Cavern, push-ice, played like a player: in by the portal isle's mouth; in every
// puzzle chamber she leans on the ice blocks the way the plan's solution says (stand against the
// block on the side opposite the push, hold the stick), the last one slides down the slipway into
// the water and freezes into a bridge; over the bridge, the stairs, the Frost Monarch, the way
// out. Also: the reset bell ("Ring": the loose block forms again where it started), and
// Save -> Continue with a block pushed half-way through a solution.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/push-ice.cjs
const { Run, plan } = require('./_b-lib.cjs');
const ID = 'frostfallCavern', BOSS = 'frostMonarch', FLOORS = 6;

const EXTRA = `(() => { const B = window.__B;
  const room = id => B.mstate().rooms.find(r => r.id === id);
  window.__BM = {
    rooms: () => B.mstate().rooms.map(R => ({ id: R.id, pack: B.logic().pack(R), fill: R.fill, need: R.need, bell: R.bell })),
    reach: goal => !!B.plan(goal),
    // lean on the block at local cell (i,j) of the room so that it goes local direction d (E is toward the water)
    push: async (id, i, j, d) => { const S = B.mstate(), lg = B.logic(), R = room(id), k = R.blocks.findIndex(b => b && b[0] === i && b[1] === j);
      if (k < 0) return { ok: false, why: 'no block at ' + i + ',' + j, pack: lg.pack(R) };
      const dv = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[d], ux = dv[0] * R.sx, uy = dv[1], r = lg.solidRect(R, R.blocks[k]);
      const pt = ux > 0 ? [r[0] - 10, (r[1] + r[3]) / 2] : ux < 0 ? [r[2] + 10, (r[1] + r[3]) / 2] : uy > 0 ? [(r[0] + r[2]) / 2, r[1] - 10] : [(r[0] + r[2]) / 2, r[3] + 10];
      const g = await B.go({ soles: pt, r: 10 }); const p0 = lg.pack(R), f0 = R.fill, t0 = performance.now();
      await B.push(ux, uy, 2500, () => lg.pack(R) !== p0 || R.fill !== f0); const held = Math.round(performance.now() - t0);
      const moved = lg.pack(R) !== p0 || R.fill !== f0;
      return { ok: moved, g: g.why, held, from: p0, pack: lg.pack(R), fill: R.fill, at: B.here().map(Math.round), pt: pt.map(Math.round) }; },
    busy: () => B.mstate().busy > 0 };
})()`;

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'push-ice', extra: EXTRA });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    const rooms = () => R.ev(() => window.__BM.rooms());
    const flag = k => R.ev(k => window.__B.flags()[k], k);
    const idle = () => page.waitForFunction(() => !window.__BM.busy(), { timeout: 12000 }).catch(() => {});
    let resumed = false, belled = false;
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f); let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the push-ice module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'push-ice' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const goalA = f < FLOORS ? P.assets.find(a => a.kind === 'stairsNext') : P.assets.find(a => a.kind === 'boss');
      const goal = f < FLOORS ? { centre: [goalA.x, goalA.y] } : { beside: [goalA.x, goalA.y], reach: 60 };
      R.rec(`f${f}: the way on cannot be walked before a bridge is frozen`, (await R.ev(g => window.__BM.reach(g), goal)) === false);
      let ok = true;
      for (const room of P.mechanic.rooms) {
        const start = (await rooms()).find(r => r.id === room.room).pack;
        for (let k = 0; k < room.solution.length && ok; k++) {
          const m = /^push (\d+),(\d+) ([NESW])$/.exec(room.solution[k]);
          const p = await R.ev(a => window.__BM.push(...a), [room.room, +m[1], +m[2], m[3]]); if (k === 0) await R.shot(`f${f}-${room.room}-pushed`);
          await idle(); await page.waitForTimeout(250);
          const last = k === room.solution.length - 1 && p.fill >= room.waterCellsToFill;
          ok = R.rec(`f${f} room ${room.room}: leaning on the block ("${room.solution[k]}") slides it${p.fill ? ' into the water' : ''}`, p.ok && (await flag(`d2.${ID}.f${f}.${p.fill ? 'fill' : 'blk'}.${room.room}`)) !== undefined, p);
          if (await R.ev(() => window.__B.state().msg)) { await R.shot(`f${f}-${room.room}-bridge-frozen`); await R.dismiss(); }
          if (!ok) break;
          if (f === 1 && k === 0 && !belled && !last) { belled = true;            // the bell: the block forms again at its start
            await R.ev(() => window.__B.clearMsgs());
            const bell = P.assets.find(a => a.kind === 'resetBell' && a.room === room.room), v = await R.use(bell.x, bell.y, 'Ring'); await page.waitForTimeout(500);
            const said = await R.ev(() => window.__B.msgs().slice(-1)[0] || null); await R.shot('f1-bell'); await R.dismiss(); await idle();
            const now = (await rooms()).find(r => r.id === room.room);
            R.rec('f1: "Ring" at the bell forms the loose block again where it started', v === 'Ring' && now.pack === start && now.pack !== p.pack, { v, said, start, was: p.pack, now: now.pack });
            k = -1; continue; }
          if (f === 2 && k === 0 && !resumed && !last) { resumed = true;          // a block pushed, the puzzle not solved
            const b = { r: await rooms(), s: await R.st() }; const rc = await R.saveContinue(); const a = { r: await rooms(), s: await R.st() };
            R.rec('f2: Save -> Continue mid-puzzle keeps the pushed block where it stopped, and her cell',
              rc.ok && a.s.floor === 2 && JSON.stringify(a.r) === JSON.stringify(b.r) && a.r[0].pack !== start && Object.keys(rc.saved.d2).some(k => /\.blk\./.test(k)) && Math.abs(a.s.cx - b.s.cx) <= 1 && Math.abs(a.s.cy - b.s.cy) <= 1,
              { flags: rc.saved.d2, rooms: a.r, start, at: [a.s.cx, a.s.cy], was: [b.s.cx, b.s.cy] });
            await R.shot('f2-resumed'); }
        }
        if (!ok) break;
        const now = (await rooms()).find(r => r.id === room.room);
        ok = R.rec(`f${f} room ${room.room}: the slipway water is bridged for good (flag fill)`, now.fill >= now.need && (await flag(`d2.${ID}.f${f}.fill.${room.room}`)) >= now.need, now);
        if (ok) { const w = room.water[0]; await R.go({ cell: [w[0], w[1]], grow: 10 }); await R.shot(`f${f}-${room.room}-on-the-ice-bridge`); }
      }
      if (!ok) break;
      if (!R.rec(`f${f}: with the bridge frozen the way on can be walked`, (await R.ev(g => window.__BM.reach(g), goal)) === true)) break;
      if (f < FLOORS) { if (!(await R.stairs(goalA, f + 1))) break; }
      else { if (await R.boss(goalA, f)) await R.exitByBossCell(goalA); }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
