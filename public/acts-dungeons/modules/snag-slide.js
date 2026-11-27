/* Acts 2-5 dungeons: wall glide over small lips (day 4, track S, 2026-11-27; made safe the same day, track S2).

   WHAT WAS WRONG. The dungeon mover (dq-tiles.js a1mStep) collides her SOLES with the painted walk mask and,
   when a step is refused, slides along the wall by a1mSlide: the step minus its part INTO the wall, the wall's
   direction read from the mask's distance field at the pixel she stands on. Walking straight ALONG a wall that
   field reads "the wall is exactly beside me", so there is nothing to subtract, a1mSlide answers "no slide",
   the two single-axis retries are the same refused step, and she stops dead. Every wall that is not perfectly
   straight does this to a hero who hugs it: a 1 px step in the mask is enough (static census, day 4: 43,062
   places of 24 px or less on the 107 floors; the 31 Demon Castle doorway posts of day 3 were the tallest).

   WHAT THIS DOES. It never moves her and never answers a collision question. It only BENDS THE STICK, through
   the mechanic hook the mover already offers (mod.input), for one frame at a time:
     * one frame after a push produced no movement at all, it looks for a LIP: painted rock ahead, and within
       MAXLIP px to one side a spot from which the way ahead is open (the whole sideways path and the spot are
       painted floor she may stand on);
     * while the same push is held it turns the stick the smallest amount (15, 30 ... 90 degrees, toward that
       side) that gives a free step, at no more than the speed she would have had, until the way is straight
       again. Her facing stays the one she pushed.

   THREE GUARANTEES, EACH BY CONSTRUCTION (track S2; bend() below is the only place a bent stick is made):
   1. A BENT FRAME IS A STRAIGHT WALK THE GLIDE HAS ALREADY CHECKED. bend() works out the very substeps the mover
      will take with the bent stick (the mover's own arithmetic and frame time, ctx.snagDt) and asks the mover's
      own test (D.free = a1mFree) about each. The mover then accepts every one, so it never slides on a bent
      frame, and dq-tiles.js a1mStep stops a bent frame at a refused substep instead of sliding (one marked line).
      So where a bent frame puts her is known before the stick is bent.
   2. SIDEWAYS IS BOUNDED. Sideways means across HER PUSH (the stick she holds, not her line of travel). Every
      bent frame's sideways travel is charged to an allowance of BOUND = 28 px before the stick is bent; a bend
      that would overdraw it is not made, and she stops as she did before the glide existed. The allowance comes
      back only as she walks on her own, un-bent: REFILL px for each px gained along her push. So over any
      stretch of one press: sideways travel on bent frames <= 28 px + 0.5 x (her own un-bent advance), and
      against one obstacle (no advance) it is 28 px at the very most. 28 = the tallest lip the glide is for
      (24 px, the census class) + one 60 fps frame of walking (4.33 px).
      The line a lip is looked for on comes from the stick alone: the push itself, or an axis the stick leans on.
      Her past movement is never used (the first version armed on her last heading, which after the mover's
      own slide round a corner pointed into the wall: she then walked along a flat wall for as long as the
      stick was held). A flat wall has no lip: no bend, no sideways movement at all.
   3. A BENT FRAME REACHES NO TRIGGER. Every checked substep is judged by the floor plan's own tables (table() below):
      * her SOLES must be on plain floor (terrain '.', or rock where the paint lets her soles overlap a wall cell;
        in no mechanic zone; not on or next to anything the plan names), or stay in the cell they are in already,
        and that only where hazards are judged per cell (a guard hall, a storm cell, a gust lane, a shadow's run,
        the cell beside a chest ...): the same cell is the same trigger state. They never enter another cell that
        is not plain, and the glide does not bend at all while her soles are in a cell that is special or named
        (a wire, a plate, a pad, spikes, ice, a pit, stairs, a crystal ...), where a trigger can be smaller than the cell;
      * her SPRITE CENTRE (the cell the engine's stairs, exits and per-cell work run on) must stay in its cell or
        enter one that is neither special terrain nor named by the plan.
      The same rule is put to the OPENING a lip is recognised by (lip() below): the glide does not set out for a
      spot it would not be allowed to bend her onto. So it never nudges her toward a corner that lies in another
      hazard cell and leaves the mover's own slide to carry her round it (the Demon Barracks pillar).
      Elsewhere the glide does not bend and the mover's old behaviour stands. No mechanic module is asked or edited;
      a floor without a readable plan gets no bends at all.

   WHAT IT NEVER DOES. A wall without an opening within MAXLIP px stays a stop. A step is only bent onto painted
   floor that the mover also allows (D.free AND ctx.maskFree): never onto a spot a mechanic opened (a pit's lip,
   a bridge, a breach) and never past anything a mechanic or a prop tile refuses (blocks, levers, gates, doors,
   chests, signs, crystals, the boss): those are not "rock ahead", so walking into them is untouched, bump and all.

   ACT 1 (Whispering Woods Cave, Sunken Cellar, Misty Grotto, Coastal Reef) has no mechanic hook: there the mover
   itself (dq-tiles.js a1mSnagBend, a marked block at a1mStep) asks this file's glide, the same way.

   Switch: localStorage 'qok-snag-slide' = '0' restores the mover's own behaviour (nothing is wrapped).
   The Demon Castle doorway fix of day 3 (mirror-rooms.js, 'qok-door-lips') is independent and stays; with that
   switch at '0' the glide leaves the doorway posts alone too, so it still restores the old stop there.
   Check: scripts/auto/checks/snags.cjs. Census and method: scripts/auto/snags/. */
(function () {
  'use strict';
  var D = window.__QOK_DNG2__; if (!D || !D.register || window.__QOK_SNAG__) return;
  var OFF = (function () { try { return window.localStorage.getItem('qok-snag-slide') === '0'; } catch (e) { return false; } })();
  var MAXLIP = 26, STEP = 6, SPEED = 260, SLOW = 0.5, SAME = 0.94, TILE = 48, REACH = 24;
  var BOUND = 28, REFILL = 0.5;                                              // guarantee 2: px sideways per obstacle; px given back per px of her own advance
  var TURNS = [15, 30, 45, 60, 75, 90].map(function (d) { var r = d * Math.PI / 180; return { c: Math.cos(r), s: Math.sin(r) }; });
  var PROP = { 4: 1, 5: 1, 7: 1, 14: 1, 18: 1, 23: 1, 28: 1 };              // the mover's own object tiles (A1M_PROP)
  var stats = { armed: 0, bent: 0, failed: 0, capped: 0, unplain: 0 };
  var API = window.__QOK_SNAG__ = { version: 2, on: !OFF, stats: stats, wrapped: {}, MAXLIP: MAXLIP, BOUND: BOUND, REFILL: REFILL,
    state: function () { var c = D.ctx && D.ctx(); return c && c.__snag ? c.__snag : null; } };
  if (OFF) return;

  function speed() { return (typeof window.__A1_DNG_SPEED__ === 'number') ? window.__A1_DNG_SPEED__ : SPEED; }
  // the mover's facing rule (a1mStep): keep the axis she faces until the other leads by 20%
  function facing(ux, uy, dir) { var ax = Math.abs(ux), ay = Math.abs(uy), hz = (dir === 1 || dir === 2), useX = hz ? (ax * 1.2 >= ay) : (ax > ay * 1.2); return useX ? (ux > 0 ? 2 : 1) : (uy > 0 ? 0 : 3); }

  // ---- guarantee 3: the floor's cells, from the plan alone (built once per floor) ----------------------------------
  // CORE: the cell is special terrain or is named by the plan (an asset, a mechanic object, any cell in the mechanic's
  //       own data, a zone that is not just a room). Its trigger may be smaller than the cell (a wire's line, a plate's
  //       inset, a portal pad, spikes, a pit's lip): the glide never bends her while her soles are in one.
  // RING: one of the 8 cells round a named cell (a shadow's reach, the cell she opens a chest or reads a sign from).
  //       Stairs and exit mouths have no ring: they act on the cell her sprite centre enters, nothing else.
  // ZONE: floor whose hazard is judged by the CELL her soles are in, read in each module's own test: a room-like zone
  //       (guard hall light, mirror room, forest room, shadow run ...), a storm cell 'z' (storm-terrace.js groupAt of her
  //       sole cell), a gust lane cell 'q' (gust-walkways.js st.cell of her sole cell), a shadow's run (shadow-freeze.js:
  //       cells from the shadow's cell), a glyph room's entry / exit strip (glyph-plates.js: only where a wrong plate puts
  //       her back). In a RING or ZONE cell a bend may move her inside the cell she is already in, never into another.
  // Anything not known to be per-cell is CORE. Everything the plan names is taken at its widest reading: a pair of
  // numbers is a cell, four numbers are a rectangle (a `rect` is an area x0,y0,x1,y1, room-like; any other four are read
  // both as x0,y0,x1,y1 and as x,y,w,h), a grid of strings the size of the floor is a cell map. A wrong reading can only
  // mark an innocent cell: the glide then leaves that cell alone.
  var CORE = 1, RING = 2, ZONE = 4, NORING = { stairsUp: 1, stairsDown: 1, mouth: 1, mouth2: 1 };
  var ROOMLIKE = { guardHall: 1, everLit: 1, shadowRun: 1, mirrorRoom: 1, forgeHall: 1, room: 1, puzzleChamber: 1, knightLoop: 1, strikeGroup: 1, gustLane: 1 };   // zone kinds
  var PERCELL_TERRAIN = { z: 1, q: 1 };                                                                     // terrain letters: storm cell, gust lane
  var PERCELL_KEY = { run: 1, entryStrip: 1, exitStrip: 1, strikeGroups: 1, landsAt: 1 };                   // cell lists in a mechanic's data (landsAt: only where a gust drops her)
  function table(ctx) {
    var plan = ctx.plan, T = ctx.__snagTab;
    if (T && T.plan === plan) return T;
    T = ctx.__snagTab = { plan: plan, W: 0, H: 0, t: null };
    try {
      var rows = plan && (plan.terrain || plan.rows); if (!rows || !rows.length || typeof rows[0] !== 'string') return T;
      var H = rows.length, W = rows[0].length, t = new Uint8Array(W * H), x, y, i, ch;
      var mark = function (cx, cy, bit) { if (cx === (cx | 0) && cy === (cy | 0) && cx >= 0 && cy >= 0 && cx < W && cy < H) t[cy * W + cx] |= bit; };
      var cell = function (cx, cy, sz, noRing) { if (typeof cx !== 'number' || typeof cy !== 'number' || cx !== (cx | 0) || cy !== (cy | 0)) return; sz = (typeof sz === 'number' && sz >= 1 && sz <= 8) ? (sz | 0) : 1;
        for (var b = -1; b <= sz; b++) for (var a = -1; a <= sz; a++) { var inside = a >= 0 && b >= 0 && a < sz && b < sz; if (inside) mark(cx + a, cy + b, CORE); else if (!noRing) mark(cx + a, cy + b, RING); } };
      var rect = function (x0, y0, x1, y1, bit, ring) { if (x1 < x0 || y1 < y0 || x1 - x0 > 96 || y1 - y0 > 96) return; var p = ring ? 1 : 0;
        for (var b = y0 - p; b <= y1 + p; b++) for (var a = x0 - p; a <= x1 + p; a++) mark(a, b, (a >= x0 && a <= x1 && b >= y0 && b <= y1) ? bit : RING); };
      var nums = function (a) { for (var j = 0; j < a.length; j++) if (typeof a[j] !== 'number') return false; return true; };
      var walk = function (v, depth, key) {                                  // anything the plan names
        if (!v || depth > 8) return; var j, k2;
        if (Array.isArray(v)) {
          if (v.length === 2 && nums(v)) { if (PERCELL_KEY[key] === 1) mark(v[0], v[1], ZONE); else cell(v[0], v[1], 1); return; }
          if (v.length === 4 && nums(v)) { if (key === 'rect') rect(v[0], v[1], v[2], v[3], ZONE, false);       // an area (a hall, a room): its special cells are marked by their terrain
            else { rect(v[0], v[1], v[2], v[3], CORE, true); rect(v[0], v[1], v[0] + v[2] - 1, v[1] + v[3] - 1, CORE, true); } return; }
          if (v.length === H && typeof v[0] === 'string' && v[0].length === W) { for (j = 0; j < H; j++) for (k2 = 0; k2 < W; k2++) { var c2 = String(v[j]).charAt(k2); if (c2 !== '.' && c2 !== '#' && c2 !== ' ') mark(k2, j, PERCELL_KEY[key] === 1 ? ZONE : CORE); } return; }
          for (j = 0; j < v.length; j++) walk(v[j], depth + 1, key); return; }
        if (typeof v === 'object') {
          if (typeof v.x === 'number' && typeof v.y === 'number') cell(v.x, v.y, v.size, NORING[v.kind] === 1);
          for (k2 in v) if (k2 !== 'params' && v[k2] && typeof v[k2] === 'object') walk(v[k2], depth + 1, k2); }
      };
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) { ch = String(rows[y]).charAt(x); if (ch !== '.' && ch !== '#') t[y * W + x] |= (PERCELL_TERRAIN[ch] === 1 ? ZONE : CORE); }   // special terrain (and Act 1's asset letters)
      var zs = plan.zones || [], z, r, cs, bit;
      for (i = 0; i < zs.length; i++) { z = zs[i]; if (!z) continue; r = z.rect; cs = z.cells; bit = ROOMLIKE[z.kind] === 1 ? ZONE : CORE;   // a zone: its own cells, no ring (its rectangle is its edge)
        if (r && r.length === 4 && nums(r)) rect(r[0], r[1], r[2], r[3], bit, false);
        if (cs && cs.length) for (var q = 0; q < cs.length; q++) if (cs[q] && cs[q].length === 2) mark(cs[q][0], cs[q][1], bit);
        for (var zk in z) if (zk !== 'rect' && zk !== 'cells' && z[zk] && typeof z[zk] === 'object') walk(z[zk], 1, zk); }
      walk(plan.assets, 0, ''); walk(plan.mech, 0, ''); walk(plan.mechanic, 0, '');
      T.W = W; T.H = H; T.t = t;
    } catch (e) { T.t = null; if (window.__DQ_DEBUG__) console.log('snag table ' + e); }
    return T;
  }
  function flags(T, cx, cy) { return (T && T.t && cx >= 0 && cy >= 0 && cx < T.W && cy < T.H) ? T.t[cy * T.W + cx] : 255; }   // no plan, or off the plan: nothing is plain

  // ---- one pushed frame's facts, set once by glide(); the helpers below read them (no closure is built per frame) ----
  var CTX = null, SS = null, SC = null, INP = null, TAB = null, FREE = null, X = 0, Y = 0, UX = 0, UY = 0, MAG = 1, DT = 16.7, TOTAL = 0, N = 1, ST = 0, FD = 31;
  var CX0 = 0, CS0 = 0, CC0 = 0;                                             // the cells her soles (CX0,CS0) and her sprite centre (CX0,CC0) are in as the frame begins
  function floor(px, py) { return CTX.maskFree(px, py + FD) && FREE(px, py); }             // painted floor the mover allows too
  function run(rx, ry) { for (var j = 1; j <= N; j++) if (!floor(X + rx * ST * j, Y + ry * ST * j)) return false; return true; }
  function pushFree() { for (var j = 1; j <= N; j++) if (!FREE(X + UX * ST * j, Y + UY * ST * j)) return false; return true; }   // her own straight step: the mover's word alone
  function rock(ex, ey) {                                                  // is it the PAINTED WALL that refuses the step ahead (not an object)?
    if (CTX.maskFree(X + ex * ST, Y + ey * ST + FD)) return false;
    var lg = CTX.mod && CTX.mod.logic;                                     // 'qok-door-lips' = '0' (Demon Castle): a doorway's post stops her as it did
    if (lg && lg.doorLip && CTX.state && CTX.state.lips === false) { try { if (lg.doorLip(CTX, X + ex * ST, Y + ey * ST + FD)) return false; } catch (e2) {} }
    for (var r = ST; r <= REACH; r += 6) { if (PROP[CTX.tile(((X + ex * r) / TILE) | 0, ((Y + FD + ey * r) / TILE) | 0)]) return false; }
    return true;
  }
  function lip(ex, ey, side) {                                             // within MAXLIP px to that side: a spot with the way ahead open
    var lx = -ey * side, ly = ex * side, k, px, py;
    for (k = 1; k <= MAXLIP; k++) { px = X + lx * k; py = Y + ly * k;
      if (!floor(px, py)) return 0;
      if (floor(px + ex * 4, py + ey * 4) && floor(px + ex * 8, py + ey * 8)) return okAt(px, py) ? k : 0; }   // guarantee 3: the opening itself must be floor a bent frame may stand on
    return 0;
  }
  // guarantee 3 for one spot (sprite coordinates): may a bent frame have her there?
  function okAt(px, py) {
    var cx = (px / TILE) | 0, cs = ((py + FD) / TILE) | 0, cc = (py / TILE) | 0, f = flags(TAB, cx, cs);
    if (f !== 0 && !(cx === CX0 && cs === CS0 && !(f & CORE))) return false;   // her soles: plain floor, or the cell they are in already unless it is CORE
    return (cx === CX0 && cc === CC0) || !(flags(TAB, cx, cc) & CORE);         // her sprite centre: no new cell that is special or named
  }
  // THE ONLY MAKER OF A BENT STICK (guarantees 1-3). (rx,ry): the unit direction to walk this frame. Returns the stick, or
  // null when the bend may not be made. The substeps are the mover's own (a1mStep: total = speed x (0.45 + 0.55 m) x dt,
  // n = ceil(total / 6), n equal steps added one by one), so what is tested here is what the mover will test and take.
  function bend(rx, ry) {
    var k = Math.max(SLOW, Math.min(1, rx * UX + ry * UY)), m = Math.max(0, Math.min(1, ((0.45 + 0.55 * MAG) * k - 0.45) / 0.55));   // never faster than her push along it
    var total = speed() * (0.45 + 0.55 * m) * Math.min(0.12, DT / 1000), n = Math.max(1, Math.ceil(total / STEP)), sx = rx * total / n, sy = ry * total / n;
    var side = Math.abs(rx * UY - ry * UX) * total, px = X, py = Y, j;       // this frame's travel across her push
    if (SS.lat + side > BOUND + 1e-9) { stats.capped++; return null; }       // guarantee 2: it would overdraw the allowance
    for (j = 0; j < n; j++) { px += sx; py += sy;
      if (!FREE(px, py) || !CTX.maskFree(px, py + FD)) return null;          // guarantee 1: the mover takes this substep (and it is painted floor)
      if (!okAt(px, py)) { stats.unplain++; return null; } }                 // guarantee 3
    SS.lat += side;
    SS.bent = { ux: UX, uy: UY, dir: SC.heroDir, x: X + sx * n, y: Y + sy * n, side: side }; SS.wasBent = true; stats.bent++;
    return { x: rx, y: ry, m: m, snag: INP };                                // .snag: the stick she pushed (the mover judges exits on it and restores it)
  }
  function fan(ex, ey, side) {                                             // the smallest turn toward that side that is a step bend() allows,
    for (var i = 0; i < TURNS.length; i++) { var t = TURNS[i], rx = ex * t.c - ey * t.s * side, ry = ey * t.c + ex * t.s * side, b;
      if (rx * UX + ry * UY < -0.01) break;                                // and never a step against her push
      if (!run(rx, ry)) continue;                                          // room for a whole step of her push that way (so a short bent step does not wedge her into a slanting face)
      b = bend(rx, ry); if (b) return b; }
    return null;
  }
  function sideOf(ex, ey) {                                                // a push that leans into a wall beside the travel line glides only away from it
    var cr = ex * UY - ey * UX;                                            // > 0: the push leans to side +1 (side s is the direction (-ey*s, ex*s))
    return Math.abs(cr) > 0.1 ? (cr > 0 ? -1 : 1) : 0;
  }
  function fail() { SS.g = null; SS.failAt = { x: X, y: Y, ux: UX, uy: UY }; stats.failed++; return undefined; }

  // ---- the glide: (ctx, the stick after the mechanic's own hook, her sprite position) -> a bent stick or undefined
  function glide(ctx, inp, x, y) {
    var sc = ctx.scene, loop = sc && sc.game && sc.game.loop, f = loop ? loop.frame : 0;
    var S = ctx.__snag || (ctx.__snag = { last: null, dead: 0, g: null, bent: null, wasBent: false, failAt: null, lat: 0 });
    var was = S.wasBent; S.wasBent = false; S.bent = null;
    var ux = inp.x, uy = inp.y, l = Math.sqrt(ux * ux + uy * uy);
    if (!(l > 1e-4)) { S.last = null; S.g = null; S.dead = 0; S.lat = 0; return undefined; }
    ux /= l; uy /= l;
    CTX = ctx; SS = S; SC = sc; INP = inp; X = x; Y = y; UX = ux; UY = uy;
    MAG = (typeof inp.m === 'number') ? Math.max(0, Math.min(1, inp.m)) : 1;
    DT = (typeof ctx.snagDt === 'number') ? ctx.snagDt : (loop ? loop.delta : 16.7);        // the frame time the mover steps with (dq-tiles.js a1mStep hands it over)
    TOTAL = speed() * (0.45 + 0.55 * MAG) * Math.min(0.12, DT / 1000); N = Math.max(1, Math.ceil(TOTAL / STEP)); ST = TOTAL / N;
    FREE = ctx.snagFree || D.free; FD = (typeof ctx.snagFootDy === 'number') ? ctx.snagFootDy : D.footDy();   // (Act 1: the mover's own, see dq-tiles.js a1mSnagBend)
    CX0 = (x / TILE) | 0; CS0 = ((y + FD) / TILE) | 0; CC0 = (y / TILE) | 0;
    var L = S.last, g = S.g;
    // what the last frame did with the same push
    if (L && L.f === f - 1 && (L.ux * ux + L.uy * uy) > SAME) {
      var dx = x - L.x, dy = y - L.y, mv = Math.sqrt(dx * dx + dy * dy), adv;
      if (mv < 0.02) S.dead++; else { S.dead = 0;
        if (!was) { adv = dx * ux + dy * uy; if (adv > 0) S.lat = Math.max(0, S.lat - REFILL * adv); } }   // her own advance gives the allowance back
    } else { S.dead = 0; S.g = g = null; S.failAt = null; S.lat = 0; }       // a new press
    S.last = { f: f, x: x, y: y, ux: ux, uy: uy };
    if (g && (g.ux * ux + g.uy * uy) < SAME) S.g = g = null;                // she turned the stick: a new push

    if (!g) {
      if (S.dead < 1) return undefined;                                    // she is moving: the mover's own rules
      var fa = S.failAt; if (fa && Math.abs(fa.x - x) + Math.abs(fa.y - y) < 1 && (fa.ux * ux + fa.uy * uy) > 0.985) return undefined;   // already looked from here
      if (pushFree()) return undefined;                                    // nothing is in her way (a held frame): not a wall's doing
      // the line a lip is looked for on, FROM THE STICK ALONE: pushing into a wall at an angle, the axis the stick leans on; then the push itself
      var c0 = null, c1 = null, i, e, s, k1, k2, pick = null, aux = Math.abs(ux), auy = Math.abs(uy), own;
      if (aux >= auy) { if (auy > 0.02) c0 = AX[ux > 0 ? 0 : 1]; if (auy > 0.2) c1 = AX[uy > 0 ? 2 : 3]; } else { if (aux > 0.02) c0 = AX[uy > 0 ? 2 : 3]; if (aux > 0.2) c1 = AX[ux > 0 ? 0 : 1]; }
      TAB = table(ctx);
      for (i = 0; i < 3 && !pick; i++) { e = i === 0 ? c0 : (i === 1 ? c1 : null); own = (i === 2); if (!own && !e) continue;
        var ex0 = own ? ux : e[0], ey0 = own ? uy : e[1];
        if (ex0 * ux + ey0 * uy < 0.5) continue;
        s = own ? 0 : sideOf(ex0, ey0);
        if (!own && !s) continue;                                          // the same line as the push itself
        if (run(ex0, ey0)) { if (!own) pick = { own: false, ex: ex0, ey: ey0, side: s }; continue; }
        if (!rock(ex0, ey0)) continue;
        if (s) { if (lip(ex0, ey0, s)) pick = { own: own, ex: ex0, ey: ey0, side: s }; }
        else { k1 = lip(ex0, ey0, 1); k2 = lip(ex0, ey0, -1);
          if (k1 || k2) pick = { own: own, ex: ex0, ey: ey0, side: (k1 && (!k2 || k1 <= k2)) ? 1 : -1, both: true }; }
      }
      if (!pick) return fail();
      pick.ux = ux; pick.uy = uy; S.g = g = pick; S.failAt = null; stats.armed++;
    } else if (S.dead >= 3) return fail();                                 // the mover refused what was offered: stand down
    // armed: the same push is held
    if (pushFree()) return undefined;                                      // free as she pushes (also onto what a mechanic opened: her own step)
    TAB = table(ctx);
    var ex = g.own ? ux : g.ex, ey = g.own ? uy : g.ey, r;
    if (!g.own && run(ex, ey)) {                                           // the axis she leans along is open: the mover's own slide first;
      if (S.dead < 1) return undefined;                                    // only when that slide gave nothing is she walked along the axis
      r = bend(ex, ey); return r || fail(); }
    if (!rock(ex, ey)) { S.g = null; return undefined; }                   // an object or a mechanic's blocker: hers to walk into
    r = lip(ex, ey, g.side) ? fan(ex, ey, g.side) : null;
    if (!r && g.both && !g.flip && lip(ex, ey, -g.side)) {                 // the near side was a pocket: the other side, once
      g.flip = 1; g.side = -g.side; r = fan(ex, ey, g.side); }
    if (!r) return fail();                                                 // a wall, a spent allowance or floor that is not plain: a stop
    return r;
  }
  var AX = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // after the mover's step: a bent frame must not turn her (she faces the way she pushed)
  function face(ctx) {
    var S = ctx.__snag, b = S && S.bent, sc = ctx.scene, h = sc && sc.hero; if (!b || !h) return;
    S.bent = null;
    var want = facing(b.ux, b.uy, b.dir);
    if (sc.heroDir === want) return;
    var fr = h.frame && !isNaN(+h.frame.name) ? +h.frame.name : sc.heroDir * 3;
    sc.heroDir = want; try { h.setFrame(want * 3 + (fr % 3)); } catch (e) {}
  }
  function wrap(id, mod) {
    if (!mod || mod.__snag) return mod;
    var oi = mod.input, ot = mod.tick;
    mod.__snag = { input: oi, tick: ot };
    mod.input = function (ctx, stick, x, y) {
      var o = mod.__snag.input, r = o ? o.apply(this, arguments) : undefined, inp = (r !== undefined) ? r : stick, b;
      if (!inp) { if (ctx.__snag) { ctx.__snag.last = null; ctx.__snag.g = null; ctx.__snag.bent = null; ctx.__snag.wasBent = false; ctx.__snag.dead = 0; ctx.__snag.lat = 0; } return r; }   // held by the mechanic, or no push
      try { b = glide(ctx, inp, x, y); } catch (e) { b = undefined; if (window.__DQ_DEBUG__) console.log('snag ' + e); }
      return b !== undefined ? b : r;
    };
    mod.tick = function (ctx) { try { face(ctx); } catch (e) {} var t = mod.__snag.tick; if (t) return t.apply(this, arguments); };
    API.wrapped[id] = true;
    return mod;
  }
  API._debug = { glide: glide, wrap: wrap, facing: facing, table: table };
  // The Act 1 dungeons have no mechanic to wrap: the mover itself asks this same glide there (dq-tiles.js a1mSnagBend).
  API.glide = glide; API.facing = facing;
  // probes (the check): the glide's marks on the cell under a pixel (0 plain, 1 special or named, 2 next to a named cell, 4 room-like zone)
  API.flagsAt = function (ctx, px, py) { return flags(table(ctx), (px / TILE) | 0, (py / TILE) | 0); };

  // every mechanic module, whenever it registers; the two dungeons without a mechanic get an empty one
  var reg = D.register;
  D.register = function (id, mod) { return reg.call(D, id, wrap(id, mod)); };
  D.register('none', {});
  // modules that registered before this file ran: wrapped when their floor is live
  var timer = setInterval(function () {
    try { var c = D.ctx && D.ctx(), man = D.manifest && D.manifest(), ds = man && man.dungeons, k, all = !!ds;
      if (c && c.mod && !c.mod.__snag) wrap(c.mechanic && c.mechanic.id, c.mod);
      for (k in ds) if (ds[k] && ds[k].mechanic && !API.wrapped[ds[k].mechanic]) all = false;
      if (all) clearInterval(timer);
    } catch (e) {}
  }, 300);
})();
