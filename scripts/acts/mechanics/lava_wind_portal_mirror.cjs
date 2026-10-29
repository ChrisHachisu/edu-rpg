const L = require('/home/claude/edu-rpg/scripts/acts/mechanics/lib.cjs');
(async () => {
  const T = await L.launch(); let page;
  const S = (s, a) => L.scene(page, s, a);
  // lava: ask canMove directly in both phases, then try a step in the passable phase
  page = await L.fresh(T); await L.enter(page, 'magmaTunnels', 1);
  for (let k = 0; k < 6; k++) { console.log('lava canMove', JSON.stringify(await S('return {phase:w.lavaPhase, can:w.canMove(82,36), tile:w.mapData[36][82], mech:true}'))); await page.waitForTimeout(1500); }
  await L.teleportIdle(page, 82, 35);
  for (let k = 0; k < 20; k++) { if (await S('return !!w.lavaPhase')) break; await page.waitForTimeout(300); }
  console.log('phase now', await S('return w.lavaPhase'));
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(1200);
  console.log('lava after hold', await S('return {h:[w.heroTileX,w.heroTileY], phase:w.lavaPhase, dir:w.heroDir, mv:w.isMoving, tw:w.tweens.isTweening(w.hero), msg:w.showingMessage}'));
  await page.keyboard.up('ArrowDown');
  // stormNest: stone then gust
  page = await L.fresh(T); await L.enter(page, 'stormNest', 2);
  await L.teleportIdle(page, 63, 68); await L.step(page, 'right', { after: 1500 }); await L.clearMsg(page);
  const w19 = await S('const o=[]; for(const [x,y] of [[41,23],[42,23]]) for(const [dx,dy,d] of [[0,1,"up"],[0,-1,"down"],[1,0,"left"],[-1,0,"right"]]) if(w.mapData[y+dy][x+dx]===0) o.push([x,y,x+dx,y+dy,d]); return o');
  console.log('wind approaches', JSON.stringify(w19), 'inv', await S('return gs.player.state.inventory.map(i=>i.itemId)'));
  for (const q of w19.slice(0, 3)) { await L.teleportIdle(page, q[2], q[3]); const s = await L.step(page, q[4], { after: 1500 });
    console.log(' gust', JSON.stringify(q), JSON.stringify(s), JSON.stringify(await S('return {t1:w.mapData[23][41],t2:w.mapData[23][42],inv:gs.player.state.inventory.map(i=>i.itemId+"x"+i.quantity),msgs:w.__msgs.slice(-2)}'))); await L.clearMsg(page);
    if ((await S('return w.mapData[23][41]')) === 0) break; }
  await L.shot(page, '' + (process.env.MECH_OUT || '/tmp/') + 'storm-calmed.jpg');
  // portal: clean single attempt with a long wait
  page = await L.fresh(T); await L.enter(page, 'twilightDungeon', 1);
  const pp = await S('return w.portalPairs.map(p=>[p.a.x,p.a.y,p.b.x,p.b.y])'); console.log('pairs', JSON.stringify(pp));
  const [ax, ay, bx, by] = pp[0];
  const nb = await S(`for(const [dx,dy,d] of [[0,1,'up'],[0,-1,'down'],[1,0,'left'],[-1,0,'right']]){if(w.mapData[a[1]+dy]?.[a[0]+dx]===0) return [a[0]+dx,a[1]+dy,d];} return null`, [ax, ay]);
  await L.teleportIdle(page, nb[0], nb[1]);
  await L.step(page, nb[2], { after: 3000 }); await L.idle(page); await page.waitForTimeout(2000);
  console.log('portal result', JSON.stringify(await S('return {h:[w.heroTileX,w.heroTileY], b:a, msgs:w.__msgs.slice(-2)}', [bx, by])));
  await L.shot(page, '' + (process.env.MECH_OUT || '/tmp/') + 'portal-after.jpg');
  // demonCastle mirror rooms per floor 1..3 and 9 (runtime)
  for (const f of [2, 9]) { page = await L.fresh(T); await L.enter(page, 'demonCastle', f);
    const r = await S('return {rooms:w.mirrorRoomBounds, walk:w.mapData.flat().filter(v=>v!==1&&v!==5).length}'); console.log('demonCastle f' + f, JSON.stringify(r));
    if (r.rooms.length) { const b = r.rooms[0];
      const c = await S(`const b=a; for(let y=b.y;y<b.y+b.h;y++) for(let x=b.x+1;x<b.x+b.w-1;x++){const q=w.mapData[y]; if(q[x]===0&&q[x-1]===0&&q[x+1]===0) return [x,y];} return null`, b);
      await L.teleportIdle(page, c[0], c[1]); await S('w.updateMirrorState()');
      const s = await L.step(page, 'right', { after: 800 });
      console.log(' mirror step Right', JSON.stringify(s), await S('return w.mirrorActive'));
      await L.shot(page, '' + (process.env.MECH_OUT || '/tmp/') + 'mirror-f9.jpg'); } }
  await T.browser.close();
})();
