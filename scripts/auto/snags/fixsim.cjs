'use strict';
// The fix's own file (public/acts-dungeons/modules/snag-slide.js) run against the static mover model:
// the module is loaded in a sandbox with a fake window.__QOK_DNG2__ whose free()/maskFree() are the model's.
// Act 1 floors: as dq-tiles.js a1mSnagBend gives it (the floor-1 mouth cell counts as floor she may stand on).
// Track S2: the ctx carries the floor plan (the glide's plain-floor table reads it) and the mover's frame time; a bent
// frame is stepped as dq-tiles.js a1mStep steps it (whole accepted substeps along the bent stick, never a slide) and
// compared with what the glide said it would be; the glide's collision probes are counted.
// SNAG_FIX=<path> runs another copy of the module (the first version has no .snag tag: its bent frames slide as they did).
const fs = require('fs'), path = require('path'), vm = require('vm');
const S = require('./snaglib.cjs');
const SRC_PATH = process.env.SNAG_FIX && process.env.SNAG_FIX !== '1' ? process.env.SNAG_FIX : path.join(S.ROOT, 'public/acts-dungeons/modules/snag-slide.js');
const FD = 31;
// make(path): the same rig for another copy of the module (comparisons); the default export is make(SRC_PATH)
function make(srcPath) {
const SRC = fs.readFileSync(srcPath, 'utf8');
function rig(m, opt) {
  const loop = { frame: 0, delta: 1000 / 60 }, mods = {}, probes = { n: 0 };
  let ctx = null;
  const D = { register(id, mod) { mods[id] = mod; return mod; }, ctx() { return ctx; }, manifest() { return { dungeons: {} }; }, footDy() { return FD; },
    free(x, y) { probes.n++; return S.free(m, x, y + FD, opt); } };
  const win = { __QOK_DNG2__: D, localStorage: { getItem() { return null; } } };
  vm.runInNewContext(SRC, { window: win, setInterval() { return 0; }, clearInterval() {}, console, Math, isNaN, Uint8Array, Array, String });
  const mod = mods.none, api = win.__QOK_SNAG__, fl = m.fl || {}, ter = fl.terrain || fl.rows || [];
  const fresh = () => { const scene = { game: { loop }, heroDir: 0, hero: { x: 0, y: 0, frame: { name: 0 }, setFrame(n) { this.frame.name = n; } } };
    ctx = { scene, mechanic: fl.mechanic || { id: 'none' }, plan: fl, state: {}, snagDt: loop.delta, terrain(x, y) { const r = ter[y]; return r ? r.charAt(x) : '#'; },
      maskFree(px, py) { probes.n++; return S.maskFree(m, px, py) || !!(m.act1 && m.mouth && ((px / 48) | 0) === m.mouth[0] && ((py / 48) | 0) === m.mouth[1]); }, tile(cx, cy) { return m.prop[cy * m.cw + cx] || 0; } }; return ctx; };
  return { D, mod, api, loop, fresh, probes };
}
const rigs = new Map();
// same contract as snaglib.walk (sole coordinates), with the module's input hook in the loop.
// opt: mag, dt (ms a frame, default 1000/60), trace (true: [x, y, bent] rounded to 0.1; 'exact': [x, y, bent, probes] unrounded), free, until
function walk(m, p0, ux, uy, frames, opt) {
  let R = rigs.get(m); if (!R) { R = rig(m, opt && opt.free); rigs.set(m, R); }
  const dt = opt && opt.dt ? opt.dt : 1000 / 60; R.loop.delta = dt;
  const ctx = R.fresh(), p = { x: p0.x, y: p0.y }; let dead = 0, f, bent = 0, maxLat = 0, refusedBent = 0, mispredicted = 0, stall = 0, stallMax = 0;
  const lx = -uy, ly = ux, trace = opt && opt.trace ? [] : null, exact = opt && opt.trace === 'exact', pr = [];
  for (f = 0; f < frames; f++) {
    const inp = { x: ux, y: uy, m: opt && typeof opt.mag === 'number' ? opt.mag : 1 };
    ctx.scene.hero.x = p.x; ctx.scene.hero.y = p.y - FD; ctx.snagDt = dt;
    const n0 = R.probes.n, o = R.mod.input(ctx, inp, p.x, p.y - FD), use = o === undefined ? inp : o, np = R.probes.n - n0;
    let mv = 0;
    if (o && o.snag) {                                                       // the mover's bent frame (a1mStep): the bent stick's own substeps, a refused one ends the frame
      bent++; pr.push(np);
      const total = S.SPEED * (0.45 + 0.55 * o.m) * Math.min(0.12, dt / 1000), n = Math.max(1, Math.ceil(total / S.STEP)), sx = o.x * total / n, sy = o.y * total / n;
      let xs = p.x, ys = p.y - FD;
      for (let k = 0; k < n; k++) { const nx = xs + sx, ny = ys + sy; if (!S.free(m, nx, ny + FD, opt && opt.free)) { refusedBent++; break; } xs = nx; ys = ny; mv += Math.sqrt(sx * sx + sy * sy); }
      const b = ctx.__snag && ctx.__snag.bent; if (!b || Math.abs(b.x - xs) > 1e-9 || Math.abs(b.y - ys) > 1e-9) mispredicted++;
      p.x = xs; p.y = ys + FD;
    } else if (use) { if (o) { bent++; pr.push(np); } mv = S.frame(m, p, use.x, use.y, dt / 1000, { ...(opt && opt.free), mag: use.m }); }
    R.mod.tick(ctx, 16.7); R.loop.frame++;
    if (trace) trace.push(exact ? [p.x, p.y, o ? 1 : 0, np] : [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, o ? 1 : 0]);
    const lat = Math.abs((p.x - p0.x) * lx + (p.y - p0.y) * ly); if (lat > maxLat) maxLat = lat;
    if (mv < 1e-6) { dead++; stall++; if (dead >= 4) break; } else { dead = 0; if (stall > stallMax) stallMax = stall; stall = 0; }
    if (opt && opt.until && opt.until(p)) break;
  }
  R.loop.frame += 5;                                                       // the next walk is a new push
  return { x: p.x, y: p.y, dead: dead >= 4, frames: f, bent, maxLat, trace, refusedBent, mispredicted, probes: pr, stallMax };
}
return { walk, rig, FD };
}
module.exports = Object.assign(make(SRC_PATH), { make });
