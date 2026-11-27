'use strict';
// Day 4 census: the four portal isles (Stormreach, Frostfall, Sunken Temple, Twilight) and the village on each.
// The villages are the bundle's own 16x16 tile towns (not the painted hi-fi towns); day 1 never photographed them.
//   node scripts/auto/census/portal.cjs [stormreach frostfall sunkenTemple twilight]
// Per village: arrival at the gate, centre, every person (hero set one tile below, Talk pressed), the save crystal, the shop and the healer.
// Per isle: four views around the landing and the portal to the dungeon.
const C = require('./clib.cjs');
const { L } = C;
const SETS = { stormreach: ['stormreachIsles', 'stormreachVillage', 'stormreachSpire'], frostfall: ['frostfallPeaks', 'frostfallVillage', 'frostfallCavern'],
  sunkenTemple: ['sunkenTempleIsle', 'sunkenTempleVillage', 'sunkenTempleDungeon'], twilight: ['twilightRealm', 'twilightVillage', 'twilightDungeon'] };
const T = 48;
const put = (page, tx, ty) => page.evaluate(([tx, ty, T]) => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); w.hero.setPosition((tx + 0.5) * T, (ty + 0.5) * T); w.heroTileX = tx; w.heroTileY = ty;
  try { w.hero.body && w.hero.body.reset && w.hero.body.reset((tx + 0.5) * T, (ty + 0.5) * T); } catch (e) {} w.cameras.main.centerOn((tx + 0.5) * T, (ty + 0.5) * T); }, [tx, ty, T]);
(async () => {
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SETS);
  const { browser, page } = await C.open();
  for (const k of want) {
    const [isle, vil] = SETS[k], act = 5;
    try {
      await C.boot(page, { mapId: isle, x: 25, y: 11 }, { ready: false, settle: 2500 }); await page.waitForTimeout(2500);
      const iz = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return { w: w.mapData[0].length, h: w.mapData.length }; });
      await C.snap(page, `isle-${k}-landing`, { area: 'overworld', act, place: isle, shows: `${isle} portal isle (${iz.w}x${iz.h} cells), hero at the portal landing (25,11)`, how: 'seeded save on the isle' });
      for (const [tag, dx, dy] of [['west', -8, 0], ['east', 8, 0], ['north', 0, -7], ['south', 0, 8]]) {
        const tx = Math.max(3, Math.min(iz.w - 4, 25 + dx)), ty = Math.max(4, Math.min(iz.h - 5, 11 + dy)); await put(page, tx, ty); await page.waitForTimeout(900);
        await C.snap(page, `isle-${k}-${tag}`, { area: 'overworld', act, place: isle, shows: `${isle} portal isle, view ${tag} of the landing (hero teleported to ${tx},${ty})`, how: 'hero teleported' });
      }
      await C.boot(page, { mapId: vil, x: 8, y: 14 }, { ready: false, settle: 2500 }); await page.waitForTimeout(2500);
      await C.snap(page, `town-${vil}-entry`, { area: 'town', act, town: vil, shows: `${vil} arrival at the gate (native 16x16 tile town)`, how: 'seeded save at the village gate (8,14)' });
      await put(page, 8, 8); await page.waitForTimeout(900);
      await C.snap(page, `town-${vil}-centre`, { area: 'town', act, town: vil, shows: `${vil}: village centre`, how: 'hero placed at (8,8)' });
      const npcs = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return w.npcSprites.map(n => ({ x: n.x, y: n.y, t: n.texture && n.texture.key })); });
      let i = 0;
      for (const n of npcs) {
        const role = n.t === 'shopkeeper' ? 'shop' : n.t === 'npc-healer' ? 'healer-inn' : n.t === 'save-point' ? 'save-point' : 'person'; i++;
        const tx = Math.floor(n.x / T), ty = Math.floor(n.y / T);
        await put(page, tx, ty + 1); await page.waitForTimeout(900);
        await C.snap(page, `town-${vil}-npc-${role}${i}`, { area: 'town', act, town: vil, role, shows: `${vil}: next to the ${role} (${n.t}) at ${tx},${ty}; Talk button expected`, how: 'hero placed one tile below, facing up' });
        await page.keyboard.press('ArrowUp').catch(() => {}); await page.keyboard.press('z').catch(() => {}); await page.waitForTimeout(1400);
        const st = await page.evaluate(() => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'); return { msg: !!w.showingMessage, shop: g.scene.isActive('ShopScene'), heal: !!w.healerOverlayOpen, card: !!document.querySelector('#qok-ui [data-act]') }; });
        await C.snap(page, `town-${vil}-npc-${role}${i}-talk`, { area: 'town', act, town: vil, role, shows: `${vil}: after Talk to the ${role} (${JSON.stringify(st)})`, how: 'ArrowUp + Z' });
        if (st.shop) { await page.locator('[data-act="shopLeave"]').first().tap({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800); }
        for (let j = 0; j < 6; j++) { await page.keyboard.press('z').catch(() => {}); await page.waitForTimeout(250); }
        await page.keyboard.press('x').catch(() => {}); await page.waitForTimeout(300);
      }
    } catch (e) { C.log('ERR', k, String(e).slice(0, 200)); }
  }
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
