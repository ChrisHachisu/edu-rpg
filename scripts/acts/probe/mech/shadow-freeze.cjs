'use strict';
// Shadow Cave, shadows that freeze in the crystal light, played like a player: from the overworld
// mouth; on floor 1 she walks into a prowling shadow on purpose (the line, the battle, the shadow
// gone, Save -> Continue keeps it gone); every other run is crossed while the crystals shine (she
// waits at its edge in the dark); on floor 5 the second mouth is rock until the dragon is down,
// then it is the way out to the Act 3 side and back in.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/shadow-freeze.cjs
const fs = require('fs'), path = require('path');
const { Run, L, manifest, ROOT } = require('./_a-lib.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const ID = 'shadowCave';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `${ID}-f${f}.json`), 'utf8'));
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const SH = `(() => { const A = window.__A, T = 48;
  const shineLeft = () => { const P = A.mstate().P, tk = A.mstate().t / 185, per = P.dimTicks + P.shineTicks, pos = tk % per; return pos < P.dimTicks ? 0 : (per - pos) * 185; };
  const dimLeft = () => { const P = A.mstate().P, tk = A.mstate().t / 185, per = P.dimTicks + P.shineTicks, pos = tk % per; return pos < P.dimTicks ? (P.dimTicks - pos) * 185 : 0; };
  window.__SH = { shineLeft, dimLeft,
    async go(goal) { const f = A.fdy(); let crossed = 0, waited = 0;
      for (let guard = 0; guard < 40; guard++) { const st = A.mstate(), mech = A.ctx().mechanic.shadows, danger = new Set();
        st.shadows.forEach(s => { const m = mech.find(x => x.id === s.id); (m.run || []).forEach(c => danger.add(c[0] + ',' + c[1])); });
        const inD = pt => [[0, 0], [-9, 0], [9, 0], [0, -9], [0, 9], [-9, -9], [9, -9], [-9, 9], [9, 9]].some(o => danger.has(Math.floor((pt[0] + o[0]) / T) + ',' + Math.floor((pt[1] + f + o[1]) / T)));   // 9 px of margin: the pilot rounds corners by up to its tolerance
        const p = A.plan(goal, { avoid: st.shadows.map(s => s.cx + ',' + s.cy) }); if (!p) return { ok: false, why: 'no-path', crossed };
        let j = 0; while (j < p.length && !inD(p[j])) j++;
        if (j >= p.length) { const r = await A.drive(p, { tol: 5 }); return Object.assign(r, { crossed, waited }); }
        if (j > 1) { const r = await A.drive(p.slice(0, j - 1), { tol: 5 }); if (!r.ok || r.why !== 'arrived') return Object.assign(r, { crossed, seg: 'calm' }); }
        let k = j; while (k < p.length && inD(p[k])) k++;
        const need = (k - j + 3) * 12 / 260 * 1000 * 1.25 + 400, t0 = performance.now();
        while (shineLeft() < need) { if (performance.now() - t0 > 30000) return { ok: false, why: 'no-shine', need, crossed }; await A.wait(40); } waited += performance.now() - t0;
        const p2 = A.plan(goal, { avoid: A.mstate().shadows.map(s => s.cx + ',' + s.cy) }); if (!p2) return { ok: false, why: 'no-path-frozen', crossed };
        let a = 0; while (a < p2.length && !inD(p2[a])) a++; let b = a; while (b < p2.length && inD(p2[b])) b++;
        const b0 = A.mstate().battles || 0, r = await A.drive(p2.slice(0, Math.min(p2.length, b + 1)), { tol: 6 }); crossed++;
        if (!r.ok || r.why !== 'arrived' || (A.mstate().battles || 0) !== b0) return Object.assign(r, { ok: false, seg: 'run', crossed }); }
      return { ok: false, why: 'guard' }; } }; })()`;

(async () => {
  const P1 = plan(1), N = P1.totalFloors, PN = plan(N), bossAsset = PN.assets.find(a => a.kind === 'boss'), LM2 = acts.landmarks.find(l => l.mapId === ID && l.toFloor);
  const R = new Run(ID, { bossId: bossAsset.id, name: 'shadow-freeze' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page, inject = () => R.ev(SH), sgo = goal => R.ev(g => window.__SH.go(g), goal);
    const shadows = () => R.ev(() => window.__A.mstate().shadows.map(s => ({ id: s.id, cx: s.cx, cy: s.cy })));
    for (let f = 1; f <= N; f++) {
      const P = plan(f); let s = await R.st(); await inject();
      if (!R.rec(`f${f}: on the authored floor with the shadow-freeze module`, s.map === ID && s.floor === f && s.w === P.width && s.d2.mechanic === 'shadow-freeze' && s.d2.module, s)) break;
      const sh0 = await shadows();
      R.rec(`f${f}: ${P.mechanic.shadows.length} shadow(s) prowl; the bundle's own darkness patrols are off`, sh0.length === P.mechanic.shadows.length && (await R.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return !w.darknessPulseEnabled && !(w.patrolSprites && w.patrolSprites.length); })), sh0);
      await page.waitForFunction(() => window.__SH.dimLeft() > 1500, { timeout: 15000 }).catch(() => {}); await R.shot(`f${f}-dim`);
      if (f === 1) {                                                         // caught on purpose
        const S0 = P.mechanic.shadows[0], mid = S0.track[S0.track.length >> 1];
        await sgo({ beside: [S0.run[0][0], S0.run[0][1]], reach: 60 }).catch(() => null);
        await page.waitForFunction(() => window.__SH.dimLeft() > 3000, { timeout: 15000 }).catch(() => {});
        await R.ev(() => window.__A.clearMsgs()); const g = await R.go({ cell: mid, grow: 0 }); await page.waitForTimeout(250);
        const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || null); await R.shot('f1-caught'); await R.dismiss();
        const fr = await R.fight(); await page.waitForTimeout(800); await R.dismiss(); await R.pilot(); await inject();
        const fl = await R.ev(() => window.__A.flags()), sh1 = await shadows();
        R.rec('f1: walking into a prowling shadow: the line, one battle with a shadow, and that shadow is gone', /lunges/.test(msg || '') && fr.entered && fr.won && fl[`d2.${ID}.f1.shadow${S0.id}.gone`] === true && sh1.length === sh0.length - 1, { g, msg, fr, sh1 });
        const rc = await R.saveContinue(); await inject(); const sh2 = await shadows(), s2 = await R.st();
        R.rec('f1: Save -> Continue keeps the beaten shadow gone', rc.ok && s2.floor === 1 && sh2.length === sh1.length, { d2: rc.saved.d2, sh2 });
        await R.shot('f1-resumed');
      }
      const stairs = P.assets.find(a => a.kind === 'stairsNext'), target = stairs || bossAsset, m2 = P.assets.find(a => a.kind === 'mouth' && a.sealedUntil);
      if (m2) { const q = await R.ev(([x, y]) => ({ tile: window.__A.tile(x, y), free: window.__QOK_DNG2__.free(x * 48 + 24, y * 48 + 24 - window.__A.fdy()), path: !!window.__A.plan({ centre: [x, y] }) }), [m2.x, m2.y]);
        R.rec(`f${f}: with the boss alive the second mouth is rock (no way-out tile, her soles refused, no path into it)`, q.tile !== 10 && q.free === false && q.path === false, q); }
      const b0 = await R.ev(() => window.__A.mstate().battles || 0), t0 = Date.now(), g = await sgo({ beside: [target.x, target.y], reach: 40 }), b1 = await R.ev(() => window.__A.mstate().battles || 0);
      if (!R.rec(`f${f}: she passes ${g.crossed} run(s) in the crystal light without a battle (${((Date.now() - t0) / 1000).toFixed(1)} s, ${((g.waited || 0) / 1000).toFixed(1)} s waiting in the dark)`, g.ok && b1 === b0, Object.assign(g, b1 === b0 && g.why === 'arrived' ? {} : { msg: await R.ev(() => window.__A.msgs().slice(-2)), at: await R.ev(() => { const s = window.__A.st(); return [s.sx, s.sy]; }).catch(() => null), battles: [b0, b1] }))) { await R.shot(`f${f}-fail`); break; }
      await page.waitForFunction(() => window.__SH.shineLeft() > 800, { timeout: 12000 }).catch(() => {}); await R.shot(`f${f}-shine`);
      if (stairs) { if (!(await R.stairs(stairs, f + 1))) break; continue; }
      if (!(await R.boss(bossAsset, f))) break;
      await R.pilot(); await inject();
      if (m2) { await page.waitForTimeout(500); await R.ev(() => window.__A.settle());   // The Shadow Gate ends with the dragon and says so first
        const q = await R.ev(([x, y]) => ({ tile: window.__A.tile(x, y), free: window.__QOK_DNG2__.free(x * 48 + 24, y * 48 + 24 - window.__A.fdy()) }), [m2.x, m2.y]);
        R.rec(`f${f}: the dragon down, the second mouth opens without leaving the floor (way-out tile, soles allowed)`, q.tile === 10 && q.free === true, q);
        await sgo({ beside: [m2.x, m2.y], reach: 60 }); await R.shot(`f${f}-second-mouth-open`);
        await R.go({ centre: [m2.x, m2.y] }, { hold: 1200 }); await page.waitForTimeout(2500); const p = await L.pos(page);
        R.rec('the second mouth leads out to the Act 3 side', p.map === 'overworld' && p.x === LM2.exit[0] && p.y === LM2.exit[1], p); await R.shot('exit-act3-side');
        if (p.map === 'overworld') { await page.waitForTimeout(1500); await L.noEncounters(page); await L.walkCells(page, [[LM2.exit[0], LM2.exit[1] + 1]], { maxMs: 6000 }); await page.waitForTimeout(300);   // the engine's one-step transition cooldown: step away first, as a player does
          await L.walkCells(page, [[LM2.at[0], LM2.at[1]]], { maxMs: 25000 }); await page.waitForTimeout(1200); await R.pilot(); const okS = await R.settle(); await inject(); const s3 = await R.st(), land = manifest().floors[`${ID}-f${N}`].land.mouth2;
          R.rec('walking back in from the Act 3 side lands her inside the second mouth on the top floor', okS && s3.map === ID && s3.floor === N && Math.abs(s3.x - land.x) <= 1 && Math.abs(s3.y - land.y) <= 2, { at: [s3.x, s3.y, s3.floor], land });
          await R.shot('back-in-second-mouth'); await L.noEncounters(page); if (s3.map === ID) await sgo({ beside: [bossAsset.x, bossAsset.y], reach: 40 }); } }
      if ((await R.st()).map === ID) await R.exitByBossCell(bossAsset, m2 ? LM2 : R.LM, m2 ? 'the exit in the dragon\'s cell lets her out by the door she came in (the Act 3 side)' : undefined);
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
