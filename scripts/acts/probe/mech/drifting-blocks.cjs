'use strict';
// Void Rift, drifting blocks, played like a patient player: in by the overworld mouth; at every
// rift she waits on the ledge until the first block's edge lines up (the module's glow on the open
// edge), steps on, rides, steps to the next block when their edges meet, and off on the far ledge;
// the stairs, the Null Devourer, the way out. Also: the treasure islet of floor 2 (off the block
// while it rests at the lane end, to the chest, and back on), that she cannot walk into the void,
// and Save -> Continue standing on a drifting block.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/drifting-blocks.cjs
const { Run, plan } = require('./_b-lib.cjs');
const ID = 'voidRift', BOSS = 'nullDevourer', FLOORS = 6;

const EXTRA = `(() => { const B = window.__B, stick = (x, y) => { window.__DQ_STICK__ = (x || y) ? { x, y, m: 1 } : { x: 0, y: 0, m: 0 }; };
  const steer = (tx, ty) => { const [sx, sy] = B.here(), dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy); if (d < 3) stick(0, 0); else stick(dx / d, dy / d); };
  const laneOf = G => { const [sx, sy] = B.here(), L = B.logic().blockUnder([G], sx, sy); return L ? G.lanes.indexOf(L) : -1; };
  window.__BM = {
    gates: () => B.mstate().gates.map(G => ({ id: G.id, on: laneOf(G), lanes: G.lanes.map(L => ({ o: L.o, y0: Math.round(L.y0) })), joins: (G.joins || []).map(j => j.kind + ':' + j.lane) })),
    tick: () => B.mstate().tick,
    // cross rift gi in direction dir (+1 east, -1 west); opt.stopOn: stop standing on that lane's block
    cross: async (gi, dir, opt) => { opt = opt || {}; const S = B.mstate(), G = S.gates[gi], n = G.lanes.length, t0 = performance.now(), log = []; let last = -2;
      const x0 = G.lanes[0].x0, x1 = G.lanes[n - 1].x1;
      try { for (;;) {
        const ms = Math.round(performance.now() - t0);
        if (ms > (opt.maxMs || 150000)) return { ok: false, why: 'timeout', ms, log };
        if (!B.onField() || B.state().msg) return { ok: false, why: 'interrupted', ms, log };
        const [sx, sy] = B.here(), j = laneOf(G), L = j >= 0 ? G.lanes[j] : null;
        if (j !== last) { log.push([j, ms]); last = j; }
        if (j < 0 && log.length > 1 && (dir > 0 ? sx >= x1 + 14 : sx < x0 - 14)) return { ok: true, why: 'across', ms, log };
        if (opt.stopOn !== undefined && j === opt.stopOn && Math.abs(sx - (L.x0 + 72)) < 6) return { ok: true, why: 'on', ms, log };
        let kind, lane, ex;
        if (j < 0 && log.length > 1 && (dir > 0 ? sx > x1 - 10 : sx < x0 + 10)) { steer(sx + dir * 40, sy); await B.raf(); continue; }   // off the last block: on to the far ledge
        if (j < 0) { kind = dir > 0 ? 'ledgeL' : 'ledgeR'; lane = dir > 0 ? 0 : n - 1; ex = dir > 0 ? x0 : x1; }
        else if (opt.stopOn === j) { steer(L.x0 + 72, L.y0 + 72); await B.raf(); continue; }
        else if (dir > 0) { if (j < n - 1) { kind = 'block'; lane = j; ex = L.x1; } else { kind = 'ledgeR'; lane = j; ex = x1; } }
        else { if (j > 0) { kind = 'block'; lane = j - 1; ex = L.x0; } else { kind = 'ledgeL'; lane = 0; ex = x0; } }
        const J = (G.joins || []).find(q => q.kind === kind && q.lane === lane);
        if (J && J.rect[3] - J.rect[1] > 16) { const ty = Math.max(J.rect[1] + 6, Math.min(J.rect[3] - 6, sy)); if (Math.abs(ty - sy) > 5) steer(sx, ty); else steer(ex + dir * 36, ty); }
        else steer(ex - dir * 22, j >= 0 ? L.y0 + 72 : (G.ledge[0] + G.ledge[1]) / 2);
        await B.raf(); } }
      finally { stick(0, 0); } },
    // from the islet lane's block onto the islet (out = true) or back (out = false), when the block rests against it
    islet: async (gi, out) => { const S = B.mstate(), G = S.gates[gi], I = G.islet, L = G.lanes[I.lane], up = I.side === 'top' ? -1 : 1, t0 = performance.now(); let opened = 0;
      try { for (;;) { const ms = Math.round(performance.now() - t0); if (ms > 60000) return { ok: false, why: 'timeout', ms, opened };
        const [sx, sy] = B.here(), j = laneOf(G), J = (G.joins || []).find(q => q.kind === 'islet');
        if (J) opened++;
        if (out && j < 0 && (up < 0 ? sy < J_edge(L, up, I) - 14 : sy > J_edge(L, up, I) + 14)) return { ok: true, ms, opened };
        if (!out && j === I.lane && Math.abs(sy - (L.y0 + 72)) < 30) return { ok: true, ms, opened };
        const cx = L.x0 + 72;
        if (out) { if (J) steer(cx, sy + up * 60); else steer(cx, up < 0 ? L.y0 + 22 : L.y1 - 22); }
        else { if (J) steer(cx, sy - up * 60); else steer(cx, J_edge(L, up, I) + up * 22); }
        await B.raf(); } }
      finally { stick(0, 0); } },
    voidStep: async (gi, dir) => { const G = B.mstate().gates[gi], n = G.lanes.length, ex = dir > 0 ? G.lanes[0].x0 : G.lanes[n - 1].x1, t0 = performance.now(); let far = 0;   // push at the void where no edge is open
      await B.waitFor(() => !(G.joins || []).some(q => q.kind === (dir > 0 ? 'ledgeL' : 'ledgeR')), 20000);
      while (performance.now() - t0 < 25000 && !(G.joins || []).some(q => q.kind === (dir > 0 ? 'ledgeL' : 'ledgeR')) && far < 50) { stick(dir, 0); await B.raf(); far++; }
      stick(0, 0); const [sx] = B.here(); return { beyond: Math.round((sx - ex) * dir), frames: far, on: laneOf(G) }; } };
  function J_edge(L, up, I) { return (L.l.yCentre + (up < 0 ? -1 : 2) + I.at) * 48; }   // the islet's edge line: the block's top (or bottom) when it rests there
})()`;

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'drifting-blocks', extra: EXTRA });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    let resumed = false;
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f), route = P.route; let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the drifting-blocks module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'drifting-blocks' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const goalA = f < FLOORS ? P.assets.find(a => a.kind === 'stairsNext') : P.assets.find(a => a.kind === 'boss');
      const goal = f < FLOORS ? { centre: [goalA.x, goalA.y] } : { beside: [goalA.x, goalA.y], reach: 60 };
      // (a lone block that happens to sit on the corridor line joins both ledges for a moment: wait for the cut)
      R.rec(`f${f}: the way on is across the void: with the blocks adrift it cannot be walked`, await R.ev(g => window.__B.waitFor(() => !window.__B.plan(g), 15000), goal));
      const order = P.mechanic.gates.map((g, gi) => { const X0 = g.lanes[0].x, X1 = g.lanes[g.lanes.length - 1].x + 2, cy = g.lanes[0].yCentre;
        const i = route.findIndex(c => c[0] >= X0 && c[0] <= X1 && Math.abs(c[1] - cy) <= 1); return i < 0 ? null : { gi, g, i, dir: Math.sign(route[i][0] - route[i - 1][0]) || 1, X0, X1, cy }; })
        .filter(Boolean).sort((a, b) => a.i - b.i);
      let ok = true;
      for (const o of order) {
        const bank = [o.dir > 0 ? o.X0 - 1 : o.X1 + 1, o.cy];
        const g0 = await R.go({ cell: bank, grow: 0 }); await R.shot(`f${f}-rift-${o.gi}-ledge`);
        if (f === 1) { const v = await R.ev(a => window.__BM.voidStep(...a), [o.gi, o.dir]);
          R.rec('f1: with no edge lined up she cannot step off the ledge into the void', v.beyond < 0 && v.on < 0, v); }
        if (f === 2 && !resumed) { resumed = true;                             // standing on a drifting block
          const c1 = await R.ev(a => window.__BM.cross(a[0], a[1], { stopOn: a[2] }), [o.gi, o.dir, o.dir > 0 ? 0 : o.g.lanes.length - 1]);
          const b = { g: await R.ev(() => window.__BM.gates()), s: await R.st(), t: await R.ev(() => window.__BM.tick()) };
          const rc = await R.saveContinue(); const a = { g: await R.ev(() => window.__BM.gates()), s: await R.st(), clk0: await R.ev(() => window.__B.mstate().clk0) };
          const savedClk = rc.saved.d2[`d2.${ID}.f2.clk`], firm = await R.ev(() => window.__QOK_DNG2__.free(window.__B.state().hx, window.__B.state().hy));
          R.rec('f2: Save -> Continue standing on a drifting block finds every block where it was and her on firm ground (the block or a ledge), never in the void',
            c1.ok && b.g[o.gi].on >= 0 && rc.ok && a.s.floor === 2 && typeof savedClk === 'number' && Math.abs(a.clk0 - savedClk) <= 300 && firm === true,
            { onBlockBefore: b.g[o.gi].on, onBlockAfter: a.g[o.gi].on, firm, savedClk, clk0: a.clk0, tickAtSave: b.t, was: [b.s.sx, b.s.sy].map(Math.round), at: [a.s.sx, a.s.sy].map(Math.round) });
          await R.shot('f2-resumed'); }
        if (o.g.islet && f === 2) {                                             // the treasure islet, there and back
          const lane = o.g.islet.lane, c1 = await R.ev(a => window.__BM.cross(a[0], a[1], { stopOn: a[2] }), [o.gi, o.dir, lane]);
          const chest = P.assets.find(a => a.kind === 'chest' && o.g.islet.cells.some(c => c[0] === a.x && c[1] === a.y));
          const out = await R.ev(gi => window.__BM.islet(gi, true), o.gi); const reach = await R.ev(c => !!window.__B.plan({ beside: c, reach: 16 }), [chest.x, chest.y]);
          await R.go({ beside: [chest.x, chest.y], reach: 16 }); await R.shot('f2-on-the-islet');
          const back = await R.ev(gi => window.__BM.islet(gi, false), o.gi);
          R.rec('f2: from the block resting at its lane end she steps onto the treasure islet, reaches the chest, and steps back on when the block returns',
            c1.ok && out.ok && reach === true && back.ok, { c1: c1.why, out, reach, back });
        }
        const run = R.ev(a => window.__BM.cross(a[0], a[1]), [o.gi, o.dir]);
        const c = await R.watch(run, [{ tag: `f${f}-rift-${o.gi}-riding`, when: `(() => { const g = window.__BM.gates()[${o.gi}]; return g.on >= 0; })()` }]);
        ok = R.rec(`f${f} rift ${o.gi}: crossed block by block (${o.g.lanes.length} block(s)) in ${Math.round(c.ms / 100) / 10} s`, g0.ok && c.ok && c.why === 'across', c);
        if (!ok) break;
      }
      if (!ok) break;
      if (!R.rec(`f${f}: past the rifts the way on can be walked`, (await R.ev(g => !!window.__B.plan(g), goal)) === true)) break;
      if (f < FLOORS) { if (!(await R.stairs(goalA, f + 1))) break; }
      else { if (await R.boss(goalA, f)) await R.exitByBossCell(goalA); }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
