'use strict';
// Trigger zones of a floor for the glide's hazard tests (track S2), in SOLE pixels: every mechanic's hazard cells, plates,
// wires, spikes, portal pads, ice, pits, and the engine's stairs / exit cells. Taken over from the reviewer's probe
// (review of day 4, haz.cjs) with one addition: each zone also carries a plain `shape` the browser check can test
// without this file: {cells:[[cx,cy]..]} | {rect:[x0,y0,x1,y1]} (half-open px) | {disc:[x,y,r]}, and centre:true when
// the zone is judged on her SPRITE CENTRE (sole y - FD: stairs and exits) rather than her soles.
// Guard light is the union of every cell any guard lights at any tick of its round (the module's own logic.litBy).
const fs = require('fs'), path = require('path'), vm = require('vm');
const S = require('./snaglib.cjs');
const T = 48, FD = 31;
let GL = null;
(function () { const win = { __QOK_DNG2__: { register(id, mod) { if (id === 'guard-lanterns') GL = mod.logic; } }, localStorage: { getItem() { return null; } } };
  try { vm.runInNewContext(fs.readFileSync(path.join(S.ROOT, 'public/acts-dungeons/modules/guard-lanterns.js'), 'utf8'), { window: win, console, Math, setTimeout() {}, document: {} }); } catch (e) { console.error('hazlib: guard-lanterns.js did not load in the sandbox: ' + String(e).slice(0, 120)); } })();

function hazards(key, fl) {
  const H = [];
  const ter = fl.terrain || fl.rows, tc = (cx, cy) => { const r = ter[cy]; return r ? r.charAt(cx) : '#'; };
  const cellTest = (cells) => { const s = new Set(cells.map(c => c[0] + ',' + c[1])); return (x, y) => s.has(((x / T) | 0) + ',' + ((y / T) | 0)); };
  const cellZone = (label, cells) => H.push({ label, nears: cells.map(c => [c[0] * T + 24, c[1] * T + 24]), test: cellTest(cells), shape: { cells } });
  const rectZone = (label, r, nears) => H.push({ label, nears, test: (x, y) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3], shape: { rect: r } });
  const mc = fl.mechanic || {}, zones = fl.zones || [];
  for (const a of fl.assets || []) if (/^(stairsUp|stairsDown|mouth|mouth2)$/.test(a.kind))
    H.push({ label: 'way:' + a.kind + '@' + a.x + ',' + a.y, nears: [[a.x * T + 24, a.y * T + 24 + FD]], test: (x, y) => ((x / T) | 0) === a.x && (((y - FD) / T) | 0) === a.y, shape: { cells: [[a.x, a.y]], centre: true } });
  for (const w of mc.wires || []) { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const c of w.cells) { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); }
    const vert = x0 === x1, line = (vert ? x0 : y0) * T + 24, a0 = (vert ? y0 : x0) * T, a1 = ((vert ? y1 : x1) + 1) * T;
    rectZone('wire:' + w.id, vert ? [line - 7, a0, line + 7.0001, a1] : [a0, line - 7, a1, line + 7.0001], [[vert ? line : (a0 + a1) / 2, vert ? (a0 + a1) / 2 : line]]); }
  (mc.spikePatches || []).forEach((cells, i) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const c of cells) { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); }
    const r = [x0 * T + 3, y0 * T + 3, (x1 + 1) * T - 3, (y1 + 1) * T - 3]; rectZone('spikes:' + i, r, [[(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]]); });
  for (const p of mc.pairs || []) for (const q of [p.a, p.b]) { const px = q[0] * T + 24, py = q[1] * T + 24; H.push({ label: 'portal:' + q, nears: [[px, py]], test: (x, y) => (x - px) * (x - px) + (y - py) * (y - py) <= 400, shape: { disc: [px, py, 20] } }); }
  for (const sh of mc.shadows || []) { const cs = [], seen = new Set(); for (const c of sh.track) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = (c[0] + dx) + ',' + (c[1] + dy); if (!seen.has(k)) { seen.add(k); cs.push([c[0] + dx, c[1] + dy]); } }
    H.push({ label: 'shadow:' + sh.id, nears: sh.track.map(c => [c[0] * T + 24, c[1] * T + 24]), test: cellTest(cs), shape: { cells: cs } }); }
  if (mc.id === 'guard-lanterns' && GL) { const ctx = { mechanic: mc, plan: fl, terrain: tc }; const M = GL.model(ctx);
    for (const g of M.guards) { const lit = new Set(); for (let t = 0; t < M.period; t++) for (const k of Object.keys(GL.litBy(ctx, M, g, t))) lit.add(k);
      cellZone('guardlight:' + g.id, [...lit].map(k => k.split(',').map(Number))); } }
  for (const z of zones) {
    const rc = z.rect, cells = z.cells || (rc ? (() => { const o = []; for (let y = rc[1]; y <= rc[3]; y++) for (let x = rc[0]; x <= rc[2]; x++) o.push([x, y]); return o; })() : []);
    if (z.kind === 'gustLane') cellZone('gust:' + z.id, cells);
    else if (z.kind === 'strikeGroup') cellZone('strike:' + z.group, cells);
    else if (z.kind === 'glyphPlate') rectZone('plate:' + z.room + ':' + z.grid, [rc[0] * T + 9, rc[1] * T + 9, (rc[2] + 1) * T - 9, (rc[3] + 1) * T - 9], cells.map(c => [c[0] * T + 24, c[1] * T + 24]));
    else if (z.kind === 'mirrorRoom') { const nears = []; for (let x = rc[0]; x <= rc[2]; x++) { nears.push([x * T + 24, rc[1] * T + 24]); nears.push([x * T + 24, rc[3] * T + 24]); } for (let y = rc[1]; y <= rc[3]; y++) { nears.push([rc[0] * T + 24, y * T + 24]); nears.push([rc[2] * T + 24, y * T + 24]); }
      rectZone('mirror:' + z.id, [rc[0] * T, rc[1] * T, (rc[2] + 1) * T, (rc[3] + 1) * T], nears); }
    else if (z.kind === 'pit') cellZone('pit:' + z.room, cells);
    else if (z.kind === 'crustBridge') cellZone('crust:' + z.id, cells);
    else if (z.kind === 'channel') cellZone('channel:' + z.id, cells);
    else if (z.kind === 'blockLane') cellZone('blockLane:' + z.gate + '.' + z.lane, cells);
  }
  if (mc.id === 'slide-ice') { const cells = []; for (let y = 0; y < ter.length; y++) for (let x = 0; x < ter[y].length; x++) if (ter[y].charAt(x) === '~') cells.push([x, y]); if (cells.length) cellZone('ice', cells); }
  for (const h of H) h.kind = h.label.split(':')[0];
  return H.filter(h => h.nears && h.nears.length);
}
// the un-bent walk, frame by frame (sole px)
function beforeTrace(m, p0, ux, uy, frames, mag) { const p = { x: p0.x, y: p0.y }, tr = []; let dead = 0;
  for (let f = 0; f < frames; f++) { const mv = S.frame(m, p, ux, uy, undefined, { mag }); tr.push([p.x, p.y]); if (mv < 1e-6) { dead++; if (dead >= 4) break; } else dead = 0; }
  return tr; }
// A NEW ENTRY ON A BENT FRAME (the reviewer's rule): on a bent frame she goes from outside a zone to inside it, although her
// own push alone would not have entered it this frame, the zone is not within `ahead` px straight along her push, and the
// un-bent walk never enters it. f: a fixsim walk with trace 'exact' or true. Returns [{h, at, from, enter}].
function newEntries(H, f, b, p0, ux, uy, ahead) {
  const out = [];
  for (const h of H) { if (h.test(p0.x, p0.y)) continue;
    for (let i = 1; i < f.trace.length; i++) { const q0 = f.trace[i - 1], q1 = f.trace[i]; if (!q1[2]) continue;
      if (h.test(q0[0], q0[1]) || !h.test(q1[0], q1[1])) continue;
      const dx = q1[0] - q0[0], dy = q1[1] - q0[1], al = dx * ux + dy * uy;
      if (h.test(q0[0] + ux * al, q0[1] + uy * al)) break;
      let near = false; for (let s = 0; s <= ahead; s += 2) if (h.test(q0[0] + ux * s, q0[1] + uy * s)) { near = true; break; }
      if (near) break;
      if (b.some(q => h.test(q[0], q[1]))) break;
      out.push({ h, at: i, from: q0.slice(0, 2), enter: q1.slice(0, 2) }); break; } }
  return out;
}
module.exports = { hazards, beforeTrace, newEntries, T, FD };
