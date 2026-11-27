'use strict';
// Static model of the dungeon mover (public/dq-tiles.js a1mBuild / a1mNeed / a1mFree / a1mSlide / a1mStep):
// the painted mask and the tile props, in SOLE coordinates (sprite y + footDy). No mechanic module is modelled.
// Day 4, track S (2026-11-27). Masks come from masks.py (SNAG_MASKS, default <tmp>/qok-snag-masks).
// The model was checked against the browser: 20 floors, 3 lips of each size per floor (confirm.cjs).
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '../../..');
const MASKS = process.env.SNAG_MASKS || path.join(os.tmpdir(), 'qok-snag-masks');
const MAN = JSON.parse(fs.readFileSync(path.join(process.env.SNAG_PUBLIC || path.join(ROOT, 'public'), 'acts-dungeons/manifest.json'), 'utf8'));
// the Act 1 floors (Whispering Woods Cave, Sunken Cellar, Misty Grotto, Coastal Reef): same mover, their own floor file
const A1 = (() => { try { return JSON.parse(fs.readFileSync(path.join(process.env.SNAG_PUBLIC || path.join(ROOT, 'public'), 'act1-dungeon-floors.json'), 'utf8')).floors; } catch (e) { return {}; } })();
const TILE = 48, FOOT = 12, STEP = 6, CH = 3, LEAN = 4, LIFT = 3, SPEED = 260;
const PROP_KIND = { chest: 4, sign: 18, save: 14, boss: 7 };

function build(key) {
  const b = fs.readFileSync(path.join(MASKS, key + '.bin'));
  const W = b.readUInt32LE(0), H = b.readUInt32LE(4), n = W * H, INF = 60000;
  const dist = new Uint16Array(n);
  let i, x, y, v;
  for (i = 0; i < n; i++) dist[i] = b[8 + i] ? INF : 0;
  for (y = 0; y < H; y++) { const r = y * W;
    for (x = 0; x < W; x++) { i = r + x; v = dist[i]; if (!v) continue;
      if (y > 0) { if (dist[i - W] + 3 < v) v = dist[i - W] + 3;
        if (x > 0 && dist[i - W - 1] + 4 < v) v = dist[i - W - 1] + 4;
        if (x < W - 1 && dist[i - W + 1] + 4 < v) v = dist[i - W + 1] + 4; }
      if (x > 0 && dist[i - 1] + 3 < v) v = dist[i - 1] + 3;
      dist[i] = v; } }
  for (y = H - 1; y >= 0; y--) { const r2 = y * W;
    for (x = W - 1; x >= 0; x--) { i = r2 + x; v = dist[i]; if (!v) continue;
      if (y < H - 1) { if (dist[i + W] + 3 < v) v = dist[i + W] + 3;
        if (x < W - 1 && dist[i + W + 1] + 4 < v) v = dist[i + W + 1] + 4;
        if (x > 0 && dist[i + W - 1] + 4 < v) v = dist[i + W - 1] + 4; }
      if (x < W - 1 && dist[i + 1] + 3 < v) v = dist[i + 1] + 3;
      dist[i] = v; } }
  const act1 = !MAN.floors[key] && !!A1[key], fl = MAN.floors[key] || A1[key];
  // per-pixel legal map (mask rule only): 1 = a sole may stand here
  const ok = new Uint8Array(n);
  const base = FOOT * CH;
  for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) { i = y * W + x; const d = dist[i]; if (d < base) continue;
    const nx = dist[i + 1] - dist[i - 1], ny = dist[i + W] - dist[i - W], l = Math.sqrt(nx * nx + ny * ny);
    const need = l < 1e-6 ? base : base + LEAN * CH * (1 + ny / l) * 0.5;
    if (d >= need) ok[i] = 1; }
  // tile props (cells that stop her and are opened by a bump) and the mouth cell (enterable although masked)
  const prop = new Uint8Array((W / TILE) * (H / TILE)); const cw = W / TILE;
  let mouth = null;                                                        // (the Act 1 entrance crystal's cell is open: a1mFree)
  for (const a of (fl && fl.assets) || []) { if (PROP_KIND[a.kind] && !(act1 && a.kind === 'save' && fl.floor === 1)) prop[a.y * cw + a.x] = PROP_KIND[a.kind]; if (a.kind === 'mouth' && !mouth) mouth = [a.x, a.y]; }
  return { key, W, H, dist, ok, prop, cw, mouth, fl, act1 };
}
// mask-only: may her soles be at (fx,fy)?
function maskFree(m, fx, fy) { if (fx < 1 || fy < 1 || fx >= m.W - 1 || fy >= m.H - 1) return false; return m.ok[(fy | 0) * m.W + (fx | 0)] === 1; }
// the mover's full static rule: mask + tile props (+ the floor-1 mouth cell)
function free(m, fx, fy, opt) {
  if (fx < 1 || fy < 1 || fx >= m.W - 1 || fy >= m.H - 1) return false;
  const tx = (fx / TILE) | 0, ty = (fy / TILE) | 0;
  if (opt && opt.veto && opt.veto(fx, fy) === false) return false;
  if (!m.ok[(fy | 0) * m.W + (fx | 0)] && !(m.mouth && m.mouth[0] === tx && m.mouth[1] === ty)) return false;
  if (!(opt && opt.noProps) && m.prop[ty * m.cw + tx]) return false;
  return true;
}
function need(m, gx, gy) {
  const base = FOOT * CH;
  if (gx < 1 || gy < 1 || gx >= m.W - 1 || gy >= m.H - 1) return base;
  const i = gy * m.W + gx, nx = m.dist[i + 1] - m.dist[i - 1], ny = m.dist[i + m.W] - m.dist[i - m.W], l = Math.sqrt(nx * nx + ny * ny);
  if (l < 1e-6) return base;
  return base + LEAN * CH * (1 + ny / l) * 0.5;
}
function slide(m, x, y, sx, sy) {
  const gx = x | 0, gy = y | 0;
  if (gx < 1 || gy < 1 || gx >= m.W - 1 || gy >= m.H - 1) return null;
  const i = gy * m.W + gx;
  let nx = m.dist[i + 1] - m.dist[i - 1], ny = m.dist[i + m.W] - m.dist[i - m.W];
  const l = Math.sqrt(nx * nx + ny * ny); if (l < 1e-6) return null;
  nx /= l; ny /= l;
  const d = sx * nx + sy * ny; if (d >= 0) return null;
  let tx = sx - d * nx, ty = sy - d * ny;
  const len = Math.sqrt(tx * tx + ty * ty);
  if (len < 0.01) return null;
  let lift = 0;
  for (let p = 0; p < 2; p++) {
    const ex = (x + tx) | 0, ey = (y + ty) | 0;
    if (ex < 1 || ey < 1 || ex >= m.W - 1 || ey >= m.H - 1) break;
    const nd = need(m, ex, ey) - m.dist[ey * m.W + ex];
    if (nd <= 0) break;
    const add = Math.min(LIFT - lift, (nd / CH) + 0.5);
    if (add <= 0) break;
    tx += nx * add; ty += ny * add; lift += add;
  }
  return { x: tx, y: ty, len };
}
// one frame of a1mStep. p = {x,y} soles. Returns the path length walked (0 = a dead frame).
function frame(m, p, ux, uy, dt, opt) {
  const mag = (opt && typeof opt.mag === 'number') ? opt.mag : 1;
  const total = SPEED * (0.45 + 0.55 * mag) * Math.min(0.12, dt === undefined ? 1 / 60 : dt);
  const n = Math.max(1, Math.ceil(total / STEP)), sx = ux * total / n, sy = uy * total / n;
  let x = p.x, y = p.y, moved = 0;
  for (let k = 0; k < n; k++) {
    const nx = x + sx, ny = y + sy;
    if (free(m, nx, ny, opt)) { x = nx; y = ny; moved += Math.sqrt(sx * sx + sy * sy); continue; }
    let slid = false; const tg = slide(m, x, y, sx, sy);
    if (tg && free(m, x + tg.x, y + tg.y, opt)) { x += tg.x; y += tg.y; moved += tg.len; slid = true; }
    else { if (sx && free(m, nx, y, opt)) { x = nx; moved += Math.abs(sx); slid = true; }
      if (sy && free(m, x, ny, opt)) { y = ny; moved += Math.abs(sy); slid = true; } }
    if (!slid) break;
  }
  p.x = x; p.y = y; return moved;
}
// hold the stick (ux,uy) from p0 for up to `frames` frames. Returns the end point and whether she ended on dead frames.
function walk(m, p0, ux, uy, frames, opt) {
  const p = { x: p0.x, y: p0.y }; let dead = 0, f;
  for (f = 0; f < frames; f++) { const mv = frame(m, p, ux, uy, undefined, opt); if (mv < 1e-6) { dead++; if (dead >= 3) break; } else dead = 0; if (opt && opt.until && opt.until(p)) break; }
  return { x: p.x, y: p.y, dead: dead >= 3, frames: f };
}
module.exports = { ROOT, MAN, A1, TILE, build, maskFree, free, need, slide, frame, walk, FOOT, STEP, LIFT, SPEED };
