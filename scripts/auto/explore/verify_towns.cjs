'use strict';
// Depth check for the town census: in each named town, a real walk (keys in the town frame, path
// planned on the town's own walkable polygons, ptlib) (1) to the shopkeeper's talk band and (2) to
// the shop counter, the talk key pressed at each; what opens is recorded (ShopScene / dialogue /
// nothing), with screenshots. Also measures the shopkeeper band at 0.5 px.
//   PT_DIR=/home/user/work/explore/pt PT_SHOTS=/home/user/work/explore/shots/verify/ \
//     node scripts/auto/explore/verify_towns.cjs ruinsCamp oasisHaven lastBastion
process.env.PT_DIR = process.env.PT_DIR || '/home/user/work/explore/pt';
process.env.PT_SHOTS = process.env.PT_SHOTS || '/home/user/work/explore/shots/verify/';
const X = require('./xlib.cjs'), L = X.L;
const P = require('../../acts/probe/playthrough/ptlib.cjs');
(async () => {
  const towns = process.argv.slice(2);
  for (const id of towns) {
    const s = new P.Session('verify-' + id), row = { town: id };
    try {
      await s.open(L.save({ x: 80, y: 262, flags: L.allFlags() })); await L.noEncounters(s.page);
      const d = await s.travel(id); await s.walkInto(id); await s.page.waitForTimeout(3500); await s.inject();
      const t = await s.ev(() => window.__PTH.town()); row.inTown = t && t.id;
      // fine band of the shopkeeper: points within town.html's band that isInsideWalkable accepts
      row.fineBand = await s.ev(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), T = f.contentWindow.__ACT1_TOWN__, C = T.town.worldPxPerCell, n = T.npcs.find(n => n.id === 'shopkeeper');
        if (!n) return null; let k = 0, pts = []; for (let x = n.point.x - C * 1.1; x <= n.point.x + C * 1.1; x += 0.5) for (let y = n.point.y - C * 0.35; y <= n.point.y + C * 2.1; y += 0.5) if (T.isInsideWalkable({ x, y })) { k++; if (pts.length < 5) pts.push([+(x / C).toFixed(2), +(y / C).toFixed(2)]); }
        return { points: k, areaPx: k / 4, sample: pts, npc: [n.point.x / C, n.point.y / C], counter: T.town.shopCounter }; });
      await s.ev(() => window.__PTH.clear());
      const w1 = await s.ev(() => window.__PTH.walkToNpc('shopkeeper')); row.toNpc = w1 && w1.why;
      if (w1 && w1.ok) { await s.ev(() => window.__PTH.pressTalk()); await s.page.waitForTimeout(1500); row.atNpc = await s.ev(() => window.__PTH.state().scenes); await s.shot('at-shopkeeper'); }
      await s.page.evaluate(() => { const g = window.__PHASER_GAME__; if (g.scene.isActive('ShopScene')) { const b = document.querySelector('[data-act="shopLeave"]'); if (b) b.click(); } }); await s.page.waitForTimeout(800);
      const c = row.fineBand && row.fineBand.counter;
      if (c) { const w2 = await s.ev(([x, y]) => window.__PTH.walkToCell(x, y, 1.0), [c[0], c[1]]); row.toCounter = w2 && w2.why;
        const sv = await s.ev(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'), T = f.contentWindow.__ACT1_TOWN__; return { svc: (T.nearestService() || {}).kind || null, npc: (T.nearestNpc() || {}).id || null }; }); row.counterAnswer = sv;
        await s.ev(() => window.__PTH.pressTalk()); await s.page.waitForTimeout(1800); row.atCounter = await s.ev(() => window.__PTH.state().scenes); row.shot = await s.shot('at-counter'); }
      row.shopOpens = !!(row.atCounter && row.atCounter.includes('ShopScene')) || !!(row.atNpc && row.atNpc.includes('ShopScene'));
      row.errors = s.errors.slice(0, 4);
    } catch (e) { row.error = String(e && e.stack || e).slice(0, 400); }
    console.log(JSON.stringify(row)); X.append('verify-towns.jsonl', row);
    try { await s.browser.close(); } catch (e) {}
  }
})();
