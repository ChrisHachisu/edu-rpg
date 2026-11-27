'use strict';
// Census: every town (Act 1's three and the nine of Acts 2-5). Per town:
//   overworld view at the gate (save seeded on the door's exit cell), a real walk in (arrival view),
//   walks (the town's own walkable test, arrow keys, ptlib's planner) to the centre, the save point and
//   the shop counter, then next to one person with the talk button up, and the first line they say.
//   node scripts/auto/census/towns.cjs [townId ...]     (town ids: greenhollow ... cinderwatch)
const fs = require('fs'), path = require('path');
const C = require('./clib.cjs');
const { L } = C;
// ptlib's in-page town walker (HELP), reused verbatim
const ptsrc = fs.readFileSync(path.join(C.ROOT, 'scripts/acts/probe/playthrough/ptlib.cjs'), 'utf8');
const HELP = ptsrc.slice(ptsrc.indexOf('const HELP = () => {') + 'const HELP = '.length, ptsrc.indexOf('\nclass Session'));
const ORDER = ['greenhollow', 'millbrook', 'portSapphire', 'ironkeep', 'frostwatch', 'hauntedVillage', 'ruinsCamp', 'oasisHaven', 'embersRest', 'cinderwatch', 'lastBastion', 'havensEdge'];
const ACT = { greenhollow: 1, millbrook: 1, portSapphire: 1, ironkeep: 2, frostwatch: 2, hauntedVillage: 2, ruinsCamp: 3, oasisHaven: 3, embersRest: 4, cinderwatch: 4, lastBastion: 5, havensEdge: 5 };
const TALK = { greenhollow: 'elder', millbrook: null, portSapphire: null, ironkeep: 'blacksmith', cinderwatch: 'watchCaptain' };
const inject = page => page.evaluate(`(${HELP.trim().replace(/;\s*$/, '')})()`);
const townOf = page => page.evaluate(() => window.__PTH && window.__PTH.town());
async function walkTo(page, cx, cy, r = 0.9) { return page.evaluate(([x, y, r]) => window.__PTH.walkToCell(x, y, r), [cx, cy, r]).catch(e => ({ ok: false, why: String(e).slice(0, 120) })); }
async function townDismiss(page) {
  for (let i = 0; i < 12; i++) {
    const m = await page.evaluate(() => { const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'); return !!(w && w.showingMessage); }).catch(() => false);
    if (!m) return; await page.evaluate(() => window.__P.tapKey('z')); await page.waitForTimeout(350);
  }
}
(async () => {
  const want = process.argv.slice(2), ids = want.length ? want : ORDER;
  const { browser, page, errors } = await C.open();
  const rows = [];
  for (const id of ids) {
    const d = C.LANDMARKS.find(l => (l.virtual || l.mapId) === id && l.tile === 6);
    const row = { id }; const act = ACT[id];
    try {
      await C.boot(page, { mapId: 'overworld', x: d.exit[0], y: d.exit[1] });
      await C.snap(page, `ow-gate-${id}`, { area: 'overworld', act, shows: `overworld outside the gate of ${id}`, how: `save seeded on the door's exit cell ${d.exit}` });
      const w = await L.walkCells(page, [d.at], { maxMs: 25000 });
      await page.waitForFunction(() => { const f = document.querySelector('#act1-hifi-preserved-root iframe'); return !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(3500); await inject(page);
      const t = await townOf(page); row.entered = !!(t && t.id === id); row.walk = w.why;
      await C.snap(page, `town-${id}-entry`, { area: 'town', act, town: id, shows: `${id} arrival view at the gate`, how: 'real walk into the overworld door' });
      if (!row.entered) { rows.push(row); continue; }
      await townDismiss(page);
      const tj = JSON.parse(fs.readFileSync(path.join(C.ROOT, 'public/act1-hifi/town', id + '-town.json'), 'utf8'));
      const views = [['centre', [32.5, 32.5]], ['save-point', tj.savePoint], ['shop', tj.shopCounter], ['north', [32.5, 14]]].filter(v => v[1]);
      for (const [tag, c] of views) {
        const r = await walkTo(page, c[0], c[1] + (tag === 'save-point' ? 1.2 : 0), tag === 'north' || tag === 'centre' ? 6 : 1.2);
        await page.waitForTimeout(700); await townDismiss(page);
        const p = await townOf(page);
        row[tag] = r.why;
        await C.snap(page, `town-${id}-${tag}`, { area: 'town', act, town: id, shows: `${id}: walked toward the ${tag} (${c.map(v => (+v).toFixed(1))}), hero at ${p ? [p.cx.toFixed(1), p.cy.toFixed(1)] : '?'}`, how: `town walker (${r.why})` });
      }
      const npcs = (await townOf(page)).npcs.map(n => n.id);
      const who = TALK[id] && npcs.includes(TALK[id]) ? TALK[id] : npcs.find(n => !/healer|shopkeeper/.test(n)) || npcs[0];
      const g = await page.evaluate(n => window.__PTH.walkToNpc(n), who);
      await page.waitForTimeout(900);
      const near = (await townOf(page)).near; row.talk = { who, walk: g.why, near };
      await C.snap(page, `town-${id}-npc-${who}`, { area: 'town', act, town: id, shows: `${id}: next to ${who}, talk button expected (near=${near})`, how: 'town walker to the NPC talk band' });
      await page.evaluate(() => window.__PTH.pressTalk()); await page.waitForTimeout(1300);
      await C.snap(page, `town-${id}-npc-${who}-talk`, { area: 'town', act, town: id, shows: `${id}: ${who}'s first line`, how: 'talk key next to the NPC' });
      await townDismiss(page);
    } catch (e) { row.err = String(e).slice(0, 300); C.log('ERR', id, row.err); }
    rows.push(row); C.log(JSON.stringify(row));
  }
  fs.appendFileSync(path.join(C.OUT, 'towns-report.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  C.log('errors', JSON.stringify(errors.filter(e => !/favicon|audio|mp3|ogg/.test(e.m)).slice(0, 8)));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
