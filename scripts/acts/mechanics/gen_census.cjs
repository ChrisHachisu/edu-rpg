#!/usr/bin/env node
/* Headless per-floor census of the SHIPPED generator Ap() (lifted verbatim by
 * scripts/acts/dungeons/extract_bundle_generator.py), called with loadMap's exact arguments.
 * Reports, per floor, every mechanic's data and whether it is usable, plus the engine's own
 * detectMirrorRooms() (copied verbatim from WorldMapScene) run on the result.
 *   node gen_census.cjs <apmod.js (Ap exported, no driver)> <defs.json> [out.json]
 */
const fs = require('fs');
const { Ap } = require(process.argv[2]);
const defs = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
console.log = (() => { const o = console.log; return (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[TRIPWIRE]')) return; o(...a); }; })();

// verbatim logic of WorldMapScene.detectMirrorRooms (bundle), on a plain grid
function detectMirrorRooms(md) {
  const x = [], T = new Set;
  for (let i = 1; i < md.length - 1; i++) for (let o = 1; o < md[0].length - 1; o++) {
    const u = `${o},${i}`; if (T.has(u)) continue; const m = md[i][o]; if (m === 1 || m === 5) continue;
    const C = [[o, i]]; T.add(u); let t = o, f = o, S = i, h = i, l = 0;
    for (; C.length > 0 && l < 500;) { const [r, c] = C.shift(); l++;
      for (const [s, d] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const v = r + s, y = c + d, p = `${v},${y}`;
        if (v < 0 || v >= md[0].length || y < 0 || y >= md.length || T.has(p)) continue;
        const g = md[y][v]; g === 1 || g === 5 || (T.add(p), C.push([v, y]), t = Math.min(t, v), f = Math.max(f, v), S = Math.min(S, y), h = Math.max(h, y)); } }
    const a = f - t + 1, e = h - S + 1; a >= 4 && e >= 4 && l >= 12 && x.push({ x: t, y: S, w: a, h: e });
  }
  return x.filter((i, o) => o % 2 === 1);
}

const out = {};
const _log = console.log;
for (const [id, d] of Object.entries(defs)) {
  for (let f = 1; f <= d.floors; f++) {
    const u = d.conns > 1 && d.floors === 1, C = d.conns > 1 && d.floors > 1 && f === d.floors;
    const r = Ap(100, 100, id.charCodeAt(0) * 251, f, d.floors, u, C, d.castle, d.mechanic || undefined, id);
    const md = r.map, hist = {};
    for (const row of md) for (const v of row) hist[v] = (hist[v] || 0) + 1;
    const at = (x, y) => md[y]?.[x];
    const walk = md.flat().filter(v => v !== 1 && v !== 5).length;
    const rec = {
      walk, doors15: hist[15] || 0, wind19: hist[19] || 0, crystal20: hist[20] || 0, pillars23: hist[23] || 0,
      hidden17: hist[17] || 0, torch24: hist[24] || 0, lava5: hist[5] || 0, ice25: hist[25] || 0, stop28: hist[28] || 0,
      sink27: hist[27] || 0, pit26: hist[26] || 0, portal29: hist[29] || 0, spike30: hist[30] || 0, wire31: hist[31] || 0,
      chests4: hist[4] || 0, save14: hist[14] || 0, sign18: hist[18] || 0,
      keyChests: (r.keyChests || []).map(k => [k.x, k.y, at(k.x, k.y)]),
      hiddenRoomChests: (r.hiddenRoomChests || []).length, mimics: (r.mimicChests || []).length,
      patrols: (r.patrolWaypoints || []).length, windDir: r.windCorridorDir || null,
      portalPairs: (r.portalPairs || []).length, correctExitY: r.correctExitY ?? null,
      goldenChest: r.goldenChestPos ? [r.goldenChestPos.x, r.goldenChestPos.y] : null,
      pillarSeq: r.pillarSequence ? r.pillarSequence.length : null,
      mirrorRooms: d.mechanic === 'mirror' ? detectMirrorRooms(md).length : null,
    };
    out[`${id}-f${f}`] = rec;
  }
}
if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 0));
for (const [k, r] of Object.entries(out)) {
  const bits = Object.entries(r).filter(([n, v]) => v && !(Array.isArray(v) && !v.length) && n !== 'walk').map(([n, v]) => `${n}=${JSON.stringify(v)}`);
  _log(k.padEnd(26), `walk=${r.walk}`, bits.join(' '));
}
