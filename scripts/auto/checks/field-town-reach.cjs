'use strict';
// M16 + m3 (census 2026-11-23), every town, no browser: the town's own walkable authority
// (public/act1-hifi/walkable-polygons.js) with the NPC bodies exactly as the served town.html
// registers them, flooded from the arrival cell on a 2 world-px grid.
//   M16  the hero stops BESIDE an NPC: nowhere reachable lets her feet come within 20 world px of
//        an NPC's feet from the south (the unfixed 7 px disc let them come to 11 px, stacking the
//        two 36 px sprites), nor within 13 px from the side.
//   M16  no path is closed: every point reachable with the old 7 px discs is still reachable,
//        except points inside the new NPC bodies themselves.
//   all  every NPC (shopkeepers too: explorer X04) can be talked to (a reachable point where the town's nearestNpc() names her and,
//        unless she IS a service, no service spot outranks her); the save point and the shop
//        counter can be used; the exit line can be crossed.
//   m3   Port Sapphire's wise woman is one of those NPCs (unfixed: the save point lay under her feet,
//        so the Save pill outranked her from every spot she could be talked to).
// The served files are fetched from PROBE_URL so the same check runs against any build.
//   node scripts/auto/checks/field-town-reach.cjs [townId ...]
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const URL_ = process.env.PROBE_URL || 'http://127.0.0.1:5503/';
const TOWNS = ['greenhollow', 'millbrook', 'portSapphire', 'ironkeep', 'frostwatch', 'hauntedVillage', 'ruinsCamp', 'oasisHaven', 'embersRest', 'cinderwatch', 'lastBastion', 'havensEdge'];
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) pass++; else fail++; console.log(`[${c ? 'PASS' : 'FAIL'}] ${n}${d ? ' -- ' + d : ''}`); };
const get = async p => { const r = await fetch(new URL(p, URL_)); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); };

// The NPC body town.html registers (current mode, i.e. without the qok-f2-old switch).
function bodyFrom(html) {
  const r = /NPC_BLOCK_RADIUS = (?:F2_OLD\('npcbody'\) \? [\d.]+ : )?([\d.]+)/.exec(html);
  const s = /NPC_BODY_SOUTH = (?:F2_OLD\('npcbody'\) \? [\d.]+ : )?([\d.]+)/.exec(html);
  return { r: r ? +r[1] : NaN, south: s ? +s[1] : 0, own: /Array\.isArray\(n\.body\)/.test(html), reach: /npc\.talkReach/.test(html) };
}
(async () => {
  const W = await import(path.join(ROOT, 'public/act1-hifi/walkable-polygons.js'));
  const html = await get('act1-hifi/town.html'), body = bodyFrom(html);
  console.log(`[INFO] NPC body in the served town.html: half-width ${body.r} px, ${body.south} px south of the feet`);
  const want = process.argv.slice(2).length ? process.argv.slice(2) : TOWNS;
  for (const id of want) {
    const T = JSON.parse(await get(`act1-hifi/town/${id}-town.json`)), base = JSON.parse(await get(`act1-hifi/${T.walkable}`));
    const C = T.worldPxPerCell, WORLD = T.cells * C, STEP = 2, N = Math.ceil(WORLD / STEP) + 1, fr = base.actorFootRadius || 0;
    const npcs = T.npcs.map(n => ({ id: n.id, x: n.cell[0] * C, y: n.cell[1] * C, reach: body.reach && n.talkReach ? n.talkReach : 2.1, body: body.own && Array.isArray(n.body) ? n.body : null, note: n.bodyNote }));
    const withBodies = (r, south, own) => ({ ...base, dynamicBlockers: [...(base.dynamicBlockers || []), ...npcs.map(n => { const b = own && n.body ? n.body : [r, south];
      return { id: 'npc-' + n.id, from: { x: n.x, y: n.y }, to: { x: n.x, y: n.y + b[1] }, halfWidth: b[0] }; })] });
    function flood(data) {
      const inside = new Uint8Array(N * N), seen = new Uint8Array(N * N);
      for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) inside[gy * N + gx] = W.isInsideWalkable({ x: gx * STEP, y: gy * STEP }, data) ? 1 : 0;
      const sx = Math.round(T.startCell[0] * C / STEP), sy = Math.round(T.startCell[1] * C / STEP), q = [sy * N + sx];
      if (!inside[q[0]]) { for (let r = 1; r < 6 && !inside[q[0]]; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (inside[(sy + dy) * N + sx + dx]) { q[0] = (sy + dy) * N + sx + dx; break; } }
      seen[q[0]] = 1;
      for (let i = 0; i < q.length; i++) { const k = q[i], x = k % N, y = (k - x) / N;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx; if (seen[nk] || !inside[nk]) continue; if (dx && dy && (!inside[y * N + nx] || !inside[ny * N + x])) continue; seen[nk] = 1; q.push(nk); } }
      return seen;
    }
    const cur = flood(withBodies(body.r, body.south, true)), old = flood(withBodies(7, 0, false));
    // town.html's own prompt rules, replicated (nearestNpc / nearestService)
    const services = [['shop', T.shopCounter], ['save', T.savePoint]].filter(s => Array.isArray(s[1]));
    const nearestNpc = (x, y) => { let b = null; for (const n of npcs) { const dx = x - n.x, dy = y - n.y; if (Math.abs(dx) > C * 1.1 || dy < -C * 0.35 || dy > C * n.reach) continue; const d = Math.hypot(dx, dy); if (!b || d < b.d) b = { n, d }; } return b ? b.n : null; };
    const nearestService = (x, y) => { let b = null; for (const [kind, c] of services) { const dx = x / C - c[0], dy = y / C - c[1]; if (Math.abs(dx) > 1.2 || Math.abs(dy) > 1.2) continue; const d = Math.hypot(dx, dy); if (!b || d < b.d) b = { kind, d }; } return b ? b.kind : null; };
    const talk = {}, svc = {}, minS = {}, minSide = {}, nearAt = {}, nearD = {}; let crossExit = false, lost = 0, lostAt = null;
    const exitY = (T.exit && T.exit.cell ? T.exit.cell[1] : T.startCell[1]) * C, north = T.exit && T.exit.axis ? T.exit.axis === 'north' : (T.exit && T.exit.cell && T.exit.cell[1] < T.cells / 2);
    for (let k = 0; k < N * N; k++) {
      const x = (k % N) * STEP, y = Math.floor(k / N) * STEP;
      if (old[k] && !cur[k]) { const nearBody = npcs.some(n => Math.hypot(x - n.x, y - Math.min(Math.max(y, n.y), n.y + body.south)) <= body.r + fr + STEP * 1.5); if (!nearBody) { lost++; lostAt = lostAt || [+(x / C).toFixed(1), +(y / C).toFixed(1)]; } }
      if (!cur[k]) continue;
      if (north ? y < exitY : y > exitY) crossExit = true;
      const n = nearestNpc(x, y), s = nearestService(x, y);
      if (n) { const isSvc = n.id === 'healer' || n.id === 'shopkeeper'; if (isSvc || !s) talk[n.id] = true; }
      if (s && !(n && (n.id === 'healer' || n.id === 'shopkeeper'))) svc[s] = true;
      for (const m of npcs) { const dx = x - m.x, dy = y - m.y;
        if (dy > 0 && Math.abs(dx) < 6) minS[m.id] = Math.min(minS[m.id] ?? 1e9, Math.hypot(dx, dy));
        if (Math.abs(dx) <= C * 1.1 && dy >= -C * 0.35 && dy <= C * m.reach && Math.hypot(dx, dy) < (nearD[m.id] ?? 1e9)) { nearD[m.id] = Math.hypot(dx, dy); nearAt[m.id] = [x, y]; }
        if (Math.abs(dy) < 4) minSide[m.id] = Math.min(minSide[m.id] ?? 1e9, Math.abs(dx)); }
    }
    for (const n of npcs) {
      const isSvc = n.id === 'healer' || n.id === 'shopkeeper';
      // every person, shopkeepers included (explorer X04), must have a reachable spot where the prompt names them
      ok(talk[n.id], `${id}: ${n.id} can be talked to`, talk[n.id] ? (n.reach !== 2.1 ? `talk band ${n.reach} cells (across a counter)` : '') : 'no reachable spot where the talk prompt names her');
      const s = minS[n.id], d = minSide[n.id], needS = n.body ? 13 : 20;
      if (n.body) console.log(`[INFO] ${id}: ${n.id} has her own body ${JSON.stringify(n.body)}: ${String(n.note || '').slice(0, 120)}`);
      ok((s === undefined || s >= needS) && (d === undefined || d >= 13), `${id}: hero stops beside ${n.id}`, `closest feet from the south ${s === undefined ? 'n/a' : s.toFixed(1)} px (need ${needS}), from the side ${d === undefined ? 'n/a' : d.toFixed(1)} px (need 13)`);
      // walking right up to her (the reachable spot of her talk band closest to her), the prompt must be HER (m3)
      if (nearAt[n.id] && !isSvc) { const [x, y] = nearAt[n.id], nn = nearestNpc(x, y), ss = nearestService(x, y);
        ok(nn && nn.id === n.id && !ss, `${id}: walking right up to ${n.id} offers her talk`, `at cell ${(x / C).toFixed(1)},${(y / C).toFixed(1)} the prompt is ${ss ? ss + ' (service)' : nn ? 'talk to ' + nn.id : 'none'}`); }
    }
    for (const [kind] of services) ok(svc[kind], `${id}: the ${kind} spot can be used`, svc[kind] ? '' : 'no reachable spot where the prompt names it');
    ok(crossExit, `${id}: the exit line can be crossed`);
    ok(lost === 0, `${id}: no path closed by the NPC bodies`, lost ? `${lost} grid points lost away from any NPC, first at cell ${lostAt}` : '');
  }
  console.log(`field-town-reach: ${pass + fail} checks, ${fail} FAIL -- against ${URL_}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
