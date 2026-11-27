'use strict';
// Honest player, repro: what the game does when the bag already holds 20 stacks (the bundle's cap).
//   NODE_PATH=/opt/node-tools/node_modules node scripts/auto/honest/bagcap.cjs
// Boots the game's own New Game record (grade 3), fills the bag with 20 different real items and then
// calls the game's own code paths. Prints one JSON object; nothing is written to the game.
const fs = require('fs'), path = require('path');
process.env.PROBE_URL = process.env.PROBE_URL || 'http://127.0.0.1:5500/';
process.env.PROBE_OUT = process.env.PROBE_OUT || '/home/user/work/honest/probe-out';
const L = require('../../acts/probe/lib.cjs');
(async () => {
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'newgame', 'g3.json'), 'utf8'));
  const o = await L.launch(); const page = o.page;
  try {
    await L.bootSave(page, { version: 4, timestamp: Date.now(), player: { ...st, position: { mapId: 'overworld', x: 69, y: 256, floor: 1 } }, playtime: 0, quizStats: {} }, { settle: 1500 });
    const out = await page.evaluate(() => {
      const gs = window.__GAME_STATE__, p = gs.player, s = p.state, db = window.__QOK.db;
      const wm = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), r = {};
      // 20 different stacks, the way a child who never sells ends up: old gear, materials, potions
      const ids = Object.keys(db).filter(id => !['flameCloak', 'holyAmulet', 'excalibur', 'frostbrand', 'ironSword', 'leatherArmor'].includes(id) && !db[id].unsellable).slice(0, 40);
      s.inventory = []; for (const id of ids) { if (s.inventory.length >= 20) break; p.addItem(id, 1); }
      r.stacks = s.inventory.length;
      r.addFlameCloak = p.addItem('flameCloak', 1);                       // boss reward path: tt.player.addItem("flameCloak", 1), return value unused
      r.hasFlameCloakAfterBossReward = p.hasItem('flameCloak');
      const g0 = s.gold; wm.applyQuestRewards({ gold: 5, items: [{ itemId: 'flameCloak', quantity: 1 }] });   // the game's own quest reward code
      r.questGoldPaid = s.gold - g0; r.hasFlameCloakAfterQuestReward = p.hasItem('flameCloak');
      r.addHolyAmulet = p.addItem('holyAmulet', 1);                       // golden chest path
      // a legendary boss reward: addItem fails, equip() still equips it and the old weapon has nowhere to go
      s.equipment.weapon = 'ironSword'; const eq0 = s.equipment.weapon;
      r.addExcalibur = p.addItem('excalibur', 1); p.equip('excalibur');
      r.weaponAfterBossAutoEquip = s.equipment.weapon; r.oldWeaponKept = p.hasItem(eq0);
      // taking a piece of gear off with a full bag
      s.equipment.armor = 'leatherArmor'; r.unequipReturned = p.unequip('armor'); r.armorSlotAfter = s.equipment.armor; r.armorInBag = p.hasItem('leatherArmor');
      r.stacksAfter = s.inventory.length;
      return r;
    });
    console.log(JSON.stringify(out, null, 1));
  } finally { await o.browser.close(); }
})().catch(e => { console.error('ERR', e && e.stack || e); process.exit(1); });
