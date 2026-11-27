'use strict';
// Day 4 census: every person in every town, each with the Talk button showing (the talk band below them),
// plus the person's first line for those who are not a service. Also the healer / inn and shop counters.
//   node scripts/auto/census/towns_npc.cjs [townId ...]
const fs = require('fs'), path = require('path');
const C = require('./clib.cjs');
const { L } = C;
const ptsrc = fs.readFileSync(path.join(C.ROOT, 'scripts/acts/probe/playthrough/ptlib.cjs'), 'utf8');
const HELP = ptsrc.slice(ptsrc.indexOf('const HELP = () => {') + 'const HELP = '.length, ptsrc.indexOf('\nclass Session'));
const ORDER = ['greenhollow', 'millbrook', 'portSapphire', 'ironkeep', 'frostwatch', 'hauntedVillage', 'ruinsCamp', 'oasisHaven', 'embersRest', 'cinderwatch', 'lastBastion', 'havensEdge'];
const ACT = { greenhollow: 1, millbrook: 1, portSapphire: 1, ironkeep: 2, frostwatch: 2, hauntedVillage: 2, ruinsCamp: 3, oasisHaven: 3, embersRest: 4, cinderwatch: 4, lastBastion: 5, havensEdge: 5 };
process.env.HONEST_DIST = process.env.HONEST_DIST || '/home/user/work/h3/dist';
const QG = {}; try { const T = require('../honest/world.cjs').tables(); for (const q of Object.values(T.quests)) { (QG[q.turnInMapId] = QG[q.turnInMapId] || new Set()).add(q.giverNpcId || q.turnInNpcId); } } catch (e) { console.log('quest table', String(e).slice(0, 120)); }
const PILOT = fs.readFileSync(path.join(C.ROOT, 'scripts/acts/probe/pilot.js'), 'utf8');
const inject = async page => { await page.evaluate(PILOT); await page.evaluate(`(${HELP.trim().replace(/;\s*$/, '')})()`); };
const townOf = page => page.evaluate(() => window.__PTH && window.__PTH.town());
async function townDismiss(page) {
  for (let i = 0; i < 14; i++) {
    const s = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), c = document.getElementById('qok-quest-completion');
      return { m: !!(w && w.showingMessage), o: !!(w && (w.healerOverlayOpen || w.questOverlayOpen)), c: !!(c && !c.hidden), shop: window.__PHASER_GAME__.scene.isActive('ShopScene') }; }).catch(() => ({}));
    if (s.c) { await page.locator('#qok-quest-completion .qqc-dismiss').tap({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); continue; }
    if (s.shop) { await page.locator('[data-act="shopLeave"]').first().tap({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800); continue; }
    if (s.o) { await page.keyboard.press('x').catch(() => {}); await page.waitForTimeout(400); }
    if (!s.m && !s.o) return;
    await page.evaluate(() => window.__P.tapKey('z')); await page.waitForTimeout(350);
  }
}
(async () => {
  const want = process.argv.slice(2), ids = want.length ? want : ORDER;
  const { browser, page, errors } = await C.open();
  const rows = [];
  for (const id of ids) {
    const d = C.LANDMARKS.find(l => (l.virtual || l.mapId) === id && l.tile === 6);
    const row = { id, npcs: [] }; const act = ACT[id];
    try {
      await C.boot(page, { mapId: 'overworld', x: d.exit[0], y: d.exit[1], activeQuests: ['kikisChallenge'] });
      await L.walkCells(page, [d.at], { maxMs: 25000 });
      await page.waitForFunction(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(3500); await inject(page);
      const t = await townOf(page); row.entered = !!(t && t.id === id);
      if (!row.entered) { rows.push(row); continue; }
      await townDismiss(page);
      const tj = JSON.parse(fs.readFileSync(path.join(C.ROOT, 'public/act1-hifi/town', id + '-town.json'), 'utf8'));
      const npcs = tj.npcs.map(n => ({ id: n.id, name: n.name, cell: n.cell }));
      for (const n of npcs) {
        const role = n.id === 'shopkeeper' ? 'shop' : n.id === 'healer' ? 'healer-inn' : (QG[id] && QG[id].has(n.id)) ? 'quest-giver' : 'person';
        const rec = { id: n.id, role };
        try {
          const g = await page.evaluate(x => window.__PTH.walkToNpc(x), n.id); rec.walk = g.why; await page.waitForTimeout(900);
          const near = (await townOf(page)).near; rec.near = near;
          await C.snap(page, `town-${id}-npc-${n.id}`, { area: 'town', act, town: id, role, shows: `${id}: ${n.name || n.id} (${role}); walked to the talk band, Talk button expected (near=${near})`, how: 'town walker to the NPC talk band' });
          if ((role === 'person' || role === 'quest-giver') && near === n.id) {
            await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1300);
            await C.snap(page, `town-${id}-npc-${n.id}-talk`, { area: 'town', act, town: id, role, shows: `${id}: ${n.name || n.id}'s first line (dialogue box)`, how: 'talk key' });
            await townDismiss(page);
          } else if (role === 'healer-inn' && near === n.id) {
            await page.evaluate(() => { const s = window.__GAME_STATE__.player.state; s.hp = Math.floor(s.maxHp / 3); });
            await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1500);
            await C.snap(page, `town-${id}-npc-${n.id}-service`, { area: 'town', act, town: id, role, shows: `${id}: healer / inn service opened`, how: 'talk key at 1/3 HP' });
            await townDismiss(page);
          } else if (role === 'shop' && near === n.id) {
            await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1800);
            await C.snap(page, `town-${id}-npc-${n.id}-service`, { area: 'town', act, town: id, role, shows: `${id}: shop / smith service opened (or its greeting)`, how: 'talk key' });
            await townDismiss(page);
          }
        } catch (e) { rec.err = String(e).slice(0, 160); }
        row.npcs.push(rec);
      }
    } catch (e) { row.err = String(e).slice(0, 300); C.log('ERR', id, row.err); }
    rows.push(row); C.log(JSON.stringify(row));
  }
  fs.appendFileSync(path.join(C.OUT, 'towns-npc-report.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
