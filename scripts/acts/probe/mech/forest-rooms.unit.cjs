'use strict';
// Rules of the nine forest rooms against the Haunted Forest plan (no browser).
//   node scripts/acts/probe/mech/forest-rooms.unit.cjs
const F = require('./_fake.cjs');
const w = F.world('hauntedForest', 1, 'forest-rooms'), P = w.plan, M = P.mechanic, st = () => w.ctx.state, cam = w.scene.cameras.main;
const C = (c) => [(c[0] + .5) * 48, (c[1] + .5) * 48], [rw, rh] = M.params.roomTiles;
const mouth = P.assets.find(a => a.kind === 'mouth' && a.side === 'south');
w.setSoles(...C([mouth.x, mouth.y - 2])); w.idle(100);
F.check('she arrives in the room of the south mouth; nothing else is lit', st().room.join() === [Math.floor(mouth.x / rw), Math.floor((mouth.y - 2) / rh)].join(), st().room);
let ok = true; const log = [];
for (const ex of M.exits) { const [a, b] = ex.rooms, [gx, gy, gw, gh] = ex.gap, horiz = a[1] === b[1];
  for (const [from, to] of [[a, b], [b, a]]) {
    const d = [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])];
    // start two cells before the gap on the `from` side, in the middle of the path
    const mid = horiz ? [d[0] > 0 ? gx - 2 : gx + gw + 1, gy + 1] : [gx + 1, d[1] > 0 ? gy - 2 : gy + gh + 1];
    w.setSoles(...C(mid)); w.idle(700);
    const r0 = st().room.join(); let frames = 0, slid = false, forced = 0, camOk = true;
    while (frames < 400) { const before = w.soles(); w.frame(st().slide ? null : { x: d[0], y: d[1], m: 1 }, 16); frames++;
      if (st().slide) { slid = true; const after = w.soles(); if (Math.hypot(after[0] - before[0], after[1] - before[1]) > 1) forced++; }
      else if (slid) break; }
    const [sx, sy] = w.soles(), R = w.mod._debug.rect(st(), st().room), c = w.mod.camera(w.ctx, 0, 0, cam, 16);
    const inside = sx > R.x + 20 && sx < R.x + R.w - 20 && sy > R.y + 20 && sy < R.y + R.h - 20;
    // the view never leaves the room: scroll within the room's rectangle (or centred when the room is smaller)
    const vw = cam.width, vh = cam.height; camOk = (R.w <= vw || (c.x >= R.x - 1 && c.x + vw <= R.x + R.w + 1)) && (R.h <= vh || (c.y >= R.y - 1 && c.y + vh <= R.y + R.h + 1));
    const good = r0 === from.join() && st().room.join() === to.join() && slid && inside && camOk && forced > 5;
    log.push([from.join(), '>', to.join(), good ? 'ok' : JSON.stringify({ r0, room: st().room, slid, inside, camOk, forced })]); if (!good) ok = false; } }
F.check(`all ${M.exits.length} gaps, both ways: the room changes once she is through, the camera slides, she is carried past the trees, the view ends inside the new room`, ok, log.filter(l => l[3] !== 'ok'));
F.check('no flags are written (the room is where she stands)', Object.keys(w.flags).length === 0);
F.done('forest-rooms.unit');
