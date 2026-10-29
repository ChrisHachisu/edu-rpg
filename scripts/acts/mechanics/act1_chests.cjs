#!/usr/bin/env node
/* Diagnose Act 1 chests that the bump test could not open: for each authored chest, try every
 * open side through the real mover, record where the hero ends up, and screenshot failures.
 *   node scripts/acts/mechanics/act1_chests.cjs <outdir> key[,key...]   (key = mistyGrotto-f3 etc.) */
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const KEYS = process.argv[3].split(',');
const FLOORS = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/act1-dungeon-floors.json'), 'utf8')).floors;
(async () => {
  const T = await L.launch(); const out = {};
  for (const key of KEYS) {
    const [id, fs_] = key.split('-f'); const f = +fs_;
    const page = await L.fresh(T); await L.enter(page, id, f);
    const fl = FLOORS[key]; out[key] = [];
    for (const c of fl.assets.filter(a => a.kind === 'chest')) {
      const flag = `chest.${id}.f${f}.${c.x}.${c.y}`;
      const rows = []; for (let dy = -2; dy <= 2; dy++) rows.push(fl.rows[c.y + dy]?.slice(Math.max(0, c.x - 3), c.x + 4));
      const tries = [];
      for (const [dir, sx, sy] of [['up', c.x, c.y + 1], ['down', c.x, c.y - 1], ['left', c.x + 1, c.y], ['right', c.x - 1, c.y], ['up', c.x, c.y + 2]]) {
        const free = await L.scene(page, `const r=w.mapData[a[1]]; return !!r && r[a[0]]===0;`, [sx, sy]);
        if (!free) continue;
        await L.teleport(page, sx, sy); await page.waitForTimeout(150);
        await L.hold(page, dir, 1500); await page.waitForTimeout(300);
        const r = await L.scene(page, `return {ok:!!gs.player.state.storyFlags[a], tile:[w.heroTileX,w.heroTileY], px:[Math.round(w.hero.x),Math.round(w.hero.y)], msgs:w.__msgs.slice(-1)}`, flag);
        await L.clearMsg(page);
        tries.push({ dir, from: [sx, sy], ...r });
        if (r.ok) break;
        await page.screenshot({ path: path.join(OUT, `${key}-chest-${c.x}-${c.y}-${dir}.jpg`), type: 'jpeg', quality: 65 });
      }
      const opened = tries.some(t => t.ok);
      out[key].push({ chest: [c.x, c.y], opened, rows, tries });
      console.log(key, `chest (${c.x},${c.y})`, opened ? 'OPENED' : 'NOT OPENED', JSON.stringify(tries.map(t => [t.dir, t.from, t.tile, t.ok])), rows.join('|'));
    }
  }
  fs.writeFileSync(path.join(OUT, 'act1-chests.json'), JSON.stringify(out, null, 1));
  await T.browser.close();
})();
