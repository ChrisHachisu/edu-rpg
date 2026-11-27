'use strict';
// The fix's own file (public/acts-dungeons/modules/snag-slide.js) run against the static mover model:
// the module is loaded in a sandbox with a fake window.__QOK_DNG2__ whose free()/maskFree() are the model's.
const fs = require('fs'), path = require('path'), vm = require('vm');
const S = require('./snaglib.cjs');
const SRC_PATH = process.env.SNAG_FIX && process.env.SNAG_FIX !== '1' ? process.env.SNAG_FIX : path.join(S.ROOT, 'public/acts-dungeons/modules/snag-slide.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const FD = 31;
function rig(m, opt) {
  const loop = { frame: 0, delta: 1000 / 60 }, mods = {};
  let ctx = null;
  const D = { register(id, mod) { mods[id] = mod; return mod; }, ctx() { return ctx; }, manifest() { return { dungeons: {} }; }, footDy() { return FD; },
    free(x, y) { return S.free(m, x, y + FD, opt); } };
  const win = { __QOK_DNG2__: D, localStorage: { getItem() { return null; } } };
  vm.runInNewContext(SRC, { window: win, setInterval() { return 0; }, clearInterval() {}, console, Math, isNaN });
  const mod = mods.none, api = win.__QOK_SNAG__;
  const fresh = () => { const scene = { game: { loop }, heroDir: 0, hero: { x: 0, y: 0, frame: { name: 0 }, setFrame(n) { this.frame.name = n; } } };
    ctx = { scene, mechanic: { id: 'none' }, state: {}, maskFree(px, py) { return S.maskFree(m, px, py); }, tile(cx, cy) { return m.prop[cy * m.cw + cx] || 0; } }; return ctx; };
  return { D, mod, api, loop, fresh };
}
const rigs = new Map();
// same contract as snaglib.walk (sole coordinates), with the module's input hook in the loop
function walk(m, p0, ux, uy, frames, opt) {
  let R = rigs.get(m); if (!R) { R = rig(m, opt && opt.free); rigs.set(m, R); }
  const ctx = R.fresh(), p = { x: p0.x, y: p0.y }; let dead = 0, f, bent = 0, maxLat = 0;
  const lx = -uy, ly = ux, trace = opt && opt.trace ? [] : null;
  for (f = 0; f < frames; f++) {
    const inp = { x: ux, y: uy, m: opt && typeof opt.mag === 'number' ? opt.mag : 1 };
    ctx.scene.hero.x = p.x; ctx.scene.hero.y = p.y - FD;
    const o = R.mod.input(ctx, inp, p.x, p.y - FD), use = o === undefined ? inp : o;
    let mv = 0;
    if (use) { if (o) bent++; mv = S.frame(m, p, use.x, use.y, undefined, { ...(opt && opt.free), mag: use.m }); }
    R.mod.tick(ctx, 16.7); R.loop.frame++;
    if (trace) trace.push([Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, o ? 1 : 0]);
    const lat = Math.abs((p.x - p0.x) * lx + (p.y - p0.y) * ly); if (lat > maxLat) maxLat = lat;
    if (mv < 1e-6) { dead++; if (dead >= 4) break; } else dead = 0;
    if (opt && opt.until && opt.until(p)) break;
  }
  R.loop.frame += 5;                                                       // the next walk is a new push
  return { x: p.x, y: p.y, dead: dead >= 4, frames: f, bent, maxLat, trace };
}
module.exports = { walk, rig, FD };
