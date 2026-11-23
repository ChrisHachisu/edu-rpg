// Mechanic adapters for the child pilot (kid.js). Injected after kid.js.
// An adapter tells the child WHAT IS VISIBLE (visible(cam): the render state that drives the cue,
// limited to the camera view), which route cells belong to a hazard UNIT (unitAt), whether a
// unit LOOKS dangerous in a perceived snapshot (danger), and counts failures (fails: {kind: n}).
// The failure counters are read only to score a trial (never by the child's gate).
(() => {
  const D = () => window.__QOK_DNG2__, ctx = () => D().ctx(), T = 48;
  const inCam = (cam, cx, cy, m = 0) => !cam || (cx * T + T > cam[0] - m && cx * T < cam[2] + m && cy * T + T > cam[1] - m && cy * T < cam[3] + m);
  const A = {};
  // ------------------------------------------------------------ Storm Nest: gust walkways
  A['gust-walkways'] = () => {
    const S = ctx().state;
    return {
      commit: true,          // once on a lane she keeps going (stopping mid-lane is the worst place)
      cue: 'lane warn: window glow + chevrons + walkway cells pulse amber; gust: white streaks',
      visible(cam) { const out = {}; for (const L of S.lanes || []) { const on = L.cells.some(c => inCam(cam, c[0], c[1])) || (L.win && inCam(cam, L.win.a.x, L.win.a.y));
        out[L.id] = on ? L.state : 'unseen'; } return out; },
      unitAt(cx, cy) { const L = (S.cell || {})[cx + ',' + cy]; return L ? 'lane' + L.id : null; },
      stateOf(vis, unit) { return vis ? vis[unit.slice(4)] : 'unseen'; }, bad: ['gust', 'warn'],
      fails() { return { 'blown off': (S.falls || 0) + (S.blown ? 1 : 0) }; },
      busy() { return ctx().state === S && !!S.blown; },
    };
  };
  // ------------------------------------------------------------ Stormreach Spire: storm terrace
  A['storm-terrace'] = () => {
    const c = ctx(), S = c.state, lg = c.mod.logic;
    return {
      commit: false,
      cue: 'the stones of the next group glow (pulsing tint) for glowTicks before the bolt; bolt + white flash on strike',
      visible(cam) { const M = S.M; if (!M || !S.spr) return null; const out = {};
        for (let g = 0; g < M.G; g++) { const seen = M.cells[g].some(q => inCam(cam, q[0], q[1]));
          const glowA = S.spr.glow[g].alpha, hitA = S.spr.hit[g].alpha;
          out[g] = !seen ? 'unseen' : hitA > 0 ? 'strike' : glowA > 0.06 ? 'glow' : 'calm'; }   // glow sprite alpha is what the eye sees
        return out; },
      unitAt(cx, cy) { const M = S.M; if (!M) return null; const g = lg.groupAt(M, cx, cy); return g >= 0 ? 'g' + g : null; },
      stateOf(vis, unit) { return vis ? vis[unit.slice(1)] : 'unseen'; }, bad: ['glow', 'strike'],
      fails() { return { 'struck (knocked back)': S.struck || 0 }; },
      mild: ['struck (knocked back)'],   // a strike costs 10% and a tile: she gets up and walks on (the attempt still counts as failed)
    };
  };
  // ------------------------------------------------------------ Magma Tunnels: crust bridges
  A['crust-bridges'] = () => {
    const c = ctx(), S = c.state;
    const cellB = {}; (S.L || []).forEach((L, i) => L.b.cells.forEach(q => { cellB[q[0] + ',' + q[1]] = i; }));
    return {
      commit: true,
      cue: 'crust tiles: solid (walkable) / cracks glow red (warn, still walkable) / sink away (molten)',
      visible(cam) { if (!S.spr) return null; const out = {};
        (S.L || []).forEach((L, i) => { const seen = L.b.cells.some(q => inCam(cam, q[0], q[1])); const e = S.spr[i];
          out[i] = !seen ? 'unseen' : e.a < 0.5 ? 'molten' : e.g > 0.05 ? 'warn' : 'crust'; });
        return out; },
      unitAt(cx, cy) { const i = cellB[cx + ',' + cy]; return i === undefined ? null : 'b' + i; },
      stateOf(vis, unit) { return vis ? vis[unit.slice(1)] : 'unseen'; }, bad: ['molten', 'warn'],
      fails() { return { 'caught on melting crust (put back on bank)': S.caught || 0 }; },
      mild: ['caught on melting crust (put back on bank)'],
    };
  };

  // ------------------------------------------------------------ Demon Barracks: guard lanterns
  A['guard-lanterns'] = () => {
    const c = ctx(), S = c.state, lg = c.mod.logic, M = S.M;
    // cells a lantern can ever light (the child learns where the halls are): the union over the beat
    const ever = {}; for (const g of M.guards) for (let t = 0; t < M.period; t++) for (const k in lg.litBy(c, M, g, t)) ever[k] = 1;
    const near = (lit, x, y) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (lit[(x + dx) + ',' + (y + dy)]) return true; return false; };
    return {
      commit: false, look: 2,
      cue: 'the lantern light drawn on the floor (the lit cells ARE the trigger) + the guard sprite walking its beat',
      visible(cam) { if (!S.spr || S.drawn < 0) return null; const lit = {}; let any = false;
        const gp = []; const a = ((Math.floor(S.tick) % M.period) + M.period) % M.period;
        for (const g of M.guards) { if (g.gone) continue; const L = lg.litBy(c, M, g, S.drawn); for (const k in L) { const q = k.split(','); if (inCam(cam, +q[0], +q[1])) { lit[k] = 1; any = true; } }
          const p = g.seq[a]; if (inCam(cam, p[0], p[1])) gp.push([p[0], p[1]]); }   // the guard sprite where it is drawn
        return { lit, gp }; },
      unitAt(cx, cy) { return ever[cx + ',' + cy] ? 'c' + cx + ',' + cy : null; },
      // a child keeps clear of the light AND of the demon itself (3 cells): she can see it walking toward her
      stateOf(vis, unit) { if (!vis) return 'unseen'; const q = unit.slice(1).split(','), x = +q[0], y = +q[1];
        return near(vis.lit, x, y) ? 'lit' : (vis.gp || []).some(p => Math.max(Math.abs(p[0] - x), Math.abs(p[1] - y)) <= 3) ? 'guard near' : 'dark'; }, bad: ['lit', 'guard near'],
      threat(vis, here) { return !!vis && (near(vis.lit, here[0], here[1]) || (vis.gp || []).some(p => Math.max(Math.abs(p[0] - here[0]), Math.abs(p[1] - here[1])) <= 1)); },
      fails() { return { 'caught by a guard (battle)': S.battles || 0 }; },
      busy() { return ctx().state === S && !!S.busy; },
      naive: true,   // a dark hall looks like a dark hall: the light is the cue, not knowledge of the beat
    };
  };
  // ------------------------------------------------------------ Shadow Cave: shadows freeze while crystals shine
  A['shadow-freeze'] = () => {
    const c = ctx(), S = c.state, P = S.P, TICK = 185;
    const zone = {}; for (const sh of c.mechanic.shadows || []) for (const q of sh.track) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) zone[(q[0] + dx) + ',' + (q[1] + dy)] = 'sh' + sh.id;
    return {
      commit: true,
      cue: 'crystals shine (cave lit, shadows grey and still) / flicker for the last second of each phase / dim (purple 3x3 ring round each prowling shadow)',
      visible(cam) { if (!S.P) return null; const cy = Math.floor(S.t / TICK), per = P.dimTicks + P.shineTicks, pos = (S.t / TICK) - Math.floor(S.t / TICK / per) * per;
        const dim = pos < P.dimTicks, left = (dim ? P.dimTicks - pos : per - pos) * TICK, flick = left < 1000;   // the flicker is drawn from these same numbers
        const sh = S.shadows.filter(s => inCam(cam, s.cx, s.cy)).map(s => [s.cx, s.cy]);
        return { light: dim ? (flick ? 'dim-flicker' : 'dim') : (flick ? 'shine-flicker' : 'shine'), sh }; },
      unitAt(cx, cy) { return zone[cx + ',' + cy] || null; },
      stateOf(vis, unit) { return vis ? vis.light : 'unseen'; }, bad: ['dim', 'dim-flicker', 'shine-flicker'],
      fails() { return { 'caught by a shadow (battle)': S.battles || 0 }; },
      busy() { return ctx().state === S && !!S.pending; },
    };
  };
  // ------------------------------------------------------------ Sunken Temple: maze hunter (no gate: she just walks her route)
  A['maze-hunter'] = () => { const S = ctx().state; return {
      commit: true, cue: 'guardian eyes glow when it wakes; it walks the halls toward her',
      visible() { return {}; }, unitAt() { return null; }, stateOf() { return 'calm'; }, bad: [],
      fails() { return { 'caught by the guardian (battle)': S.battles || 0 }; }, busy() { return ctx().state === S && !!S.busy; } }; };
  // ------------------------------------------------------------ Bandit Hideout: trip wires (glint / pill) and hidden spike patches
  A['tripwires-and-spikes'] = () => {
    const c = ctx(), S = c.state; const cellW = {};
    (S.wires || []).forEach(G => G.cells.forEach(q => { cellW[q[0] + ',' + q[1]] = G; }));
    return {
      commit: false, naive: true,
      cue: 'a wire glints for 0.52 s every 3.2 s; within 2 tiles it shows a little more and the "Cut trip wire" pill appears; spike patches are a shade off the floor',
      visible(cam) { const out = {}; const pill = (() => { const e = document.getElementById('a1mInteract'); return !!(e && e.classList.contains('a1m-show')); })();
        for (const G of S.wires || []) { if (!G.live) { out[G.id] = 'cut'; continue; } const on = G.cells.some(q => inCam(cam, q[0], q[1]));
          const ph = (S.t + G.id * 870) % 3200; out[G.id] = !on ? 'unseen' : (ph < 520 || G.show > 0.5) ? 'glint' : 'hidden'; }
        out.pill = pill; return out; },
      unitAt(cx, cy) { const G = cellW[cx + ',' + cy]; return G ? 'w' + G.id : null; },
      stateOf(vis, unit) { return vis ? vis[unit.slice(1)] : 'unseen'; }, bad: ['glint'],
      act(vis) { return !!(vis && vis.pill); },
      fails() { return { 'tripped a wire (ambush battle)': S.battles || 0, 'spikes (thrown back)': S.hits || 0 }; },
      mild: ['spikes (thrown back)'], mildPass: true,   // hidden spikes: the first visit costs a small hit by design; a pass here = no ambush
      avoid() { const out = []; for (const r of S.patches || []) { if (!r.up) continue; for (let x = r.x0 / 48 - 1; x < r.x1 / 48 + 1; x++) for (let y = r.y0 / 48 - 1; y < r.y1 / 48 + 1; y++) out.push([x, y]); } return out; },
      busy() { return ctx().state === S && !!(S.pending || S.push); },
    };
  };

  // ------------------------------------------------------------ Void Rift: drifting blocks (no fall possible: time + stuck only)
  A['drifting-blocks'] = () => {
    const c = ctx(), S = c.state, T = 48;
    // platforms along the corridor: 'L' (left ledge), lane j, 'R' (right ledge); a route cell inside lane j's columns is unit g<i>:<j>,
    // the first ledge cell right/left of the lanes is unit g<i>:R / g<i>:L. danger = no visible join from the platform she is coming from.
    const laneOf = (cx, cy) => { for (let i = 0; i < S.gates.length; i++) { const G = S.gates[i]; for (let j = 0; j < G.lanes.length; j++) { const L = G.lanes[j]; if (cx * T >= L.x0 && cx * T < L.x1 && cy * T >= L.top && cy * T < L.bot) return [i, j]; }
      const a = G.lanes[0], b = G.lanes[G.lanes.length - 1]; if (Math.abs(cy - G.cy) <= 1) { if (cx * T === a.x0 - T) return [i, 'L']; if (cx * T === b.x1) return [i, 'R']; } } return null; };
    let dir = 1;   // +1: the route crosses left to right
    return {
      commit: false,
      cue: 'the block slides up and down its lane; a pulsing light strip marks each edge that is joined right now',
      setRoute(cells) { const xs = cells.filter(q => laneOf(q[0], q[1])).map(q => q[0]); if (xs.length > 1) dir = xs[xs.length - 1] >= xs[0] ? 1 : -1; },
      visible(cam) { const out = {}; for (let i = 0; i < S.gates.length; i++) for (const J of S.gates[i].joins || []) { const e = J.edge; if (!inCam(cam, Math.floor(e[0] / T), Math.floor(e[1] / T), 48)) continue;
          const n = S.gates[i].lanes.length; out[i + ':' + (J.kind === 'ledgeL' ? 'L-0' : J.kind === 'ledgeR' ? (n - 1) + '-R' : J.kind === 'block' ? J.lane + '-' + (J.lane + 1) : 'islet')] = 1; } return out; },
      unitAt(cx, cy) { const q = laneOf(cx, cy); return q ? 'g' + q[0] + ':' + q[1] : null; },
      stateOf(vis, unit) { if (!vis) return 'unseen'; const [gi, p] = unit.slice(1).split(':'), n = S.gates[+gi].lanes.length;
        let key; if (p === 'L' || p === 'R') key = p === 'R' ? (n - 1) + '-R' : 'L-0';
        else { const j = +p, prev = dir > 0 ? j - 1 : j + 1; key = prev < 0 ? 'L-0' : prev >= n ? (n - 1) + '-R' : Math.min(j, prev) + '-' + Math.max(j, prev); }
        if (p === 'L' && dir > 0) return 'joined'; if (p === 'R' && dir < 0) return 'joined';   // the ledge she starts from
        return vis[gi + ':' + key] ? 'joined' : 'apart'; }, bad: ['apart'],
      fails() { return {}; },
    };
  };

  // ------------------------------------------------------------ Demon Castle: mirror rooms (left/right swapped inside; pits; 3-wide bridges; knights)
  A['mirror-rooms'] = () => {
    const c = ctx(), S = c.state, lg = c.mod.logic, T = 48, M = S.M;
    const ring = {}; for (const k of (M && M.knights) || []) for (const q of k.ring) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ring[(q[0] + dx) + ',' + (q[1] + dy)] = 1;
    return {
      commit: false, look: 2,
      cue: 'mirror frame shimmer at the door + a left-right badge over her head while the swap is on; pits are painted holes; the knight is a walking sprite',
      visible(cam) { const badge = !!(S.spr && S.spr.badge && S.spr.badge.alpha > 0.5);
        const kn = ((M && M.knights) || []).map(k => lg.knightAt(k, S.tick)).filter(q => inCam(cam, Math.floor(q.x / T), Math.floor(q.y / T))).map(q => [q.x, q.y]);
        return { badge, kn }; },
      // she mirrors her own left/right as soon as she SEES the badge (and stops mirroring when she sees it go)
      xform(vx, vy, vis) { return (vis && vis.badge) ? [-vx, vy] : [vx, vy]; },
      unitAt(cx, cy) { return ring[cx + ',' + cy] ? 'k' + cx + ',' + cy : null; },
      stateOf(vis, unit) { if (!vis) return 'unseen'; const q = unit.slice(1).split(','), x = +q[0] * T + 24, y = +q[1] * T + 24;
        return vis.kn.some(k => Math.abs(k[0] - x) < 1.6 * T && Math.abs(k[1] - y) < 1.6 * T) ? 'knight' : 'clear'; }, bad: ['knight'],
      threat(vis, here) { if (!vis) return false; const x = here[0] * T + 24, y = here[1] * T + 24; return vis.kn.some(k => Math.abs(k[0] - x) < 1.3 * T && Math.abs(k[1] - y) < 1.3 * T); },
      naive: true,
      fails() { return { 'fell into a pit (back at the mirror door)': S.falls || 0, 'caught by a knight (battle)': S.battles || 0 }; },
      busy() { return ctx().state === S && !!(S.fall || S.busy || S.hold > 0); },
    };
  };
  // a unit the child KNOWS is a hazard (route learned) but cannot see yet counts as "stop and look"
  const finish = a => { a.danger = (vis, unit) => { const s = a.stateOf(vis, unit); return (s === 'unseen' && !a.naive) || a.bad.indexOf(s) >= 0; }; return a; };
  window.__KIDA = { make: id => (A[id] ? finish(A[id]()) : null), has: id => !!A[id], ids: () => Object.keys(A) };
})();
