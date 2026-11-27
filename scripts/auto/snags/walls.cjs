'use strict';
// Flat-wall sites for the negative half of the snag check: a push square into a straight face with no opening within 30 px.
//   node walls.cjs <floorKey ...>  -> JSON { key: [{d, start:[x,y], face:[x,y]}] }
const S = require('./snaglib.cjs');
const DIRS = [['E', 1, 0], ['W', -1, 0], ['S', 0, 1], ['N', 0, -1]];
const out = {};
for (const key of process.argv.slice(2)) {
  const m = S.build(key), fl = m.fl, T = 48, res = [];
  const F = (x, y) => S.free(m, x, y);
  const objs = [...(fl.assets || []), ...(fl.mech || [])].map(a => [a.x * T + 24, a.y * T + 24]);
  const farObj = (x, y) => objs.every(o => Math.hypot(o[0] - x, o[1] - y) > 120);
  const plain = (x, y) => { const r = (fl.terrain || fl.rows)[Math.floor(y / T)]; return r && r.charAt(Math.floor(x / T)) === '.'; };
  for (const [dn, ux, uy] of DIRS) {
    const lx = -uy, ly = ux; let best = null;
    const cxm = m.W / 2, cym = m.H / 2;
    for (let y = 60; y < m.H - 60; y += 7) for (let x = 60; x < m.W - 60; x += 7) {
      if (!F(x + 0.5, y + 0.5) || F(x + ux + 0.5, y + uy + 0.5)) continue;
      if (!plain(x, y) || !farObj(x, y)) continue;
      let ok = true;
      for (let i = 1; i <= 40 && ok; i++) if (!F(x - i * ux + 0.5, y - i * uy + 0.5)) ok = false;            // run-up
      for (let k = -34; k <= 34 && ok; k++) {                                                                // flat, closed face
        const px = x + k * lx + 0.5, py = y + k * ly + 0.5;
        if (!F(px - 3 * ux, py - 3 * uy)) ok = false;                                                        // the lane beside her is floor
        else if (F(px + 3 * ux, py + 3 * uy)) ok = false;                                                    // and the face stands within 3 px of the same line
      }
      if (!ok) continue;
      const d = Math.hypot(x - cxm, y - cym); if (!best || d < best.d) best = { d, x, y };
    }
    if (best) res.push({ d: dn, start: [best.x - 30 * ux + 0.5, best.y - 30 * uy + 0.5], face: [best.x, best.y] });
  }
  out[key] = res;
}
console.log(JSON.stringify(out));
