#!/usr/bin/env node
/* Act 1 dungeon mechanics, tested in the running game (seeded save -> Continue).
 *   node scripts/acts/mechanics/act1.cjs <outdir>
 * Per A1D floor: engine floor (snapshotted inside loadMap) vs the authored floor dq-tiles swaps in;
 * key-chest / locked-door survival; every chest bumped open through the real mover; the fog/torch
 * mechanic on mistyGrotto; the coloured-pillar puzzle on crystalCave (engine floors). */
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const OUT = process.argv[2] || '/tmp/mech-act1';
fs.mkdirSync(OUT, { recursive: true });
const FLOORS = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/act1-dungeon-floors.json'), 'utf8')).floors;
const A1D = ['sunkenCellar', 'whisperingWoodsCave', 'coastalReef', 'mistyGrotto'];
const res = { floors: {}, checks: [] };
const check = (name, ok, detail) => { res.checks.push({ name, ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };

async function bumpOpen(page, id, f, cx, cy) {
  const flag = `chest.${id}.f${f}.${cx}.${cy}`;
  const sides = [['up', cx, cy + 1], ['down', cx, cy - 1], ['left', cx + 1, cy], ['right', cx - 1, cy]];
  for (const [dir, sx, sy] of sides) {
    const free = await L.scene(page, `const r=w.mapData[a[1]]; return !!r && r[a[0]]===0;`, [sx, sy]);
    if (!free) continue;
    await L.teleport(page, sx, sy);
    await page.waitForTimeout(150);
    await L.hold(page, dir, 1100);
    await page.waitForTimeout(250);
    const got = await L.scene(page, `return !!gs.player.state.storyFlags[a]`, flag);
    await L.clearMsg(page);
    if (got) return dir;
  }
  return null;
}

(async () => {
  const { browser, page } = await L.launch();
  for (const id of A1D) {
    for (let f = 1; f <= 3; f++) {
      const key = `${id}-f${f}`;
      console.log(`== ${key}`);
      await L.enter(page, id, f);
      const st = await L.scene(page, `
        const snaps=w.__renderSnaps||[]; const mv=window.__A1_DNG_MOVE__; let masked=false; try{masked=!!mv.forScene(w)}catch(e){}
        return { snaps, W:w.mapData[0].length, H:w.mapData.length, masked,
          keys:[...w.keyChestPositions], fogEnabled:!!w.fogEnabled, fogRadius:w.fogRadius, fogTorchBonus:w.fogTorchBonus,
          inv: gs.player.state.inventory.map(i=>i.itemId+'x'+i.quantity) };`);
      const eng = st.snaps.find(s => s.W === 100) || null;
      const live = st.snaps[st.snaps.length - 1];
      res.floors[key] = { engine: eng, live, masked: st.masked, keys: st.keys, fog: [st.fogEnabled, st.fogRadius, st.fogTorchBonus] };
      const engDoors = eng ? (eng.hist[15] || 0) : 0, engKeys = eng ? eng.keys.filter(k => k[2] === 4).length : 0;
      const liveDoors = live.hist[15] || 0;
      const liveKeysValid = st.keys.filter(k => { const [x, y] = k.split(',').map(Number); return x < st.W && y < st.H && live && FLOORS[key] && FLOORS[key].assets.some(a => a.kind === 'chest' && a.x === x && a.y === y); }).length;
      console.log(`   engine ${eng ? eng.W + 'x' + eng.H : '-'} doors15=${engDoors} keyChests=${engKeys} torches24=${eng ? eng.hist[24] || 0 : 0}` +
        ` | live ${st.W}x${st.H} doors15=${liveDoors} keyChestPositions=${JSON.stringify(st.keys)} validKeys=${liveKeysValid} torches24=${live.hist[24] || 0} masked=${st.masked}`);
      if (engDoors || engKeys) check(`${key}: engine's locked door + key chest survive the A1D swap`, liveDoors > 0 && liveKeysValid > 0,
        `engine had ${engDoors} door tile(s) + ${engKeys} key chest(s); live floor has ${liveDoors} door tile(s), key positions ${JSON.stringify(st.keys)} (floor is ${st.W}x${st.H})`);
      if (id === 'mistyGrotto') {
        check(`${key}: fog torches (tile 24) survive the A1D swap`, (live.hist[24] || 0) > 0,
          `engine floor had ${eng ? eng.hist[24] || 0 : '?'} torch tile(s); authored floor lists ${FLOORS[key].assets.filter(a => a.kind === 'torch').length} torch asset(s) but A1D_TILE maps torch->0; live has ${live.hist[24] || 0}`);
      }
      // Open every authored chest through the real mover (bump), then look for the key item.
      const chests = FLOORS[key].assets.filter(a => a.kind === 'chest');
      let opened = 0;
      for (const c of chests) { const d = await bumpOpen(page, id, f, c.x, c.y); if (d) opened++; }
      const inv = await L.scene(page, `return gs.player.state.inventory.map(i=>i.itemId+'x'+i.quantity)`);
      const hasKey = inv.some(s => s.startsWith(`dungeonKey_${id}`));
      check(`${key}: chests open by bumping on the A1D floor`, opened === chests.length, `${opened}/${chests.length} opened`);
      if (engKeys) check(`${key}: opening every chest yields the dungeon key`, hasKey, `inventory after: ${JSON.stringify(inv)}`);
      if (f === 1 || id === 'mistyGrotto') {
        await L.scene(page, `w.showingMessage=false; try{w.hideMessage()}catch(e){}`);
        const ch = FLOORS[key].assets.find(a => a.kind === 'stairsDown' || a.kind === 'boss');
        await page.screenshot({ path: path.join(OUT, `${key}.jpg`), type: 'jpeg', quality: 70 });
      }
    }
  }
  // mistyGrotto engine floors 4-5 (declared floors 5; authored floors 3): procedural fog for contrast
  for (const f of [4]) {
    const key = `mistyGrotto-f${f}`;
    await L.enter(page, 'mistyGrotto', f);
    const st = await L.scene(page, `const mv=window.__A1_DNG_MOVE__; let masked=false; try{masked=!!mv.forScene(w)}catch(e){}
      const md=w.mapData; let t=[]; for(let y=0;y<md.length;y++) for(let x=0;x<md[y].length;x++) if(md[y][x]===24) t.push([x,y]);
      return {W:md[0].length,H:md.length,masked,fog:[w.fogEnabled,w.fogRadius,w.fogTorchBonus],torches:t,hero:[w.heroTileX,w.heroTileY]}`);
    res.floors[key] = st;
    console.log(`== ${key}`, JSON.stringify(st));
    // torch pickup on the engine floor: stand next to a torch and step onto it
    if (st.torches.length) {
      const [tx, ty] = st.torches[0];
      const nb = await L.scene(page, `for(const [dx,dy,d] of [[0,1,'up'],[0,-1,'down'],[1,0,'left'],[-1,0,'right']]){const r=w.mapData[a[1]+dy]; if(r&&r[a[0]+dx]===0) return [a[0]+dx,a[1]+dy,d];} return null`, [tx, ty]);
      if (nb) {
        await L.teleport(page, nb[0], nb[1]);
        const before = await L.scene(page, 'return [w.fogTorchCount,w.fogTorchBonus,w.fogRadius]');
        await L.step(page, nb[2]);
        const after = await L.scene(page, 'return [w.fogTorchCount,w.fogTorchBonus,w.fogRadius,w.mapData[a[1]][a[0]], w.__msgs.slice(-2)]', [tx, ty]);
        check(`${key}: torch pickup works on an ENGINE floor (control)`, after[0] === before[0] + 1, `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
      }
    }
    await page.screenshot({ path: path.join(OUT, `${key}-engine-fog.jpg`), type: 'jpeg', quality: 70 });
  }
  // crystalCave: coloured-pillar puzzle on its ENGINE floors (not in A1D_MAPS)
  for (const f of [1, 2]) {
    const key = `crystalCave-f${f}`;
    await L.enter(page, 'crystalCave', f);
    const st = await L.scene(page, `const mv=window.__A1_DNG_MOVE__; let masked=false; try{masked=!!mv.forScene(w)}catch(e){}
      const md=w.mapData; let walls=0; for(const r of md) for(const v of r) if(v===20) walls++;
      return {W:md[0].length,H:md.length,masked,pillars:w.crystalPillars.map(p=>[p.x,p.y,p.colorIdx,md[p.y][p.x]]),seq:w.crystalSequence,walls}`);
    res.floors[key] = st;
    console.log(`== ${key}`, JSON.stringify(st));
    const touch = async (idx) => {
      const p = st.pillars[idx];
      const nb = await L.scene(page, `for(const [dx,dy,d] of [[0,1,'up'],[0,-1,'down'],[1,0,'left'],[-1,0,'right']]){const r=w.mapData[a[1]+dy]; const v=r&&r[a[0]+dx]; if(v===0||v===2||v===8) return [a[0]+dx,a[1]+dy,d];} return null`, [p[0], p[1]]);
      if (!nb) return 'no-access';
      await L.teleport(page, nb[0], nb[1]);
      await L.clearMsg(page);
      await L.hold(page, nb[2], 220);
      await page.waitForTimeout(900);
      return L.scene(page, 'return {act:[...w.crystalActivated], msg:w.__msgs.slice(-1)[0]}');
    };
    if (st.pillars.length >= 2) {
      // wrong order first (the sequence's 2nd pillar), then the right order
      const wrong = await touch(st.seq[1]);
      check(`${key}: touching a pillar out of order resets the sequence`, wrong.act && wrong.act.length === 0, JSON.stringify(wrong));
      let last;
      for (const i of st.seq) last = await touch(i);
      await page.waitForTimeout(900);
      const after = await L.scene(page, `let walls=0; for(const r of w.mapData) for(const v of r) if(v===20) walls++;
        return {walls, solved: !!gs.player.state.storyFlags['pillars.'+w.currentMapId+'.f'+w.currentFloor+'.solved'], msgs:w.__msgs.slice(-3)}`);
      check(`${key}: pillars in sequence dissolve the crystal walls`, after.solved && after.walls === 0, `walls ${st.walls}->${after.walls}, ${JSON.stringify(after)}`);
      await L.clearMsg(page);
      await page.screenshot({ path: path.join(OUT, `${key}-pillars-solved.jpg`), type: 'jpeg', quality: 70 });
    } else check(`${key}: has a pillar puzzle`, false, `pillars ${st.pillars.length}, crystal walls ${st.walls}`);
  }
  res.errors = page.__errors;
  fs.writeFileSync(path.join(OUT, 'act1-results.json'), JSON.stringify(res, null, 1));
  await browser.close();
})();
