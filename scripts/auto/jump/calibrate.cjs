'use strict';
// Testers' Jump menu, part 0: landing cells for the dungeons the ENGINE still draws procedurally.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5505/ node scripts/auto/jump/calibrate.cjs
// Crystal Cave stays on the bundle's own generated maps (public/dq-tiles.js A1D_MAPS leaves it out, and it is never
// modified), so its authored floors in act1-dungeon-floors.json are not what the player walks. This reads the
// engine's map of every floor (a save on the floor, Continue, scene.mapData) and writes
// scripts/auto/jump/engine-cells.json: per floor the cell a player lands on coming down the stairs (two steps from
// the up-stairs tile) and, on the boss floor, a cell three steps from the boss tile. build.cjs uses it.
const fs = require('fs'), path = require('path'), os = require('os');
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(os.tmpdir(), 'qok-jump-cal');
const L = require('../../acts/probe/lib.cjs');
const PROCEDURAL = { crystalCave: 5 };      // map id -> the bundle's declared floors (Xt[id].floors)
const OUT = path.join(__dirname, 'engine-cells.json');
(async () => {
  const o = await L.launch(); const page = o.page, out = { note: 'Written by scripts/auto/jump/calibrate.cjs from the running game; do not edit by hand.', generated: new Date().toISOString(), dungeons: {} };
  try {
    for (const [id, n] of Object.entries(PROCEDURAL)) {
      const D = out.dungeons[id] = { floors: {} };
      for (let fl = 1; fl <= n; fl++) {
        const s = L.save({ mapId: id, x: 50, y: 50, floor: fl });
        await L.bootSave(page, s, { settle: 2500 });
        const r = await page.evaluate(() => {
          const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), md = w.mapData, H = md.length, W = md[0].length;
          const find = v => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (md[y][x] === v) return [x, y]; return null; };
          const open = (x, y) => y >= 0 && x >= 0 && y < H && x < W && md[y][x] === 0;
          // BFS over plain floor from a tile; the first cell `want` steps away with the most open sides
          const near = (t, want) => { if (!t) return null; const seen = new Set([t + '']), q = [[t[0], t[1], 0]], c = [];
            for (let h = 0; h < q.length; h++) { const [x, y, d] = q[h]; if (d === want) { c.push([x, y]); continue; } if (d > want) break;
              for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const a = x + dx, b = y + dy, k = a + ',' + b; if (seen.has(k) || !open(a, b)) continue; seen.add(k); q.push([a, b, d + 1]); } }
            const sides = ([x, y]) => [[0, 1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => open(x + dx, y + dy)).length;
            c.sort((a, b) => sides(b) - sides(a)); return c[0] || null; };
          const up = find(6), boss = find(7);
          return { floor: w.currentFloor, size: [W, H], up, down: find(9), boss, land: near(up, 2), bossDoor: near(boss, 3) };
        });
        if (r.floor !== fl || !r.land) throw new Error(`${id} floor ${fl}: ${JSON.stringify(r)}`);
        D.floors[fl] = { land: r.land, up: r.up, size: r.size }; if (r.bossDoor) { D.floors[fl].boss = r.bossDoor; D.bossFloor = fl; }
        console.log(id, fl, JSON.stringify(D.floors[fl]));
      }
    }
  } finally { await o.browser.close().catch(() => {}); }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n'); console.log('wrote', OUT);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
