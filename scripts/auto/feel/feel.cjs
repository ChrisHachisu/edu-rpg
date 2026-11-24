'use strict';
// Track K "kid timing" harness: a child pilot (kid.js + adapters.js) plays the route of one or more
// authored floors N times per profile and records attempts, failures by kind, damage, game time and
// frame-time stats per trial.
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5500/ \
//     node scripts/auto/feel/feel.cjs <dungeonId> <floors e.g. 1,2,3> <profile g1|g3|g6> [trials=20] [seed=1]
// env FEEL_OUT (default /home/user/work/feel/out) : <dungeon>-f<n>-<profile>.json + shots/*.jpg
//     FEEL_PLANS (default scripts/auto/feel/data/plans) : plan JSON (route) per floor
//     FEEL_BUDGET_S (default 450) : stop starting new trials after this many wall seconds (chain runs)
//
// ENTRY: a v4 save whose position is INSIDE the dungeon on floor <n> at the route's 3rd cell,
// continued from the title (the game's own resume of a dungeon auto save, the real entry path;
// never WorldMapScene.loadMap). Between trials the hero is put back on the route start with the
// engine's ctx.place (and ctx.toFloor after a drop to the floor below): that is test scaffolding
// for repetition, not a claim about reachability.
const fs = require('fs'), path = require('path');
const L = require('../../acts/probe/lib.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const PLANS = process.env.FEEL_PLANS || path.join(__dirname, 'data/plans');
const OUT = process.env.FEEL_OUT || '/home/user/work/feel/out';
const BUDGET = (+process.env.FEEL_BUDGET_S || 450) * 1000;
const KID = fs.readFileSync(path.join(__dirname, 'kid.js'), 'utf8'), ADA = fs.readFileSync(path.join(__dirname, 'adapters.js'), 'utf8');
const PROFILES = {
  g1: { name: 'grade 1', grade: '1', rt: 700, sd: 150, noiseDeg: 20, overshoot: 200, replan: 1500 },
  g3: { name: 'grade 3', grade: '3', rt: 500, sd: 120, noiseDeg: 14, overshoot: 150, replan: 1000 },
  g6: { name: 'grade 6', grade: '6', rt: 350, sd: 80, noiseDeg: 8, overshoot: 100, replan: 600 },
};
const FAIR_P95 = 50;   // ms: a trial whose p95 frame time is above this is marked 'coarse' and left out of the rates
const MARGIN = [24, 72]; // px from her soles to the hazard cell where the child decides to stop (uniform per approach)
const BUNDLE_BOSSES = ['ashenGuardian', 'banditLord', 'celestialGuardian', 'coralTitan', 'crystalHydra', 'dragon', 'flameTitan', 'frostMonarch', 'giantCrab', 'giantToad', 'iceWyrm',
  'lavaWyrm', 'magmaBeetleKing', 'mosswarden', 'nullDevourer', 'oreColossus', 'phantomStag', 'sandGolem', 'sandSerpentQueen', 'serpent', 'stormHarpy', 'stormSentinel', 'swordWraith', 'warGeneralMalachar'];
const INV = ['herb*5', 'flameCloak', 'windbreakerStone'].map(s => ({ itemId: s.split('*')[0], quantity: +(s.split('*')[1] || 1) }));
const QUESTS = ['owlsLesson', 'drakeCargo', 'lunasMap', 'ancientRelic', 'flameCloak', 'lunasProphecy'];
// floors whose hazard is local: a trial is the stretch from 5 cells before the first hazard cell to 4 after the last
const SEGMENT = new Set(['drifting-blocks', 'mirror-rooms']);
function segWindow(P, route) { const m = P.mechanic; let idx = [];
  if (m.id === 'drifting-blocks') for (const g of m.gates) for (const l of g.lanes) route.forEach((q, i) => { if (q[0] >= l.x && q[0] < l.x + 3 && Math.abs(q[1] - l.yCentre) <= l.amplitude + 1) idx.push(i); });
  if (m.id === 'mirror-rooms') for (const r of m.rooms || []) route.forEach((q, i) => { if (q[0] >= r.rect[0] - 1 && q[0] <= r.rect[2] + 1 && q[1] >= r.rect[1] - 1 && q[1] <= r.rect[3] + 1) idx.push(i); });
  return idx.length ? [Math.min(...idx), Math.max(...idx)] : null; }
const plan = (id, f) => JSON.parse(fs.readFileSync(path.join(PLANS, `${id}-f${f}.json`), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function enterFloor(page, id, f, cell, grade) {
  const flags = { ...L.allFlags(), ...Object.fromEntries(BUNDLE_BOSSES.map(b => [`boss.${b}.defeated`, true])) };
  const sv = L.save({ mapId: id, x: cell[0], y: cell[1], floor: f, flags, inventory: INV, completedQuests: QUESTS });
  if (grade) sv.player.quizDifficulty = String(grade);   // the profile's school grade is the save's quiz setting (modules read it)
  sv.player.hp = sv.player.maxHp = 1000; sv.player.def = 100;   // a fraction-of-max hurt reads as % directly
  await L.bootSave(page, sv, { settle: 1500 });
  const ok = await page.waitForFunction(([id, f]) => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), d = window.__QOK_DNG2__;
    const s = d && d.state(); return w.currentMapId === id && (w.currentFloor || 1) === f && s && s.art === 'ready' && s.mask === 'ready' && s.module && !w.__a1dEntryWaiting; }, [id, f], { timeout: 60000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(800); await L.noEncounters(page);
  return ok;
}
// Test scaffolding: put a floor's mechanic back to its first-visit state (a caught guard / shadow comes back,
// a cut or spent wire is live again, sprung spikes are hidden again): clear the floor's own d2 flags except the
// clock and the "told once" boxes, destroy the module's objects, fresh state, load() again.
const RELOAD = new Set(['guard-lanterns', 'shadow-freeze', 'tripwires-and-spikes', 'maze-hunter']), RELOAD_ALWAYS = new Set(['tripwires-and-spikes', 'maze-hunter']);
function reloadModule(page, id, f) { return page.evaluate(([id, f]) => { const c = window.__QOK_DNG2__.ctx(), fl = c.flags(), pre = `d2.${id}.f${f}.`; const cleared = [];
  for (const k of Object.keys(fl)) if (k.indexOf(pre) === 0 && !/\.clk$|\.told\.|spikes\.told/.test(k)) { delete fl[k]; cleared.push(k.slice(pre.length)); }
  for (const o of c._owned.splice(0)) { try { o.destroy(); } catch (e) {} }
  const old = c.state; for (const k of Object.keys(old)) delete old[k];
  try { if (c.mod.load) c.mod.load(c); } catch (e) { return { err: String(e) }; } return { cleared }; }, [id, f]); }
async function inject(page) { await page.evaluate(KID); await page.evaluate(ADA); }
const st = page => page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), p = window.__GAME_STATE__.player.state;
  return { map: w.currentMapId, floor: w.currentFloor || 1, msg: !!w.showingMessage, battle: g.scene.isActive('BattleScene'), over: g.scene.isActive('GameOverScene'), hp: p.hp, maxHp: window.__GAME_STATE__.player.totalMaxHp || p.maxHp,
    soles: window.__KID ? window.__KID.soles() : null, field: g.scene.isActive('WorldMapScene') && !g.scene.isPaused('WorldMapScene') }; });
const tapZ = page => page.evaluate(() => { const f = t => { const e = new KeyboardEvent(t, { key: 'z', code: 'KeyZ', bubbles: true }); try { Object.defineProperty(e, 'keyCode', { get: () => 90 }); } catch (x) {} window.dispatchEvent(e); }; f('keydown'); setTimeout(() => f('keyup'), 40); });
async function dismiss(page, n = 12) { for (let k = 0; k < n; k++) { const s = await st(page); if (!s.msg) return k; await tapZ(page); await sleep(300); } return n; }
// a battle the mechanic started: answer correctly until it ends (the probes' own way)
async function fight(page, maxMs = 120000) {
  const t0 = Date.now(); let rounds = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await page.evaluate(() => { const g = window.__PHASER_GAME__, b = g.scene.getScene('BattleScene'); return { active: g.scene.isActive('BattleScene'), phase: b && b.phase, over: g.scene.isActive('GameOverScene') }; });
    if (!s.active) { await sleep(900); return { rounds, over: s.over }; }
    const tap = async sel => { const loc = page.locator(sel).first(); const box = await loc.boundingBox().catch(() => null); if (box && box.width > 3) { await loc.tap({ timeout: 3000 }).catch(() => {}); return true; } return false; };
    if (s.phase === 'playerMenu') { await tap('[data-act="battleMenu"][data-i="0"]'); await sleep(450); }
    else { const idx = await page.evaluate(() => { const e = document.querySelector('[data-act="quizAns"]'); if (!e || e.offsetParent === null) return -2; const b = window.__PHASER_GAME__.scene.getScene('BattleScene'); return ((b.quizQuestion && b.quizQuestion.answers) || []).findIndex(x => !!x.isCorrect); });
      if (idx >= 0) { rounds++; await tap(`[data-act="quizAns"][data-i="${idx}"]`); await sleep(700); }
      else { if (!(await tap('[data-act="battleAdvance"]'))) await page.mouse.click(195, 600).catch(() => {}); await sleep(400); } }
  }
  return { rounds, timeout: true };
}

(async () => {
  const [id, floorsArg, profKey = 'g1', trialsArg = '20', seedArg = '1'] = process.argv.slice(2);
  const prof = PROFILES[profKey]; if (!prof) throw new Error('profile g1|g3|g6');
  const floors = floorsArg.split(',').map(Number), TRIALS = +trialsArg, wall0 = Date.now();
  fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
  const o = await L.launch(); const page = o.page;
  for (const f of floors) {
    const P = plan(id, f), route = P.route.slice(), mech = P.mechanic.id;
    // she starts on the 3rd route cell (off the mouth / stairs) and ends 2 cells short of the stairs (never takes them)
    let startI = 2, endI = route.length - 3;   // 3 short: her sprite centre (31 px above her soles) must never touch an up-stair
    if (SEGMENT.has(mech)) { const z = segWindow(P, route); if (z) { startI = Math.max(startI, z[0] - 5); endI = Math.min(endI, z[1] + 4); } }
    const cells = route.slice(startI, endI + 1);
    const outF = path.join(OUT, `${id}-f${f}-${profKey}.json`);
    const rec = { segment: SEGMENT.has(mech), dungeon: id, floor: f, mechanic: mech, profile: { key: profKey, ...prof }, fairP95: FAIR_P95, stopMarginPx: MARGIN, url: L.URL_, started: new Date().toISOString(), route: cells, trials: [], notes: [] };
    const save = () => fs.writeFileSync(outF, JSON.stringify(rec, null, 1));
    const ok = await enterFloor(page, id, f, cells[0], prof.grade);
    if (!ok) { rec.notes.push('could not enter the floor through a seeded save'); rec.entryFailed = true; save(); console.log(`[${id} f${f}] entry failed`); await L.shot(page, `${id}-f${f}-entryfail`); continue; }
    await inject(page);
    const has = await page.evaluate(m => window.__KIDA.has(m), mech);
    if (!has) { rec.notes.push('no adapter for ' + mech); save(); continue; }
    const setup = async () => { await inject(page); return page.evaluate(([m, p, seed, cells, margin]) => { const K = window.__KID; K.setProfile(p, seed); const ad = window.__KIDA.make(m); K.setAdapter(ad); if (ad.setRoute) ad.setRoute(cells); window.__KG = { ad, gate: K.makeGate(ad, cells, margin), cells, margin }; return { input: K.inputPath(), cue: ad.cue, commit: ad.commit }; }, [mech, prof, +seedArg * 1000 + f, cells, MARGIN]); };
    const info = await setup(); rec.cue = info.cue; rec.commit = info.commit;
    await page.evaluate(() => window.__KID.stick(0, 0)); rec.inputPath = await page.evaluate(() => window.__KID.inputPath());
    await L.shot(page, `_tmp`).catch(() => {});
    const shotsTaken = {};
    for (let t = 0; t < TRIALS; t++) {
      if (Date.now() - wall0 > BUDGET) { rec.notes.push(`wall budget hit after ${t} trials`); break; }
      // put her back on the route start (scaffolding), let the world run a random while (decorrelate from the beat)
      let s = await st(page);
      if (s.floor !== f || s.map !== id) { rec.notes.push(`trial ${t}: not on the floor (${s.map} f${s.floor}); re-entering`); if (!(await enterFloor(page, id, f, cells[0], prof.grade))) break; await setup(); }
      let placed = false;
      for (let k = 0; k < 3 && !placed; k++) {
        placed = await page.evaluate(c => { const x = window.__QOK_DNG2__.ctx(); const fd = window.__QOK_DNG2__.footDy(); x.place(c[0] * 48 + 24, c[1] * 48 + 24 - fd, 0);
          const so = window.__KID.soles(); return !!so && Math.hypot(so[0] - (c[0] * 48 + 24), so[1] - (c[1] * 48 + 24)) < 8; }, cells[0]).catch(() => false);
        if (!placed) await sleep(700); }
      if (!placed) { rec.notes.push(`trial ${t}: could not put her on the route start; skipped`); continue; }
      const pre = await page.evaluate(async ([p, sd]) => { const K = window.__KID; K.setProfile(p, sd); window.__KG.gate.margins.length = 0; window.__KG.gate.approaches.length = 0; await K.idle(300 + K.rnd() * 4000); return 1; }, [prof, (+seedArg * 1000 + f) * 100 + t]);
      await page.evaluate(() => { const p = window.__GAME_STATE__.player; p.state.hp = p.totalMaxHp || p.state.maxHp; });   // full HP each attempt (scaffolding)
      await L.noEncounters(page);
      s = await st(page); const hp0 = s.hp;
      const r = await page.evaluate(async () => {
        const K = window.__KID, G = window.__KG, ad = G.ad, f0 = ad.fails(), fsum = o => Object.values(o).reduce((a, b) => a + b, 0), base = fsum(f0), m0 = K.frameMark(), t0 = K.now();
        G.f0 = f0;
        // mild failures (a spike throw-back) do not end the attempt: she gets up, gives the now-visible spikes a wide berth and walks on
        const mild = ad.mild || [], sev = o => { let n = 0; for (const k in o) if (mild.indexOf(k) < 0) n += o[k]; return n; }, mil = o => { let n = 0; for (const k in o) if (mild.indexOf(k) >= 0) n += o[k]; return n; };
        let cells = G.cells, gate = G.gate, w = null, mildSeen = mil(f0), replans = 0; const events = []; const sevBase = sev(f0);
        for (;;) {
          const pts = cells.map(c => [c[0] * 48 + 24, c[1] * 48 + 24]);
          w = await K.walk(pts, { xform: ad.xform, gate, abort: () => sev(ad.fails()) > sevBase || mil(ad.fails()) > mildSeen, maxMs: 60000 });
          if (w.why === 'abort' && sev(ad.fails()) === sevBase && replans < 6) {
            const la = gate.approaches[gate.approaches.length - 1]; events.push({ phase: w.phase, edgeState: la && la.edgeState, perceived: la && la.perceived, at: K.soles().map(Math.round), ms: Math.round(K.now() - t0) });
            mildSeen = mil(ad.fails()); replans++;
            await K.waitUntil(() => !(ad.busy && ad.busy()), 5000); await K.idle(K.K.prof.replan);
            const so = K.soles(), from = [Math.floor(so[0] / 48), Math.floor(so[1] / 48)], np = K.replan(from, G.cells[G.cells.length - 1], ad.avoid ? ad.avoid() : []);
            if (!np) { w.why = 'no-path-round-hazard'; break; }
            cells = np; const g2 = K.makeGate(ad, cells, G.margin); g2.margins = gate.margins; g2.approaches = gate.approaches; gate = g2; continue; }
          break;
        }
        w.replans = replans; w.events = events; w.mild = mild; w.mildPass = !!ad.mildPass;
        const f1 = ad.fails(), kinds = {}; for (const k in f1) if (f1[k] > (f0[k] || 0)) kinds[k] = f1[k] - (f0[k] || 0);
        return { walk: w, kinds, ms: K.now() - t0, frames: K.frameStats(m0), soles: K.soles(), margins: G.gate.margins.slice(), approaches: G.gate.approaches.map(a => ({ unit: a.unit, j: a.j, seenDist: a.seenDist, leadMs: (a.seenT !== null && a.edgeT !== null) ? Math.round(a.edgeT - a.seenT) : null, edgeState: a.edgeState, perceived: a.perceived })), trace: w.why !== 'arrived' ? K.trace(4000) : null };
      });
      const row = { t, ok: false, why: r.walk.why, phase: r.walk.phase, kinds: r.kinds, gameMs: Math.round(r.ms), waitedMs: Math.round(r.walk.waited || 0), stops: r.walk.stops || 0, backs: r.walk.backs || 0, acts: r.walk.acts || 0,
        rts: r.walk.rts, replans: r.walk.replans, events: r.walk.events, margins: r.margins, approaches: r.approaches, atIdx: r.walk.i, frames: r.frames, trace: r.trace, coarse: (r.frames.p95 || 0) > FAIR_P95 };
      if (r.walk.why !== 'arrived') {
        const tag = Object.keys(r.kinds)[0] || r.walk.why;
        if (!shotsTaken[tag]) { shotsTaken[tag] = 1; const fn = path.join(OUT, 'shots', `${id}-f${f}-${profKey}-t${t}-${tag.split(' ')[0]}.jpg`); await page.screenshot({ path: fn, type: 'jpeg', quality: 60 }).catch(() => {}); row.shot = fn; }
        // let the penalty play out: the fall / knock-back / box / battle; then measure where it left her
        const t1 = Date.now(); let s2;
        for (;;) { s2 = await st(page); if (s2.battle) { row.battle = await fight(page); continue; } if (s2.msg) { row.message = true; await dismiss(page); continue; }
          const busy = await page.evaluate(() => { const a = window.__KG && window.__KG.ad; try { return !!(a && a.busy && a.busy()); } catch (e) { return false; } }).catch(() => true);
          if (!busy && s2.field && Date.now() - t1 > 1200) break; if (Date.now() - t1 > 40000) { row.penaltyTimeout = true; break; } await sleep(250); }
        // a battle / box counts as soon as it has played out (the walk stops at the box that announces it)
        const k2 = await page.evaluate(() => { const G = window.__KG; try { const f1 = G.ad.fails(), out = {}; for (const k in f1) if (f1[k] > (G.f0[k] || 0)) out[k] = f1[k] - (G.f0[k] || 0); return out; } catch (e) { return null; } }).catch(() => null);
        if (k2 && Object.keys(k2).length) row.kinds = k2;
        s2 = await st(page);
        if (Object.keys(row.kinds).length) {
          row.penalty = { floor: s2.floor, map: s2.map, soles: s2.soles, dmgPct: +(100 * (hp0 - s2.hp) / (s2.maxHp || 1)).toFixed(1), droppedFloors: s2.map === id ? f - s2.floor : null };
          if (s2.soles && s2.floor === f) { // how far back along the route the penalty put her (cells), from the cell she failed on
            const near = cells.reduce((b, c, i) => { const d = Math.hypot(c[0] * 48 + 24 - s2.soles[0], c[1] * 48 + 24 - s2.soles[1]); return d < b[0] ? [d, i] : b; }, [1e9, -1]);
            row.penalty.routeIdx = near[1]; row.penalty.cellsBack = (r.walk.i != null && near[1] >= 0) ? r.walk.i - near[1] : null; }
        }
        if (s2.over) row.gameOver = true;
        if (s2.map === id && s2.floor !== f) { // dropped to the floor below: back up through the engine's own floor change (scaffolding)
          await page.evaluate(([f, c]) => window.__QOK_DNG2__.ctx().toFloor(f, { x: c[0], y: c[1], dir: 0 }), [f, cells[0]]).catch(() => {});
          await page.waitForFunction(f => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), d = window.__QOK_DNG2__; return (w.currentFloor || 1) === f && d.state().module && !w.__a1dEntryWaiting; }, f, { timeout: 30000 }).catch(() => {});
          await sleep(600); await dismiss(page); await setup(); }
        if (Object.keys(row.kinds).length) await page.evaluate(ms => window.__KID.idle(ms), prof.replan);
      }
      { const s3 = await st(page); row.dmgPctTotal = +(100 * (hp0 - s3.hp) / (s3.maxHp || 1)).toFixed(1); }
      const mildK = r.walk.mild || []; row.mildHits = Object.entries(row.kinds).filter(([k]) => mildK.indexOf(k) >= 0).reduce((a, [, v]) => a + v, 0);
      row.completed = r.walk.why === 'arrived' && !Object.keys(row.kinds).some(k => mildK.indexOf(k) < 0);   // reached the end with no attempt-ending failure
      row.ok = row.completed && (r.walk.mildPass || !Object.keys(row.kinds).length);
      if (RELOAD.has(mech) && (!row.ok || RELOAD_ALWAYS.has(mech))) { row.reloaded = await reloadModule(page, id, f); await setup(); }
      rec.trials.push(row); save();
      console.log(`[${id} f${f} ${profKey}] t${t} ${row.ok ? 'PASS' : 'FAIL'} ${row.why} ${JSON.stringify(row.kinds)} game=${(row.gameMs / 1000).toFixed(1)}s wait=${(row.waitedMs / 1000).toFixed(1)}s stops=${row.stops} fr=${row.frames.mean}/${row.frames.p95}${row.coarse ? ' COARSE' : ''}${row.penalty ? ' pen=' + JSON.stringify(row.penalty) : ''}`);
    }
    rec.ended = new Date().toISOString(); rec.errors = o.errors.filter(e => !/favicon|audio|\.mp3|\.ogg/.test(e.m)).slice(0, 10); save();
  }
  await o.browser.close().catch(() => {});
})().catch(e => { console.error('CRASH', e && e.stack || e); process.exit(2); });
