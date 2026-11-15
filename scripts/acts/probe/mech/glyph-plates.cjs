'use strict';
// Desert Tomb, glyph plates, played like a player (a grade 1 save, so the optional order strip is
// there): from the overworld mouth; on every floor she reads the tablet, then steps the plates in
// its order; on floor 1 she first steps a wrong plate (the line, the Tomb Guardian, back at the
// room door, plates dark); Save -> Continue in the middle of floor 3's room; the vault on floor 4;
// the stairs, the boss, the way out.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/glyph-plates.cjs
const fs = require('fs'), path = require('path');
const { Run } = require('./_a-lib.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const ID = 'desertTomb';
const plan = f => JSON.parse(fs.readFileSync(path.join(PLANS, `${ID}-f${f}.json`), 'utf8'));
const key = c => c.join(',');

(async () => {
  const P1 = plan(1), N = P1.totalFloors, bossAsset = plan(N).assets.find(a => a.kind === 'boss');
  const R = new Run(ID, { bossId: bossAsset.id, name: 'glyph-plates', grade: 1 });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    const room = name => R.ev(n => { const V = window.__A.mstate().rooms.find(v => v.R.room === n); return { n: V.n, steps: V.R.path.length, doors: V.door.length, entry: V.B.entry }; }, name);
    const strip = () => R.ev(() => { const e = document.getElementById('d2aGlyphHint'); if (!e) return null; const row = e.children[1]; return { text: e.children[0].textContent, open: row.style.display !== 'none', icons: row.querySelectorAll('canvas').length }; });
    const centre = (Rm, k) => { const cs = Rm.plateCells[k], xs = cs.map(c => c[0]), ys = cs.map(c => c[1]); return [(Math.min(...xs) + Math.max(...xs) + 1) * 24, (Math.min(...ys) + Math.max(...ys) + 1) * 24]; };
    // walk onto one plate, never over a plate that is neither lit nor the target
    const stepOn = async (Rm, k, lit) => { const avoid = []; for (const q of Object.keys(Rm.plateCells)) if (q !== k && !lit.has(q)) for (const c of Rm.plateCells[q]) avoid.push(key(c));
      return R.go({ soles: centre(Rm, k), r: 10 }, { avoid }); };
    const readTablet = async (P, Rm, f) => { const tab = P.assets.find(a => a.kind === 'tablet' && a.room === Rm.room);
      await R.ev(() => window.__A.clearMsgs()); const before = await strip(); const v = await R.use(tab.x, tab.y, 'Read'); await page.waitForTimeout(400); const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || '');
      await R.shot(`f${f}-${Rm.room}-tablet`); await R.dismiss(); await page.waitForTimeout(300); const after = await strip();
      R.rec(`f${f} ${Rm.room}: the tablet reads out the order (${Rm.order.join(', ')})`, v === 'Read' && Rm.order.every(n => msg.toLowerCase().includes(n)), { v, msg });
      return { before, after }; };
    const solve = async (P, Rm, f, opts = {}) => { const lit = new Set(); let st = await room(Rm.room);
      for (let i = 0; i < st.n; i++) lit.add(key(Rm.path[i]));
      for (let i = st.n; i < Rm.path.length; i++) { const k = key(Rm.path[i]), g = await stepOn(Rm, k, lit); await page.waitForTimeout(200); st = await room(Rm.room);
        if (!(st.n === i + 1)) return R.rec(`f${f} ${Rm.room}: plate ${i + 1} (${Rm.order[i]}) lights`, false, { g, st });
        lit.add(k);
        if (opts.saveAt === i + 1) { await R.shot(`f${f}-half-lit`); const s0 = await R.st(), rc = await R.saveContinue(), s1 = await R.st(), st2 = await room(Rm.room);
          R.rec(`f${f} ${Rm.room}: Save -> Continue with ${i + 1} of ${Rm.path.length} plates lit keeps them lit, the door shut and her on the plate`, rc.ok && st2.n === i + 1 && st2.doors > 0 && Math.abs(s1.x - s0.x) <= 1 && Math.abs(s1.y - s0.y) <= 1, { d2: rc.saved.d2, st2 });
          await R.shot(`f${f}-resumed`); } }
      await page.waitForTimeout(500); const msg = await R.ev(() => window.__A.msgs().slice(-1)[0] || ''); await R.shot(`f${f}-${Rm.room}-solved`); await R.dismiss(); await page.waitForTimeout(1100);
      const doorFree = await R.ev(cs => cs.every(c => window.__QOK_DNG2__.free(c[0] * 48 + 24, c[1] * 48 + 24 - window.__A.fdy())), Rm.door), fl = await R.ev(() => window.__A.flags());
      return R.rec(`f${f} ${Rm.room}: all ${Rm.path.length} plates lit in order, the far door opens (flag kept), no battle`, /door grinds open/.test(msg) && doorFree && fl[`d2.${ID}.f${f}.room${Rm.room}.n.${Rm.path.length}`] === true, { msg, doorFree }); };
    for (let f = 1; f <= N; f++) {
      const P = plan(f), main = P.mechanic.rooms.find(r => r.room === 'main'); let s = await R.st();
      const legacy = await R.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return { trial: !!w.glyphTrialActive, plates: (w.glyphPlates || []).length }; });
      if (!R.rec(`f${f}: on the authored floor with the glyph-plates module; the bundle's own glyph trial is off`, s.map === ID && s.floor === f && s.w === P.width && s.d2.mechanic === 'glyph-plates' && s.d2.module && !legacy.trial && !legacy.plates, { s: [s.x, s.y], legacy })) break;
      await R.shot(`f${f}-arrive`);
      const doorShut = await R.ev(cs => cs.every(c => !window.__QOK_DNG2__.free(c[0] * 48 + 24, c[1] * 48 + 24 - window.__A.fdy())), main.door);
      R.rec(`f${f}: the far door of the plate room is shut`, doorShut);
      const hs = await readTablet(P, main, f);
      if (f === 1) { R.rec('f1 (grade 1): the order strip is not there before the tablet is read, and appears collapsed after', hs.before === null && hs.after && hs.after.open === false && /Order/.test(hs.after.text), hs);
        await page.locator('#d2aGlyphHint').tap().catch(() => {}); await page.waitForTimeout(250); const o = await strip(); await R.shot('f1-order-strip-open');
        R.rec('f1: tapping the strip opens it: the glyphs of the order, in a row', o && o.open && o.icons === main.order.length, o);
        await page.locator('#d2aGlyphHint').tap().catch(() => {}); await page.waitForTimeout(200);
        // a wrong plate on purpose: the first right one, then a neighbour that is not next
        const lit = new Set(); await stepOn(main, key(main.path[0]), lit); lit.add(key(main.path[0])); await page.waitForTimeout(200); const st1 = await room('main');
        const wrong = Object.keys(main.plateCells).find(k => k !== key(main.path[0]) && k !== key(main.path[1] || []) && Math.abs(+k.split(',')[0] - main.path[0][0]) + Math.abs(+k.split(',')[1] - main.path[0][1]) === 1) || Object.keys(main.plateCells).find(k => !main.path.some(c => key(c) === k));
        await R.ev(() => window.__A.clearMsgs()); const g = await R.go({ soles: centre(main, wrong), r: 10 }); await page.waitForTimeout(300); const m1 = await R.ev(() => window.__A.msgs().slice(-1)[0] || '');
        await R.shot('f1-wrong-plate'); await R.dismiss(); const fr = await R.fight(); await page.waitForTimeout(900); await R.pilot(); const m2 = await R.ev(() => window.__A.msgs().slice(-1)[0] || ''); await R.shot('f1-back-at-the-door'); await R.dismiss();
        const st2 = await room('main'), s2 = await R.st();
        R.rec('f1: a wrong plate: the line, one Tomb Guardian battle, the plates dark again and she is back at the room door', st1.n === 1 && /Wrong plate/.test(m1) && fr.entered && fr.won && /back at the door/.test(m2) && st2.n === 0 && Math.floor(s2.sx / 48) === st2.entry[0] && Math.floor(s2.sy / 48) === st2.entry[1], { g, m1, fr, m2, st2, at: [s2.sx, s2.sy] }); }
      if (f === 3) { await R.ev(() => { window.__GAME_STATE__.player.state.quizDifficulty = '3'; }); await page.waitForTimeout(300); const o3 = await strip();
        R.rec('f3: with the quiz set to grade 3 there is no order strip', o3 === null, o3); await R.ev(() => { window.__GAME_STATE__.player.state.quizDifficulty = '1'; }); }
      if (!(await solve(P, main, f, { saveAt: f === 3 ? 2 : 0 }))) break;
      if (f === 4) { const vault = P.mechanic.rooms.find(r => r.room === 'vault'); if (vault) { await readTablet(P, vault, f); await solve(P, vault, f); } }
      const stairs = P.assets.find(a => a.kind === 'stairsNext');
      if (stairs) { if (!(await R.stairs(stairs, f + 1))) break; }
      else if (await R.boss(bossAsset, f)) await R.exitByBossCell(bossAsset);
    }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
