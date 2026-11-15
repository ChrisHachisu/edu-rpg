'use strict';
// Haunted Forest, nine rooms, played like a player: in by the south mouth, room to room through
// the gaps (the camera slides and stays inside the room she is in, the forest outside is dark),
// Save -> Continue in the Crossroads, the Phantom Stag, out by its exit; then a second visit by
// the north door (it lands her inside the north mouth and leads back out to the Ravenhollow side).
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5202/ PROBE_OUT=<dir> \
//     flock /home/user/work/e2/heavy.lock.$((RANDOM%2)) node scripts/acts/probe/mech/forest-rooms.cjs
const fs = require('fs'), path = require('path');
const { Run, L, manifest, ROOT } = require('./_a-lib.cjs');
const PLANS = process.env.D2_PLANS || '/home/user/work/plans/out';
const ID = 'hauntedForest', P = JSON.parse(fs.readFileSync(path.join(PLANS, `${ID}-f1.json`), 'utf8'));
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));

(async () => {
  const boss = P.assets.find(a => a.kind === 'boss'), LM2 = acts.landmarks.find(l => l.mapId === ID && l.toFloor), [rw, rh] = P.mechanic.params.roomTiles;
  const R = new Run(ID, { bossId: boss.id, name: 'forest-rooms' });
  try {
    if (!(await R.start())) throw new Error('could not enter');
    const page = R.page;
    // where the camera looks, against the room she is in
    const view = () => R.ev(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), v = w.cameras.main.worldView, st = window.__A.mstate(), r = st.room, T = 48;
      const X = r[0] * st.rw * T, Y = r[1] * st.rh * T, Wd = st.rw * T, Hd = st.rh * T;
      return { room: r, rooms: st.rooms, slide: !!st.slide, v: [Math.round(v.x), Math.round(v.y), Math.round(v.width), Math.round(v.height)], rect: [X, Y, Wd, Hd],
        inside: (v.width >= Wd || (v.x >= X - 2 && v.x + v.width <= X + Wd + 2)) && (v.height >= Hd || (v.y >= Y - 2 && v.y + v.height <= Y + Hd + 2)), zoom: w.cameras.main.zoom, floor: w.currentFloor || 1,
        legacy: { fog: !!w.fogEnabled, hunter: !!w.mazeHunterEnabled, exitY: w.forestMazeCorrectExitY }, stairs: w.mapData.reduce((n, r2) => n + r2.filter(t => t === 9 || t === 12).length, 0) }; });
    let s = await R.st(), v = await view();
    R.rec('one floor of 60x45 with the forest-rooms module; no stairs, no fog, the bundle\'s five-floor maze is off', s.map === ID && s.floor === 1 && s.w === P.width && s.h === P.height && s.d2.mechanic === 'forest-rooms' && s.d2.module && v.stairs === 0 && !v.legacy.fog && !v.legacy.hunter, { s: [s.x, s.y], v });
    R.rec('she starts in the room of the south mouth and the camera is held inside it', v.room.join() === [Math.floor(s.sx / 48 / rw), Math.floor(s.sy / 48 / rh)].join() && v.inside, v);
    await R.shot('arrive-south-room');
    // room by room to a cell of the wanted room; a screenshot in the middle of the first slide
    let shotSlide = false;
    const toRoom = async (cell, tag) => { const before = await view();
      const pr = R.go({ cell, grow: 0 });
      if (!shotSlide) { const sl = await page.waitForFunction(() => { const st = window.__A.mstate(); return st && st.slide && st.slide.t > 150; }, { timeout: 60000 }).then(() => true).catch(() => false); if (sl) { shotSlide = true; await R.shot('sliding-to-the-next-room'); } }
      const g = await pr; await page.waitForTimeout(700); const after = await view();
      R.rec(`${tag}: ${after.rooms - before.rooms} room change(s) on the way, each a slide; the camera rests inside room ${after.room}`, g.ok && after.inside && !after.slide && after.rooms > before.rooms && after.room.join() === [Math.floor(cell[0] / rw), Math.floor(cell[1] / rh)].join(), { g, after });
      await R.shot(tag.replace(/\W+/g, '-')); return g.ok; };
    const mid = (rx, ry) => { for (let d = 0; d < 6; d++) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) { const c = [rx * rw + (rw >> 1) + dx, ry * rh + (rh >> 1) + dy]; if (P.rows[c[1]][c[0]] === '.' && !P.assets.some(a => a.x === c[0] && a.y === c[1])) return c; } return null; };
    if (!(await toRoom(mid(1, 1), 'to the Crossroads'))) throw new Error('route');
    const before = await R.st(), rc = await R.saveContinue(), after = await R.st(), v2 = await view();
    R.rec('Save -> Continue in the Crossroads: same cell, same room lit, camera inside it', rc.ok && Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1 && v2.room.join() === '1,1' && v2.inside, { at: [after.x, after.y], v2 });
    await R.shot('crossroads-resumed');
    const g = await R.go({ beside: [boss.x, boss.y], reach: 60 }); await page.waitForTimeout(700); const v3 = await view();
    R.rec('on to the Stag clearing through the gaps', g.ok && v3.room.join() === [Math.floor(boss.x / rw), Math.floor(boss.y / rh)].join() && v3.inside, { g, v3 });
    if (await R.boss(boss, 1)) await R.exitByBossCell(boss);
    // the north door
    const m2 = P.assets.find(a => a.kind === 'mouth' && a.side === 'north'), land = manifest().floors[`${ID}-f1`].land.mouth2;
    const r2 = await R.restart(LM2), s2 = r2.s, v4 = r2.s.map === ID ? await view() : null;
    R.rec('second visit by the north door: she lands inside the north mouth, in its own room', r2.ok && s2.map === ID && s2.floor === 1 && land && Math.abs(s2.x - land.x) <= 1 && Math.abs(s2.y - land.y) <= 2 && v4.inside && v4.room.join() === [Math.floor(m2.x / rw), 0].join(), { at: [s2.x, s2.y], land, v4, walk: r2.walk });
    await R.shot('north-door-arrival');
    if (s2.map === ID) { await R.go({ centre: [m2.x, m2.y] }, { hold: 1200 }); await page.waitForTimeout(2500); const p = await L.pos(page);
      R.rec('the north mouth leads back out to the Ravenhollow side', p.map === 'overworld' && p.x === LM2.exit[0] && p.y === LM2.exit[1], p); await R.shot('exit-north'); }
  } catch (e) { R.rec('probe crashed', false, String(e && e.stack || e).slice(0, 600)); await R.shot('crash').catch(() => {}); }
  process.exit((await R.finish()) ? 1 : 0);
})();
