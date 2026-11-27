'use strict';
// Day 4 census: the five shopkeepers the NPC-band walker could not reach, approached by the counter cell instead.
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
      const sc = tj.shopCounter; const sk = tj.npcs.find(n => n.id === 'shopkeeper');
      const tries = [[sc[0], sc[1] + 1.0, 1.0], [sc[0], sc[1] + 2.0, 1.5], [sk.cell[0], sk.cell[1] + 1.2, 1.5], [sc[0] + 1.5, sc[1] + 1.2, 1.5], [sc[0] - 1.5, sc[1] + 1.2, 1.5]];
      let near = null, why = null;
      for (const [x, y, r] of tries) { const g = await page.evaluate(([x, y, r]) => window.__PTH.walkToCell(x, y, r), [x, y, r]).catch(e => ({ why: 'err' })); why = g.why; await page.waitForTimeout(800); near = (await townOf(page)).near; if (near === 'shopkeeper') break; }
      row.npcs.push({ id: 'shopkeeper', walk: why, near });
      await C.snap(page, `town-${id}-npc-shopkeeper`, { area: 'town', act, town: id, role: 'shop', shows: `${id}: seated beside the shop counter ${sc} (not by the NPC band); Talk target near=${near}`, how: 'walked to the counter cell instead of the NPC band' });
      if (near === 'shopkeeper') { await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1800); await C.snap(page, `town-${id}-npc-shopkeeper-service`, { area: 'town', act, town: id, role: 'shop', shows: `${id}: shop opened`, how: 'talk key at the counter' }); await townDismiss(page); }
    } catch (e) { row.err = String(e).slice(0, 300); C.log('ERR', id, row.err); }
    rows.push(row); C.log(JSON.stringify(row));
  }
  fs.appendFileSync(path.join(C.OUT, 'towns-shop-report.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
