'use strict';
// M16 + m3 (census 2026-11-23) and T3, T4, T6, T7, T10 (design review 2026-11-27), every town, no browser: the town's own
// walkable authority (public/act1-hifi/walkable-polygons.js) with the people's bodies exactly as the served town.html
// registers them, flooded from the arrival cell on a 2 world-px grid.
//   M16  the hero stops BESIDE an NPC: nowhere reachable lets her feet come within 20 world px of
//        an NPC's feet from the south (the unfixed 7 px disc let them come to 11 px, stacking the
//        two 36 px sprites), nor within 13 px from the side.
//   T4   wherever Talk names a person, the hero's sprite box and the person's do not overlap by more than 4 px
//        (the 10 px body of day 1 left a third to half a body of overlap). Boxes are measured from the served sheets.
//        A person whose town json carries her own `space` (a lane too narrow for two bodies) is held to her `spaceMax`.
//   M16  no path is closed: every point reachable with the old 7 px discs is still reachable,
//        except points inside the people's bodies themselves.
//   all  every NPC (shopkeepers too: explorer X04) can be talked to (a reachable point where the town's nearestNpc() names her and,
//        unless she IS a service, no service spot outranks her); the save point and the shop
//        counter can be used; the exit line can be crossed.
//   heal the healer's talk spot is at least 300 px2 of reachable ground (not a pixel-exact sliver beside a stall)
//   m3   Port Sapphire's wise woman is one of those NPCs (unfixed: the save point lay under her feet,
//        so the Save pill outranked her from every spot she could be talked to).
//   T10  nowhere reachable does a service spot take the prompt from a person she is standing in front of
//        (day 4: beside the Wise Woman the pill still read Save).
//   T3   the shopkeepers that were drawn on their stalls stand behind a counter band: the town json names the band,
//        her feet are inside it and north of its painter's line, and its top edge is 6 to 14 px above her feet;
//        and the band never covers the hero (no reachable spot north of that line lets her sprite reach into it).
//   T6   the two wells and the chimney refuse her: at no reachable point beside or behind them is her body
//        (9 px either side of her feet) more than 3 px inside the painted outline.
//   T7   the two people who stood on scenery stand on open ground (the plate's own pixels under their feet).
// The served files are fetched from PROBE_URL so the same check runs against any build.
//   node scripts/auto/checks/field-town-reach.cjs [townId ...]
const path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '../../..');
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:5503/';
const TOWNS = ['greenhollow', 'millbrook', 'portSapphire', 'ironkeep', 'frostwatch', 'hauntedVillage', 'ruinsCamp', 'oasisHaven', 'embersRest', 'cinderwatch', 'lastBastion', 'havensEdge'];
let pass = 0, fail = 0;
const TRY = process.env.REACH_TRY ? JSON.parse(process.env.REACH_TRY) : {};
const ok = (c, n, d) => { if (c) pass++; else fail++; console.log(`[${c ? 'PASS' : 'FAIL'}] ${n}${d ? ' -- ' + d : ''}`); };
const get = async p => { const r = await fetch(new URL(p, URL_)); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); };
const getBuf = async p => { const r = await fetch(new URL(p, URL_)); if (!r.ok) throw new Error(`${p}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); };

// ---- a small PNG reader (8-bit RGB / RGBA, not interlaced), so the check stays free of dependencies ----
function png(buf) {
  let o = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12] !== 0 || (ct !== 2 && ct !== 6)) throw new Error('png kind'); }
    if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), st = w * bpp, out = Buffer.alloc(st * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], a = y * (st + 1) + 1, b = y * st;
    for (let x = 0; x < st; x++) { const L = x >= bpp ? out[b + x - bpp] : 0, U = y ? out[b - st + x] : 0, UL = x >= bpp && y ? out[b - st + x - bpp] : 0; let v = raw[a + x];
      if (f === 1) v += L; else if (f === 2) v += U; else if (f === 3) v += (L + U) >> 1; else if (f === 4) { const p = L + U - UL, pa = Math.abs(p - L), pb = Math.abs(p - U), pc = Math.abs(p - UL); v += pa <= pb && pa <= pc ? L : pb <= pc ? U : UL; }
      out[b + x] = v & 255; } }
  return { w, h, bpp, data: out };
}
// the drawn box of the idle frame (column 0, row 0 of a 64 px sheet), in world px round the feet (36 px sprite, feet on row 58)
function spriteBox(P) {
  let x0 = 64, y0 = 64, x1 = -1, y1 = -1;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (P.bpp === 4 && P.data[(y * P.w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const k = 36 / 64; return [(x0 - 32) * k, (y0 - 58) * k, (x1 + 1 - 32) * k, (y1 + 1 - 58) * k];
}
// the hero's box: every walk frame of both heroes together (public/act1-hifi/hero-g3, measured 2026-11-27)
const HERO = [-14.62, -30.94, 14.62, 0.56];
const BODY_HALF = 9, BODY_UP = 28;   // T6: her body without the sword and shield, for "is she drawn over the stones"

// ---- T6: the painted outlines the review saw her inside (world px; measured from the plates at 5x) ----
// oval: [centre x, half-width, rim centre y, rim half-height, base centre y, base half-height]; `front`: south of this she stands in front
// `was`: where the review saw her; `from`: the side she walks in from (the browser check, town-looks.cjs)
const PROPS = {
  embersRest: [{ id: 'well', oval: [515.8, 27.4, 585.6, 18, 606.4, 18], front: 612, was: [548, 610], from: 'east' }],
  cinderwatch: [{ id: 'well', oval: [520.0, 29.3, 577.6, 24, 601.6, 22], front: 608, was: [487, 604], from: 'west' }],
  lastBastion: [{ id: 'chimney', cells: [[45.35, 39.6], [45.35, 38.95], [45.75, 38.62], [46.6, 38.6], [47.05, 38.85], [47.2, 39.2], [47.2, 39.6]], front: 1e9, was: [744, 627], from: 'north' }],
};
const ovalRing = o => { const [cx, a, yr, br, yb, bb] = o, p = []; for (let d = 180; d <= 360; d += 15) p.push([cx + a * Math.cos(d * Math.PI / 180), yr + br * Math.sin(d * Math.PI / 180)]);
  for (let d = 0; d <= 180; d += 15) p.push([cx + a * Math.cos(d * Math.PI / 180), yb + bb * Math.sin(d * Math.PI / 180)]); return p; };
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// T3: the towns whose keeper the review saw standing on the stall
const BANDED = ['lastBastion', 'embersRest', 'ruinsCamp', 'havensEdge', 'oasisHaven', 'cinderwatch', 'hauntedVillage'];
// T7: who stood on scenery, where, and what the scenery looks like in the plate (rubble: near-black rock; verge: leaf green)
const ONGROUND = { cinderwatch: { id: 'cinderVillager', was: [26.41, 46.72], scenery: (r, g, b) => r + g + b < 150 || (r > 150 && g < 110 && b < 80), what: 'rubble' },
  millbrook: { id: 'herbalist', was: [40.44, 29.12], scenery: (r, g, b) => g > r * 1.12 && g > b * 1.5, what: 'the leafy verge' } };

// The people's bodies and talk bands the served town.html registers (current mode, i.e. without a qok-f2-old switch).
function modelFrom(html) {
  const num = (re, d) => { const m = re.exec(html); return m ? +m[1] : d; };
  const sp = /NPC_SPACE = \[([\d.]+), ([\d.]+), ([\d.]+)\], NPC_SPACE_R = ([\d.]+)/.exec(html);
  const m = { r: num(/NPC_BLOCK_RADIUS = (?:F2_OLD\('npcbody'\) \? [\d.]+ : )?([\d.]+)/, NaN), south: num(/NPC_BODY_SOUTH = (?:F2_OLD\('npcbody'\) \? [\d.]+ : )?([\d.]+)/, 0),
    own: /Array\.isArray\(n\.body\)/.test(html), reach: /npc\.talkReach/.test(html), space: sp ? [+sp[1], +sp[2], +sp[3]] : null, spaceR: sp ? +sp[4] : 0 };
  if (sp) { m.side = num(/NPC_TALK_SIDE = [^;]*?NPC_SPACE_ON \? ([\d.]+)/, NaN); m.sideDy = num(/NPC_TALK_SIDE_DY = NPC_SPACE_ON \? ([\d.]+)/, NaN); m.reachS = num(/NPC_TALK_SOUTH = NPC_SPACE_ON \? ([\d.]+)/, NaN); }
  else { m.side = num(/NPC_TALK_SIDE = (?:F2_OLD\('npcbody'\) \? [\d.]+ : )?([\d.]+)/, 1.1); m.sideDy = num(/NPC_TALK_SIDE_DY = ([\d.]+)/, 99); m.reachS = 2.1; }
  m.kx = sp && /NPC_NEAR_KX = NPC_SPACE_ON \? \(NPC_SPACE\[2\] \+ 4\) \/ \(NPC_SPACE\[0\] \+ 4\)/.test(html) ? (m.space[2] + 4) / (m.space[0] + 4) : 1;   // nearestNpc()'s sideways weight
  m.sideLow = 1.1;
  return m;
}
// town.html's blockers for one person: [{ x0, y0, x1, y1, hw }]
function segs(n, M, mode) {
  if (mode === 'old') return [{ x0: n.x, y0: n.y, x1: n.x, y1: n.y, hw: 7 }];
  if (M.space) return [Array.isArray(n.space) ? n.space : M.space, ...(Array.isArray(n.also) ? [n.also] : [])].flatMap(([hw, north, south, rr]) => { const r = Math.min(rr ?? M.spaceR, hw), off = hw - r, y0 = n.y - Math.max(0, north - r), y1 = n.y + Math.max(0, south - r);
    const k = off > 0 ? Math.ceil(off / r) + 1 : 1; return Array.from({ length: k }, (_, i) => { const o = k > 1 ? -off + 2 * off * i / (k - 1) : 0; return { x0: n.x + o, y0, x1: n.x + o, y1, hw: r }; }); });
  const b = M.own && n.body ? n.body : [M.r, M.south]; return [{ x0: n.x, y0: n.y, x1: n.x, y1: n.y + b[1], hw: b[0] }];
}
// town.html's own prompt rules, replicated (inTalkBand / nearestNpc / nearestService) for people [{ id, x, y, reach }]
function promptRules(C, M, npcs, services) {
  const inBand = (n, x, y) => { const dx = x - n.x, dy = y - n.y; return !(Math.abs(dx) > C * (dy <= C * M.sideDy ? M.side : M.sideLow) || dy < -C * 0.35 || dy > C * n.reach); };
  const nearestNpc = (x, y) => { let b = null; for (const n of npcs) { if (!inBand(n, x, y)) continue; const d = Math.hypot((x - n.x) * M.kx, y - n.y); if (!b || d < b.d) b = { n, d }; } return b ? b.n : null; };
  const nearestService = (x, y) => { let b = null; for (const [kind, c] of services) { const dx = x / C - c[0], dy = y / C - c[1]; if (Math.abs(dx) > 1.2 || Math.abs(dy) > 1.2) continue; const d = Math.hypot(dx, dy); if (!b || d < b.d) b = { kind, d }; } return b ? b.kind : null; };
  return { inBand, nearestNpc, nearestService };
}
// ---- FT2 (review of 2026-11-27): how far she walks. One town on one set of files: the ground she can reach from the gate
// (2 px grid, the flood of the main check) and the shortest walk over it (8 directions, no cutting a corner) from the gate,
// the save spot and the opening spot to every person's talk spot, the shop, the save spot and the exit line.
function people(T, M, html, opts = {}) { const C = T.worldPxPerCell, old = opts.cellOld || [];
  return T.npcs.map(n => { const c = old.includes(n.id) && Array.isArray(n.cellOld) ? n.cellOld : n.cell;
    return { id: n.id, x: c[0] * C, y: c[1] * C, reach: M.reach && n.talkReach ? n.talkReach : M.reachS, body: n.body, space: M.space ? (opts.space ? opts.space(n) : n.space) : null, also: M.space && /n\.spaceAlso/.test(html) && !(opts.space && opts.space(n) !== n.space) ? n.spaceAlso : null, max: n.spaceMax, note: n.spaceNote || n.bodyNote }; }); }
function bareGrid(W, T, base, STEP = 2) { const WORLD = T.cells * T.worldPxPerCell, N = Math.ceil(WORLD / STEP) + 1, bare = new Uint8Array(N * N);
  for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) bare[gy * N + gx] = W.isInsideWalkable({ x: gx * STEP, y: gy * STEP }, base) ? 1 : 0; return bare; }
function carve(bare, N, STEP, npcs, M, mode, fr) { const inside = Uint8Array.from(bare);
  for (const n of npcs) for (const s of segs(n, M, mode)) { const R = s.hw + fr + 1e-6;
    for (let gy = Math.max(0, Math.floor((s.y0 - R) / STEP)); gy <= Math.min(N - 1, Math.ceil((s.y1 + R) / STEP)); gy++) for (let gx = Math.max(0, Math.floor((s.x0 - R) / STEP)); gx <= Math.min(N - 1, Math.ceil((s.x0 + R) / STEP)); gx++) {
      const x = gx * STEP, y = gy * STEP; if (Math.hypot(x - s.x0, y - Math.min(Math.max(y, s.y0), s.y1)) <= R) inside[gy * N + gx] = 0; } }
  return inside; }
function nearestFree(inside, N, STEP, x, y, R = 24) { const sx = Math.round(x / STEP), sy = Math.round(y / STEP); let best = -1, bd = 1e9;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const gx = sx + dx, gy = sy + dy; if (gx < 0 || gy < 0 || gx >= N || gy >= N || !inside[gy * N + gx]) continue; const d = Math.hypot(gx * STEP - x, gy * STEP - y); if (d < bd) { bd = d; best = gy * N + gx; } }
  return best; }
// shortest walks from one grid point (Dijkstra, binary heap)
function walks(inside, N, STEP, src) { const dist = new Float32Array(N * N).fill(Infinity), hk = [src], hd = [0]; dist[src] = 0; const D = STEP * Math.SQRT2;
  const push = (k, d) => { let i = hk.length; hk.push(k); hd.push(d); while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= d) break; hk[i] = hk[p]; hd[i] = hd[p]; i = p; } hk[i] = k; hd[i] = d; };
  const pop = () => { const k = hk[0], d = hd[0], lk = hk.pop(), ld = hd.pop(), n = hk.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hd[c + 1] < hd[c]) c++; if (hd[c] >= ld) break; hk[i] = hk[c]; hd[i] = hd[c]; i = c; } hk[i] = lk; hd[i] = ld; } return [k, d]; };
  while (hk.length) { const [k, d] = pop(); if (d > dist[k]) continue; const x = k % N, y = (k - x) / N;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const nk = ny * N + nx; if (!inside[nk]) continue;
      if (dx && dy && (!inside[y * N + nx] || !inside[ny * N + x])) continue; const nd = d + (dx && dy ? D : STEP); if (nd < dist[nk]) { dist[nk] = nd; push(nk, nd); } } }
  return dist; }
// opts: bare (a grid already made), cellOld [ids standing at their cellOld], space(n) (a person's space, when a switch changes it), saveOld
function measure(W, T, base, M, html, opts = {}) {
  const C = T.worldPxPerCell, STEP = 2, N = Math.ceil(T.cells * C / STEP) + 1, fr = base.actorFootRadius || 0;
  const npcs = opts.npcs || people(T, M, html, opts), bare = opts.bare || bareGrid(W, T, base, STEP), inside = carve(bare, N, STEP, npcs, M, 'cur', fr);
  const save = opts.saveOld && Array.isArray(T.savePointOld) ? T.savePointOld : T.savePoint;
  const services = [['shop', T.shopCounter], ['save', save]].filter(s => Array.isArray(s[1])), P = promptRules(C, M, npcs, services);
  const src = { gate: nearestFree(inside, N, STEP, T.startCell[0] * C, T.startCell[1] * C) };
  const fromGate = walks(inside, N, STEP, src.gate), seen = new Uint8Array(N * N); for (let k = 0; k < N * N; k++) if (fromGate[k] < Infinity) seen[k] = 1;
  // the other places she starts a walk from: the save spot (where she stands to save: the reachable point nearest its cell) and the opening spot
  const reachNear = (x, y) => { let best = -1, bd = 1e9; for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) { const gx = Math.round(x / STEP) + dx, gy = Math.round(y / STEP) + dy; if (gx < 0 || gy < 0 || gx >= N || gy >= N || !seen[gy * N + gx]) continue; const d = Math.hypot(gx * STEP - x, gy * STEP - y); if (d < bd) { bd = d; best = gy * N + gx; } } return best; };
  if (Array.isArray(save)) src.save = reachNear(save[0] * C, save[1] * C);
  if (Array.isArray(T.firstEntryCell)) src.opening = reachNear(T.firstEntryCell[0] * C, T.firstEntryCell[1] * C);
  // the places she walks to: a person's (where Talk names her), the shop's (its spot, or its keeper), the save spot's, the exit line
  const exitY = (T.exit && T.exit.cell ? T.exit.cell[1] : T.startCell[1]) * C, exitX = (T.exit && T.exit.cell ? T.exit.cell[0] : T.startCell[0]) * C, north = T.exit && T.exit.axis ? T.exit.axis === 'north' : (T.exit && T.exit.cell && T.exit.cell[1] < T.cells / 2);
  const goal = {}; const add = (name, k) => (goal[name] = goal[name] || []).push(k);
  for (let k = 0; k < N * N; k++) { if (!seen[k]) continue; const x = (k % N) * STEP, y = Math.floor(k / N) * STEP, n = P.nearestNpc(x, y), s = P.nearestService(x, y);
    if (n && (n.id === 'healer' || n.id === 'shopkeeper' || !s)) add(n.id === 'shopkeeper' ? 'shop' : n.id, k);
    if (s && !(n && (n.id === 'healer' || (n.id === 'shopkeeper' && s !== 'shop')))) add(s, k);
    if ((north ? y <= exitY : y >= exitY) && Math.abs(x - exitX) < 2.4 * C) add('exit', k); }
  const dist = {};
  for (const [name, k] of Object.entries(src)) { if (k < 0) continue; const d = name === 'gate' ? fromGate : walks(inside, N, STEP, k); dist[name] = {};
    for (const [g, ks] of Object.entries(goal)) { if (g === name) continue; let m = Infinity; for (const q of ks) if (d[q] < m) m = d[q]; dist[name][g] = m < Infinity ? +m.toFixed(1) : null; }
    for (const n of npcs) { const g = n.id === 'shopkeeper' ? 'shop' : n.id; if (!(g in dist[name])) dist[name][g] = null; } }
  return { N, STEP, C, fr, npcs, bare, inside, seen, dist, P, services };
}
// the outlines, lists and box readers are shared with the browser check (town-looks.cjs)
module.exports = { TOWNS, PROPS, BANDED, ONGROUND, HERO, BODY_HALF, BODY_UP, ovalRing, inRing, spriteBox, png, modelFrom, segs, measure, people, bareGrid, carve, walks, promptRules };
if (require.main === module) (async () => {
  const W = await import(path.join(ROOT, 'public/act1-hifi/walkable-polygons.js'));
  const html = await get('act1-hifi/town.html'), M = modelFrom(html);
  console.log(`[INFO] people's bodies in the served town.html: ${M.space ? `space ${JSON.stringify(M.space)} px (half-width, north, south), corners ${M.spaceR} px` : `capsule half-width ${M.r} px, ${M.south} px south of the feet`}; talk band side ${M.side} cells (to ${M.sideDy} cells south), south ${M.reachS} cells; nearest person weighs sideways distance x${M.kx.toFixed(2)}`);
  const want = process.argv.slice(2).length ? process.argv.slice(2) : TOWNS;
  for (const id of want) {
    const T = JSON.parse(await get(`act1-hifi/town/${id}-town.json`)), base = JSON.parse(await get(`act1-hifi/${T.walkable}`));
    const C = T.worldPxPerCell, WORLD = T.cells * C, STEP = 2, N = Math.ceil(WORLD / STEP) + 1, fr = base.actorFootRadius || 0;
    const band = (T.occluders || []).find(o => o.id === 'shop-counter');
    const npcs = [];
    // REACH_TRY='{"millbrook/shopkeeper":{"space":[16,27,20]}}' tries a person's cell / space / spaceMax before it is written to the town json
    for (const n of T.npcs) Object.assign(n, TRY[`${id}/${n.id}`] || {});
    for (const n of T.npcs) { let box = null; try { box = spriteBox(png(await getBuf(`act1-hifi/${n.sheet}`))); } catch (e) { box = [-11, -29, 11, 1.2]; }
      npcs.push({ id: n.id, x: n.cell[0] * C, y: n.cell[1] * C, reach: M.reach && n.talkReach ? n.talkReach : M.reachS, body: n.body, space: M.space ? n.space : null, also: M.space && /n\.spaceAlso/.test(html) ? n.spaceAlso : null, max: n.spaceMax, note: n.spaceNote || n.bodyNote, box }); }
    // a keeper behind a counter band shows only above the band's top edge
    if (band) { const k = npcs.find(n => n.id === 'shopkeeper'); if (k) { const top = Math.min(...band.polygon.filter(p => Math.abs(p[0] * C - k.x) < 20).map(p => p[1] * C)); if (Number.isFinite(top)) k.box = [k.box[0], k.box[1], k.box[2], Math.min(k.box[3], top - k.y)]; } }
    const withBodies = mode => ({ ...base, dynamicBlockers: [...(base.dynamicBlockers || []), ...npcs.flatMap(n => segs(n, M, mode).map((s, i) => ({ id: `npc-${n.id}-${i}`, from: { x: s.x0, y: s.y0 }, to: { x: s.x1, y: s.y1 }, halfWidth: s.hw })))] });
    // the authority once for the town without its people; the people's capsules by the authority's own rule
    // (isInsideWalkable: blocked when the distance to the segment is no more than halfWidth + actorFootRadius)
    const bare = new Uint8Array(N * N);
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) bare[gy * N + gx] = W.isInsideWalkable({ x: gx * STEP, y: gy * STEP }, base) ? 1 : 0;
    function flood(mode) {
      const inside = Uint8Array.from(bare), seen = new Uint8Array(N * N);
      for (const n of npcs) for (const s of segs(n, M, mode)) { const R = s.hw + fr + 1e-6;
        for (let gy = Math.max(0, Math.floor((s.y0 - R) / STEP)); gy <= Math.min(N - 1, Math.ceil((s.y1 + R) / STEP)); gy++) for (let gx = Math.max(0, Math.floor((s.x0 - R) / STEP)); gx <= Math.min(N - 1, Math.ceil((s.x0 + R) / STEP)); gx++) {
          const x = gx * STEP, y = gy * STEP; if (Math.hypot(x - s.x0, y - Math.min(Math.max(y, s.y0), s.y1)) <= R) inside[gy * N + gx] = 0; } }
      const sx = Math.round(T.startCell[0] * C / STEP), sy = Math.round(T.startCell[1] * C / STEP), q = [sy * N + sx];
      if (!inside[q[0]]) { for (let r = 1; r < 6 && !inside[q[0]]; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (inside[(sy + dy) * N + sx + dx]) { q[0] = (sy + dy) * N + sx + dx; break; } }
      seen[q[0]] = 1;
      for (let i = 0; i < q.length; i++) { const k = q[i], x = k % N, y = (k - x) / N;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx; if (seen[nk] || !inside[nk]) continue; if (dx && dy && (!inside[y * N + nx] || !inside[ny * N + x])) continue; seen[nk] = 1; q.push(nk); } }
      return seen;
    }
    const cur = flood('cur'), old = flood('old');
    // town.html's own prompt rules, replicated (nearestNpc / nearestService)
    const services = [['shop', T.shopCounter], ['save', T.savePoint]].filter(s => Array.isArray(s[1]));
    const inBand = (n, x, y) => { const dx = x - n.x, dy = y - n.y; return !(Math.abs(dx) > C * (dy <= C * M.sideDy ? M.side : 1.1) || dy < -C * 0.35 || dy > C * n.reach); };
    const nearestNpc = (x, y) => { let b = null; for (const n of npcs) { if (!inBand(n, x, y)) continue; const d = Math.hypot((x - n.x) * M.kx, y - n.y); if (!b || d < b.d) b = { n, d }; } return b ? b.n : null; };
    const nearestService = (x, y) => { let b = null; for (const [kind, c] of services) { const dx = x / C - c[0], dy = y / C - c[1]; if (Math.abs(dx) > 1.2 || Math.abs(dy) > 1.2) continue; const d = Math.hypot(dx, dy); if (!b || d < b.d) b = { kind, d }; } return b ? b.kind : null; };
    const overlap = (n, x, y) => { const dx = x - n.x, dy = y - n.y, ox = Math.min(HERO[2] + dx, n.box[2]) - Math.max(HERO[0] + dx, n.box[0]), oy = Math.min(HERO[3] + dy, n.box[3]) - Math.max(HERO[1] + dy, n.box[1]); return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0; };
    const dBody = (n, x, y) => Math.min(...segs(n, M, 'cur').map(s => Math.hypot(x - Math.min(Math.max(x, Math.min(s.x0, s.x1)), Math.max(s.x0, s.x1)), y - Math.min(Math.max(y, s.y0), s.y1)) - s.hw));
    const talk = {}, talkN = {}, svc = {}, minS = {}, minSide = {}, nearAt = {}, nearD = {}, worst = {}, worstAt = {}, stolen = {}, stolenAt = {}; let crossExit = false, lost = 0, lostAt = null;
    const exitY = (T.exit && T.exit.cell ? T.exit.cell[1] : T.startCell[1]) * C, north = T.exit && T.exit.axis ? T.exit.axis === 'north' : (T.exit && T.exit.cell && T.exit.cell[1] < T.cells / 2);
    const bandRing = band ? band.polygon.map(c => [c[0] * C, c[1] * C]) : null; let hidden = 0, hiddenAt = null;
    const props = (PROPS[id] || []).map(p => ({ ...p, ring: p.oval ? ovalRing(p.oval) : p.cells.map(c => [c[0] * C, c[1] * C]), deep: 0, deepAt: null }));
    for (let k = 0; k < N * N; k++) {
      const x = (k % N) * STEP, y = Math.floor(k / N) * STEP;
      if (old[k] && !cur[k]) { const nearBody = npcs.some(n => dBody(n, x, y) <= fr + STEP * 1.5); if (!nearBody) { lost++; lostAt = lostAt || [+(x / C).toFixed(1), +(y / C).toFixed(1)]; } }
      if (!cur[k]) continue;
      if (north ? y < exitY : y > exitY) crossExit = true;
      const n = nearestNpc(x, y), s = nearestService(x, y);
      if (n) { const isSvc = n.id === 'healer' || n.id === 'shopkeeper'; if (isSvc || !s) { talk[n.id] = true; talkN[n.id] = (talkN[n.id] || 0) + 1; const o = overlap(n, x, y); if (o > (worst[n.id] || 0)) { worst[n.id] = o; worstAt[n.id] = [x, y]; } }
        // T10: she stands right in front of a person (inside the band, no further than a body and a half) and a service takes the prompt
        else if (Math.hypot(x - n.x, y - n.y) <= 40) { stolen[n.id] = (stolen[n.id] || 0) + 1; stolenAt[n.id] = stolenAt[n.id] || [x, y, s]; } }
      // the shop spot and the keeper open the same shop (interact(): a shopkeeper IS the shop), so the keeper never takes the shop spot away; she does take a save spot
      if (s && !(n && (n.id === 'healer' || (n.id === 'shopkeeper' && s !== 'shop')))) svc[s] = true;
      for (const m of npcs) { const dx = x - m.x, dy = y - m.y;
        if (dy > 0 && Math.abs(dx) < 6) minS[m.id] = Math.min(minS[m.id] ?? 1e9, Math.hypot(dx, dy));
        if (inBand(m, x, y) && Math.hypot(dx, dy) < (nearD[m.id] ?? 1e9)) { nearD[m.id] = Math.hypot(dx, dy); nearAt[m.id] = [x, y]; }
        if (Math.abs(dy) < 4) minSide[m.id] = Math.min(minSide[m.id] ?? 1e9, Math.abs(dx)); }
      // T3: north of the band's painter's line she is drawn BEFORE the band; her sprite must not reach into it there
      if (bandRing && y < band.baseY * C + STEP /* she can stand anywhere within a grid step of a reachable grid point */) { let hit = false; for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.33, 0.66, 1]) if (inRing(x + HERO[0] + fx * (HERO[2] - HERO[0]), y + HERO[1] + fy * (HERO[3] - HERO[1]), bandRing)) hit = true;
        if (hit) { hidden++; hiddenAt = hiddenAt || [x, y]; } }
      for (const p of props) { if (y >= p.front) continue;      // in front of it she is drawn over it, and rightly
        for (const h of [2, 8, 14, 20, BODY_UP]) for (const side of [-1, 1]) { if (!inRing(x + side * BODY_HALF, y - h, p.ring)) continue;
          let d = 0; while (d < BODY_HALF * 2 && inRing(x + side * (BODY_HALF - d), y - h, p.ring)) d++;                        // how far inside the outline her body's edge is
          if (d > p.deep) { p.deep = d; p.deepAt = [x, y]; } } }
    }
    for (const n of npcs) {
      const isSvc = n.id === 'healer' || n.id === 'shopkeeper';
      // every person, shopkeepers included (explorer X04), must have a reachable spot where the prompt names them
      // the healer has no other spot (a shop has its counter): where she can be talked to must be roomy, not a sliver. Last Bastion and
      // Cinderwatch, whose healers stand behind their stalls, had 156 and 192 px2 with the 1.1 cell side band (2026-11-26).
      if (n.id === 'healer') ok((talkN[n.id] || 0) * STEP * STEP >= 300, `${id}: the healer's talk spot is roomy`, `${(talkN[n.id] || 0) * STEP * STEP} px2 of reachable ground where Talk names her (need 300)`);
      else console.log(`[INFO] ${id}: ${n.id} talk spot ${(talkN[n.id] || 0) * STEP * STEP} px2`);
      ok(talk[n.id], `${id}: ${n.id} can be talked to`, talk[n.id] ? (n.reach !== M.reachS ? `talk band ${n.reach} cells (across a counter)` : '') : 'no reachable spot where the talk prompt names her');
      const s = minS[n.id], d = minSide[n.id], own = n.space || n.body, needS = own && !n.also ? 13 : 20;
      if (own) console.log(`[INFO] ${id}: ${n.id} has her own body ${JSON.stringify(own)}: ${String(n.note || '').slice(0, 160)}`);
      ok((s === undefined || s >= needS) && (d === undefined || d >= 13), `${id}: hero stops beside ${n.id}`, `closest feet from the south ${s === undefined ? 'n/a' : s.toFixed(1)} px (need ${needS}), from the side ${d === undefined ? 'n/a' : d.toFixed(1)} px (need 13)`);
      // T4: the two sprites at every spot where Talk names her
      const lim = n.space && Number.isFinite(n.max) ? n.max : 4, w = worst[n.id] || 0;
      ok(w <= lim, `${id}: the hero's sprite and ${n.id}'s do not overlap where Talk names her`, `worst overlap ${w.toFixed(1)} px${worstAt[n.id] && w ? ` with her feet ${(worstAt[n.id][0] - n.x).toFixed(0)},${(worstAt[n.id][1] - n.y).toFixed(0)} px from theirs` : ''} (allowed ${lim}${lim !== 4 ? ': a lane too narrow for two bodies, see her spaceNote' : ''})`);
      // walking right up to her (the reachable spot of her talk band closest to her), the prompt must be HER (m3)
      if (nearAt[n.id] && !isSvc) { const [x, y] = nearAt[n.id], nn = nearestNpc(x, y), ss = nearestService(x, y);
        ok(nn && nn.id === n.id && !ss, `${id}: walking right up to ${n.id} offers her talk`, `at cell ${(x / C).toFixed(1)},${(y / C).toFixed(1)} the prompt is ${ss ? ss + ' (service)' : nn ? 'talk to ' + nn.id : 'none'}`);
        ok(!stolen[n.id], `${id}: no service spot takes the prompt in front of ${n.id}`, stolen[n.id] ? `${stolen[n.id] * STEP * STEP} px2 within 40 px of her where the pill reads ${stolenAt[n.id][2]} (first at cell ${(stolenAt[n.id][0] / C).toFixed(1)},${(stolenAt[n.id][1] / C).toFixed(1)})` : ''); }
    }
    for (const [kind] of services) ok(svc[kind], `${id}: the ${kind} spot can be used`, svc[kind] ? '' : 'no reachable spot where the prompt names it');
    ok(crossExit, `${id}: the exit line can be crossed`);
    // a pocket smaller than a quarter of a cell, shut in between two people's bodies and a wall, is not a path
    ok(lost * STEP * STEP <= 64, `${id}: no path closed by the NPC bodies`, lost ? `${lost * STEP * STEP} px2 lost away from any NPC, first at cell ${lostAt} (a pocket of up to 64 px2 between two bodies is allowed)` : '');
    // ---- T6
    for (const p of props) {
      const wasIn = W.isInsideWalkable({ x: p.was[0], y: p.was[1] }, withBodies('cur'));
      ok(p.deep <= 3 && !wasIn, `${id}: the ${p.id} refuses her`, `her body reaches ${p.deep} px inside the painted outline${p.deepAt ? ` (feet at cell ${(p.deepAt[0] / C).toFixed(1)},${(p.deepAt[1] / C).toFixed(1)})` : ''}; the review's spot ${(p.was[0] / C).toFixed(1)},${(p.was[1] / C).toFixed(1)} is ${wasIn ? 'standable' : 'refused'} (allowed 3 px)`);
    }
    // ---- T3
    if (BANDED.includes(id)) {
      const k = npcs.find(n => n.id === 'shopkeeper'), ring = band && band.polygon.map(c => [c[0] * C, c[1] * C]);
      const top = ring && Math.min(...ring.filter(p => Math.abs(p[0] - k.x) < 20).map(p => p[1])), inside = ring && inRing(k.x, k.y, ring) && inRing(k.x - 8, k.y, ring) && inRing(k.x + 8, k.y, ring);
      ok(band && inside && k.y < band.baseY * C && k.y - top >= 6 && k.y - top <= 14, `${id}: the shopkeeper's feet are behind the counter band`,
        band ? `feet at cell ${(k.x / C).toFixed(2)},${(k.y / C).toFixed(2)}, band top ${(k.y - top).toFixed(1)} px above them, painter's line ${band.baseY} (${inside ? 'feet inside the band' : 'FEET OUTSIDE THE BAND'})` : 'the town json names no counter band (she is drawn whole, on the stall)');
    }
    if (band) ok(!hidden, `${id}: the counter band never covers the hero`, hidden ? `${hidden * STEP * STEP} px2 of reachable ground north of the band's line (cell y ${band.baseY}) where her sprite reaches into the band and would be drawn under it (first at cell ${(hiddenAt[0] / C).toFixed(2)},${(hiddenAt[1] / C).toFixed(2)})` : `the band is drawn at cell y ${band.baseY}, right after the keeper; no reachable spot north of that line lets her sprite reach it`);
    // ---- T7
    if (ONGROUND[id]) {
      const g = ONGROUND[id], n = npcs.find(q => q.id === g.id), P = png(await getBuf(`act1-hifi/${T.screen}`)), k = P.w / WORLD;
      const share = (cx, cy) => { let hit = 0, all = 0; for (let y = Math.round((cy - 5) * k); y <= Math.round((cy + 2) * k); y++) for (let x = Math.round((cx - 8) * k); x <= Math.round((cx + 8) * k); x++) { const i = (y * P.w + x) * P.bpp; all++; if (g.scenery(P.data[i], P.data[i + 1], P.data[i + 2])) hit++; } return hit / all; };
      const now = share(n.x, n.y), was = share(g.was[0] * C, g.was[1] * C);
      ok(now <= 0.2 && W.isInsideWalkable({ x: n.x, y: n.y }, base), `${id}: ${g.id} stands on open ground`, `${Math.round(now * 100)}% of the plate under her feet is ${g.what} at cell ${(n.x / C).toFixed(2)},${(n.y / C).toFixed(2)} (allowed 20%; the review's spot ${g.was} has ${Math.round(was * 100)}%)`);
    }
  }
  console.log(`field-town-reach: ${pass + fail} checks, ${fail} FAIL -- against ${URL_}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
