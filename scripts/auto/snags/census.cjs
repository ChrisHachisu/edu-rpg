'use strict';
// Static snag census (day 4, track S). For every floor mask: hold the stick in one of the four cardinal directions
// along every row/column that meets rock, and list where the mover's own rules (snaglib.cjs, a copy of dq-tiles.js
// a1mStep/a1mSlide) leave her on dead frames although a sideways shift of at most 24 px would let her walk on.
//   python3 scripts/auto/snags/masks.py && node scripts/auto/snags/census.cjs [floorKey ...]
//   (default: all 107 floors, about three minutes; writes <key>.json and SUMMARY.json to SNAG_OUT,
//    default <tmp>/qok-snag-census, or <tmp>/qok-snag-census-fix with SNAG_FIX)
// SNAG_FIX=1 runs the same walks with the fix (public/acts-dungeons/modules/snag-slide.js itself) in the loop: fixsim.cjs.
// A SITE is a group of stops of one direction within 10 px of each other. kind 'lip': 48 px ahead are free after a
// sideways shift of at most 24 px (k48); 'closing': the wall keeps closing in (a corner: a real stop). prop: a chest,
// sign, crystal or boss cell is what she walked into (walking into one is how it is used).
// Day 4 result: 43,062 lips before, 652 with the fix, every one of them a prop cell (see the track's report).
const fs = require('fs'), path = require('path');
const S = require('./snaglib.cjs');
const FIXED = !!process.env.SNAG_FIX;
const OUT = process.env.SNAG_OUT || path.join(require('os').tmpdir(), FIXED ? 'qok-snag-census-fix' : 'qok-snag-census');
fs.mkdirSync(OUT, { recursive: true });
const FIX = process.env.SNAG_FIX ? require('./fixsim.cjs') : null;
const MAXLIP = 24, DIRS = [['E', 1, 0], ['W', -1, 0], ['S', 0, 1], ['N', 0, -1]];
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(S.MAN.floors).sort();

function census(key) {
  const m = S.build(key), W = m.W, H = m.H, ok = m.ok, t0 = Date.now();
  const F = (x, y) => S.free(m, x, y);
  const events = []; let contacts = 0, cands = 0;
  for (const [dn, ux, uy] of DIRS) {
    const lx = -uy, ly = ux;                                              // lateral axis (side +1 = clockwise-left of travel in screen terms)
    const lines = ux ? H : W, len = ux ? W : H;
    for (let a = 2; a < lines - 2; a++) for (let b = 2; b < len - 2; b++) {
      const x = ux ? b : a, y = ux ? a : b;
      if (!F(x + 0.5, y + 0.5) || F(x + ux + 0.5, y + uy + 0.5)) continue;
      contacts++;
      // prefilter: a sideways shift of k <= MAXLIP px (all free on the way) after which 8 px ahead are free
      let k8 = null, side8 = 0;
      for (const s of [1, -1]) { for (let k = 1; k <= MAXLIP; k++) { const px = x + s * k * lx, py = y + s * k * ly;
        if (!F(px + 0.5, py + 0.5)) break; let fwd = true;
        for (let i = 1; i <= 8; i++) if (!F(px + i * ux + 0.5, py + i * uy + 0.5)) { fwd = false; break; }
        if (fwd) { if (k8 === null || k < k8) { k8 = k; side8 = s; } break; } } }
      if (k8 === null) continue;
      cands++;
      // walks: three arrival phases from up to 24 px back along the same line
      let back = 0; while (back < 24 && F(x - (back + 1) * ux + 0.5, y - (back + 1) * uy + 0.5)) back++;
      if (back < 5) continue;                                             // no run-up: a pocket, not a walk along a wall
      let deadAt = null, nDead = 0, tried = 0;
      for (const ph of [0, 1.4, 2.9]) { if (back - ph < 4) continue; tried++;
        const p0 = { x: x - (back - ph) * ux + 0.5, y: y - (back - ph) * uy + 0.5 };
        const goal = p => (p.x - x) * ux + (p.y - y) * uy > 14;
        const r = FIX ? FIX.walk(m, p0, ux, uy, 90, { until: goal }) : S.walk(m, p0, ux, uy, 90, { until: goal });
        if (r.dead) { nDead++; if (!deadAt) deadAt = [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10]; } }
      if (!nDead) continue;
      // size of the thing: the smallest sideways shift after which 48 px ahead are free (null: the wall keeps closing in)
      let k48 = null;
      for (const s of [1, -1]) { for (let k = 1; k <= 48; k++) { const px = deadAt[0] + s * k * lx, py = deadAt[1] + s * k * ly;
        if (!F(px, py)) break; let fwd = true;
        for (let i = 2; i <= 48; i += 2) if (!F(px + i * ux, py + i * uy)) { fwd = false; break; }
        if (fwd) { if (k48 === null || k < k48) k48 = k; break; } } }
      // hugging: rock within 3 px on a side of where she stands
      let hug = false; for (const s of [1, -1]) for (let k = 1; k <= 3; k++) if (!F(deadAt[0] + s * k * lx, deadAt[1] + s * k * ly)) hug = true;
      const prop = !!m.prop[(((y + uy * 20) / S.TILE) | 0) * m.cw + (((x + ux * 20) / S.TILE) | 0)];
      events.push({ d: dn, line: a, at: b, stop: deadAt, k8, side8, k48, hug, nDead, tried, prop });
    }
  }
  // sites: events of one direction whose stops lie within 10 px of each other
  const sites = [];
  for (const [dn] of DIRS) {
    const ev = events.filter(e => e.d === dn), par = ev.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
    const grid = new Map(), G = 10;
    ev.forEach((e, i) => { const gx = Math.floor(e.stop[0] / G), gy = Math.floor(e.stop[1] / G);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const l = grid.get((gx + dx) + ',' + (gy + dy)); if (!l) continue;
        for (const j of l) if (Math.abs(ev[j].stop[0] - e.stop[0]) <= G && Math.abs(ev[j].stop[1] - e.stop[1]) <= G) par[find(i)] = find(j); }
      const k = gx + ',' + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    const by = new Map(); ev.forEach((e, i) => { const r = find(i); if (!by.has(r)) by.set(r, []); by.get(r).push(e); });
    for (const g of by.values()) {
      const xs = g.map(e => e.stop[0]), ys = g.map(e => e.stop[1]), k48s = g.map(e => e.k48);
      const lip = k48s.every(k => k !== null && k <= MAXLIP);
      sites.push({ d: dn, x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)], lines: g.length,
        k8: Math.max(...g.map(e => e.k8)), k48: k48s.some(k => k === null) ? null : Math.max(...k48s), kind: lip ? 'lip' : 'closing',
        hug: g.some(e => e.hug), prop: g.some(e => e.prop), sure: g.some(e => e.nDead === e.tried) });
    }
  }
  const res = { key, W, H, contacts, cands, events: events.length, sites: sites.length,
    lips: sites.filter(s => s.kind === 'lip').length, closing: sites.filter(s => s.kind === 'closing').length,
    lipsHug: sites.filter(s => s.kind === 'lip' && s.hug).length, props: sites.filter(s => s.prop).length, ms: Date.now() - t0 };
  fs.writeFileSync(path.join(OUT, key + '.json'), JSON.stringify({ ...res, siteList: sites, eventList: events }));
  return res;
}
const all = [];
for (const k of keys) { const r = census(k); all.push(r); console.log(JSON.stringify(r)); }
if (!process.argv.slice(2).length) fs.writeFileSync(path.join(OUT, 'SUMMARY.json'), JSON.stringify(all, null, 1));
