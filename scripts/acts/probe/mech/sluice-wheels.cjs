'use strict';
// Oasis Depths, sluice wheels, played like a player: from the overworld mouth (smoke flag, the
// dungeon ships disabled), every floor solved in the solver's own turn order (sluice-wheels.solve.cjs,
// the recovery script's rule): the treasure first, then the stairs; the "too deep" line on floor 1;
// floor 2's mimic; floor 2 left without its stairs and entered again from above (the stranding case:
// the wheels go back to the start); Save -> Continue in the middle of floor 3's three-turn puzzle;
// floor 5's moat, the Sand Serpent Queen, the way out.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5300/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/sluice-wheels.cjs
const { Run } = require('./_a-lib.cjs');
const SV = require('./sluice-wheels.solve.cjs');
const ID = 'oasisDepths', BOSS = 'sandSerpentQueen';
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const R = new Run(ID, { bossId: BOSS, name: 'sluice-wheels' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    // which channels block her right now (sprite centre over the channel's middle cell), and the wheel mask
    const water = P => R.ev(cs => cs.map(c => { const x = ((c.rect[0] + c.rect[2] + 1) / 2) * 48, y = ((c.rect[1] + c.rect[3] + 1) / 2) * 48; return !window.__QOK_DNG2__.free(x, y - window.__A.fdy()); }), P.mechanic.channels);
    const want = (P, m) => P.mechanic.channels.map(c => c.floodedAtStart !== !!((m >> (c.wheel - 1)) & 1));
    const mask = f => R.ev(([id, f]) => { const fl = window.__A.flags(); let m = 0; for (let k = 1; k <= 3; k++) if (fl[`d2.${id}.f${f}.wheel${k}`]) m |= 1 << (k - 1); return m; }, [ID, f]);
    const levels = () => R.ev(() => window.__A.mstate().ch.map(C => Math.round(C.level * 100) / 100));
    const here = async () => { const s = await R.st(); return [Math.floor(s.sx / 48), Math.floor(s.sy / 48)]; };
    const turn = async (P, f, id, shotTag) => {
      const W = P.mechanic.wheels.find(w => w.id === id), m0 = await mask(f);
      await R.ev(() => window.__A.clearMsgs());
      const v = await R.use(W.at[0], W.at[1], 'Turn wheel');
      let away = 0;
      if (v) { const t0 = Date.now(); let shot = false;
        while (Date.now() - t0 < 20000) { const q = await R.ev(() => { const s = window.__A.mstate(), w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), cam = w.cameras.main;
            return { seq: !!s.seq, focus: s.focus, d: Math.hypot(cam.scrollX + cam.width / 2 - w.hero.x, cam.scrollY + cam.height / 2 - w.hero.y) }; });
          away = Math.max(away, q.d);
          if (!shot && q.focus && shotTag && Date.now() - t0 > 900) { shot = true; await R.shot(shotTag); }
          if (!q.seq) break; await page.waitForTimeout(120); } }
      await page.waitForTimeout(500); const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || ''); await R.dismiss(); await page.waitForTimeout(300);
      const m1 = await mask(f), wt = await water(P), lv = await levels();
      const ok = v === 'Turn wheel' && m1 === (m0 ^ (1 << (id - 1))) && eq(wt, want(P, m1)) && eq(lv, want(P, m1).map(b => b ? 1 : 0));
      R.rec(`f${f}: "Turn wheel" on wheel ${id} toggles exactly its channels (${W.channels.join(',')}); water drawn as it is walked`, ok, { v, m0, m1, wt, lv, camAway: Math.round(away), msg });
      return { ok, msg, away };
    };
    const play = async (P, f, target, tag) => {                             // the solver's fewest turns from where she stands, then walk there
      const Md = SV.model(P), p = SV.plan01(Md, await here(), await mask(f), target);
      if (!R.rec(`f${f}: ${tag} reachable from here (${p ? p.turns : '-'} turn(s): ${p ? p.seq.map(t => 'wheel ' + t.wheel).join(', ') || 'none' : ''})`, !!p)) return false;
      for (let i = 0; i < p.seq.length; i++) { const r = await turn(P, f, p.seq[i].wheel, i === 0 ? `f${f}-turn-wheel${p.seq[i].wheel}` : null); if (!r.ok) return false;
        if (f === 3 && !R.resumed) { R.resumed = true;                       // mid-puzzle: one of three turns made
          const before = { m: await mask(f), s: await R.st(), lv: await levels() }; await R.shot('f3-before-save');
          const rc = await R.saveContinue(); const after = { m: await mask(f), s: await R.st(), lv: await levels(), wt: await water(P) };
          R.rec('f3: Save -> Continue mid-puzzle (1 of 3 turns): wheel flags, water and walk state, her cell; no reset',
            rc.ok && after.s.floor === 3 && after.m === before.m && eq(after.lv, before.lv) && eq(after.wt, want(P, after.m)) && Math.abs(after.s.x - before.s.x) <= 1 && Math.abs(after.s.y - before.s.y) <= 1
            && !(await R.ev(() => window.__A.mstate().didReset)), { saved: rc.saved, before: { ...before, s: [before.s.x, before.s.y] }, after: { ...after, s: [after.s.x, after.s.y] } });
          await R.shot('f3-resumed'); } }
      return true;
    };
    const chest = async (P, f, c) => {
      if (!(await play(P, f, [c.x, c.y], `chest ${c.x},${c.y}`))) return false;
      const v = await R.use(c.x, c.y, 'Open'); await page.waitForTimeout(500); await R.shot(`f${f}-chest`); await R.dismiss(); await page.waitForTimeout(300);
      const fl = await R.ev(() => window.__A.flags());
      return R.rec(`f${f}: the chest at ${c.x},${c.y} opens by "Open" (chest.${ID}.f${f}.${c.x}.${c.y})`, v === 'Open' && !!fl[`chest.${ID}.f${f}.${c.x}.${c.y}`], { v });
    };
    for (let f = 1; f <= 5; f++) {
      const P = SV.plan(f); let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the sluice-wheels module`, s.map === ID && s.floor === f && s.w === P.width && s.h === P.height && s.d2.mechanic === 'sluice-wheels' && s.d2.module, { s: [s.x, s.y, s.floor], d2: s.d2 })) break;
      await page.waitForTimeout(600);
      const m0 = await mask(f), w0 = await water(P);
      R.rec(`f${f}: water as planned on arrival (mask ${m0}: ${w0.map((b, i) => b ? 'ch' + i + ' flooded' : 'ch' + i + ' dry').join(', ')}); no reset`, eq(w0, want(P, m0)) && !(await R.ev(() => window.__A.mstate().didReset)), { w0 });
      await R.shot(`f${f}-arrive`);
      if (f === 1) {                                                         // lean into the flooded upper walkway from the start room
        const c = P.mechanic.channels.find(z => z.floodedAtStart), y = (c.rect[1] + c.rect[3]) >> 1;
        await R.ev(() => window.__A.clearMsgs()); await R.go({ soles: [(c.rect[0] - 1) * 48 + 24, y * 48 + 24], r: 10 });
        await R.ev(() => window.__A.push(1, 0, 2600)); await page.waitForTimeout(300); const s1 = await R.st(), msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || '');
        await R.shot('f1-too-deep'); await R.dismiss();
        R.rec('f1: pushing into the flooded walkway she stops at its edge and is told it is too deep', s1.sx < c.rect[0] * 48 && /too deep/.test(msg), { soles: [s1.sx, s1.sy], edge: c.rect[0] * 48, msg });
      }
      if (f === 2) {                                                         // the mimic on the start bank
        const mi = P.assets.find(a => a.kind === 'mimic'); await R.ev(() => window.__A.clearMsgs());
        const v = await R.use(mi.x, mi.y, 'Open'); await page.waitForTimeout(400); const msg = await R.ev(() => window.__A.msgs().join(' | ')); await R.shot('f2-mimic');
        await R.dismiss(); const fr = await R.fight(); await page.waitForTimeout(800); await R.pilot();
        const fl = await R.ev(() => window.__A.flags()), open = await R.ev(([x, y]) => window.__QOK_DNG2__.free(x * 48 + 24, y * 48 + 24 - window.__A.fdy()), [mi.x, mi.y]);
        R.rec('f2: the chest on the start bank is a mimic: "The chest was a Mimic!", a Mimic battle won, it stays an open empty chest', /Mimic/.test(msg) && fr.entered && fr.won && fl[`d2.${ID}.f2.mimic.${mi.x}.${mi.y}`] === true && open, { v, msg, fr });
        await R.shot('f2-mimic-after');
      }
      let ok = true;
      for (const c of P.assets.filter(a => a.kind === 'chest')) ok = ok && await chest(P, f, c);
      if (!ok) break;
      const goal = P.assets.find(a => a.kind === 'stairsNext' || a.kind === 'boss');
      if (!(await play(P, f, [goal.x, goal.y], goal.kind === 'boss' ? 'the boss' : 'the stairs down'))) break;
      if (f === 5) { const msg = await R.ev(() => window.__A.msgs().join(' | '));
        R.rec('f5: draining the moat says so (the queen stirs)', /moat drains/.test(msg), msg); }
      if (f === 2 && !R.reentered) {                                         // leave without the stairs, come back down: the stranding case
        R.reentered = true; await R.shot('f2-solved');
        await R.ev(() => window.__PHASER_GAME__.scene.getScene('WorldMapScene').performTransition({ targetMap: '__floor_up__' }));
        await page.waitForTimeout(2500); await R.pilot(); await R.settle(); s = await R.st();
        const P1 = SV.plan(1), st1 = P1.assets.find(a => a.kind === 'stairsNext');
        R.rec('f2 left by the engine\'s floor change (as a lost battle would leave it): she is on floor 1 by its stairs', s.floor === 1, [s.x, s.y, s.floor]);
        await R.ev(() => window.__A.clearMsgs()); await R.stairs(st1, 2); await page.waitForTimeout(3500);
        const msg = await R.ev(() => window.__A.msgs().join(' | ')); await R.shot('f2-reset'); await R.dismiss();
        const m2 = await mask(2), w2 = await water(P);
        R.rec('f2 entered again from above with the island wheel turned (stranded): the wheels go back to the start, a line says so', m2 === 0 && eq(w2, want(P, 0)) && /sluice gates clank/.test(msg) && (await R.ev(() => window.__A.mstate().didReset)) === true, { m2, w2, msg });
        if (!(await play(P, f, [goal.x, goal.y], 'the stairs down (again)'))) break;
      }
      await R.shot(`f${f}-solved`);
      if (goal.kind === 'stairsNext') { if (!(await R.stairs(goal, f + 1))) break; }
      else if (await R.boss(goal, f)) await R.exitByBossCell(goal);
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
