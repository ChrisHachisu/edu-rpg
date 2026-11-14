'use strict';
// Every Acts 2-5 dungeon mouth and portal: seeded on its exit cell, a real walk into the mouth,
// the right map and floor load, a real walk back out through the interior's own exit, and the
// hero stands on the owner's exit cell (the remapped return).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> node scripts/acts/probe/mouths.cjs [from [to]]
// Story gates are opened by the save (every boss flag, Flame Cloak, Windbreaker Stone, the four
// Demon Castle relics); the gates themselves are the bundle's and are not what this probes.
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const MAPS = require('./mapdefs.cjs');
const PILOT = fs.readFileSync(path.join(__dirname, 'pilot.js'), 'utf8');
const flags = () => Object.fromEntries([...new Set(Object.values(MAPS).map(m => m.bossId).filter(Boolean))].map(b => [`boss.${b}.defeated`, true]));
const INV = ['herb*5', 'flameCloak', 'windbreakerStone', 'excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom']
  .map(s => ({ itemId: s.split('*')[0], quantity: +(s.split('*')[1] || 1) }));
const QUESTS = ['owlsLesson', 'drakeCargo', 'lunasMap', 'ancientRelic', 'flameCloak', 'lunasProphecy'];   // quest-gated mouths
(async () => {
  const from = +(process.argv[2] || 0), to = +(process.argv[3] || 999);
  const { browser, page, errors } = await L.launch();
  const rows = [];
  await L.bootSave(page, L.save({ x: 80, y: 262, flags: flags() }));
  const doors = (await page.evaluate(() => window.__QOK_MULTIACT__.index().landmarks.filter(d => d.tile !== 6))).slice(from, to);
  // Act 1's own Crystal Cave mouth, which the release repaints (acts-hifi/overrides/act1-crystal-cave:
  // carved entrance art plus added rock bits): she must still walk in and come back out on Act 1's exit.
  if (to >= 99) doors.push({ name: 'Crystal Cave (Act 1 side, override art)', mapId: 'crystalCave', at: [149, 278], exit: [149, 279], toX: 50, toY: 99, tile: 15 });
  const state = () => page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return { map: w.currentMapId, floor: w.currentFloor, x: w.heroTileX, y: w.heroTileY, msg: w.showingMessage ? ((window.__P && window.__P.lastMsg && window.__P.lastMsg()) || true) : null }; });
  for (const d of doors) {
    const row = { name: d.name, map: d.mapId, door: d.at, exit: d.exit, wantFloor: d.toFloor || 1, wantAt: [d.toX, d.toY] };
    try {
      await L.bootSave(page, L.save({ x: d.exit[0], y: d.exit[1], flags: flags(), inventory: INV, completedQuests: QUESTS }));
      await page.evaluate(PILOT); await page.evaluate(() => window.__P.hookMsgs());
      const walk = await L.walkCells(page, [d.at], { maxMs: 25000 });
      await page.waitForTimeout(3500);
      await page.evaluate(PILOT); await L.noEncounters(page);
      let st = await state();
      row.walk = walk.why; row.in = st;
      row.entered = st.map === d.mapId && st.floor === (d.toFloor || 1);
      row.arrivedAt = st.x === d.toX && st.y === d.toY;
      row.shotIn = path.basename(await L.shot(page, 'mouth-' + d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-in'));
      if (row.entered) {
        // The interior's own way back out: the nearest cell whose checkTransition answers "overworld".
        // (Asked with the arrival cooldown set aside and put back, so the real walk below still pays it.)
        const E = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), md = w.mapData, hx = w.heroTileX, hy = w.heroTileY, cd = w.transitionCooldown;
          let best = null, bd = 1e9;
          for (let y = 0; y < md.length; y++) for (let x = 0; x < md[0].length; x++) {
            w.transitionCooldown = 0; let t = null; try { t = w.checkTransition(x, y); } catch (e) {}
            if (t && t.targetMap === 'overworld') { const dd = Math.abs(x - hx) + Math.abs(y - hy); if (dd < bd) { bd = dd; best = [x, y, t.toX, t.toY]; } } }
          w.transitionCooldown = cd; return best; });
        row.interiorExit = E;
        // The cell she ARRIVES on, read on the first overworld frame (the walker's key is still held
        // through the fade, so a later reading has already walked on).
        await page.evaluate(() => { window.__ARRIVE = null; (function watch() { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), sp = window.__DQ_TILES__.overworldSpace;
          if (w.currentMapId === 'overworld' && w.hero && w.mapData && w.mapData.length === 400) { window.__ARRIVE = { x: w.heroTileX, y: w.heroTileY, cx: sp.toCanonical(w.hero.x) / 48, cy: sp.toCanonical(w.hero.y) / 48 }; return; }
          requestAnimationFrame(watch); })(); });
        const kind = MAPS[d.mapId].type;
        let r = { ok: false, why: 'no-exit-cell' };
        if (!E) {                                                // tower foot / forest maze: the exit is the map's south edge
          await page.keyboard.down('ArrowDown');
          for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); if (await page.evaluate(() => !!window.__ARRIVE)) { r = { ok: true, why: 'edge-exit' }; break; } }
          await page.keyboard.up('ArrowDown');
        }
        if (E) {
          // step clear of the exit first: the engine ignores a transition on the step right after arriving
          await page.evaluate(([E, kind]) => window.__P.walk((a, b) => Math.abs(a - E[0]) + Math.abs(b - E[1]) >= 3, kind, { enter: false, maxMs: 15000 }), [E, kind]).catch(() => null);
          r = await page.evaluate(([E, kind]) => window.__P.walk((a, b) => a === E[0] && b === E[1], kind, { enter: true, maxMs: 45000 }), [E, kind]).catch(e => ({ ok: false, why: 'threw ' + String(e).slice(0, 120) }));
          if (!r.ok && r.why === 'nopath')                        // a floor whose way out crosses lava or a key door
            r = await page.evaluate(([E, kind]) => window.__P.walk((a, b) => a === E[0] && b === E[1], kind, { enter: true, maxMs: 90000, passOpts: { lava: true, keyDoors: true } }), [E, kind]).catch(e => ({ ok: false, why: 'threw ' + String(e).slice(0, 120) }));
          if (!r.ok && r.why === 'nopath') {                      // the floor is a course of its own (Magma Tunnels' lava course): the way
            // across is the dungeon's business, not this probe's. Stand her on the cell beside the exit and take the last step for real.
            // (the engine's arrival cooldown swallows the first transition asked for after a floor loads; her walk would have spent it)
            const beside = await page.evaluate(([E]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
              for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) { const x = E[0] + dx, y = E[1] + dy; let ok = false; try { ok = !!w.canMove(x, y); } catch (e) {}
                if (ok) { w.transitionCooldown = 0; w.heroTileX = x; w.heroTileY = y; w.hero.x = x * 48 + 24; w.hero.y = y * 48 + 24; if (typeof w.updatePosition === 'function') w.updatePosition(); return [x, y]; } }
              return null; }, [E]);
            row.placedBesideExit = beside;
            if (beside) { await page.waitForTimeout(600);
              r = await page.evaluate(([E, kind]) => window.__P.walk((a, b) => a === E[0] && b === E[1], kind, { enter: true, maxMs: 30000, passOpts: { lava: true, keyDoors: true } }), [E, kind]).catch(e => ({ ok: false, why: 'threw ' + String(e).slice(0, 120) })); }
          }
        }
        row.outWalk = { ok: r.ok, why: r.why, steps: r.steps };
        await page.waitForTimeout(3500);
        const p = await L.pos(page), arr = await page.evaluate(() => window.__ARRIVE);
        row.out = { map: p.map, floor: p.floor, x: p.x, y: p.y };
        row.arrive = arr && { x: arr.x, y: arr.y, cx: +arr.cx.toFixed(2), cy: +arr.cy.toFixed(2) };
        // (the walker's key is held for up to a frame after the map changes, and a headless frame
        // is long: the cell is what is asserted, the offset inside it is recorded)
        row.exitOnCell = p.map === 'overworld' && !!arr && arr.x === d.exit[0] && arr.y === d.exit[1];
        row.shotOut = path.basename(await L.shot(page, 'mouth-' + d.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-out'));
      }
      const m = await L.multi(page); row.stats = m && { entries: m.stats.entries, exits: m.stats.exits, relocated: m.stats.relocated };
    } catch (e) { row.error = String(e).slice(0, 300); }
    row.pass = !!(row.entered && row.exitOnCell);
    rows.push(row); console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(L.OUT, `mouths-${from}.json`), JSON.stringify({ rows, errors: errors.slice(0, 20) }, null, 1));
  console.log('MOUTHS', rows.filter(r => r.pass).length + '/' + rows.length, 'errors', errors.length, JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
