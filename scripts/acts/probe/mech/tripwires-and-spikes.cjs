'use strict';
// Bandit Hideout, trip wires and spike patches, played like a player: from the overworld mouth;
// on floor 1 she walks through a wire on purpose (the line, one bandit ambush, the wire spent);
// on floor 2 she steps on a spike patch on purpose (a small hit, thrown back two tiles, the
// spikes stay up); everywhere else she stops within two tiles of each wire in her way and cuts
// it, and walks round the patches; Save -> Continue on floor 3 with a wire cut; the Bandit Lord.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/tripwires-and-spikes.cjs
const fs = require('fs'), path = require('path');
const { Run } = require('./_a-lib.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const ID = 'banditHideout';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `${ID}-f${f}.json`), 'utf8'));
const key = c => c.join(',');

(async () => {
  const P1 = plan(1), N = P1.totalFloors, bossAsset = plan(N).assets.find(a => a.kind === 'boss');
  const R = new Run(ID, { bossId: bossAsset.id, name: 'tripwires-and-spikes' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    const ms = () => R.ev(() => { const st = window.__A.mstate(); return { wires: st.wires.map(w => ({ id: w.id, live: w.live, cells: w.cells })), patches: st.patches.map(p => ({ id: p.id, up: !!p.up })), hits: st.hits || 0, battles: st.battles || 0 }; });
    const hazards = async (P, { wires = true } = {}) => { const m = await ms(), av = []; for (const p of P.mechanic.spikePatches) for (const c of p) av.push(key(c));
      if (wires) for (const w of m.wires) if (w.live) for (const c of w.cells) av.push(key(c)); return av; };
    // to the goal like a careful player: round the patches, and every wire in the way is cut from two tiles off
    const careful = async (P, goal, f) => { let cut = 0;
      for (let guard = 0; guard < 12; guard++) { const av = await hazards(P);
        const can = await R.ev(([g, a]) => !!window.__A.plan(g, { avoid: a }), [goal, av]);
        if (can) { const g = await R.go(goal, { avoid: av }); return { ok: g.ok, cut, g }; }
        const m = await ms(); let did = false;
        for (const w of m.wires.filter(x => x.live)) { const c = w.cells[w.cells.length >> 1];
          const g = await R.go({ beside: c, reach: 80 }, { avoid: av }); if (!g.ok) continue;
          await page.waitForTimeout(250); if (!cut) await R.shot(`f${f}-cut-prompt`);
          const v = await R.tapPrompt('Cut trip wire'); await page.waitForTimeout(300); await R.dismiss(); const m2 = await ms(), fl = await R.ev(() => window.__A.flags());
          const ok = v === 'Cut trip wire' && !m2.wires.find(x => x.id === w.id).live && fl[`d2.${ID}.f${f}.wire${w.id}.cut`] === true;
          R.rec(`f${f}: within two tiles of wire ${w.id} the prompt reads "Cut trip wire"; cut, it is gone for good`, ok, { v, at: g.at }); if (ok) { cut++; did = true; break; } }
        if (!did) return { ok: false, cut, why: 'no wire could be reached' }; }
      return { ok: false, cut, why: 'guard' }; };
    let saved = false;
    for (let f = 1; f <= N; f++) {
      const P = plan(f), M = P.mechanic; let s = await R.st(), m0 = await ms();
      const legacy = await R.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return { lord: !!(w._banditLordSprite && w._banditLordSprite.visible), tw: (w.tripwirePositions && (w.tripwirePositions.size || w.tripwirePositions.length)) || 0 }; });
      if (!R.rec(`f${f}: on the authored floor with the tripwires-and-spikes module (${M.wires.length} wires, ${M.spikePatches.length} patches); the bundle's own bandit marker is hidden`,
        s.map === ID && s.floor === f && s.w === P.width && s.d2.mechanic === 'tripwires-and-spikes' && s.d2.module && m0.wires.length === M.wires.length && m0.patches.length === M.spikePatches.length && !legacy.lord, { s: [s.x, s.y], legacy })) break;
      await R.shot(`f${f}-arrive`);
      if (f === 1) {                                                         // tripped on purpose
        const w = M.wires[0], c = w.cells[w.cells.length >> 1], vert = w.cells.every(q => q[0] === c[0]);
        const g0 = await R.go({ beside: c, reach: 100 }, { avoid: await hazards(P) }); await page.waitForTimeout(3400); await R.shot('f1-wire-glint');
        const s0 = await R.st(), side = vert ? Math.sign(c[0] * 48 + 24 - s0.sx) : Math.sign(c[1] * 48 + 24 - s0.sy), beyond = vert ? [c[0] + side * 2, c[1]] : [c[0], c[1] + side * 2];
        await R.ev(() => window.__A.clearMsgs()); const g = await R.go({ cell: beyond, grow: 0 }, { avoid: await hazards(P, { wires: false }) }); await page.waitForTimeout(300);
        const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || ''); await R.shot('f1-tripped'); await R.dismiss(); const fr = await R.fight(); await page.waitForTimeout(900); await R.pilot(); await R.dismiss();
        const m1 = await ms(), fl = await R.ev(() => window.__A.flags());
        R.rec('f1: walking through a live wire: the line, exactly one bandit ambush, the wire is spent', /tripped a wire/.test(msg) && fr.entered && fr.won && /bandit|bruiser|knife/i.test(String(fr.monster)) && !m1.wires[0].live && fl[`d2.${ID}.f1.wire${w.id}.spent`] === true && m1.battles === 1, { g0, g, msg, fr });
      }
      if (f === 2) {                                                         // spikes on purpose
        const p = M.spikePatches[0], xs = p.map(c => c[0]), ys = p.map(c => c[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
        const near = await R.go({ beside: [x0, y0], reach: 70 }, { avoid: await hazards(P) }); await R.shot('f2-spike-patch-hidden');
        const hp0 = (await R.st()).hp, s0 = await R.st(); await R.ev(() => window.__A.clearMsgs());
        await R.go({ soles: [(x0 + 1) * 48, (y0 + 1) * 48], r: 30 }, { avoid: await hazards(P).then(a => a.filter(k => !p.some(c => key(c) === k))) }); await page.waitForTimeout(900);
        const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || ''); await R.shot('f2-spikes-sprung'); await R.dismiss(); await page.waitForTimeout(300);
        const s1 = await R.st(), m1 = await ms(), fl = await R.ev(() => window.__A.flags());
        const dx = Math.max(x0 * 48 - s1.sx, s1.sx - (x0 + 2) * 48, 0), dy = Math.max(y0 * 48 - s1.sy, s1.sy - (y0 + 2) * 48, 0), back = Math.max(dx, dy);
        R.rec('f2: stepping on a spike patch: a small hit, thrown back about two tiles, the spikes stay up (flag kept)', m1.hits === 1 && s1.hp < hp0 && s1.hp > hp0 * 0.85 && back >= 60 && back <= 110 && m1.patches[0].up && fl[`d2.${ID}.f2.spike0.sprung`] === true && /Spikes/.test(msg), { near, hp: [hp0, s1.hp], back, msg });
      }
      const stairs = P.assets.find(a => a.kind === 'stairsNext'), target = stairs || bossAsset, h0 = (await ms());
      if (f === 3 && !saved) { saved = true; const av = await hazards(P), w = (await ms()).wires.find(x => x.live);
        if (w) { const c = w.cells[w.cells.length >> 1]; let cutOk = false;
          for (const w2 of (await ms()).wires.filter(x => x.live)) { const c2 = w2.cells[w2.cells.length >> 1], g = await R.go({ beside: c2, reach: 80 }, { avoid: av }); if (!g.ok) continue; await page.waitForTimeout(250); cutOk = (await R.tapPrompt('Cut trip wire')) === 'Cut trip wire'; await page.waitForTimeout(300); await R.dismiss(); if (cutOk) break; }
          const b = await ms(), s0 = await R.st(), rc = await R.saveContinue(), a = await ms(), s1 = await R.st();
          R.rec('f3: Save -> Continue with one wire cut keeps it cut, the others live, her cell the same', cutOk && rc.ok && s1.floor === 3 && JSON.stringify(a.wires.map(x => x.live)) === JSON.stringify(b.wires.map(x => x.live)) && a.wires.some(x => !x.live) && Math.abs(s1.x - s0.x) <= 1 && Math.abs(s1.y - s0.y) <= 1, { d2: rc.saved.d2, wires: a.wires.map(x => x.live) });
          await R.shot('f3-resumed'); } }
      const r = await careful(P, { beside: [target.x, target.y], reach: 40 }, f), h1 = await ms();
      if (!R.rec(`f${f}: to the ${stairs ? 'stairs' : 'boss'} like a careful player: ${r.cut} wire(s) cut on the way, no ambush, no spikes`, r.ok && h1.hits === h0.hits && h1.battles === h0.battles, r)) { await R.shot(`f${f}-fail`); break; }
      await R.shot(`f${f}-through`);
      if (stairs) { if (!(await R.stairs(stairs, f + 1, { avoid: await hazards(P) }))) break; }
      else if (await R.boss(bossAsset, f, { avoid: await hazards(P) })) await R.exitByBossCell(bossAsset);
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
