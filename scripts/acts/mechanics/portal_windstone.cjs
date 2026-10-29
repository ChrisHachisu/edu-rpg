const L = require('/home/claude/edu-rpg/scripts/acts/mechanics/lib.cjs');
const SC=process.env.MECH_OUT || '/tmp/';
(async () => {
  const T = await L.launch(); let page; const S = (s, a) => L.scene(page, s, a);
  // portal: try every free neighbour, then poll for the pair
  page = await L.fresh(T); await L.enter(page, 'twilightDungeon', 1);
  const [ax, ay, bx, by] = (await S('return w.portalPairs.map(p=>[p.a.x,p.a.y,p.b.x,p.b.y])'))[0];
  const nbs = await S(`const r=[];for(const [dx,dy,d] of [[0,1,'up'],[0,-1,'down'],[1,0,'left'],[-1,0,'right']]){if(w.mapData[a[1]+dy]?.[a[0]+dx]===0) r.push([a[0]+dx,a[1]+dy,d]);} return r`, [ax, ay]);
  for (const nb of nbs) {
    await L.teleportIdle(page, nb[0], nb[1]); await S('w.portalCooldown=false');
    await L.step(page, nb[2], { after: 500 });
    let res; const t0 = Date.now();
    while (Date.now() - t0 < 20000) { res = await S('return {h:[w.heroTileX,w.heroTileY],msgs:w.__msgs.slice(-1)}'); if (res.h[0]===bx && res.h[1]===by) break; await page.waitForTimeout(500); }
    console.log('portal from', JSON.stringify(nb), '->', JSON.stringify(res), 'pair', bx, by);
    if (res.h[0]===bx && res.h[1]===by) { await L.idle(page); await L.shot(page, SC+'portal-after.jpg'); break; }
  }
  // stormNest f2 with the stone in the bag
  page = await L.fresh(T); await L.enter(page, 'stormNest', 2, { inventory: [{ itemId: 'windbreakerStone_stormNest', quantity: 1 }] });
  console.log('inv', JSON.stringify(await S('return gs.player.state.inventory.map(i=>i.itemId+"x"+i.quantity)')));
  for (const q of [[41,22,'down'],[41,24,'up'],[42,22,'down'],[42,24,'up']]) {
    if (await S('return w.mapData[23][41]')!==19 && await S('return w.mapData[23][42]')!==19) break;
    await L.teleportIdle(page, q[0], q[1]); await L.step(page, q[2], { after: 800 });
    console.log(' storm', JSON.stringify(q), JSON.stringify(await S('return {h:[w.heroTileX,w.heroTileY],t1:w.mapData[23][41],t2:w.mapData[23][42],inv:gs.player.state.inventory.map(i=>i.itemId+"x"+i.quantity),msgs:w.__msgs.slice(-1)}')));
  }
  await L.shot(page, SC+'storm-calmed.jpg');
  await T.browser.close(); console.log('DBGDONE');
})().catch(e => { console.log('ERR', e.message); console.log('DBGDONE'); process.exit(1); });
