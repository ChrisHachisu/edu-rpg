'use strict';
// Full-bag probe (track H). Fails if a full bag (20 kinds of ordinary items) can still destroy
// something: a key item, a boss or quest reward, chest loot, gear taken off, gear replaced by a
// legendary piece; or if a save that already lost a story item is not repaired on load.
// Fix it guards: public/battle-recovery.js, block "QOK balance + bag (autoloop 2026-11-23)".
// Before the fix (build 98, port 5500) every group fails; see autoloop/honest/REPORT.md, B2.
//
//   NODE_PATH=/opt/node-tools/node_modules PROBE_URL=http://127.0.0.1:5504/ node scripts/auto/checks/bag.cjs
//
// One process, one Chromium, about a minute. Output: [PASS]/[FAIL] lines, one summary line, exit 1 on a FAIL.
// What is real and what is not:
//   real       Continue from a seeded save (the load path), Player.addItem / equip / unequip, the scene's
//              own applyQuestRewards, its wake() after a boss (on the boss's own floor), its
//              tryOpenTreasure on a chest of the loaded floor, the line it shows.
//   simulated  the boss fight itself (the flag its victory sets is written into the record), and the
//              chest's dice: Math.random is pinned for one call so that the chest holds an item.
const fs = require('fs'), path = require('path'), os = require('os');
process.env.PROBE_OUT = process.env.PROBE_OUT || path.join(os.tmpdir(), 'qok-bag');
const L = require('../../acts/probe/lib.cjs');
const ROOT = path.resolve(__dirname, '../../..');
const NEW = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/auto/honest/newgame/g3.json'), 'utf8'));
const DIST = process.env.BAG_DIST || '/home/user/work/dist';       // authored floor data only (the same in every build)
const A2 = JSON.parse(fs.readFileSync(path.join(DIST, 'acts-dungeons/manifest.json'), 'utf8'));
let pass = 0, fail = 0;
const rec = (ok, name, note) => { console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${note ? ': ' + note : ''}`); ok ? pass++ : fail++; };
const seed = (o = {}) => ({ version: 4, timestamp: Date.now(), playtime: 0, quizStats: {},
  player: { ...NEW, level: 20, hp: 150, maxHp: 150, atk: 80, def: 80, gold: 500, storyFlags: { ...(NEW.storyFlags || {}), 'intro.done': true, 'acts.geo2': true, ...(o.flags || {}) },
    inventory: o.inventory || [], equipment: { weapon: null, armor: null, shield: null, helmet: null, accessory: null, ...(o.equipment || {}) }, position: o.position || { mapId: 'overworld', x: 69, y: 256, floor: 1 }, ...(o.player || {}) } });
// 20 different ordinary items (things a shop sells), none of them used by a test below
const KEEP_OUT = ['herb', 'potion', 'hiPotion', 'elixir', 'smokeBomb', 'escapeCrystal', 'holyBlade', 'ironSword', 'leatherArmor'];
const fill = page => page.evaluate(out => { const p = window.__GAME_STATE__.player, db = window.__QOK.db;
  p.state.inventory = Object.keys(db).filter(id => db[id].buyPrice > 0 && db[id].type !== 'key' && !out.includes(id)).slice(0, 20).map(id => ({ itemId: id, quantity: 1 }));
  return p.state.inventory.length; }, KEEP_OUT);
const fullBag = () => Object.keys(ITEMS).filter(id => ITEMS[id].buyPrice > 0 && ITEMS[id].type !== 'key' && !KEEP_OUT.includes(id)).slice(0, 20).map(id => ({ itemId: id, quantity: 1 }));
let ITEMS = {};

(async () => {
  const o = await L.launch(); const page = o.page;
  const ev = (fn, a) => page.evaluate(fn, a);
  try {
    // ---------------------------------------------------------------- 1. rewards with a full bag (overworld)
    await L.bootSave(page, seed(), { settle: 1500 });
    ITEMS = await ev(() => JSON.parse(JSON.stringify(window.__QOK.db)));
    const n = await fill(page);
    rec(n === 20, 'setup: bag holds 20 kinds of ordinary items', n + ' stacks');
    const r1 = await ev(() => { const p = window.__GAME_STATE__.player, s = p.state, out = {};
      const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      for (const id of ['flameCloak', 'holyAmulet', 'windbreakerStone', 'ironOre', 'magmaBlade', 'dungeonKey_ironMine']) { out[id] = [p.addItem(id, 1), p.hasItem(id)]; }
      const g0 = s.gold; w.applyQuestRewards({ gold: 5, items: [{ itemId: 'holyBlade', quantity: 1 }] }); out.quest = [s.gold - g0, p.hasItem('holyBlade')];
      p.removeItem('holyBlade', 1);
      out.ordinary = p.addItem('holyBlade', 1);                               // the cap itself must still hold for things she buys
      // a legendary reward, the wake handler's own two calls
      s.equipment.weapon = 'ironSword'; p.addItem('excalibur', 1); p.equip('excalibur'); out.legend = [s.equipment.weapon, p.hasItem('ironSword')];
      // taking gear off
      s.equipment.armor = 'leatherArmor'; const u = p.unequip('armor'); out.unequip = [u, s.equipment.armor, p.hasItem('leatherArmor')];
      out.line = w.showingMessage ? (w.messageText && w.messageText.text) || '' : ''; out.want = window.__QOK.Z('shop.inventoryFull');
      return out; });
    for (const id of ['flameCloak', 'holyAmulet', 'windbreakerStone', 'ironOre']) rec(r1[id][0] === true && r1[id][1], `A1 key item ${id} is received with a full bag`, JSON.stringify(r1[id]));
    rec(r1.magmaBlade[1], 'A1 boss reward gear (magmaBlade) is received with a full bag', JSON.stringify(r1.magmaBlade));
    rec(r1['dungeonKey_ironMine'][1], 'A1 a dungeon key is received with a full bag', JSON.stringify(r1['dungeonKey_ironMine']));
    rec(r1.quest[0] === 5 && r1.quest[1], 'A1 quest reward item (the scene\'s applyQuestRewards) is received with a full bag', JSON.stringify(r1.quest));
    rec(r1.ordinary === false, 'the 20-kind limit still refuses a 21st ordinary item', String(r1.ordinary));
    rec(r1.legend[0] === 'excalibur' && r1.legend[1], 'A4 legendary auto-equip keeps the weapon it replaces', JSON.stringify(r1.legend));
    rec(r1.unequip[1] === 'leatherArmor' || r1.unequip[2], 'A3 taking armour off with a full bag does not delete it', JSON.stringify(r1.unequip));
    rec(r1.unequip[0] === null && r1.unequip[1] === 'leatherArmor', 'A3 ... it is refused and stays on', JSON.stringify(r1.unequip));
    rec(!!r1.line && r1.line === r1.want && r1.want[0] !== '[', 'A3 ... with the line "' + r1.want + '"', JSON.stringify(r1.line));

    // the same refusal through the menu: MenuScene.handleEquipAction on the equipped armour, and the toast it raises
    const r1b = await ev(async () => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), p = window.__GAME_STATE__.player;
      if (w.hideMessage) w.hideMessage(); w.showingMessage = false;
      w.scene.launch('MenuScene'); w.scene.pause();
      await new Promise(r => setTimeout(r, 700));
      const ms = g.scene.getScene('MenuScene'); ms.equipMode = 'equipped'; ms.equipSlotIndex = 1;
      ms.handleEquipAction();
      await new Promise(r => setTimeout(r, 500));
      const t = [...document.querySelectorAll('.qok-toast')].map(e => e.textContent);
      const out = { armor: p.state.equipment.armor, toast: t, want: window.__QOK.Z('shop.inventoryFull') };
      ms.scene.stop(); w.scene.resume(); return out; });
    rec(r1b.armor === 'leatherArmor', 'A3 menu: Unequip on a full bag leaves the armour on', r1b.armor);
    rec(r1b.toast.includes(r1b.want), 'A3 menu: the player sees "' + r1b.want + '"', JSON.stringify(r1b.toast));

    // languages: the lines are the game's own shop / treasure lines, present in all three scripts
    const langs = await ev(() => { const s = window.__GAME_STATE__.player.state, Z = window.__QOK.Z, keep = [s.locale, s.kanjiMode], out = {};
      const set = window.__QOK.setLoc || null; out.en = [Z('shop.inventoryFull'), Z('treasure.foundItem', { item: 'X' })]; return out; });
    rec(langs.en.every(t => t && t[0] !== '['), 'the two lines exist in the game\'s own string table', JSON.stringify(langs.en));

    // ---------------------------------------------------------------- 2. the boss's own reward handler, on its floor
    const bossKey = Object.keys(A2.floors).filter(k => /^desertTomb-f\d+$/.test(k)).sort((x, y) => +x.split('-f')[1] - +y.split('-f')[1]).pop(), bossFloor = A2.floors[bossKey], bossFloorNo = +bossKey.split('-f')[1];
    const at = (bossFloor.land && bossFloor.land.fromPrev) || bossFloor.assets.find(a => a.kind === 'stairsUp');
    await L.bootSave(page, seed({ position: { mapId: 'desertTomb', x: at.x, y: at.y, floor: bossFloorNo }, inventory: fullBag() }), { settle: 2000 });
    const r2 = await ev(async () => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), p = window.__GAME_STATE__.player, s = p.state;
      const before = s.inventory.length, hasBossTile = w.mapData.some(r => r.includes(7));
      s.storyFlags['boss.sandGolem.defeated'] = true; w.pendingBossId = 'sandGolem';     // what the won battle leaves behind
      w.wake();
      await new Promise(r => setTimeout(r, 1500));
      return { map: w.currentMapId, floor: w.currentFloor, hasBossTile, before, cloak: p.hasItem('flameCloak'), armor: p.hasItem('sandstormCloak'), shard: p.hasItem('shadowCrystal') }; });
    rec(r2.map === 'desertTomb' && r2.hasBossTile && r2.before === 20, 'setup: on Sand Golem\'s floor with a full bag', JSON.stringify(r2));
    rec(r2.cloak, 'A1 Sand Golem\'s Flame Cloak arrives (the scene\'s wake handler)', String(r2.cloak));
    rec(r2.armor && r2.shard, 'A1 ... and the Sandstorm Cloak and the shard', JSON.stringify([r2.armor, r2.shard]));

    // ---------------------------------------------------------------- 3. a chest with a full bag
    const A1 = JSON.parse(fs.readFileSync(path.join(DIST, 'act1-dungeon-floors.json'), 'utf8')).floors['whisperingWoodsCave-f1'];
    const mouth = A1.assets.find(a => a.kind === 'mouth');
    await L.bootSave(page, seed({ position: { mapId: 'whisperingWoodsCave', x: mouth.x, y: mouth.y, floor: 1 }, inventory: fullBag(), flags: { 'quest.owlsLesson.started': true } }), { settle: 2000 });
    const r3 = await ev(async () => { const g = window.__PHASER_GAME__, w = g.scene.getScene('WorldMapScene'), p = window.__GAME_STATE__.player, s = p.state, Z = window.__QOK.Z;
      const chests = []; w.mapData.forEach((row, y) => row.forEach((v, x) => { if (v === 4) chests.push([x, y]); }));
      const out = { map: w.currentMapId, chests: chests.length, stacks: s.inventory.length, want: Z('shop.inventoryFull') };
      if (!chests.length) return out;
      const [cx, cy] = chests[0], key = `chest.${w.currentMapId}.f${w.currentFloor}.${cx}.${cy}`, rnd = Math.random;
      const msg = () => (w.showingMessage && w.messageText && w.messageText.text) || '';
      // (a) the chest holds a potion and the bag is full
      Math.random = () => 0.99; let g0 = s.gold; w.tryOpenTreasure(cx, cy); Math.random = rnd;
      out.a = { opened: !!s.storyFlags[key], tile: w.mapData[cy][cx], gold: s.gold - g0, potion: p.hasItem('potion'), line: msg() };
      if (w.hideMessage) w.hideMessage(); w.showingMessage = false;
      // (b) she makes room and tries again: it opens and the potion is hers
      if (!out.a.opened) { s.inventory.pop(); Math.random = () => 0.99; g0 = s.gold; w.tryOpenTreasure(cx, cy); Math.random = rnd;
        out.b = { opened: !!s.storyFlags[key], tile: w.mapData[cy][cx], gold: s.gold - g0, potion: p.hasItem('potion'), line: msg() }; }
      return out; });
    rec(r3.map === 'whisperingWoodsCave' && r3.chests > 0 && r3.stacks === 20, 'setup: on a floor with a chest, bag full', JSON.stringify({ map: r3.map, chests: r3.chests, stacks: r3.stacks }));
    if (r3.a) {
      rec(r3.a.potion || !r3.a.opened, 'A2 a chest does not eat its item when the bag is full', JSON.stringify(r3.a));
      rec(!r3.a.opened && r3.a.tile === 4 && r3.a.gold === 0, 'A2 ... it stays shut, nothing taken', JSON.stringify(r3.a));
      rec(r3.a.line === r3.want, 'A2 ... and says "' + r3.want + '"', JSON.stringify(r3.a.line));
      rec(!!r3.b && r3.b.opened && r3.b.potion && r3.b.gold > 0, 'A2 with room made, the same chest opens and gives the potion', JSON.stringify(r3.b || null));
    }

    // ---------------------------------------------------------------- 4. a save that already lost its story items
    const lost = { 'boss.sandGolem.defeated': true, 'boss.stormHarpy.defeated': true, 'boss.stormSentinel.defeated': true, 'boss.serpent.defeated': true };
    await L.bootSave(page, seed({ flags: lost, inventory: fullBag() }), { settle: 2500 });
    const r4 = await ev(() => { const p = window.__GAME_STATE__.player, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene');
      return { cloak: p.hasItem('flameCloak'), stone: p.hasItem('windbreakerStone'), shield: p.hasItem('galeShield') || p.state.equipment.shield === 'galeShield', shards: p.getItemCount('shadowCrystal'),
        excalibur: p.hasItem('excalibur'), line: (w.showingMessage && w.messageText && w.messageText.text) || '' }; });
    rec(r4.cloak, 'A5 old save: Sand Golem beaten, no Flame Cloak -> it is back after Continue', String(r4.cloak));
    rec(r4.stone, 'A5 old save: Storm Harpy beaten, canyon still shut, no Windbreaker Stone -> it is back', String(r4.stone));
    rec(r4.shield, 'A5 old save: Storm Sentinel beaten, no Gale Shield -> it is back', String(r4.shield));
    rec(r4.shards === 3, 'A5 old save: one crystal shard per shard boss beaten (3)', String(r4.shards));
    rec(!r4.excalibur, 'A5 nothing is handed out for a boss that still stands', String(r4.excalibur));
    rec(!!r4.line && r4.line[0] !== '[', 'A5 the player is told', JSON.stringify(r4.line));
    // and a save past the gate gets nothing it no longer needs
    await L.bootSave(page, seed({ flags: { 'boss.sandGolem.defeated': true, 'boss.lavaWyrm.defeated': true, 'boss.stormHarpy.defeated': true, 'canyon.windCleared': true } }), { settle: 2500 });
    const r5 = await ev(() => { const p = window.__GAME_STATE__.player; return { cloak: p.hasItem('flameCloak'), stone: p.hasItem('windbreakerStone') }; });
    rec(!r5.cloak && !r5.stone, 'A5 a save already past Magma Tunnels and the canyon is left alone', JSON.stringify(r5));
    // ---------------------------------------------------------------- 5. the two lines in Japanese (kana, then kanji)
    for (const kj of [false, true]) {
      const tag = kj ? 'kanji' : 'kana', full = kj ? '持ち物が いっぱいだ！' : 'もちものが いっぱいだ！', got = kj ? 'を 手に入れた！' : 'を てにいれた！';
      await L.bootSave(page, seed({ flags: { 'boss.sandGolem.defeated': true }, inventory: fullBag(), equipment: { armor: 'leatherArmor' }, player: { locale: 'ja', kanjiMode: kj } }), { settle: 2500, extra: { 'edu-rpg-locale': 'ja' } });
      const r6 = await ev(() => { const p = window.__GAME_STATE__.player, w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), out = {};
        out.loc = window.__QOK.loc ? window.__QOK.loc() : p.state.locale; out.cloak = p.hasItem('flameCloak');
        out.repair = (w.showingMessage && w.messageText && w.messageText.text) || '';
        try { w.hideMessage(); w.showingMessage = false; } catch (e) {}
        out.un = p.unequip('armor'); out.armor = p.state.equipment.armor;
        out.full = (w.showingMessage && w.messageText && w.messageText.text) || ''; return out; });
      rec(r6.loc === 'ja' && r6.cloak && r6.repair.replace(/\n/g, '').includes(got), `A5 ${tag}: the repaired item is announced as "...${got}"`, JSON.stringify(r6.repair));
      rec(!r6.un && r6.armor === 'leatherArmor' && r6.full.replace(/\n/g, '') === full, `A3 ${tag}: the refusal reads "${full}"`, JSON.stringify(r6.full));
    }
    const errs = (o.errors || []).filter(e => !/favicon|ERR_ABORTED/.test(String(e && e.m || e)));
    rec(errs.length === 0, 'no page errors', errs.slice(0, 3).map(e => String(e && e.m || e)).join(' | '));
  } catch (e) { rec(false, 'probe crashed', String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
  finally { await o.browser.close(); }
  console.log(`bag: ${pass} pass, ${fail} fail (${process.env.PROBE_URL || 'default url'})`);
  process.exit(fail ? 1 : 0);
})();
