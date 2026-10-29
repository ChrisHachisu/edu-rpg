#!/usr/bin/env node
/* Acts 2-5 dungeon mechanics on the bundle's OWN layouts (engine tile stepping), tested in the
 * running game: seeded save -> Continue -> place the hero beside the mechanic cell -> real arrow-key
 * input -> read the scene. Proves whether the ENGINE code for each mechanic works at all.
 *   node scripts/acts/mechanics/acts25.cjs <outdir> [testName,...]
 */
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const OUT = process.argv[2] || '/tmp/mech-acts25';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
const res = { checks: [], notes: {} };
const check = (name, ok, detail) => { res.checks.push({ name, ok, detail }); console.log(`  ${ok === null ? 'N/A ' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };
let T, page;

async function go(id, f, opts) { page = await L.fresh(T); await L.enter(page, id, f, opts); return page; }
const S = (src, a) => L.scene(page, src, a);
// all cells with tile v (optionally limited), each with a walkable neighbour to step FROM
const APPROACH = `
  const md=w.mapData, out=[]; const ok=new Set(a.from||[0]);
  for(let y=1;y<md.length-1;y++) for(let x=1;x<md[y].length-1;x++){ if(md[y][x]!==a.v) continue;
    for(const [dx,dy,d] of [[0,1,'up'],[0,-1,'down'],[1,0,'left'],[-1,0,'right']]){
      const v=md[y+dy]?.[x+dx]; if(ok.has(v)){ out.push({x,y,fx:x+dx,fy:y+dy,dir:d}); break; } }
    if(out.length>=(a.max||50)) break; }
  return out;`;
async function approach(v, opts = {}) { return S(APPROACH, Object.assign({ v }, opts)); }
async function shot(name) { await L.clearMsg(page); await L.shot(page, path.join(OUT, name + '.jpg')); }
const tile = (x, y) => S('return w.mapData[a[1]]?.[a[0]]', [x, y]);
const inv = () => S('return gs.player.state.inventory.filter(i=>i.quantity>0).map(i=>i.itemId)');

const TESTS = {
  async keyDoor() {               // generic key chest -> dungeonKey -> locked door 15 (ironMine)
    for (const [id, f] of [['ironMine', 2], ['ironMine', 3], ['ironMine', 4], ['oasisDepths', 2]]) {
      await go(id, f);
      const keys = await S('return [...w.keyChestPositions].map(k=>k.split(",").map(Number))');
      const doors = await approach(15);
      if (!keys.length || !doors.length) { console.log(`   ${id}-f${f}: keys ${keys.length} doors ${doors.length}, next`); continue; }
      const [kx, ky] = keys[0];
      const kn = await S(APPROACH.replace('a.v)', 'a.v||x!==a.kx||y!==a.ky)'), { v: 4, kx, ky });
      // door first, without the key
      await L.teleportIdle(page, doors[0].fx, doors[0].fy);
      const noKey = await L.step(page, doors[0].dir);
      const blocked = noKey.after[0] === noKey.before[0] && noKey.after[1] === noKey.before[1];
      const msg1 = await S('return w.__msgs.slice(-1)[0]');
      check(`${id}-f${f}: locked door (15) blocks without the key`, blocked, `msg "${msg1}"`);
      await L.clearMsg(page);
      await L.teleportIdle(page, kn[0].fx, kn[0].fy);
      await L.step(page, kn[0].dir);
      await page.waitForTimeout(900);
      const items = await inv();
      check(`${id}-f${f}: key chest at (${kx},${ky}) gives dungeonKey_${id}`, items.includes(`dungeonKey_${id}`), JSON.stringify(items));
      await L.clearMsg(page);
      await L.teleportIdle(page, doors[0].fx, doors[0].fy);
      const st = await L.step(page, doors[0].dir);
      const after = await tile(doors[0].x, doors[0].y);
      check(`${id}-f${f}: key opens the locked door`, after === 0 && !(await inv()).includes(`dungeonKey_${id}`),
        `door tile now ${after}, hero ${JSON.stringify(st.after)}`);
      await shot(`${id}-f${f}-door-open`);
      return;
    }
    check('keyDoor: found a floor with key chest + door', false, '');
  },
  async wind() {                   // stormNest: tile 19 pushes back; windbreakerStone_ from key chest clears it
    for (let f = 2; f <= 5; f++) {
      await go('stormNest', f);
      const w19 = await approach(19);
      const keys = await S('return [...w.keyChestPositions].map(k=>k.split(",").map(Number))');
      if (!w19.length) continue;
      res.notes[`stormNest-f${f}`] = { wind19: w19.length, keys, overlays: await S('return (w._windTileOverlays||[]).length') };
      await shot(`stormNest-f${f}-wind`);
      await L.teleportIdle(page, w19[0].fx, w19[0].fy);
      const s1 = await L.step(page, w19[0].dir);
      const msg = await S('return w.__msgs.slice(-1)[0]');
      check(`stormNest-f${f}: wind gust (19) refuses entry without the stone`, (await tile(w19[0].x, w19[0].y)) === 19 && !(s1.after[0] === w19[0].x && s1.after[1] === w19[0].y),
        `hero ${JSON.stringify(s1.before)} -> ${JSON.stringify(s1.after)}, msg "${msg}"`);
      await L.clearMsg(page);
      if (keys.length) {
        const kn = await S(APPROACH.replace('a.v)', 'a.v||x!==a.kx||y!==a.ky)'), { v: 4, kx: keys[0][0], ky: keys[0][1] });
        await L.teleportIdle(page, kn[0].fx, kn[0].fy); await L.step(page, kn[0].dir); await page.waitForTimeout(900);
        const items = await inv();
        check(`stormNest-f${f}: key chest gives windbreakerStone_stormNest`, items.includes('windbreakerStone_stormNest'), JSON.stringify(items));
        await L.clearMsg(page);
        await L.teleportIdle(page, w19[0].fx, w19[0].fy);
        await L.step(page, w19[0].dir);
        check(`stormNest-f${f}: the stone calms the gust (19 -> 0)`, (await tile(w19[0].x, w19[0].y)) === 0, `tile ${await tile(w19[0].x, w19[0].y)}`);
      } else check(`stormNest-f${f}: has a key chest for the stone`, false, 'no keyChestPositions');
      return;
    }
  },
  async forestMaze() {
    await go('hauntedForest', 2);
    const st = await S('return {W:w.mapData[0].length,H:w.mapData.length,cy:w.forestMazeCorrectExitY,exits:w.mapData.map((r,y)=>[y,r[r.length-1]]).filter(e=>e[1]!==1)}');
    res.notes['hauntedForest-f2'] = st;
    await shot('hauntedForest-f2');
    const wrong = st.exits.find(e => e[0] !== st.cy && e[1] === 0);
    if (wrong) {
      await L.teleportIdle(page, st.W - 1, wrong[0]);
      await L.hold(page, 'right', 300); await page.waitForTimeout(2500);
      const r = await S('return {f:w.currentFloor, hero:[w.heroTileX,w.heroTileY], msgs:w.__msgs.slice(-2)}');
      check('hauntedForest-f2: a wrong east exit loops you back (floor unchanged, hero reset)', r.f === 2 && r.hero[0] === 1, JSON.stringify(r));
      await L.clearMsg(page);
    } else check('hauntedForest-f2: has wrong exits', false, JSON.stringify(st.exits));
    await L.teleportIdle(page, st.W - 1, st.cy);
    await L.hold(page, 'right', 300); await page.waitForTimeout(3000);
    const r2 = await S('return {f:w.currentFloor, hero:[w.heroTileX,w.heroTileY], msgs:w.__msgs.slice(-2)}');
    check(`hauntedForest-f2: the correct exit (y=${st.cy}, tile ${st.exits.find(e => e[0] === st.cy)?.[1]}) leads to floor 3`, r2.f === 3, JSON.stringify(r2));
  },
  async ice() {
    for (const id of ['frozenLake', 'frostfallCavern']) {
      await go(id, 1);
      const c = await S(`
        const md=w.mapData, H=md.length, W=md[0].length;
        for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ if(md[y][x]!==0) continue;
          for(const [dx,dy,d] of [[1,0,'right'],[-1,0,'left'],[0,1,'down'],[0,-1,'up']])
            if(md[y+dy][x+dx]===25 && md[y+2*dy]?.[x+2*dx]===25 && md[y+3*dy]?.[x+3*dx]===25) return {x,y,d};}
        return null`);
      if (!c) { check(`${id}-f1: has an ice run`, false, ''); continue; }
      await L.teleportIdle(page, c.x, c.y);
      const s = await L.step(page, c.d, { after: 1500 });
      const dist = Math.abs(s.after[0] - c.x) + Math.abs(s.after[1] - c.y);
      const stopTile = await tile(s.after[0], s.after[1]);
      check(`${id}-f1: stepping onto slide ice (25) slides more than one cell`, dist > 1, `from (${c.x},${c.y}) ${c.d} -> ${JSON.stringify(s.after)}, ${dist} cells, stopped on tile ${stopTile}`);
      await shot(`${id}-f1-ice`);
    }
  },
  async darkness() {
    await go('shadowCave', 2);
    const st = await S('return {en:w.darknessPulseEnabled, patrols:w.darknessPulsePatrols.map(p=>p.waypoints.map(q=>[q.x,q.y]))}');
    const phases = [];
    for (let i = 0; i < 18; i++) { phases.push(await S('return w.darknessPulsePhase')); await page.waitForTimeout(500); }
    const toggles = phases.filter((p, i) => i && p !== phases[i - 1]).length;
    check('shadowCave-f2: darkness pulse cycles light <-> dark', st.en && toggles >= 1, `phases ${phases.join(',')}`);
    if (st.patrols.length) {
      const wp = st.patrols[0];
      // wait for the dark phase, then stand on the patrol's route end and let it walk into us
      await L.teleportIdle(page, wp[wp.length - 1][0], wp[wp.length - 1][1]);
      let caught = false;
      for (let i = 0; i < 40 && !caught; i++) { await page.waitForTimeout(400); caught = (await S('return w.__battles.length')) > 0; }
      check('shadowCave-f2: a shadow patrol that reaches the hero in the dark starts a battle', caught, `patrols ${st.patrols.length}, route ${JSON.stringify(wp)}, battles ${JSON.stringify(await S('return w.__battles'))}`);
    } else check('shadowCave-f2: has patrols', false, '');
    await shot('shadowCave-f2');
  },
  async sandTrap() {
    await go('desertTomb', 1);
    const g = await S('return {active:w.glyphTrialActive, corridor:w.glyphCorridor, plates:w.glyphPlates.length, safeSym:w.glyphSafeSym}');
    res.notes['desertTomb-f1-glyph'] = g;
    await shot('desertTomb-f1');
    const ring = await approach(27, { from: [0, 27] });
    const pit = await approach(26, { from: [27, 0] });
    if (ring.length) {
      let pulled = 0, tries = 0;
      for (const r of ring.slice(0, 12)) {
        for (let k = 0; k < 3; k++) {
          await L.teleportIdle(page, r.fx, r.fy); tries++;
          const s = await L.step(page, r.dir, { after: 700 });
          if (s.after[0] !== r.x || s.after[1] !== r.y) { pulled++; }
          await L.clearMsg(page);
        }
      }
      check('desertTomb-f1: sinking sand (27) sometimes pulls the hero toward the pit', pulled > 0, `${pulled} pull(s) in ${tries} steps onto 27 (30% each)`);
    } else check('desertTomb-f1: has sinking sand', false, '');
    if (pit.length) {
      await L.teleportIdle(page, pit[0].fx, pit[0].fy);
      await L.step(page, pit[0].dir, { after: 2200 });
      const m = await S('return {msgs:w.__msgs.slice(-3), hero:[w.heroTileX,w.heroTileY], battles:w.__battles}');
      check('desertTomb-f1: stepping into the pit (26) triggers the pit fall', m.msgs.some(s => /pit/i.test(s)), JSON.stringify(m));
    }
    if (g.active) {
      const bad = await S('const p=w.glyphPlates.find(p=>!p.safe && p.row===0); return p?[p.x,p.y]:null');
      if (bad) {
        await L.teleportIdle(page, bad[0], bad[1] - 1);
        await L.step(page, 'down', { after: 2500 });
        const r = await S('return {hero:[w.heroTileX,w.heroTileY], msgs:w.__msgs.slice(-2)}');
        check('desertTomb-f1: a wrong glyph plate throws you back (sandstorm)', !(r.hero[0] === bad[0] && r.hero[1] === bad[1]), JSON.stringify(r));
      }
    }
  },
  async bandit() {
    await go('banditHideout', 3);
    const spikes = await approach(30), wires = await approach(31);
    res.notes['banditHideout-f3'] = { spikes: spikes.length, wires: wires.length };
    await shot('banditHideout-f3');
    if (spikes.length) {
      const hp0 = await S('return gs.player.state.hp');
      await L.teleportIdle(page, spikes[0].fx, spikes[0].fy); await L.step(page, spikes[0].dir);
      const hp1 = await S('return gs.player.state.hp');
      check('banditHideout-f3: spike trap (30) damages and becomes sprung (32)', hp1 < hp0 && (await tile(spikes[0].x, spikes[0].y)) === 32, `hp ${hp0}->${hp1}, tile ${await tile(spikes[0].x, spikes[0].y)}`);
      await L.clearMsg(page);
    } else check('banditHideout-f3: has spike traps', false, '');
    if (wires.length) {
      await L.teleportIdle(page, wires[0].fx, wires[0].fy); await L.step(page, wires[0].dir);
      const p = await S('return {poison:gs.player.state.poisonedUntil>Date.now(), tile:w.mapData[a[1]][a[0]]}', [wires[0].x, wires[0].y]);
      check('banditHideout-f3: tripwire (31) poisons and is cleared', p.poison && p.tile === 0, JSON.stringify(p));
    } else check('banditHideout-f3: has tripwires', false, '');
  },
  async lava() {
    await go('magmaTunnels', 1);
    const lv = await approach(5);
    if (!lv.length) { check('magmaTunnels-f1: has lava', false, ''); return; }
    // wait for the crusted (passable) phase
    const waitPhase = async (want) => { for (let i = 0; i < 50; i++) { if ((await S('return !!w.lavaPhase')) === want) return true; await page.waitForTimeout(200); } return false; };
    await L.teleportIdle(page, lv[0].fx, lv[0].fy);
    await waitPhase(false); await page.waitForTimeout(200);
    const s0 = await L.step(page, lv[0].dir, { timeout: 500 });
    check('magmaTunnels-f1: molten lava (5) blocks while lavaPhase=false', s0.after[0] === s0.before[0] && s0.after[1] === s0.before[1], JSON.stringify(s0));
    await L.teleportIdle(page, lv[0].fx, lv[0].fy);
    await waitPhase(true); await page.waitForTimeout(100);
    const s1 = await L.step(page, lv[0].dir, { timeout: 800 });
    check('magmaTunnels-f1: crusted lava is walkable while lavaPhase=true', s1.after[0] === lv[0].x && s1.after[1] === lv[0].y, JSON.stringify(s1));
    const hp0 = await S('return gs.player.state.hp');
    await waitPhase(false); await page.waitForTimeout(600);
    const hp1 = await S('return {hp:gs.player.state.hp, hero:[w.heroTileX,w.heroTileY], tile:w.mapData[w.heroTileY][w.heroTileX]}');
    check('magmaTunnels-f1: standing on lava when it turns molten burns the hero', hp1.hp < hp0, `hp ${hp0}->${hp1.hp} at ${JSON.stringify(hp1.hero)} tile ${hp1.tile}`);
    await shot('magmaTunnels-f1-lava');
  },
  async mirror() {
    await go('demonCastle', 2);
    const rooms = await S('return w.mirrorRoomBounds');
    res.notes['demonCastle-f2'] = { rooms };
    if (!rooms.length) { check('demonCastle-f2: mirror rooms detected', false, '0 rooms'); return; }
    // a floor cell inside the first room with free cells left and right
    const c = await S(`for(const b of a) for(let y=b.y;y<b.y+b.h;y++) for(let x=b.x+1;x<b.x+b.w-1;x++){const r=w.mapData[y]; if(r[x]===0&&r[x-1]===0&&r[x+1]===0) return [x,y];} return null`, rooms);
    if (!c) { check('demonCastle-f2: mirror room has a 3-wide floor run', false, JSON.stringify(rooms)); return; }
    await L.teleportIdle(page, c[0], c[1]);
    await S('w.updateMirrorState()');
    const s = await L.step(page, 'right');
    const act = await S('return w.mirrorActive');
    check('demonCastle-f2: controls invert inside a mirror room (Right moves left)', s.after[0] === c[0] - 1, `mirrorActive ${act}, ${JSON.stringify(s)}, rooms ${JSON.stringify(rooms)}`);
    await shot('demonCastle-f2-mirror');
  },
  async windTower() {
    await go('stormreachSpire', 1);
    const st = await S('return {en:w.windTowerEnabled, dir:w.windTowerDir}');
    const cells = await S(`const md=w.mapData,d=w.windTowerDir,o=[]; for(let y=1;y<md.length-1;y++) for(let x=1;x<md[0].length-1;x++) if(md[y][x]===25){const n=md[y+d.dy]?.[x+d.dx]; if(n===25||n===0) o.push([x,y]);} return o.slice(0,5)`);
    if (!cells.length) { check('stormreachSpire-f1: has wind corridor tiles', false, JSON.stringify(st)); return; }
    await L.teleportIdle(page, cells[0][0], cells[0][1]);
    let moved = null;
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); const h = await S('return [w.heroTileX,w.heroTileY,w.windTowerPhase]'); if (h[0] !== cells[0][0] || h[1] !== cells[0][1]) { moved = h; break; } }
    check('stormreachSpire-f1: a wind gust pushes the hero along windCorridorDir', !!moved, `dir ${JSON.stringify(st.dir)} from ${JSON.stringify(cells[0])} -> ${JSON.stringify(moved)}`);
    await shot('stormreachSpire-f1-wind');
  },
  async mazeHunter() {
    await go('sunkenTempleDungeon', 2);
    const st = await S('return {en:w.mazeHunterEnabled, W:w.mapData[0].length}');
    // walk around until 5 steps are counted
    const free = await S(`const md=w.mapData,o=[]; for(let y=1;y<md.length-1;y++) for(let x=1;x<md[0].length-2;x++) if(md[y][x]===0&&md[y][x+1]===0) o.push([x,y]); return o[Math.floor(o.length/2)]`);
    await L.teleportIdle(page, free[0], free[1]);
    for (let i = 0; i < 6; i++) await L.step(page, i % 2 ? 'left' : 'right', { after: 200 });
    await page.waitForTimeout(1500);
    const r = await S('return {steps:w.mazeHunterStepCount, active:w.mazeHunterActive, boss:[w.mazeHunterBossTileX,w.mazeHunterBossTileY], sprite:!!w.mazeHunterBossSprite}');
    check('sunkenTempleDungeon-f2: the hunter spawns after 5 steps', st.en && r.active && r.sprite, JSON.stringify(Object.assign({}, st, r)));
    await shot('sunkenTempleDungeon-f2-hunter');
    await go('sunkenTempleDungeon', 6);
    const gc = await S('return w.goldenChestPos?[w.goldenChestPos.x,w.goldenChestPos.y,w.mapData[w.goldenChestPos.y][w.goldenChestPos.x]]:null');
    if (gc) {
      const kn = await S(APPROACH.replace('a.v)', 'a.v||x!==a.kx||y!==a.ky)'), { v: 4, kx: gc[0], ky: gc[1] });
      await L.teleportIdle(page, kn[0].fx, kn[0].fy); await L.step(page, kn[0].dir); await page.waitForTimeout(800);
      check('sunkenTempleDungeon-f6: the golden chest gives the Holy Amulet', (await inv()).includes('holyAmulet'), JSON.stringify(await inv()));
    } else check('sunkenTempleDungeon-f6: golden chest placed', false, '');
  },
  async portals() {
    await go('twilightDungeon', 3);
    const pp = await S('return {en:w.shadowPortalEnabled, pairs:w.portalPairs.map(p=>[[p.a.x,p.a.y,w.mapData[p.a.y][p.a.x]],[p.b.x,p.b.y,w.mapData[p.b.y][p.b.x]]])}');
    res.notes['twilightDungeon-f3'] = pp;
    if (!pp.pairs.length) { check('twilightDungeon-f3: portal pairs', false, JSON.stringify(pp)); return; }
    const [a, b] = pp.pairs[0];
    const nb = await S(`for(const [dx,dy,d] of [[0,1,'up'],[0,-1,'down'],[1,0,'left'],[-1,0,'right']]){const v=w.mapData[a[1]+dy]?.[a[0]+dx]; if(v===0) return [a[0]+dx,a[1]+dy,d];} return null`, a);
    await L.teleportIdle(page, nb[0], nb[1]);
    await L.step(page, nb[2], { after: 1500 });
    const h = await S('return [w.heroTileX,w.heroTileY]');
    check('twilightDungeon-f3: a shadow portal (29) teleports to its pair', h[0] === b[0] && h[1] === b[1], `entered (${a[0]},${a[1]}) -> ${JSON.stringify(h)}, pair (${b[0]},${b[1]})`);
    await shot('twilightDungeon-f3-portal');
  },
  async hiddenMimic() {
    // first floor of an N-set dungeon that has a hidden wall (17), and any floor with a mimic
    let didHidden = false, didMimic = false;
    for (const [id, f] of [['scorchedRuins', 1], ['scorchedRuins', 2], ['emberMines', 1], ['emberMines', 2], ['voidRift', 1], ['oasisDepths', 1], ['oasisDepths', 2], ['oasisDepths', 3], ['desertTomb', 2], ['banditHideout', 1], ['obsidianCavern', 1], ['obsidianCavern', 2], ['demonBarracks', 1], ['demonBarracks', 2]]) {
      if (didHidden && didMimic) break;
      await go(id, f);
      const h17 = await approach(17);
      const mim = await S('return [...w.mimicChestPositions].map(k=>k.split(",").map(Number)).filter(([x,y])=>w.mapData[y][x]===4)');
      if (!didHidden && h17.length) {
        await L.teleportIdle(page, h17[0].fx, h17[0].fy); await L.step(page, h17[0].dir);
        const r = await S('return {flag:!!gs.player.state.storyFlags[`hidden.${w.currentMapId}.f${w.currentFloor}.${a[0]}.${a[1]}`], hero:[w.heroTileX,w.heroTileY], msgs:w.__msgs.slice(-1)}', [h17[0].x, h17[0].y]);
        check(`${id}-f${f}: walking into a hidden wall (17) reveals the hidden room`, r.flag, JSON.stringify(r));
        await shot(`${id}-f${f}-hidden`);
        await L.clearMsg(page); didHidden = true;
      }
      if (!didMimic && mim.length) {
        const kn = await S(APPROACH.replace('a.v)', 'a.v||x!==a.kx||y!==a.ky)'), { v: 4, kx: mim[0][0], ky: mim[0][1], from: [0, 2, 17] });
        if (kn.length) {
          await L.teleportIdle(page, kn[0].fx, kn[0].fy); await L.step(page, kn[0].dir); await page.waitForTimeout(1200);
          const b = await S('return {battles:w.__battles, msgs:w.__msgs.slice(-1)}');
          check(`${id}-f${f}: opening a mimic chest starts the mimic battle`, b.battles.length > 0, JSON.stringify(b));
          didMimic = true;
        }
      }
    }
    if (!didHidden) check('hidden wall (17) found on a scanned floor', false, '');
    if (!didMimic) check('mimic chest found on a scanned floor', false, '');
  },
};

(async () => {
  T = await L.launch();
  for (const [name, fn] of Object.entries(TESTS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    console.log(`== ${name}`);
    try { await fn(); } catch (e) { check(`${name}: harness`, false, String(e).slice(0, 300)); }
    fs.writeFileSync(path.join(OUT, 'acts25-results.json'), JSON.stringify(res, null, 1));
  }
  await T.browser.close();
})();
