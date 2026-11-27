/* Acts 2-5 dungeons: wall glide over small lips (day 4, track S, 2026-11-27).

   WHAT WAS WRONG. The dungeon mover (dq-tiles.js a1mStep) collides her SOLES with the painted walk mask and,
   when a step is refused, slides along the wall by a1mSlide: the step minus its part INTO the wall, the wall's
   direction read from the mask's distance field at the pixel she stands on. Walking straight ALONG a wall that
   field reads "the wall is exactly beside me", so there is nothing to subtract, a1mSlide answers "no slide",
   the two single-axis retries are the same refused step, and she stops dead. Every wall that is not perfectly
   straight does this to a hero who hugs it: a 1 px step in the mask is enough (static census, day 4: 43,062
   places of 24 px or less on the 107 floors; the 31 Demon Castle doorway posts of day 3 were the tallest).

   WHAT THIS DOES. It never moves her and never answers a collision question. It only BENDS THE STICK, through
   the mechanic hook the mover already offers (mod.input), so every position is still accepted or refused by the
   mover's own a1mFree, substep by substep:
     * one frame after a push produced no movement at all, it looks for a LIP: painted rock ahead, and within
       MAXLIP px to one side a spot from which the way ahead is open (the whole sideways path and the spot are
       painted floor she may stand on);
     * while the same push is held it turns the stick the smallest amount (15, 30 ... 90 degrees, toward that
       side) that gives a free step, at no more than the speed she would have had, until the way is straight
       again. Her facing stays the one she pushed.
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
  var TURNS = [15, 30, 45, 60, 75, 90].map(function (d) { var r = d * Math.PI / 180; return { c: Math.cos(r), s: Math.sin(r) }; });
  var PROP = { 4: 1, 5: 1, 7: 1, 14: 1, 18: 1, 23: 1, 28: 1 };              // the mover's own object tiles (A1M_PROP)
  var stats = { armed: 0, bent: 0, failed: 0 };
  var API = window.__QOK_SNAG__ = { version: 1, on: !OFF, stats: stats, wrapped: {}, MAXLIP: MAXLIP,
    state: function () { var c = D.ctx && D.ctx(); return c && c.__snag ? c.__snag : null; } };
  if (OFF) return;

  function speed() { return (typeof window.__A1_DNG_SPEED__ === 'number') ? window.__A1_DNG_SPEED__ : SPEED; }
  // the mover's facing rule (a1mStep): keep the axis she faces until the other leads by 20%
  function facing(ux, uy, dir) { var ax = Math.abs(ux), ay = Math.abs(uy), hz = (dir === 1 || dir === 2), useX = hz ? (ax * 1.2 >= ay) : (ax > ay * 1.2); return useX ? (ux > 0 ? 2 : 1) : (uy > 0 ? 0 : 3); }

  // ---- the glide: (ctx, the stick after the mechanic's own hook, her sprite position) -> a bent stick or undefined
  function glide(ctx, inp, x, y) {
    var sc = ctx.scene, loop = sc && sc.game && sc.game.loop, f = loop ? loop.frame : 0, dt = loop ? loop.delta : 16.7;
    var S = ctx.__snag || (ctx.__snag = { last: null, dead: 0, g: null, hx: 0, hy: 0, bent: null, wasBent: false, failAt: null });
    var was = S.wasBent; S.wasBent = false; S.bent = null;
    var ux = inp.x, uy = inp.y, l = Math.sqrt(ux * ux + uy * uy);
    if (!(l > 1e-4)) { S.last = null; S.g = null; S.dead = 0; return undefined; }
    ux /= l; uy /= l;
    var mag = (typeof inp.m === 'number') ? Math.max(0, Math.min(1, inp.m)) : 1;
    var total = speed() * (0.45 + 0.55 * mag) * Math.min(0.12, dt / 1000), n = Math.max(1, Math.ceil(total / STEP)), st = total / n;
    var free = ctx.snagFree || D.free, fd = (typeof ctx.snagFootDy === 'number') ? ctx.snagFootDy : D.footDy(), L = S.last, g = S.g;   // (Act 1: the mover's own, see dq-tiles.js a1mSnagBend)
    // what the last frame did with the same push
    if (L && L.f === f - 1 && (L.ux * ux + L.uy * uy) > SAME) {
      var dx = x - L.x, dy = y - L.y, mv = Math.sqrt(dx * dx + dy * dy);
      if (mv < 0.02) S.dead++; else { S.dead = 0; if (!was && mv > 0.5) { S.hx = dx / mv; S.hy = dy / mv; } }
    } else { S.dead = 0; S.g = g = null; S.hx = S.hy = 0; S.failAt = null; }
    S.last = { f: f, x: x, y: y, ux: ux, uy: uy };
    if (g && (g.ux * ux + g.uy * uy) < SAME) S.g = g = null;                // she turned the stick: a new push

    function floor(px, py) { return ctx.maskFree(px, py + fd) && free(px, py); }            // painted floor the mover allows too
    function run(rx, ry) { for (var j = 1; j <= n; j++) if (!floor(x + rx * st * j, y + ry * st * j)) return false; return true; }
    function pushFree() { for (var j = 1; j <= n; j++) if (!free(x + ux * st * j, y + uy * st * j)) return false; return true; }   // her own straight step: the mover's word alone
    function rock(ex, ey) {                                                // is it the PAINTED WALL that refuses the step ahead (not an object)?
      if (ctx.maskFree(x + ex * st, y + ey * st + fd)) return false;
      var lg = ctx.mod && ctx.mod.logic;                                   // 'qok-door-lips' = '0' (Demon Castle): a doorway's post stops her as it did
      if (lg && lg.doorLip && ctx.state && ctx.state.lips === false) { try { if (lg.doorLip(ctx, x + ex * st, y + ey * st + fd)) return false; } catch (e2) {} }
      for (var r = st; r <= REACH; r += 6) { if (PROP[ctx.tile(((x + ex * r) / TILE) | 0, ((y + fd + ey * r) / TILE) | 0)]) return false; }
      return true;
    }
    function lip(ex, ey, side) {                                           // within MAXLIP px to that side: a spot with the way ahead open
      var lx = -ey * side, ly = ex * side, k, px, py;
      for (k = 1; k <= MAXLIP; k++) { px = x + lx * k; py = y + ly * k;
        if (!floor(px, py)) return 0;
        if (floor(px + ex * 4, py + ey * 4) && floor(px + ex * 8, py + ey * 8)) return k; }
      return 0;
    }
    function fan(ex, ey, side) {                                           // the smallest turn toward that side that is a free step,
      for (var i = 0; i < TURNS.length; i++) { var t = TURNS[i], rx = ex * t.c - ey * t.s * side, ry = ey * t.c + ex * t.s * side;
        if (rx * ux + ry * uy < -0.01) break;                              // and never a step against her push
        if (run(rx, ry)) return { x: rx, y: ry, wide: i >= 4 }; }
      return null;
    }
    function sideOf(ex, ey) {                                              // a push that leans into a wall beside the travel line glides only away from it
      var cr = ex * uy - ey * ux;                                          // > 0: the push leans to side +1 (side s is the direction (-ey*s, ex*s))
      return Math.abs(cr) > 0.1 ? (cr > 0 ? -1 : 1) : 0;
    }
    function out(rx, ry) {                                                 // the bent stick: never faster than her push along it
      var k = Math.max(SLOW, Math.min(1, rx * ux + ry * uy)), m = ((0.45 + 0.55 * mag) * k - 0.45) / 0.55;
      S.bent = { ux: ux, uy: uy, dir: sc.heroDir }; S.wasBent = true; stats.bent++;
      return { x: rx, y: ry, m: Math.max(0, Math.min(1, m)) };
    }
    function fail() { S.g = null; S.failAt = { x: x, y: y, ux: ux, uy: uy }; stats.failed++; return undefined; }

    if (!g) {
      if (S.dead < 1) return undefined;                                    // she is moving: the mover's own rules
      var fa = S.failAt; if (fa && Math.abs(fa.x - x) + Math.abs(fa.y - y) < 1 && (fa.ux * ux + fa.uy * uy) > 0.985) return undefined;   // already looked from here
      // the line she is really travelling: the push itself or, pushing into a wall at an angle, the wall she was sliding along (or its axis)
      if (pushFree()) return undefined;                                    // nothing is in her way (a held frame): not a wall's doing
      var c = [], i, e, s, k1, k2, pick = null, aux = Math.abs(ux), auy = Math.abs(uy);
      var hd = S.hx * ux + S.hy * uy; if ((S.hx || S.hy) && hd >= 0.5 && hd < 0.9995) c.push([S.hx, S.hy]);
      var ax = [ux > 0 ? 1 : -1, 0], ay = [0, uy > 0 ? 1 : -1];
      if (aux >= auy) { if (auy > 0.02) c.push(ax); if (auy > 0.2) c.push(ay); } else { if (aux > 0.02) c.push(ay); if (aux > 0.2) c.push(ax); }
      c.push(null);                                                        // the push itself
      for (i = 0; i < c.length && !pick; i++) { e = c[i] || [ux, uy];
        if (e[0] * ux + e[1] * uy < 0.5) continue;
        s = c[i] ? sideOf(e[0], e[1]) : 0;
        if (c[i] && !s) continue;                                          // the same line as the push itself
        if (run(e[0], e[1])) { if (c[i]) pick = { own: false, ex: e[0], ey: e[1], side: s }; continue; }
        if (!rock(e[0], e[1])) continue;
        if (s) { if (lip(e[0], e[1], s)) pick = { own: !c[i], ex: e[0], ey: e[1], side: s }; }
        else { k1 = lip(e[0], e[1], 1); k2 = lip(e[0], e[1], -1);
          if (k1 || k2) pick = { own: !c[i], ex: e[0], ey: e[1], side: (k1 && (!k2 || k1 <= k2)) ? 1 : -1, both: true }; }
      }
      if (!pick) return fail();
      pick.ux = ux; pick.uy = uy; S.g = g = pick; S.failAt = null; stats.armed++;
    } else if (S.dead >= 3) return fail();                                 // the mover refused what was offered: stand down
    // armed: the same push is held
    if (pushFree()) { g.wide = 0; return undefined; }                      // free as she pushes (also onto what a mechanic opened: her own step)
    var ex = g.own ? ux : g.ex, ey = g.own ? uy : g.ey;
    if (!g.own && run(ex, ey)) {                                           // along the wall she was sliding on: the mover's own slide first
      g.wide = 0;                                                          // where a mechanic listens for her leaning on things (its bump hook)
      return (S.dead >= 1 || !(ctx.mod && ctx.mod.bump)) ? out(ex, ey) : undefined; }
    if (!rock(ex, ey)) { S.g = null; return undefined; }                   // an object or a mechanic's blocker: hers to walk into
    var r = lip(ex, ey, g.side) ? fan(ex, ey, g.side) : null;
    if (!r && g.both && !g.flip && lip(ex, ey, -g.side)) {                 // the near side was a pocket: the other side, once
      g.flip = 1; g.side = -g.side; g.wide = 0; r = fan(ex, ey, g.side); }
    if (!r) return fail();                                                 // a wall: a stop
    if (r.wide) { g.wide = (g.wide || 0) + total * SLOW; if (g.wide > MAXLIP + 4) return fail(); } else g.wide = 0;   // sideways for a lip's height, not along a wall
    return out(r.x, r.y);
  }
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
      if (!inp) { if (ctx.__snag) { ctx.__snag.last = null; ctx.__snag.g = null; ctx.__snag.bent = null; ctx.__snag.wasBent = false; ctx.__snag.dead = 0; } return r; }   // held by the mechanic, or no push
      try { b = glide(ctx, inp, x, y); } catch (e) { b = undefined; if (window.__DQ_DEBUG__) console.log('snag ' + e); }
      return b !== undefined ? b : r;
    };
    mod.tick = function (ctx) { try { face(ctx); } catch (e) {} var t = mod.__snag.tick; if (t) return t.apply(this, arguments); };
    API.wrapped[id] = true;
    return mod;
  }
  API._debug = { glide: glide, wrap: wrap, facing: facing };
  // The Act 1 dungeons have no mechanic to wrap: the mover itself asks this same glide there (dq-tiles.js a1mSnagBend).
  API.glide = glide; API.facing = facing;

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
