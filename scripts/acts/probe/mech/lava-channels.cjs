'use strict';
// Volcanic Forge, lava channels, played like a player: in by the overworld mouth; in every forge
// hall she stands on the turntables that need it and taps "Turn", pulls the lever by the door
// ("Pull"), watches the iron run and walks over the bridge it casts; the stairs, the Flame Titan,
// the way out. Also: a pour with the troughs still broken (pools, no penalty, nothing cast), the
// treasure bridge of floor 3, and Save -> Continue with one turntable turned and nothing poured.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5260/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/lava-channels.cjs
const { Run, plan } = require('./_b-lib.cjs');
const ID = 'volcanicForge', BOSS = 'flameTitan', FLOORS = 7;

const EXTRA = `(() => { const B = window.__B;
  const H = id => B.mstate().M.halls[id];
  window.__BM = {
    halls: () => { const S = B.mstate(); return S.M.order.map(id => { const h = H(id); return { id, lever: h.lever, turn: h.turn.map(t => ({ x: t.x, y: t.y, rot: t.rot, key: t.key })),
      molds: h.molds.map(m => ({ id: m.id, cast: !!m.cast, rect: m.rect })) }; }); },
    solve: (hall, ids) => B.logic().solve(H(hall), ids),
    fed: hall => B.logic().flow(H(hall)).molds.map(m => m.mold.id),
    busy: () => !!B.mstate().anim,
    reach: goal => !!B.plan(goal) };
})()`;

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'lava-channels', extra: EXTRA });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    const halls = () => R.ev(() => window.__BM.halls());
    const flag = k => R.ev(k => window.__B.flags()[k], k);
    const idle = () => page.waitForFunction(() => !window.__BM.busy(), { timeout: 15000 }).catch(() => {});
    const turn = async (f, hall, i, taps) => {                                // stand on turntable i of the hall and tap "Turn" `taps` times
      const t = (await halls()).find(h => h.id === hall).turn[i], key = `d2.${ID}.f${f}.rot.${t.key}`, r0 = (await flag(key)) || 0; let n = 0;
      const g = await R.go({ soles: [(t.x + 1) * 48, (t.y + 1) * 48], r: 22 });
      for (let k = 0; k < taps; k++) { await page.waitForFunction(() => window.__B.prompt() === 'Turn' && !window.__BM.busy(), { timeout: 5000 }).catch(() => {});
        if (await R.tapPrompt('Turn')) n++; await page.waitForTimeout(260); }
      const r1 = (await flag(key)) || 0;
      return R.rec(`f${f} hall ${hall}: standing on turntable ${i + 1} shows "Turn"; ${taps} tap(s) turn it ${taps} quarter(s) clockwise (flag rot)`, g.ok && n === taps && r1 === ((r0 + taps) & 3), { g, n, r0, r1, at: [t.x, t.y] });
    };
    const pour = async (f, hall) => {                                          // "Pull" at the lever; returns what the box said and which molds are cast
      const h = (await halls()).find(x => x.id === hall); await R.ev(() => window.__B.clearMsgs());
      const v = await R.use(h.lever.x, h.lever.y, 'Pull'); if (v) await R.shot(`f${f}-${hall}-pour`);
      await page.waitForFunction(() => window.__B.state().msg, { timeout: 8000 }).catch(() => {});
      const said = await R.ev(() => window.__B.msgs().slice(-1)[0] || null); await R.shot(`f${f}-${hall}-poured`); await R.dismiss(); await idle();
      const after = (await halls()).find(x => x.id === hall);
      return { v, said, cast: after.molds.filter(m => m.cast).map(m => m.id) };
    };
    let resumed = false;
    for (let f = 1; f <= FLOORS; f++) {
      const P = plan(ID, f); let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the lava-channels module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'lava-channels' && s.d2.module, s)) break;
      await R.shot(`f${f}-arrive`);
      const goalA = f < FLOORS ? P.assets.find(a => a.kind === 'stairsNext') : P.assets.find(a => a.kind === 'boss');
      const goal = f < FLOORS ? { centre: [goalA.x, goalA.y] } : { beside: [goalA.x, goalA.y], reach: 60 };
      R.rec(`f${f}: the way on cannot be walked before a bridge is cast`, (await R.ev(g => window.__BM.reach(g), goal)) === false);
      let ok = true;
      for (let round = 0; round < 4 && ok; round++) {                          // a hall at a time, as the bridges open the next
        if (await R.ev(g => window.__BM.reach(g), goal)) break;
        const hs = await halls(); let did = false;
        for (const h of hs) { if (h.molds.find(m => m.id === 'exit').cast) continue;
          if (!(await R.ev(l => window.__BM.reach({ beside: [l.x, l.y], reach: 16 }), h.lever))) continue;
          did = true;
          if (f === 1) {                                                        // a pour before anything is turned: it pools
            const fed0 = await R.ev(id => window.__BM.fed(id), h.id), hp0 = (await R.st()).hp, p0 = await pour(f, h.id), hp1 = (await R.st()).hp;
            R.rec('f1: a pour with the troughs broken pools and cools: no bridge, no penalty, the lever works again', fed0.length === 0 && p0.v === 'Pull' && p0.cast.length === 0 && /pool/i.test(p0.said || '') && hp1 === hp0, { fed0, p0 });
          }
          if (f === 3 && h.molds.some(m => m.id === 'treasure')) {              // floor 3: the troughs as found feed the treasure mold
            const pt = await pour(f, h.id), chest = P.assets.find(a => a.kind === 'chest' && a.hall === h.id);
            const reach = await R.ev(c => window.__BM.reach({ beside: [c.x, c.y], reach: 16 }), chest);
            R.rec('f3: the first pour casts the treasure bridge and the forge chest can be walked to', pt.cast.includes('treasure') && !pt.cast.includes('exit') && reach === true && !!(await flag(`d2.${ID}.f3.mold.${h.id}.treasure`)), { pt, reach });
          }
          const sol = await R.ev(id => window.__BM.solve(id, ['exit']), h.id);
          if (!R.rec(`f${f} hall ${h.id}: the turntables can be set for the way on (${sol ? sol.taps : '-'} taps)`, !!sol, sol)) { ok = false; break; }
          for (let j = 0; j < sol.plan.length && ok; j++) { ok = await turn(f, h.id, sol.plan[j].i, sol.plan[j].taps);
            if (ok && f === 2 && !resumed) { resumed = true;                    // one turntable turned, nothing poured
              const b = { h: await halls(), s: await R.st() }; const rc = await R.saveContinue(); const a = { h: await halls(), s: await R.st() };
              R.rec('f2: Save -> Continue mid-puzzle keeps the turned turntable, the uncast mold and her cell',
                rc.ok && a.s.floor === 2 && JSON.stringify(a.h) === JSON.stringify(b.h) && Object.keys(rc.saved.d2).some(k => /\.rot\./.test(k)) && Math.abs(a.s.cx - b.s.cx) <= 1 && Math.abs(a.s.cy - b.s.cy) <= 1,
                { flags: rc.saved.d2, turn: a.h.map(x => x.turn.map(t => t.rot)), at: [a.s.cx, a.s.cy], was: [b.s.cx, b.s.cy] });
              await R.shot('f2-resumed'); } }
          if (!ok) break;
          const p = await pour(f, h.id);
          ok = R.rec(`f${f} hall ${h.id}: "Pull" pours; the iron reaches the mold and the bridge is cast for good (flag mold)`, p.v === 'Pull' && p.cast.includes('exit') && !!(await flag(`d2.${ID}.f${f}.mold.${h.id}.exit`)) && /bridge/i.test(p.said || ''), p);
        }
        if (!did) break;
      }
      if (!ok) break;
      if (!R.rec(`f${f}: with the bridge cast the way on can be walked`, (await R.ev(g => window.__BM.reach(g), goal)) === true)) break;
      if (f < FLOORS) { const hs = await halls(), m = hs[hs.length - 1].molds.find(x => x.id === 'exit');
        await R.go({ cell: [m.rect[0] + ((m.rect[2] - m.rect[0]) >> 1), m.rect[1] + ((m.rect[3] - m.rect[1]) >> 1)], grow: 0 }); await R.shot(`f${f}-on-the-bridge`);
        if (!(await R.stairs(goalA, f + 1))) break; }
      else { if (await R.boss(goalA, f)) await R.exitByBossCell(goalA); }
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
