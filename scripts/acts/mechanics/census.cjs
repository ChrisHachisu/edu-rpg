#!/usr/bin/env node
/* Per-floor census of every dungeon's mechanic STATE as the running game holds it after a real
 * entry (seeded save -> Continue). For each floor it records what the engine's generator produced
 * (side channels: keyChestPositions, hiddenRoomChestPositions, mimicChestPositions, portalPairs,
 * windTowerDir, patrols, mirrorRoomBounds, correctExitY, goldenChestPos, crystal pillars) and
 * checks each against the mapData that is actually live -- which, for an A1D_MAPS floor, is the
 * authored floor dq-tiles swapped in AFTER loadMap.
 *   node scripts/acts/mechanics/census.cjs [out.json] [id,id,...]
 */
const fs = require('fs');
const L = require('./lib.cjs');
const DUNGEONS = {
  sunkenCellar: 3, whisperingWoodsCave: 3, coastalReef: 3, mistyGrotto: 5, crystalCave: 5,
  ironMine: 4, stormNest: 5, hauntedForest: 5, frozenLake: 5, shadowCave: 5,
  oasisDepths: 5, desertTomb: 5, banditHideout: 5, scorchedRuins: 5,
  emberMines: 5, magmaTunnels: 5, obsidianCavern: 5, volcanicForge: 7,
  demonBarracks: 6, voidRift: 6, demonCastle: 9, stormreachSpire: 6, frostfallCavern: 6,
  sunkenTempleDungeon: 6, twilightDungeon: 6,
};
const OUT = process.argv[2] || '/tmp/mech-census.json';
const only = process.argv[3] ? process.argv[3].split(',') : null;

const READ = `
  const md=w.mapData, H=md.length, W=(md[0]||[]).length, hist={};
  for(const r of md) for(const v of r) hist[v]=(hist[v]||0)+1;
  const at=(k)=>{const [x,y]=String(k).split(',').map(Number); return md[y]?.[x];};
  const keys=[...(w.keyChestPositions||[])], hid=[...(w.hiddenRoomChestPositions||[])], mim=[...(w.mimicChestPositions||[])];
  const mv=window.__A1_DNG_MOVE__; let masked=false; try{ masked=!!mv.forScene(w); }catch(e){}
  return {
    map:w.currentMapId, floor:w.currentFloor, W, H, hist, masked,
    a1d: !!(w.__a1dPatched && W<100),
    hero:[w.heroTileX,w.heroTileY],
    keyChests: keys.map(k=>[k,at(k)]),
    hiddenRoomChests: hid.map(k=>[k,at(k)]),
    mimicChests: mim.map(k=>[k,at(k)]),
    correctExitY: w.forestMazeCorrectExitY, exitTile: w.forestMazeCorrectExitY>=0 ? md[w.forestMazeCorrectExitY]?.[W-1] : null,
    portalPairs: (w.portalPairs||[]).map(p=>[[p.a.x,p.a.y,md[p.a.y]?.[p.a.x]],[p.b.x,p.b.y,md[p.b.y]?.[p.b.x]]]),
    shadowPortalEnabled: !!w.shadowPortalEnabled,
    windTowerEnabled: !!w.windTowerEnabled, windTowerDir: w.windTowerDir||null,
    windOverlays: (w._windTileOverlays||[]).length,
    patrols: (w.darknessPulsePatrols||[]).map(p=>({wp:p.waypoints.map(q=>[q.x,q.y,md[q.y]?.[q.x]])})),
    darknessPulseEnabled: !!w.darknessPulseEnabled,
    mirrorRooms: (w.mirrorRoomBounds||[]).map(b=>[b.x,b.y,b.w,b.h]),
    goldenChestPos: w.goldenChestPos ? [w.goldenChestPos.x,w.goldenChestPos.y,md[w.goldenChestPos.y]?.[w.goldenChestPos.x]] : null,
    mazeHunterEnabled: !!w.mazeHunterEnabled,
    fogEnabled: !!w.fogEnabled, fogRadius: w.fogRadius, fogTorchBonus: w.fogTorchBonus,
    lavaPhase: w.lavaPhase,
    crystalPillars: (w.crystalPillars||[]).map(p=>[p.x,p.y,p.colorIdx,md[p.y]?.[p.x]]),
    crystalSequence: w.crystalSequence||[],
    glyphTrialActive: !!w.glyphTrialActive, glyphPlates: (w.glyphPlates||[]).length,
    tripwireGfx: !!w._twLineGfx,
  };`;

(async () => {
  const T = await L.launch(); const browser = T.browser; let page;
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  for (const [id, n] of Object.entries(DUNGEONS)) {
    if (only && !only.includes(id)) continue;
    for (let f = 1; f <= n; f++) {
      const k = `${id}-f${f}`;
      if (out[k] && !out[k].error) continue;
      try {
        page = await L.fresh(T);
        await L.enter(page, id, f);
        const st = await L.scene(page, READ);
        st.errors = page.__errors.splice(0);
        out[k] = st;
        const h = st.hist;
        console.log(k, `${st.W}x${st.H}`, st.a1d ? 'A1D' : 'engine', st.masked ? 'mask-mover' : 'tile-step',
          'keys', JSON.stringify(st.keyChests), 'doors15', h[15] || 0, 'w19', h[19] || 0, 'h17', h[17] || 0,
          't24', h[24] || 0, 'lava5', h[5] || 0, 'ice25', h[25] || 0, 's26/27', (h[26] || 0) + '/' + (h[27] || 0),
          'p29', h[29] || 0, 'tw30/31', (h[30] || 0) + '/' + (h[31] || 0), 'mimic', JSON.stringify(st.mimicChests));
      } catch (e) {
        console.log(k, 'ERROR', String(e).slice(0, 200));
        out[k] = { error: String(e).slice(0, 300) };
      }
      fs.writeFileSync(OUT, JSON.stringify(out));
    }
  }
  await browser.close();
})();
