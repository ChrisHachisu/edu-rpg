'use strict';
// A hosted town (Cinderwatch, engine map embersRest) records and lists as itself, and Ember's Rest
// still records and lists as Ember's Rest. Per locale (en, ja kana, ja kanji): walk into the town's
// door, read the HUD place name and the compass "visited" flags, save in town (the bundle's own
// save through ui-overhaul manualSave), then reload to the title and read the 5-slot screen (the
// slot list and the slot's Auto save / Last save rows) as rendered DOM text.
//   NODE_PATH=/opt/node-tools/node_modules PROBE_OUT=<dir> node scripts/acts/probe/hosted.cjs
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const LOCALES = [['en', false, { cinderwatch: 'Cinderwatch', embersRest: "Ember's Rest" }],
  ['ja', false, { cinderwatch: 'シンダーウォッチ' }], ['ja', true, { cinderwatch: 'シンダーウォッチ' }]];
(async () => {
  const { browser, page, errors } = await L.launch();
  const rows = [];
  await L.bootSave(page, L.save({ flags: L.allFlags() }));
  const doors = await page.evaluate(() => window.__QOK_MULTIACT__.index().landmarks.filter(d => d.mapId === 'embersRest'));
  for (const [locale, kanjiMode, want] of LOCALES) {
    for (const d of doors) {
      const id = d.virtual || d.mapId, tag = locale + (kanjiMode ? '-kanji' : '') + '-' + id;
      const row = { tag, town: id };
      try {
        await L.bootSave(page, L.save({ x: d.exit[0], y: d.exit[1], flags: L.allFlags(), locale, kanjiMode }), { extra: { 'qok-active-slot': '1' } });
        await L.walkCells(page, [d.at], { maxMs: 25000 });
        await page.waitForFunction(() => { const r = document.getElementById('act1-hifi-preserved-root'), f = r && r.querySelector('iframe'); return !!(f && f.contentWindow && f.contentWindow.__ACT1_TOWN__); }, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3500);
        const live = await page.evaluate(() => {
          const w = window.__PHASER_GAME__.scene.getScene('WorldMapScene'), f = window.__GAME_STATE__.player.state.storyFlags;
          const r = document.getElementById('act1-hifi-preserved-root'), fr = r && r.querySelector('iframe'), t = fr && fr.contentWindow.__ACT1_TOWN__;
          const ok = window.__QOK_SAVES__.manualSave(), z = window.__QOK.Z.__base || window.__QOK.Z;
          return { map: w.currentMapId, art: t && t.town ? t.town.id : null, hud: w.floorText && w.floorText.text,
            chip: (document.querySelector('.qok-field-floor, #qok-field-floor') || {}).textContent || null,
            visitedCinderwatch: !!f['compass.visited.cinderwatch'], visitedEmbersRest: !!f['compass.visited.embersRest'], saved: ok, hostName: z('map.embersRest') };
        });
        Object.assign(row, live);
        await L.shot(page, 'hosted-' + tag + '-in');
        // to the title with a fresh page: nothing of the live town is left to borrow a name from
        await page.reload({ waitUntil: 'load' });
        await L.toTitle(page);
        await page.waitForTimeout(1500);
        // the title has no player kanji mode yet, so Ember's Rest lists in the title's own spelling
        row.titleHost = await page.evaluate(() => { const z = window.__QOK.Z.__base || window.__QOK.Z; return z('map.embersRest'); });
        await page.locator('[data-act="titleSlots"]').first().tap();
        await page.waitForTimeout(800);
        row.slotList = await page.evaluate(() => [...document.querySelectorAll('.slotcard:not(.empty)')].map(e => e.innerText.replace(/\s+/g, ' ')));
        await page.locator('.slotcard[data-i="1"]').first().tap();
        await page.waitForTimeout(800);
        row.slotRows = await page.evaluate(() => [...document.querySelectorAll('.slotcard[data-act="slotLoad"]')].map(e => e.innerText.replace(/\s+/g, ' ')));
        await L.shot(page, 'hosted-' + tag + '-slot');
        // Ember's Rest: the bundle's own spelling (the unwrapped translate), in town and at the title
        const expect = want[id] || row.hostName, listed = id === 'cinderwatch' ? want.cinderwatch : row.titleHost;
        row.expect = expect; row.expectListed = listed;
        const other = id === 'cinderwatch' ? row.titleHost : want.cinderwatch;
        row.pass = row.map === 'embersRest' && row.art === id && row.saved && row.hud === expect
          && row.visitedCinderwatch === (id === 'cinderwatch') && row.visitedEmbersRest === (id === 'embersRest')
          && row.slotList.length === 1 && row.slotList[0].includes(listed) && !row.slotList[0].includes(other)
          && row.slotRows.length >= 1 && row.slotRows.every(t => t.includes(listed) && !t.includes(other));
      } catch (e) { row.error = String(e).slice(0, 300); }
      rows.push(row); console.log(JSON.stringify(row));
    }
  }
  fs.writeFileSync(path.join(L.OUT, 'hosted.json'), JSON.stringify({ rows, errors: errors.slice(0, 20) }, null, 1));
  console.log('HOSTED', rows.filter(r => r.pass).length + '/' + rows.length, 'errors', errors.length, JSON.stringify(errors.slice(0, 4)));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
