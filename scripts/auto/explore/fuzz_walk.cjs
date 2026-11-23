'use strict';
// Wall-push and wander fuzz. One seeded random walker per spot (mulberry32(seed), so a run
// repeats): straight pushes into walls at many headings, slow heading sweeps along edges and
// corners (edge hugging), short random wanders, all through the analog stick (__DQ_STICK__), the
// same input the touch pad gives. Watched every frame, in the page:
//   teleport   the sprite jumps > 40 px (dungeon) / > 60 physical px (overworld) in one frame without a map/floor change
//   inBlocked  the game's own test says her current spot is not free for > 0.5 s (dungeon: __XP__.free;
//              overworld: __DQ_TILES__.checkOverworldSpawn status ready, free false)
//   water      overworld: her SOLES stand on a water tile (2) while the game calls the spot free
//   outside    her tile is outside the map
//   stuck      after a push, none of 8 headings moves her 2 px in 400 ms
//   door       the map changed: from where, heading, target (a door firing from the wrong side shows here)
//   error      page errors
// Spots: `ow:<x>,<y>` (overworld cell), `<dungeonId>:<floor>` (seeded at that floor's arrival, as
// census_dungeons.cjs), `town:<id>` is not handled here (towns: fuzz_menu / census).
//   node scripts/auto/explore/fuzz_walk.cjs [--secs 40] [--seed 1] spot ...
//   node scripts/auto/explore/fuzz_walk.cjs --list-ow [perAct]     prints overworld spots
// Writes /home/user/work/explore/fuzz-walk.jsonl, shots/fuzz/<spot>-<event>.jpg
const fs = require('fs'), path = require('path');
const X = require('./xlib.cjs'), L = X.L;
const acts = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-hifi/manifest.json'), 'utf8'));
const man = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/acts-dungeons/manifest.json'), 'utf8'));
const a1 = JSON.parse(fs.readFileSync(path.join(X.ROOT, 'public/act1-dungeon-floors.json'), 'utf8')).floors;
const A1L = (() => { const src = fs.readFileSync(path.join(X.ROOT, 'public/act1-world-map.js'), 'utf8'), m = /var LANDMARKS = (\[.*?\]);/.exec(src);
  return JSON.parse(m[1]).map(l => ({ mapId: l.mapId, at: [l.at.x, l.at.y], exit: [l.exit.x, l.exit.y], tile: l.tile, act: 1 })); })();
const DOORS = [...A1L, ...acts.landmarks];
const RELICS = ['excalibur', 'aegisOfDawn', 'galeShield', 'crownOfWisdom'];
const mul = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function reachGrid() { const R = acts.reach, g = []; for (const r of R.rows) { const row = []; for (const seg of r.split(',')) { const [v, n] = seg.split(':').map(Number); for (let i = 0; i < n; i++) row.push(v); } g.push(row); } return g; }
function actOf(x, y) { for (const a of acts.acts) { const [x0, y0, x1, y1] = a.bounds; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return a.act; } return 1; }
function listOw(per = 6, seed = 7) {
  const g = reachGrid(), rnd = mul(seed), byAct = {};
  for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g[0].length - 1; x++) {
    if (!g[y][x]) continue; let edge = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g[y + dy][x + dx]) edge++;
    if (edge) (byAct[actOf(x, y)] = byAct[actOf(x, y)] || []).push([x, y]); }
  const out = [];
  for (const a of Object.keys(byAct).sort()) { const c = byAct[a]; for (let i = 0; i < per; i++) { const p = c[(rnd() * c.length) | 0]; out.push(`ow:${p[0]},${p[1]}`); } }
  for (const d of DOORS) out.push(`ow:${d.exit[0]},${d.exit[1]}`);
  return out;
}
function seedFor(spot) {
  if (spot.startsWith('ow:')) { const [x, y] = spot.slice(3).split(',').map(Number); return { mapId: 'overworld', x, y, floor: 1 }; }
  const [id, f] = spot.split(':'), key = `${id}-f${f}`;
  if (man.floors[key]) { const ld = man.floors[key].land || {}, s = +f === 1 ? (ld.mouth || ld.entrance) : (ld.fromPrev || ld.mouth2 || ld.mouth); return { mapId: id, x: s.x, y: s.y, floor: +f, boss: man.dungeons[id].bossId }; }
  const FL = a1[key], from = FL.assets.find(a => a.kind === (+f === 1 ? 'mouth' : 'stairsUp'));
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2]]) if (FL.rows[from.y + dy] && FL.rows[from.y + dy][from.x + dx] === '.') return { mapId: id, x: from.x + dx, y: from.y + dy, floor: +f };
  throw new Error('no seed ' + spot);
}

// in-page walker: returns events
const WANDER = async ({ secs, seed }) => {
  const mul = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rnd = mul(seed), G = window.__PHASER_GAME__, w = G.scene.getScene('WorldMapScene'), XP = window.__XP__, DT = window.__DQ_TILES__;
  const ev = [], t0 = performance.now(), map0 = w.currentMapId, f0 = w.currentFloor || 1, ow = map0 === 'overworld';
  const sp = DT.overworldSpace;
  const frame = () => new Promise(r => requestAnimationFrame(r));
  const onField = () => G.scene.isActive('WorldMapScene') && !G.scene.isPaused('WorldMapScene') && !G.scene.isActive('BattleScene');
  const masked = () => { try { const f = XP.field(); return !!f && (ow ? f.ow : !f.ow); } catch (e) { return false; } };
  const freeHere = () => { try { if (!ow && !masked()) return null; if (ow) { const r = DT.checkOverworldSpawn(w, w.hero.x, w.hero.y); return r.status === 'ready' ? r.free : null; } return XP.free(w.hero.x, w.hero.y); } catch (e) { return null; } };
  const fd = XP.footDy() || 31;
  let last = [w.hero.x, w.hero.y], blockedSince = null, heading = [0, 0], frames = 0, moved = 0;
  const cell = () => [w.heroTileX, w.heroTileY];
  // the real pad (index.html setVector): the raw vector AND the arrow keys past 0.38 deflection
  const KC = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }, held = {};
  const fire = (type, key) => { const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }); try { Object.defineProperty(ev, 'keyCode', { get: () => KC[key] }); Object.defineProperty(ev, 'which', { get: () => KC[key] }); } catch (e) {} window.dispatchEvent(ev); };
  const keys = (nx, ny) => { const want = {}; if (nx > 0.38) want.ArrowRight = 1; else if (nx < -0.38) want.ArrowLeft = 1; if (ny > 0.38) want.ArrowDown = 1; else if (ny < -0.38) want.ArrowUp = 1;
    for (const k of Object.keys(KC)) { if (want[k] && !held[k]) { held[k] = 1; fire('keydown', k); } else if (!want[k] && held[k]) { delete held[k]; fire('keyup', k); } } };
  const stick = (x, y) => { const l = Math.hypot(x, y) || 1; heading = [x / l, y / l]; window.__DQ_STICK__ = { x: x / l, y: y / l, m: 1 }; keys(x / l, y / l); };
  const rel = () => { window.__DQ_STICK__ = { x: 0, y: 0, m: 0 }; keys(0, 0); };
  let done = false;
  const check = () => {
    frames++;
    if (w.currentMapId !== map0 || (w.currentFloor || 1) !== f0) { ev.push({ k: 'door', to: w.currentMapId, floor: w.currentFloor || 1, from: last.map(Math.round), fromCell: ow ? [Math.floor(sp.toCanonical(last[0]) / 48), Math.floor(sp.toCanonical(last[1]) / 48)] : [Math.floor(last[0] / 48), Math.floor(last[1] / 48)], heading: heading.map(v => +v.toFixed(2)), t: Math.round(performance.now() - t0) }); done = true; return; }
    if (!onField()) { if (w.showingMessage === undefined) {} return; }
    const p = [w.hero.x, w.hero.y], j = Math.hypot(p[0] - last[0], p[1] - last[1]); moved += j;
    if (j > (ow ? 60 : 40)) ev.push({ k: 'teleport', from: last.map(Math.round), to: p.map(Math.round), d: Math.round(j), heading, t: Math.round(performance.now() - t0) });
    last = p;
    const md = w.mapData, [tx, ty] = cell();
    if (!md[ty] || md[ty][tx] === undefined) ev.push({ k: 'outside', cell: [tx, ty] });
    const fr = freeHere();
    if (fr === false) { if (blockedSince === null) blockedSince = performance.now(); else if (performance.now() - blockedSince > 500 && !ev.some(e => e.k === 'inBlocked' && Math.hypot(e.at[0] - p[0], e.at[1] - p[1]) < 24)) ev.push({ k: 'inBlocked', at: p.map(Math.round), cell: [tx, ty], t: Math.round(performance.now() - t0) }); }
    else blockedSince = null;
    if (ow && fr) { const cx = sp.toCanonical(p[0]), cy = sp.toCanonical(p[1]) + fd, sx = Math.floor(cx / 48), sy = Math.floor(cy / 48);
      if (md[sy] && md[sy][sx] === 2 && !ev.some(e => e.k === 'water' && e.cell[0] === sx && e.cell[1] === sy)) ev.push({ k: 'water', cell: [sx, sy], at: p.map(Math.round), t: Math.round(performance.now() - t0) }); }
  };
  const hold = async (x, y, ms) => { stick(x, y); const e = performance.now() + ms; while (performance.now() < e && !done) { await frame(); check(); if (w.showingMessage) { rel(); return 'msg'; } } rel(); };
  const stuckTest = async () => {
    const p0 = [w.hero.x, w.hero.y]; let any = false;
    for (let a = 0; a < 8 && !done; a++) { const ang = a * Math.PI / 4; await hold(Math.cos(ang), Math.sin(ang), 400); if (Math.hypot(w.hero.x - p0[0], w.hero.y - p0[1]) > 2) { any = true; break; } }
    if (!any && !done && onField() && !w.showingMessage) ev.push({ k: 'stuck', at: p0.map(Math.round), cell: cell(), t: Math.round(performance.now() - t0) });
  };
  const msgs = [];
  try {
    let n = 0;
    while (performance.now() - t0 < secs * 1000 && !done) {
      if (w.showingMessage) { msgs.push(String(w.messageText && w.messageText.text || '').slice(0, 80)); try { w.showingMessage && w.messageBox && w.hideMessage && w.hideMessage(); } catch (e) {}
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', bubbles: true })); await new Promise(r => setTimeout(r, 60)); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'z', code: 'KeyZ', bubbles: true })); await new Promise(r => setTimeout(r, 250)); continue; }
      if (!onField()) { await new Promise(r => setTimeout(r, 300)); if (G.scene.isActive('BattleScene')) { ev.push({ k: 'battle' }); break; } continue; }
      const r = rnd(), ang = rnd() * Math.PI * 2;
      if (r < 0.35) { await hold(Math.cos(ang), Math.sin(ang), 1200 + rnd() * 1500); n++; if (n % 3 === 0) await stuckTest(); }           // wall push
      else if (r < 0.6) { let a = ang; const da = (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd()); const e = performance.now() + 2500; while (performance.now() < e && !done) { stick(Math.cos(a), Math.sin(a)); await frame(); check(); a += da / 60; } rel(); } // edge sweep
      else if (r < 0.75) { const card = [[1, 0], [-1, 0], [0, 1], [0, -1]][(rnd() * 4) | 0]; await hold(card[0], card[1], 1500); await hold(card[0] + (rnd() - 0.5) * 0.4, card[1] + (rnd() - 0.5) * 0.4, 800); } // corner jab
      else { for (let i = 0; i < 6 && !done; i++) { const a = rnd() * Math.PI * 2; await hold(Math.cos(a), Math.sin(a), 150 + rnd() * 350); } }        // jitter
    }
    if (!done) await stuckTest();
  } finally { rel(); }
  return { ev, frames, moved: Math.round(moved), end: { map: w.currentMapId, floor: w.currentFloor || 1, cell: cell() }, msgs: msgs.slice(0, 8), ms: Math.round(performance.now() - t0) };
};

(async () => {
  let a = process.argv.slice(2), secs = 40, seed = 1;
  if (a[0] === '--list-ow') { console.log(listOw(+(a[1] || 6)).join('\n')); return; }
  const take = k => { const i = a.indexOf(k); if (i < 0) return null; const v = a[i + 1]; a.splice(i, 2); return v; };
  secs = +(take('--secs') || secs); seed = +(take('--seed') || seed);
  const S = await X.launchX(), page = S.page;
  for (const spot of a) {
    const row = { spot, seed, secs };
    try {
      const sd = seedFor(spot); const flags = L.allFlags(); if (sd.boss) delete flags[`boss.${sd.boss}.defeated`];
      flags['boss.sandGolem.defeated'] = true;
      S.errors.length = 0;
      await X.boot(page, L.save({ mapId: sd.mapId, x: sd.x, y: sd.y, floor: sd.floor, flags, inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 }, ...RELICS.map(r => ({ itemId: r, quantity: 1 }))] }));
      let r = null, rounds = 0; row.runs = [];
      let left = secs * 1000;
      while (left > 3000 && rounds < 8) {      // a door ends a round: note it, reboot at the spot, go on with the next seed
        const t = Date.now();
        r = await page.evaluate(WANDER, { secs: left / 1000, seed: seed * 101 + rounds });
        left -= Date.now() - t; rounds++;
        row.runs.push(r);
        const interesting = r.ev.filter(e => e.k !== 'door' && e.k !== 'battle');
        if (interesting.length) await X.jpeg(page, path.join(X.OUTX, 'shots/fuzz'), `${spot.replace(/[:,]/g, '_')}-${rounds}-${interesting[0].k}`);
        if (r.ev.some(e => e.k === 'door' || e.k === 'battle')) { await page.waitForTimeout(2500); await X.jpeg(page, path.join(X.OUTX, 'shots/fuzz'), `${spot.replace(/[:,]/g, '_')}-${rounds}-door`);
          // a floor change or a dungeon <-> overworld door: keep wandering where she now is
          const here = await page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), f = document.querySelector('#act1-hifi-preserved-root iframe');
            return { town: !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__), field: g.scene.isActive('WorldMapScene') && !g.scene.isActive('BattleScene'), map: w && w.currentMapId }; });
          if (here.field && !here.town) { await page.waitForTimeout(1500); await L.noEncounters(page); continue; }
          await X.boot(page, L.save({ mapId: sd.mapId, x: sd.x, y: sd.y, floor: sd.floor, flags, inventory: [{ itemId: 'herb', quantity: 5 }, { itemId: 'flameCloak', quantity: 1 }, { itemId: 'windbreakerStone', quantity: 1 }, ...RELICS.map(r => ({ itemId: r, quantity: 1 }))] })); }
        else break;
      }
      row.errors = S.errors.slice(0, 6);
      const evs = row.runs.flatMap(r => r.ev);
      console.log(spot, 'rounds', rounds, 'events', JSON.stringify(evs.map(e => e.k + (e.to ? '>' + e.to : ''))), 'moved', row.runs.map(r => r.moved), 'errors', row.errors.length);
    } catch (e) { row.error = String(e && e.stack || e).slice(0, 400); console.log(spot, 'ERROR', row.error); }
    X.append('fuzz-walk.jsonl', row);
  }
  await S.browser.close();
})();
