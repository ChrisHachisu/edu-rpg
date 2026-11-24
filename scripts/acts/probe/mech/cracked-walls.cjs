'use strict';
// Scorched Ruins, cracked walls, played like a player: from the overworld mouth; on every floor
// she finds each cracked wall by its floor hint, leans on the sound wall beside it (nothing),
// then walks into the crack (it crumbles and stays open) and into the hidden room behind;
// Save -> Continue inside the first hidden room; on floor 5 the last crack only gives once the
// Ashen Guardian is down; the stairs, the boss, the way out.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/cracked-walls.cjs
const fs = require('fs'), path = require('path');
const { Run } = require('./_a-lib.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const ID = 'scorchedRuins';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `${ID}-f${f}.json`), 'utf8'));

(async () => {
  const P1 = plan(1), N = P1.totalFloors, bossAsset = plan(N).assets.find(a => a.kind === 'boss');
  const R = new Run(ID, { bossId: bossAsset.id, name: 'cracked-walls' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page; let saved = false;
    const isOpen = id => R.ev(i => !!window.__A.mstate().secrets.find(s => s.id === i).open, id);
    const canReach = c => R.ev(g => !!window.__A.plan({ cell: g, grow: 0 }), c);
    const lean = (d, ms, id) => R.ev(([dx, dy, t, i]) => window.__A.push(dx, dy, t, () => window.__A.mstate().secrets.find(s => s.id === i).open).then(() => true), [d[0], d[1], ms, id]);
    const openSecret = async (P, S, f, { expectSealed = false } = {}) => {
      const mid = S.crack[1], d = [Math.sign(mid[0] - S.front[0]), Math.sign(mid[1] - S.front[1])], behind = [mid[0] + d[0], mid[1] + d[1]], hint = P.assets.find(a => a.kind === 'hint' && a.secret === S.id);
      const tag = `f${f} secret ${S.id}`;
      if (!(await canReach(S.front))) return null;                           // behind another secret, or not reachable yet
      const sealedBefore = !(await canReach(behind));
      // (the pill can take a few frames to show: the tap is retried)
      if (hint) { const g = await R.go({ cell: [hint.x, hint.y], grow: -14 }); await page.waitForTimeout(300); await R.ev(() => window.__A.clearMsgs());
        let v = null; for (let k = 0; k < 4 && !v; k++) { v = await R.tapPrompt(); if (!v) await page.waitForTimeout(350); } await page.waitForTimeout(300); const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || ''); await R.shot(`f${f}-s${S.id}-hint`); await R.dismiss();
        R.rec(`${tag}: the floor hint (${hint.type}) can be looked at`, g.ok && v === (hint.type === 'sign' ? 'Read' : 'Look') && msg.length > 10, { v, msg }); }
      // the sound wall two cells along from the crack holds
      const off = [S.front[0] + (d[0] ? 0 : 3), S.front[1] + (d[1] ? 0 : 3)]; let held = 'n/a';
      if (await canReach(off)) { await R.go({ cell: off, grow: -10 }); await lean(d, 900, S.id); held = !(await isOpen(S.id)); }
      await R.go({ cell: S.front, grow: -10 }); await page.waitForTimeout(200); await R.shot(`f${f}-s${S.id}-crack`);
      await R.ev(() => window.__A.clearMsgs()); const t0 = Date.now(); await lean(d, 2500, S.id); const ms = Date.now() - t0; await page.waitForTimeout(350);
      const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || ''), open = await isOpen(S.id);
      if (expectSealed) { await R.shot(`f${f}-s${S.id}-sealed`); await R.dismiss();
        return R.rec(`${tag}: with the boss alive it does not give; one line says so`, !open && /will not give/.test(msg) && sealedBefore, { msg }); }
      await R.shot(`f${f}-s${S.id}-open`); await R.dismiss(); await page.waitForTimeout(400);
      const g2 = await R.go({ cell: behind, grow: -6 }), fl = await R.ev(() => window.__A.flags()); await R.shot(`f${f}-s${S.id}-inside`);
      const ok = R.rec(`${tag}: sealed at first; the wall beside it holds (${held}); walking into the crack opens it after ${ms} ms; she walks through into the hidden room; the flag is kept`,
        sealedBefore && held !== false && open && /hidden room/.test(msg) && g2.ok && fl[`d2.${ID}.f${f}.secret${S.id}.open`] === true, { msg, g2, ms });
      if (ok && !saved) { saved = true; const s0 = await R.st(), rc = await R.saveContinue(), s1 = await R.st(), still = await isOpen(S.id), out = await canReach(S.front);
        R.rec(`${tag}: Save -> Continue inside the hidden room: she is still there, the wall is still open and she can walk back out`, rc.ok && s1.floor === f && Math.abs(s1.x - s0.x) <= 1 && Math.abs(s1.y - s0.y) <= 1 && still && out, { d2: rc.saved.d2, at: [s1.x, s1.y] });
        await R.shot(`f${f}-resumed-inside`); }
      return ok; };
    for (let f = 1; f <= N; f++) {
      const P = plan(f), SS = P.mechanic.secrets; let s = await R.st();
      if (!R.rec(`f${f}: on the authored floor with the cracked-walls module (${SS.length} secret(s))`, s.map === ID && s.floor === f && s.w === P.width && s.d2.mechanic === 'cracked-walls' && s.d2.module && (await R.ev(() => window.__A.mstate().secrets.length)) === SS.length, { s: [s.x, s.y] })) break;
      await R.shot(`f${f}-arrive`);
      const todo = SS.filter(S => S.needs !== 'boss defeated'); let pass = 0, okAll = true;
      while (todo.length && pass++ < 4) for (const S of todo.slice()) { const r = await openSecret(P, S, f); if (r === null) continue; todo.splice(todo.indexOf(S), 1); if (!r) okAll = false; }
      R.rec(`f${f}: every cracked wall that needs no boss was found and opened (${SS.length - SS.filter(S => S.needs === 'boss defeated').length})`, okAll && todo.length === 0, todo.map(S => S.id));
      const gated = SS.find(S => S.needs === 'boss defeated'); if (gated) await openSecret(P, gated, f, { expectSealed: true });
      const stairs = P.assets.find(a => a.kind === 'stairsNext');
      if (stairs) { if (!(await R.stairs(stairs, f + 1))) break; continue; }
      if (!(await R.boss(bossAsset, f))) break;
      if (gated) { await R.pilot(); await openSecret(P, gated, f); await R.go({ beside: [bossAsset.x, bossAsset.y], reach: 40 }); }
      await R.exitByBossCell(bossAsset);
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
