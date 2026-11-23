'use strict';
// Reachability census of dungeon floors (Act 1 generated floors and every authored Acts 2-5 floor).
// For each floor: a v4 save seeded at the floor's own arrival cell (floor 1: inside the mouth;
// deeper floors: the landing beside the stairs back), Continue from the title (the real resume
// path, AGENTS.md rule 7: never loadMap), then a flood over the game's OWN walkable test
// (__XP__.free = dq-tiles a1mFree, see xlib.cjs) from where the hero stands. Every stairs / mouth /
// way-out / boss-warp cell must be enterable, every chest / boss / crystal / plaque must answer the
// interact prompt (a1mNearbyInteract) or a bump; mechanic objects get their nearest distance.
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5500/ \
//     node scripts/auto/explore/census_dungeons.cjs emberMines:1 emberMines:2 mistyGrotto:1 ...
//   (no args: prints every spec, one per line, for chaining)
// Writes /home/user/work/explore/census-dungeons.jsonl (one row per floor) + shots/census/<floor>.jpg
const fs = require('fs'), path = require('path');
const X = require('./xlib.cjs'), L = X.L;
const man = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const a1 = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/act1-dungeon-floors.json'), 'utf8')).floors;
const NAV = process.env.D2_NAV || '/home/user/work/explore/e1/nav';
const A1BOSS = { mistyGrotto: 'giantToad', crystalCave: 'serpent', coastalReef: null, sunkenCellar: null, whisperingWoodsCave: null };
const RELICS = ['excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom'];

function specs() {
  const out = [];
  for (const k of Object.keys(a1)) out.push(k.replace(/-f(\d+)$/, ':$1'));
  for (const [id, d] of Object.entries(man.dungeons)) for (const f of d.authoredFloors) out.push(`${id}:${f}`);
  return out;
}
function seedFor(id, f) {
  const key = `${id}-f${f}`;
  if (man.floors[key]) {
    const FL = man.floors[key], ld = FL.land || {};
    const s = f === 1 ? (ld.mouth || ld.entrance || ld.fromPrev) : (ld.fromPrev || ld.mouth2 || ld.mouth);
    return { key, x: s.x, y: s.y, authored: true, FL, boss: man.dungeons[id].bossId };
  }
  const FL = a1[key]; if (!FL) throw new Error('no floor ' + key);
  const from = FL.assets.find(a => a.kind === (f === 1 ? 'mouth' : 'stairsUp'));
  const ok = (x, y) => FL.rows[y] && FL.rows[y][x] === '.';
  let c = null;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [2, 0], [-2, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (ok(from.x + dx, from.y + dy)) { c = [from.x + dx, from.y + dy]; break; }
  return { key, x: c[0], y: c[1], authored: false, FL, boss: A1BOSS[id] };
}
function navReach(key, tg) {      // the exporter's own reach (incl. declared mechanic links), 12 px grid, sole points
  let N; try { N = JSON.parse(fs.readFileSync(path.join(NAV, key + '.json'), 'utf8')); } catch (e) { return null; }
  const c = N.cell, T = 48, g = 14; let best = 1e9;
  for (let r = Math.max(0, Math.floor((tg.y * T - 60) / c)); r < Math.min(N.rows.length, Math.ceil(((tg.y + 1) * T + 60) / c)); r++)
    for (let q = Math.max(0, Math.floor((tg.x * T - 60) / c)); q < Math.min(N.rows[r].length, Math.ceil(((tg.x + 1) * T + 60) / c)); q++) {
      if (N.rows[r][q] !== '1') continue; const x = q * c + c / 2, y = r * c + c / 2;
      const ex = Math.max(tg.x * T - x, 0, x - (tg.x + 1) * T), ey = Math.max(tg.y * T - y, 0, y - (tg.y + 1) * T); best = Math.min(best, Math.hypot(ex, ey)); }
  return Math.round(best);
}

(async () => {
  const args = process.argv.slice(2);
  if (!args.length) { console.log(specs().join('\n')); return; }
  const S = await X.launchX(), page = S.page;
  for (const spec of args) {
    const [id, fs_] = spec.split(':'), f = +fs_, row = { spec, t0: new Date().toISOString() };
    try {
      const sd = seedFor(id, f); row.seed = [sd.x, sd.y]; row.authored = sd.authored;
      const flags = L.allFlags(); if (sd.boss) delete flags[`boss.${sd.boss}.defeated`];
      flags['boss.sandGolem.defeated'] = true;
      const inv = [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 }, ...RELICS.map(r => ({ itemId: r, quantity: 1 }))];
      S.errors.length = 0;
      await X.boot(page, L.save({ mapId: id, x: sd.x, y: sd.y, floor: f, flags, inventory: inv }));
      const st = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), d = window.__QOK_DNG2__;
        return { map: w.currentMapId, floor: w.currentFloor || 1, tile: [w.heroTileX, w.heroTileY], hero: [w.hero.x, w.hero.y], d2: d && d.state(), xp: !!window.__XP__ }; });
      if (!st.xp) throw new Error('instrument missing');
      // the seed cell is not standable (Crystal Cave: the bundle generates its own floors, so the
      // authored-floor table does not describe them): read this floor's own stairs-back / mouth
      // tile (6) and reseed on the first free cell centre around it
      const free0 = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return window.__XP__.free(w.hero.x, w.hero.y); });
      if (!free0) {
        const c = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), md = w.mapData, X = window.__XP__;
          for (let y = 0; y < md.length; y++) for (let x = 0; x < md[0].length; x++) if (md[y][x] === 6)
            for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [2, 0], [-2, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const cx = x + dx, cy = y + dy;
              if (md[cy] && md[cy][cx] !== 6 && X.free(cx * 48 + 24, cy * 48 + 24)) return [cx, cy]; }
          return null; });
        row.reseeded = c;
        if (c) { await X.boot(page, L.save({ mapId: id, x: c[0], y: c[1], floor: f, flags, inventory: inv })); }
      }
      row.state = st;
      if (st.map !== id || st.floor !== f) throw new Error(`resumed on ${st.map} f${st.floor}`);
      const extra = sd.authored && sd.FL.mech ? sd.FL.mech.map(m => ({ x: m.x, y: m.y, t: 'mech:' + m.kind })) : [];
      const r = await page.evaluate(X.FLOOD, { step: 4, nearEvery: 2, extraTargets: extra });
      row.nodes = r.nodes; row.startFree = r.startFree; row.startTile = r.startTile; row.nearErr = r.nearErr;
      const sealed = new Set(sd.authored ? sd.FL.assets.filter(a => a.sealedUntil).map(a => a.x + ',' + a.y) : []);
      row.targets = r.targets.map(t => ({ ...t, nav: sd.authored ? navReach(sd.key, t) : null, sealed: sealed.has(t.x + ',' + t.y) || undefined }));
      const isTr = t => [6, 9, 10, 11, 12].includes(t.t), isPr = t => [4, 7, 14, 18].includes(t.t);
      row.unreached = row.targets.filter(t => (isTr(t) && !t.entered) || (isPr(t) && !t.prompt && !t.bump) || (typeof t.t === 'string' && t.dist > 48));
      row.prompts = r.prompts.length; row.verbs = [...new Set(r.prompts.map(p => p.verb).filter(Boolean))];
      row.errors = S.errors.slice(0, 6);
      row.shot = path.basename(await X.jpeg(page, path.join(X.OUTX, 'shots/census'), sd.key));
      console.log(`${spec}: nodes ${r.nodes} startFree ${r.startFree} targets ${r.targets.length} unreached ${row.unreached.length} ${JSON.stringify(row.unreached.map(t => [t.t, t.x, t.y, t.dist, t.nav]))}`);
    } catch (e) { row.error = String(e && e.stack || e).slice(0, 400); console.log(spec, 'ERROR', row.error); }
    X.append('census-dungeons.jsonl', row);
  }
  await S.browser.close();
})();
