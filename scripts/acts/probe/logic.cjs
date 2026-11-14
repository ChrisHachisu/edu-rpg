'use strict';
// Rules of the Acts 2-5 runtime that are not a walk: the sole numbers the world gate models, the
// compass, encounter zones, suppressed frozen doors, save migration and repair, the battle drop,
// the kill switch.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> node scripts/acts/probe/logic.cjs
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
(async () => {
  const { browser, page, errors, requests } = await L.launch();
  const rows = [];
  const rec = (id, pass, detail) => { const r = { id, pass: !!pass, errorsSoFar: errors.length, detail }; rows.push(r); console.log(JSON.stringify(r).slice(0, 900)); };
  await L.bootSave(page, L.save({ x: 80, y: 262, flags: L.allFlags() }));
  const idx = await page.evaluate(() => window.__QOK_MULTIACT__.index());
  const doors = idx.landmarks;

  // 1. the hero model scripts/acts/world_lib.py uses is the live one
  let spec = null;                                             // (the movement state exists once she has moved)
  for (let i = 0; i < 6 && !(spec && spec.footDy); i++) { await L.stick(page, i % 2 ? -1 : 1, 0, 500); spec = await page.evaluate(() => window.__DQ_TILES__.soleSpec()); }
  const close = (a, b) => Math.abs(a - b) < 0.01;
  rec('sole-spec', spec && spec.sole && close(spec.sole.dy, idx.sole.dy) && close(spec.sole.r, idx.sole.r) && close(spec.sole.closeR, idx.sole.closeR) && close(spec.footDy * 32 / 48, idx.sole.footDy),
    { live: spec, index: idx.sole });

  // 2. compass: at every story stage the target is in Act 1 or on an owner door
  const stages = await page.evaluate(bosses => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), st = window.__GAME_STATE__.player.state, keep = st.storyFlags, out = [];
    for (let k = 0; k <= bosses.length; k++) { st.storyFlags = { 'intro.done': true, 'acts.geo2': true }; for (let i = 0; i < k; i++) st.storyFlags['boss.' + bosses[i] + '.defeated'] = true;
      let t = null; try { t = w.getCompassTarget(); } catch (e) { t = { err: String(e) }; }
      out.push(t ? { k, ox: t.ox, oy: t.oy, id: t.id || t.targetMap || t.mapId || null, door: t.ox !== undefined ? !!window.__QOK_MULTIACT__.entryFor(t.ox, t.oy) : null, act: t.ox !== undefined ? window.__QOK_MULTIACT__.cellAct(t.ox, t.oy) : null } : { k, none: true }); }
    st.storyFlags = keep; return out; }, L.BOSSES);
  rec('compass', stages.every(s => s.none || s.act === 1 || s.door), stages);

  // 3. encounter zones follow the act that owns the ground; Act 1 is untouched
  const ZONE = { 2: 'iron-mountains', 3: 'scorched-wastes', 4: 'scorched-wastes', 5: 'demons-threshold' };
  const zones = await page.evaluate(ds => { const gs = window.__GAME_STATE__; return { doors: ds.map(d => [d.name, d.exit, gs.getOverworldZone(d.exit[0], d.exit[1])]), act1: [gs.getOverworldZone(60, 340), gs.getOverworldZone(100, 300), gs.getOverworldZone(133, 348)] }; }, doors);
  const own = await page.evaluate(ds => { const M = window.__QOK_MULTIACT__.index(); const rows = M.owner.rows; const at = (x, y) => { let c = 0; for (const run of rows[y].split(',')) { const [v, n] = run.split(':').map(Number); if (x < c + n) return v; c += n; } return 0; }; return ds.map(d => at(d.exit[0], d.exit[1])); }, doors);
  rec('zones', zones.doors.every((z, i) => z[2] === ZONE[own[i]]) && zones.act1.join() === 'greenhollow-plains,whispering-woods,crystal-coast', { act1: zones.act1, bad: zones.doors.filter((z, i) => z[2] !== ZONE[own[i]]) });

  // 4. the bundle's frozen doors for remapped maps answer nothing (old cells, bandit hideout included)
  const frozen = await page.evaluate(ds => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); const out = [];
    for (const d of ds) { if (!d.oldFrom) continue; w.transitionCooldown = 0; let t = null; try { t = w.checkTransition(d.oldFrom[0], d.oldFrom[1]); } catch (e) {}
      const here = window.__QOK_MULTIACT__.entryFor(d.oldFrom[0], d.oldFrom[1]);
      if (t && !here) out.push([d.name, d.oldFrom, t.targetMap]); }
    w.transitionCooldown = 0; return out; }, doors);
  rec('frozen-doors-off', frozen.length === 0, frozen);

  // 5. save migration (no acts.geo2 flag): old-geography positions go to the new exit of the old door they were nearest
  const D = n => doors.find(d => d.name === n);
  for (const [label, at, want] of [['old Ironkeep doorstep', [200, 322], 'Ironkeep'], ['old Ruins Camp', [270, 122], 'Ruins Camp'], ['old Demon Castle', [86, 34], 'Demon Castle'],
    ["old Ember's Rest", [195, 82], "Ember's Rest"], ['old Frostwatch', [222, 264], 'Frostwatch']]) {
    await L.bootSave(page, L.save({ x: at[0], y: at[1], flags: { ...L.allFlags(), 'acts.geo2': undefined } }));
    await page.waitForTimeout(1500);
    const p = await L.pos(page), m = await L.multi(page), flag = await page.evaluate(() => !!window.__GAME_STATE__.player.state.storyFlags['acts.geo2']);
    rec('migrate: ' + label, p.x === D(want).exit[0] && p.y === D(want).exit[1] && flag && m.stats.relocatedHow === 'migration', { at: [p.x, p.y], want: D(want).exit, how: m.stats.relocatedHow, flag });
  }
  await L.bootSave(page, L.save({ x: 80, y: 262, flags: { ...L.allFlags(), 'acts.geo2': undefined } }));
  await page.waitForTimeout(1200);
  { const p = await L.pos(page), m = await L.multi(page), flag = await page.evaluate(() => !!window.__GAME_STATE__.player.state.storyFlags['acts.geo2']);
    rec('migrate: Act 1 save is left alone', p.x === 80 && p.y === 262 && flag && m.stats.relocated === 0, { at: [p.x, p.y], flag, relocated: m.stats.relocated }); }
  // 6. repair (flag set): a position in a range goes to the nearest exit of its own act; a reachable one stays
  const bad = await page.evaluate(() => { const A = window.__QOK_MULTIACT__; for (let y = 300; y < 340; y++) for (let x = 180; x < 300; x++) if (A.cellAct(x, y) === 2 && !A.reach(x, y)) return [x, y]; return null; });
  await L.bootSave(page, L.save({ x: bad[0], y: bad[1], flags: L.allFlags() }));
  await page.waitForTimeout(1500);
  { const p = await L.pos(page), m = await L.multi(page); const onExit = doors.some(d => d.act === 2 && d.exit[0] === p.x && d.exit[1] === p.y);
    rec('repair: unreachable cell', onExit && m.stats.relocatedHow === 'repair', { from: bad, at: [p.x, p.y], how: m.stats.relocatedHow }); }

  // 7. battle: nothing of any act stays on the GPU
  const ik = D('Ironkeep');
  await L.bootSave(page, L.save({ x: ik.exit[0], y: ik.exit[1] + 1, flags: L.allFlags() }));
  const before = await L.multi(page);
  // her next real step meets a monster of the zone she stands in (the engine's own startBattle path)
  await page.evaluate(() => { const em = window.__GAME_STATE__.encounterManager; em.onStep = function (zone) { delete this.onStep; return this.forceEncounter(zone); }; });
  let inBattle = false;
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];              // a step is a tile change: keep one heading for a while
  for (let i = 0; i < 40 && !inBattle; i++) { const d = DIRS[(i >> 3) % 4]; await L.stick(page, d[0], d[1], 800); inBattle = await page.evaluate(() => window.__PHASER_GAME__.scene.isActive('BattleScene')); }
  await page.waitForTimeout(1500);
  const during = await L.multi(page);
  rec('battle-drop', inBattle ? (during.objects === 0 && during.textures === 0 && before.objects > 0) : false, { inBattle, before: { objects: before.objects, act1: before.act1 }, during: { objects: during.objects, textures: during.textures, act1: during.act1 } });
  await L.shot(page, 'logic-battle');

  // 8. kill switch: the runtime is not there, nothing of it is fetched, the bundle's own door answers
  const n0 = requests.length;
  await L.bootSave(page, L.save({ x: 200, y: 322, flags: L.allFlags() }), { url: L.URL_ + '?multiact=0', extra: { 'qok-multiact-hifi': '0' } });
  const off = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.transitionCooldown = 0; let t = null; try { t = w.checkTransition(200, 320); } catch (e) {}
    return { multi: typeof window.__QOK_MULTIACT__, hooks: typeof window.__QOK_ACTS__, towns: typeof window.__QOK_ACTS_TOWN_IDS__, door: t && t.targetMap, at: [w.heroTileX, w.heroTileY] }; });
  const fetched = requests.slice(n0).filter(u => /acts-hifi\/(manifest|minimap|towns)|act[2-5]-hifi\//.test(u));
  rec('kill-switch', off.multi === 'undefined' && off.hooks === 'undefined' && off.door === 'ironkeep' && fetched.length === 0, { off, fetched: fetched.slice(0, 3) });
  await L.shot(page, 'logic-kill-switch');

  fs.writeFileSync(path.join(L.OUT, 'logic.json'), JSON.stringify({ rows, errors: errors.slice(0, 20) }, null, 1));
  console.log('LOGIC', rows.filter(r => r.pass).length + '/' + rows.length, 'errors', errors.length, JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
